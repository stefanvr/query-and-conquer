// AI turn engine — walks a strategy's priority list (strategies.js) against the board and
// performs one action at a time, per game spec §8's decision model and implementation-spec.md
// §11.
//
// Two rules shape everything here:
// 1. It never mutates state itself — every action goes through commands.js, so the AI plays by
//    exactly the rules the human's own clicks do (tech-stack.md's CQRS-lite split).
// 2. It decides from `getVisibleState(state, playerId)`, not canonical state — easy AI respects
//    fog (game spec §8's Difficulty table). Commands are still handed canonical `state`, since a
//    rule has to resolve against reality (line of sight is blocked by a unit the AI can't see,
//    say). That's safe because getVisibleState filters by reference: a unit or base the AI picked
//    out of the projection *is* the object canonical state holds.
//
// Easy difficulty's execution traits are baked into the helpers below rather than branching on
// difficulty everywhere: `firstValidTarget` ignores each strategy's own targetPriority, and
// `naiveStepToward` refuses to route around obstacles. Stage 12's hard AI swaps those two
// helpers; the strategy rules themselves are shared and don't change.
import { getVisibleState } from "../state/queries.js";
import {
  moveUnit,
  attackUnit,
  attackBase,
  claimBase,
  loadUnit,
  unloadUnit,
  queueBuild,
  isValidAttackTarget,
  isValidAttackBaseTarget,
  isValidClaimTarget,
  isValidLoadTarget,
  isValidUnloadTarget,
} from "../state/commands.js";
import { offsetDistance, offsetKey, hexesInRange } from "../map/hex-coords.js";
import { UNIT_TYPES, buildableUnitTypes } from "../state/unit-types.js";
import { BASE_TYPES } from "../state/base-types.js";
import { STRATEGIES } from "./strategies.js";

const MAX_BASE_CAPACITY = 15; // mirrors commands.js — a base at capacity skips production (§8)
const MAX_QUEUE_LENGTH = 5;
/** How far `exploreOrExpand` will look for an unexplored cell. Uncapped, a nearest-unexplored
 * scan is O(map) per unit per turn — up to 12,000 cells (game spec §1) — for a rule that only
 * needs a direction to walk in. */
const MAX_EXPLORE_SEARCH_RADIUS = 12;

/** Lowest id first — game spec §8's tie-break, applied everywhere the AI picks between equally
 * valid options, so a seeded match always replays identically. */
function byId(a, b) {
  return a.id - b.id;
}

/** Nearest by hex distance from `from`, ties broken by lowest id (§8). Returns null if empty. */
function nearest(from, candidates) {
  let best = null;
  let bestDist = Infinity;
  for (const c of [...candidates].sort(byId)) {
    const d = offsetDistance(from, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/** Easy difficulty's "first valid target found (no optimization)" — deliberately ignores the
 * strategy's own `targetPriority`, which is what hard AI (Stage 12) will turn on instead. */
function firstValidTarget(candidates, isValid) {
  for (const c of [...candidates].sort(byId)) {
    if (isValid(c)) return c;
  }
  return null;
}

/** Easy difficulty's naive pathing: step onto whichever single neighbor most reduces hex distance
 * to `target`, and give up if that exact hex isn't movable — no routing around obstacles, which
 * is precisely the "may waste actions on obstacles" the design doc asks for (game spec §8).
 * Returns the descriptor of the move that happened, or null if the unit couldn't move. */
function naiveStepToward(ctx, unit, target) {
  const { state, grid, playerId } = ctx;
  let best = null;
  let bestDist = offsetDistance(unit, target);
  for (const n of grid.neighborsOf(unit.col, unit.row)) {
    const d = offsetDistance(n, target);
    if (d < bestDist) {
      // Strict `<` keeps the first of several equally-good neighbors; grid.neighborsOf returns a
      // fixed direction order, so that choice is deterministic.
      bestDist = d;
      best = n;
    }
  }
  if (!best) return null;

  const from = { col: unit.col, row: unit.row };
  moveUnit(state, grid, unit.id, best.col, best.row, playerId);
  if (unit.col === from.col && unit.row === from.row) return null; // blocked/impassable/unaffordable
  // A plane can crash on its own move (fuel exhausted, game spec §3) -- it's already gone from
  // state.units by now, which is fine: this unit's turn ends here either way.
  return { type: "move", unitId: unit.id, from, to: { col: unit.col, row: unit.row } };
}

/** Own bases with room to take a unit in — what "a friendly base can repair it this turn" (game
 * spec §8's Defensive rule 1) actually gates on. The ≤5-repairs-per-turn cap only changes how
 * fast a unit heals once inside (implementation-spec.md §2), not whether it can get in. */
function repairBases(ctx) {
  return ctx.ownBases.filter((b) => b.garrison.length + (b.inProgress ? 1 : 0) < MAX_BASE_CAPACITY);
}

/** Moves toward `base` and *arrives*: claims it if it's adjacent and claimable right now,
 * otherwise takes a naive step. Shared by every "move toward an unclaimed base" rule. */
function approachAndClaim(ctx, unit, base) {
  const { state, grid, playerId } = ctx;
  if (isValidClaimTarget(grid, unit, base)) {
    claimBase(state, grid, unit.id, base.id, playerId);
    return { type: "claim", unitId: unit.id, baseId: base.id };
  }
  return naiveStepToward(ctx, unit, base);
}

/** Whether `unit` is the last thing holding one of its owner's bases — no other friendly unit
 * garrisoned there or within that base's view (game spec §8's Balanced rule 4). */
function isLastDefenderOfSomeBase(ctx, unit) {
  return ctx.ownBases.some((base) => {
    if (offsetDistance(unit, base) > BASE_TYPES[base.type].view) return false;
    if (base.garrison.length > 0) return false;
    return !ctx.state.units.some(
      (u) => u.ownerId === ctx.playerId && u.id !== unit.id && offsetDistance(u, base) <= BASE_TYPES[base.type].view,
    );
  });
}

// --- Strategy rules (game spec §8's Strategies lists) ---
// Each returns an action descriptor if it applied, or null to fall through to the next rule.

const RULES = {
  /** Attack any enemy unit or base in range. */
  attackInRange(ctx, unit) {
    const { state, grid, playerId } = ctx;
    const target = firstValidTarget(ctx.enemyUnits, (e) => isValidAttackTarget(state, grid, unit, e));
    if (target) {
      attackUnit(state, grid, unit.id, target.id, playerId);
      return { type: "attackUnit", unitId: unit.id, targetId: target.id };
    }
    const base = firstValidTarget(ctx.enemyBases, (b) => isValidAttackBaseTarget(state, grid, unit, b));
    if (base) {
      attackBase(state, grid, unit.id, base.id, playerId);
      return { type: "attackBase", unitId: unit.id, baseId: base.id };
    }
    return null;
  },

  /** Move toward the nearest known enemy unit or base. */
  advanceToNearestEnemy(ctx, unit) {
    const target = nearest(unit, [...ctx.enemyUnits, ...ctx.enemyBases]);
    return target ? naiveStepToward(ctx, unit, target) : null;
  },

  /** Move toward the nearest unexplored area or unclaimed base. Prefers an unclaimed base this
   * unit could actually take — exploring is the fallback when there's nothing to claim. */
  exploreOrExpand(ctx, unit) {
    const claimed = RULES.expandToUnclaimedBase(ctx, unit);
    if (claimed) return claimed;
    const frontier = nearestUnexplored(ctx, unit);
    return frontier ? naiveStepToward(ctx, unit, frontier) : null;
  },

  /** If damaged and a friendly base has room, head back to it (and enter, once adjacent). */
  retreatToRepair(ctx, unit) {
    const { state, grid, playerId } = ctx;
    if (unit.sp >= unit.maxSp) return null;
    const base = nearest(unit, repairBases(ctx));
    if (!base) return null;
    if (isValidLoadTarget(grid, unit, base)) {
      loadUnit(state, grid, unit.id, base.id, playerId);
      return { type: "retreat", unitId: unit.id, baseId: base.id };
    }
    return naiveStepToward(ctx, unit, base);
  },

  /** Attack an enemy in range that's threatening one of my bases (inside that base's view). */
  attackThreatToBase(ctx, unit) {
    const { state, grid, playerId } = ctx;
    const threats = ctx.enemyUnits.filter((e) =>
      ctx.ownBases.some((b) => offsetDistance(e, b) <= BASE_TYPES[b.type].view),
    );
    const target = firstValidTarget(threats, (e) => isValidAttackTarget(state, grid, unit, e));
    if (!target) return null;
    attackUnit(state, grid, unit.id, target.id, playerId);
    return { type: "attackUnit", unitId: unit.id, targetId: target.id };
  },

  /** Hold near the nearest friendly base — only close in if farther out than that base's view
   * plus this unit's own (game spec §8's worked example: a tank near a land base, 4 + 3 = 7). */
  holdNearBase(ctx, unit) {
    const base = nearest(unit, ctx.ownBases);
    if (!base) return null;
    const holdRadius = BASE_TYPES[base.type].view + UNIT_TYPES[unit.unitType].view;
    if (offsetDistance(unit, base) <= holdRadius) return null;
    return naiveStepToward(ctx, unit, base);
  },

  /** Move toward (and take) the nearest known unclaimed base, if this unit can capture at all. */
  expandToUnclaimedBase(ctx, unit) {
    const base = nearest(unit, ctx.neutralBases);
    if (!base) return null;
    return approachAndClaim(ctx, unit, base);
  },

  /** Advance on the nearest known enemy, unless this unit is the last thing holding one of its
   * owner's own bases (game spec §8's Balanced rule 4). */
  advanceKeepingBaseHeld(ctx, unit) {
    if (isLastDefenderOfSomeBase(ctx, unit)) return null;
    return RULES.advanceToNearestEnemy(ctx, unit);
  },
};

/** Nearest in-map cell this player has never explored, by expanding-ring search from `unit` —
 * naturally nearest-first, and capped (see MAX_EXPLORE_SEARCH_RADIUS). Null if everything within
 * that radius is already explored. */
function nearestUnexplored(ctx, unit) {
  const explored = ctx.exploredCells;
  const { width, height } = ctx.state.map;
  for (let radius = 1; radius <= MAX_EXPLORE_SEARCH_RADIUS; radius++) {
    for (const cell of hexesInRange(unit, radius)) {
      if (cell.col < 0 || cell.col >= width || cell.row < 0 || cell.row >= height) continue;
      if (!ctx.grid.isInMap(cell.col, cell.row)) continue;
      if (!explored.has(offsetKey(cell.col, cell.row))) return cell;
    }
  }
  return null;
}

/** Deploys a garrisoned unit onto the first valid adjacent hex (easy difficulty's first-valid
 * rule again). The strategy lists all describe what a *field* unit does, so deploying is what
 * turns a garrisoned unit into one — without it an AI would build units that never leave the
 * base (implementation-spec.md §11). */
function deployFromBase(ctx, base, garrisoned) {
  const { state, grid, playerId } = ctx;
  for (const n of grid.neighborsOf(base.col, base.row)) {
    if (!isValidUnloadTarget(state, grid, base, garrisoned, n.col, n.row)) continue;
    unloadUnit(state, grid, base.id, garrisoned.id, n.col, n.row, playerId);
    // Confirm it actually left rather than trusting the predicate — unloadUnit has ownership and
    // membership checks of its own, and a silent no-op must not be reported as an action taken.
    if (base.garrison.some((g) => g.id === garrisoned.id)) return null;
    return { type: "deploy", unitId: garrisoned.id, baseId: base.id, to: { col: n.col, row: n.row } };
  }
  return null;
}

/** Queues the first unit type this base is allowed to build, walking the strategy's own build
 * order. Skipped entirely if the base is at capacity or its queue is already full (game spec §8). */
function runBaseProduction(ctx, base, strategy) {
  const { state, playerId } = ctx;
  if (base.queue.length >= MAX_QUEUE_LENGTH) return null;
  if (base.garrison.length + (base.inProgress ? 1 : 0) >= MAX_BASE_CAPACITY) return null;
  const allowed = buildableUnitTypes(base.type, base.adjacentToDeepWater);
  const unitType = strategy.buildOrder.find((t) => allowed.includes(t));
  if (!unitType) return null;
  queueBuild(state, base.id, unitType, playerId);
  return { type: "build", baseId: base.id, unitType };
}

/**
 * Plays one AI player's whole turn, one action at a time.
 *
 * A generator rather than a plain function so the caller owns pacing: the HUD's AI-speed setting
 * (implementation-spec.md §6/§11) either drains this instantly or steps it with a delay between
 * yields. Nothing in here knows about timers or the DOM.
 *
 * Yields a small descriptor per action taken ({ type, ... }) — enough for a test to assert on
 * what the AI did, and for the caller to redraw between steps.
 *
 * @param {object} state canonical game state (mutated only via commands.js)
 * @param {import("../map/grid.js").TerrainGrid} grid
 * @param {number} playerId the AI whose turn this is
 */
export function* aiTurnActions(state, grid, playerId) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return;
  const strategy = STRATEGIES[player.strategy] ?? STRATEGIES.balanced;
  const visible = getVisibleState(state, playerId);

  const ctx = {
    state,
    grid,
    playerId,
    // Decisions read the fog-filtered projection (see this file's own header): visible enemy
    // units, and bases this player has at least explored once.
    enemyUnits: visible.units.filter((u) => u.ownerId !== playerId),
    enemyBases: visible.bases.filter((b) => b.ownerId !== null && b.ownerId !== playerId),
    neutralBases: visible.bases.filter((b) => b.ownerId === null),
    ownBases: state.bases.filter((b) => b.ownerId === playerId), // own property is never fogged
    exploredCells: new Set(player.exploredCells),
  };

  // Game spec §8's processing order: base-defenders -> field units -> newly completed units. All
  // three groups are snapshotted up front, so a unit that deploys out of a base this turn joins
  // the field next turn rather than acting twice in this one.
  const garrisonEntries = (isNew) =>
    ctx.ownBases.flatMap((base) =>
      base.garrison
        .filter((g) => (g.builtOnTurn === state.turnNumber) === isNew)
        .map((garrisoned) => ({ base, garrisoned })),
    );
  const defenders = garrisonEntries(false);
  const fieldUnits = state.units.filter((u) => u.ownerId === playerId).sort(byId);
  const newlyCompleted = garrisonEntries(true);

  for (const { base, garrisoned } of defenders) {
    const action = deployFromBase(ctx, base, garrisoned);
    if (action) yield action;
  }

  for (const unit of fieldUnits) {
    if (!state.units.includes(unit)) continue; // destroyed earlier this turn (e.g. a plane crash)
    for (const ruleName of strategy.rules) {
      const action = RULES[ruleName](ctx, unit);
      if (action) {
        yield action;
        break; // one action per unit per turn -- easy AI's unspent-budget trait (game spec §8)
      }
    }
  }

  for (const { base, garrisoned } of newlyCompleted) {
    const action = deployFromBase(ctx, base, garrisoned);
    if (action) yield action;
  }

  for (const base of [...ctx.ownBases].sort(byId)) {
    const action = runBaseProduction(ctx, base, strategy);
    if (action) yield action;
  }
}

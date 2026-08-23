// AI turn engine — walks a strategy's priority list (strategies.js) against the board and
// performs one action at a time, per game spec §8's decision model and implementation-spec.md
// §11.
//
// Two rules shape everything here:
// 1. It never mutates state itself — every action goes through commands.js, so the AI plays by
//    exactly the rules the human's own clicks do (tech-stack.md's CQRS-lite split).
// 2. The board it *decides* from is its difficulty's business (`traits.perceive`) — easy sees a
//    fog-filtered projection, hard sees everything. Commands are always handed canonical `state`
//    regardless, since a rule has to resolve against reality (line of sight is blocked by a unit
//    the AI can't see, say). That's safe because getVisibleState filters by reference: a unit or
//    base the AI picked out of the projection *is* the object canonical state holds.
//
// Difficulty is a table of traits (DIFFICULTY_TRAITS below) selected once per turn and reached
// through `ctx.traits` — perception, target choice, movement, and how much of a unit's budget
// gets used. The strategy rules are shared and never ask which difficulty they're running as:
// intent and execution quality are independent axes (game spec §8).
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
  planesOwingMovement,
} from "../state/commands.js";
import { offsetDistance, offsetKey, hexesInRange } from "../map/hex-coords.js";
import { routeTo, reachableCells } from "../state/pathfinding.js";
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
 * strategy's own `targetPriority`, which is what hard difficulty turns on instead. */
function firstValidTarget(ctx, candidates, isValid) {
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

/** Whether `target` is something `unit` would attack rather than approach — an enemy unit or an
 * enemy-held base. A neutral base is claimed, not attacked, and a bare frontier cell has no
 * owner at all, so neither gets the firing-position treatment below. */
function isHostile(unit, target) {
  return target.ownerId !== null && target.ownerId !== undefined && target.ownerId !== unit.ownerId;
}

/** The cheapest hex `unit` can reach this turn from which it could actually shoot `target` —
 * range satisfied *and* line of sight clear, with enough of its budget left after the trip to
 * fire at all.
 *
 * This is what game spec §8's Pathing row means by "respects LOS": line of sight only ever gates
 * attacks, so on its own it says nothing about where to walk. What it can say is that moving to
 * the hex nearest a target is pointless when a mountain sits between the two, and that a hex
 * slightly further out with a clear line is the better place to stand.
 *
 * Returns a `reachableCells` entry (so it carries its own cheapest route), or null if nowhere in
 * reach this turn offers a shot. */
function firingPosition(ctx, unit, target) {
  const { state, grid } = ctx;
  const attackable = target.unitType ? isValidAttackTarget : isValidAttackBaseTarget;
  let best = null;
  let bestKey = null;

  for (const [key, cell] of reachableCells(state, grid, unit)) {
    // A read-only probe of "what if I stood there": isValidAttackTarget reads position, budget and
    // type off the attacker and nothing else, so a copy answers honestly without moving anything.
    // The budget is debited by the trip, since a shot needs an action left once the unit arrives.
    const probe = { ...unit, col: cell.col, row: cell.row, remainingActions: unit.remainingActions - cell.cost };
    if (!attackable(state, grid, probe, target)) continue;
    // Cheapest wins; the key breaks ties, so the choice can't depend on Map iteration order.
    if (!best || cell.cost < best.cost || (cell.cost === best.cost && key < bestKey)) {
      best = cell;
      bestKey = key;
    }
  }
  return best;
}

/** Hard difficulty's pathing: step along the genuinely cheapest route to `target`, rather than
 * onto whichever neighbor happens to point that way. One step per call — routing decides the
 * direction, and the difficulty's action budget decides how far the unit gets this turn, so a
 * unit walking a long route simply takes several of these.
 *
 * When the target is something this unit could shoot, it heads for a hex that would actually give
 * it a shot (`firingPosition`) rather than for the target itself. Otherwise it takes the next step
 * of the cheapest route (`routeTo`).
 *
 * Both are recomputed per step rather than cached for the turn: the board moves underneath a
 * route (a unit dies, a base changes hands, another of ours takes the hex we were heading
 * through), and a stale route is how an AI walks confidently into a wall it already knows about. */
function routedStepToward(ctx, unit, target) {
  const { state, grid, playerId } = ctx;
  const firing = isHostile(unit, target) ? firingPosition(ctx, unit, target) : null;
  // firingPosition's entry carries the cheapest route to that exact hex; routeTo stops *next to*
  // its goal, which is right for an occupied target and wrong for a hex we mean to stand on.
  const route = firing ? firing.path : routeTo(state, grid, unit, target);
  if (!route || route.length === 0) return null; // no route at all, or already there

  const from = { col: unit.col, row: unit.row };
  const next = route[0];
  moveUnit(state, grid, unit.id, next.col, next.row, playerId);
  if (unit.col === from.col && unit.row === from.row) return null; // can't afford the next step
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
  return ctx.traits.stepToward(ctx, unit, base);
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

/** How each strategy's `targetPriority` scores a candidate (game spec §8) — higher wins.
 *
 * `lowestStrength` finishes off the wounded, so it negates remaining sp. `highestAttack` goes for
 * the biggest threat, scoring a unit by its better attack value; a base scores 0 there, since a
 * base never attacks and so is never the biggest threat on the board. */
const TARGET_SCORES = {
  lowestStrength: (candidate) => -candidate.sp,
  highestAttack: (candidate) => {
    const stats = UNIT_TYPES[candidate.unitType];
    return stats ? Math.max(stats.groundAtk, stats.airAtk) : 0;
  },
};

/** Hard difficulty's "applies the strategy's target-priority rule correctly" — the best-scoring
 * valid candidate rather than merely the first one found. Ties break by lowest id like everything
 * else, so a seeded match still replays identically. */
function priorityTarget(ctx, candidates, isValid) {
  const score = TARGET_SCORES[ctx.strategy.targetPriority] ?? TARGET_SCORES.lowestStrength;
  let best = null;
  let bestScore = -Infinity;
  for (const c of [...candidates].sort(byId)) {
    if (!isValid(c)) continue;
    const s = score(c);
    // Strict `>` keeps the lowest id among equals, since the list is already id-sorted.
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best;
}

/** An explored-cells set for a player who has explored everything — a hard AI knows the whole
 * map, so nothing is ever a frontier for it. Duck-typed rather than a real Set of every in-map
 * cell, which would be up to 12,000 entries rebuilt per turn to answer a question whose answer is
 * always the same (`nearestUnexplored` only ever asks `.has`). */
const EVERYWHERE = { has: () => true };

/**
 * The difficulty axis (game spec §8's Difficulty table), as one entry per difficulty.
 *
 * Difficulty is selected **once per turn** and reached through `ctx.traits`, rather than tested
 * inside each rule. The two axes are meant to be independent: a rule that asked "am I hard?"
 * would fork every strategy along the axis strategies.js is deliberately free of, and there'd be
 * no single place to read what a difficulty actually is.
 *
 * - `perceive` — which board the AI decides from, and so what it can react to at all.
 * - `chooseTarget` — how it picks among valid targets.
 * - `stepToward` — how it closes distance.
 * - `maxActionsPerUnit` — how much of each unit's budget it will actually use.
 */
const DIFFICULTY_TRAITS = {
  easy: {
    perceive: (state, player) => ({
      board: getVisibleState(state, player.id),
      exploredCells: new Set(player.exploredCells),
    }),
    chooseTarget: firstValidTarget,
    stepToward: naiveStepToward,
    maxActionsPerUnit: 1,
  },
  // Hard's remaining traits arrive one at a time in the commits that follow.
  hard: {
    // Canonical state, not a projection: hard ignores fog entirely (game spec §8's Information
    // row, and the exemption tech-stack.md states). Its Reaction row — "can react anywhere on the
    // map immediately" — needs no rule of its own, exactly as easy's "only responds to currently
    // visible threats" needs none: both are just consequences of the board each one gets.
    perceive: (state) => ({ board: state, exploredCells: EVERYWHERE }),
    chooseTarget: priorityTarget,
    stepToward: routedStepToward,
    // "Uses full action budget effectively" (game spec §8) — a unit keeps walking its priority
    // list until it runs out of actions or nothing applies. Unbounded is safe rather than
    // reckless: the loop's own no-progress guard requires every pass to spend at least one of a
    // finite budget, so the real bound is the unit's actionsPerTurn.
    maxActionsPerUnit: Infinity,
  },
};

// --- Strategy rules (game spec §8's Strategies lists) ---
// Each returns an action descriptor if it applied, or null to fall through to the next rule.

const RULES = {
  /** Attack any enemy unit or base in range. */
  attackInRange(ctx, unit) {
    const { state, grid, playerId } = ctx;
    const target = ctx.traits.chooseTarget(ctx, ctx.enemyUnits, (e) => isValidAttackTarget(state, grid, unit, e));
    if (target) {
      attackUnit(state, grid, unit.id, target.id, playerId);
      return { type: "attackUnit", unitId: unit.id, targetId: target.id };
    }
    const base = ctx.traits.chooseTarget(ctx, ctx.enemyBases, (b) => isValidAttackBaseTarget(state, grid, unit, b));
    if (base) {
      attackBase(state, grid, unit.id, base.id, playerId);
      return { type: "attackBase", unitId: unit.id, baseId: base.id };
    }
    return null;
  },

  /** Move toward the nearest known enemy unit or base. */
  advanceToNearestEnemy(ctx, unit) {
    const target = nearest(unit, [...ctx.enemyUnits, ...ctx.enemyBases]);
    return target ? ctx.traits.stepToward(ctx, unit, target) : null;
  },

  /** Move toward the nearest unexplored area or unclaimed base. Prefers an unclaimed base this
   * unit could actually take — exploring is the fallback when there's nothing to claim. */
  exploreOrExpand(ctx, unit) {
    const claimed = RULES.expandToUnclaimedBase(ctx, unit);
    if (claimed) return claimed;
    const frontier = nearestUnexplored(ctx, unit);
    return frontier ? ctx.traits.stepToward(ctx, unit, frontier) : null;
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
    return ctx.traits.stepToward(ctx, unit, base);
  },

  /** Attack an enemy in range that's threatening one of my bases (inside that base's view). */
  attackThreatToBase(ctx, unit) {
    const { state, grid, playerId } = ctx;
    const threats = ctx.enemyUnits.filter((e) =>
      ctx.ownBases.some((b) => offsetDistance(e, b) <= BASE_TYPES[b.type].view),
    );
    const target = ctx.traits.chooseTarget(ctx, threats, (e) => isValidAttackTarget(state, grid, unit, e));
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
    return ctx.traits.stepToward(ctx, unit, base);
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
 * rule again) — game spec §8's Deploying rule: the strategy lists all describe what a *field*
 * unit does, so deploying is the one action available to a garrisoned unit, and what turns it
 * into a field unit for next turn. */
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

/** Moves `unit` onto the first adjacent hex it can actually enter, with no preference at all —
 * the last resort when a plane owes movement (below) and has nowhere it would rather go, such as
 * one already sitting next to its own base. Returns the move descriptor, or null if every
 * neighbor is blocked, impassable, or unaffordable. */
function stepAnywhere(ctx, unit) {
  const { state, grid, playerId } = ctx;
  for (const n of grid.neighborsOf(unit.col, unit.row)) {
    const from = { col: unit.col, row: unit.row };
    moveUnit(state, grid, unit.id, n.col, n.row, playerId);
    if (unit.col === from.col && unit.row === from.row) continue;
    return { type: "move", unitId: unit.id, from, to: { col: unit.col, row: unit.row } };
  }
  return null;
}

/** Game spec §3's mandatory ≥50% plane movement, applied to this AI exactly as the human's End
 * Turn gate applies it to the human (implementation-spec.md §6).
 *
 * It's a game rule, not a UI rule, so an AI turn must not end with a plane still owing movement
 * any more than a human turn can. Until now an AI's planes were silently exempt — the gate was
 * built as a disabled End Turn button, and an AI turn has no button to disable.
 *
 * A plane that owes movement heads for the nearest own base that could rearm it, which is what
 * the rule's own fuel fiction describes; if it has nowhere better to be (no such base, or naive
 * stepping can't get any closer to one) it takes any step at all — the rule demands movement,
 * not useful movement. Each step is yielded, so a paced AI turn shows the plane flying.
 *
 * Termination: every iteration either moves the plane, spending at least 1 of a finite action
 * budget, or gives up on it. A plane can also crash mid-loop on its own fuel (game spec §3),
 * which removes it from `state.units` and so from the predicate. */
function* satisfyPlaneMovement(ctx) {
  const { state, playerId } = ctx;
  for (const plane of planesOwingMovement(state, playerId).sort(byId)) {
    while (planesOwingMovement(state, playerId).includes(plane)) {
      const home = nearest(plane, repairBases(ctx));
      const action = (home && ctx.traits.stepToward(ctx, plane, home)) || stepAnywhere(ctx, plane);
      if (!action) break; // boxed in — nothing more this plane can do about its debt
      yield action;
    }
  }
}

/** How many of each unit type `playerId` already owns or has coming — field units, boat cargo,
 * base garrisons, in-progress builds and queued ones. Everything that will exist if nothing dies,
 * which is what production should be reasoning about. */
function ownedUnitCounts(state, playerId) {
  const counts = {};
  const add = (unitType) => {
    counts[unitType] = (counts[unitType] ?? 0) + 1;
  };
  for (const unit of state.units) {
    if (unit.ownerId !== playerId) continue;
    add(unit.unitType);
    for (const cargo of unit.cargo ?? []) add(cargo.unitType);
  }
  for (const base of state.bases) {
    if (base.ownerId !== playerId) continue;
    for (const garrisoned of base.garrison) add(garrisoned.unitType);
    for (const queued of base.queue) add(queued.unitType);
    if (base.inProgress) add(base.inProgress.unitType);
  }
  return counts;
}

/** Queues one unit at this base, choosing the buildable type the player owns fewest of — ties
 * broken by position in the strategy's own build order (game spec §8). Skipped if the base is at
 * capacity or its queue is full.
 *
 * Fewest-first rather than simply the top of the list, because "always the first type you're
 * allowed to build" makes every entry after the first dead: a land or port base would produce
 * nothing but tanks forever, and a mountain base nothing but fighters. That left the AI unable to
 * take a mountain base at all — cracking one needs a bomber's ground attack, and it would never
 * build one. Ties falling back to build-order position means the order still decides what arrives
 * first and what a base reaches for when its army is balanced. */
function runBaseProduction(ctx, base, strategy) {
  const { state, playerId } = ctx;
  if (base.queue.length >= MAX_QUEUE_LENGTH) return null;
  if (base.garrison.length + (base.inProgress ? 1 : 0) >= MAX_BASE_CAPACITY) return null;

  const allowed = buildableUnitTypes(base.type, base.adjacentToDeepWater);
  const buildable = strategy.buildOrder.filter((t) => allowed.includes(t));
  if (buildable.length === 0) return null;

  const counts = ownedUnitCounts(state, playerId);
  let unitType = buildable[0];
  for (const candidate of buildable) {
    // Strict `<` keeps the earlier build-order entry when counts are equal.
    if ((counts[candidate] ?? 0) < (counts[unitType] ?? 0)) unitType = candidate;
  }

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
  const traits = DIFFICULTY_TRAITS[player.difficulty] ?? DIFFICULTY_TRAITS.easy;
  const { board, exploredCells } = traits.perceive(state, player);

  const ctx = {
    state,
    grid,
    playerId,
    traits,
    strategy, // hard's target priority is the strategy's own (game spec §8) — intent, read by execution
    // Decisions read whichever board this difficulty perceives (see this file's own header) —
    // for easy, only currently-visible enemies and ever-explored bases; for hard, everything.
    enemyUnits: board.units.filter((u) => u.ownerId !== playerId),
    enemyBases: board.bases.filter((b) => b.ownerId !== null && b.ownerId !== playerId),
    neutralBases: board.bases.filter((b) => b.ownerId === null),
    ownBases: state.bases.filter((b) => b.ownerId === playerId), // own property is never fogged
    exploredCells,
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
    // How much of its budget a unit gets to use is the difficulty's call (game spec §8's Action
    // efficiency row): easy stops after one action and leaves the rest unspent, hard keeps going.
    for (let taken = 0; taken < traits.maxActionsPerUnit; taken++) {
      if (!state.units.includes(unit)) break; // gone (a plane crash, or it garrisoned into a base)
      const actionsBefore = unit.remainingActions;

      let action = null;
      for (const ruleName of strategy.rules) {
        action = RULES[ruleName](ctx, unit);
        if (action) break;
      }
      if (!action) break; // nothing in the strategy applies — this unit is finished for the turn
      yield action;

      // Every action a unit takes — move, attack, claim, load — spends at least one of its own
      // actions. One that reports success without spending would otherwise be repeated forever,
      // and guarding here is cheaper than trusting each rule to be honest about its cost.
      if (unit.remainingActions >= actionsBefore) break;
    }
  }

  for (const { base, garrisoned } of newlyCompleted) {
    const action = deployFromBase(ctx, base, garrisoned);
    if (action) yield action;
  }

  // Last, because it's a debt settled at the end of the turn rather than an intent: every plane
  // has had its own chance to move for a reason first, and only what's still owing gets forced.
  // Newly deployed planes are included, exactly as the human's own gate includes a plane they
  // just unloaded (game spec §3).
  yield* satisfyPlaneMovement(ctx);

  for (const base of [...ctx.ownBases].sort(byId)) {
    const action = runBaseProduction(ctx, base, strategy);
    if (action) yield action;
  }
}

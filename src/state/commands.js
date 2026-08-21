// Command handlers — the only code allowed to mutate canonical state (tech-stack.md's CQRS-lite
// rule: "separate the code that mutates state from the code that reads/renders it").
import { UNIT_TYPES, BASE_CATEGORIES, buildTurns, buildableUnitTypes, moveCost } from "./unit-types.js";
import { offsetDistance } from "../map/hex-coords.js";
import { baseAtHex, unitAtHex } from "./game-state.js";

const MAX_QUEUE_LENGTH = 5; // §2
const MAX_BASE_CAPACITY = 15; // §2: garrisoned + in-progress builds count against it
const CAPTURING_UNIT_TYPES = ["tank", "fighter", "fregat"]; // §4: no other unit type can capture a base

/** Advances to the next player in turn order, wrapping around; bumps turnNumber on wraparound.
 * Stage 3 has no AI logic yet (Stage 11+), so an AI turn has nothing to do — callers should keep
 * calling this until the active player is human again (see screens/game-screen.js). */
export function endTurn(state) {
  state.turnIndex = (state.turnIndex + 1) % state.turnOrder.length;
  if (state.turnIndex === 0) state.turnNumber += 1;
  return state;
}

/** Instant elimination for the human player (§7) — ends the match immediately. Stage 3 has no
 * elimination/end-screen logic yet (Stage 10), so the caller just navigates back to the game
 * room; this flag is here so Stage 10 has something to hook into without restructuring call
 * sites. */
export function terminate(state) {
  state.terminated = true;
  return state;
}

function capacityUsed(base) {
  return base.garrison.length + (base.inProgress ? 1 : 0);
}

/** Promotes the next queued item to in-progress, if the base is idle and has capacity. */
function maybeStartNextBuild(base) {
  if (base.inProgress) return;
  if (base.queue.length === 0) return;
  if (capacityUsed(base) >= MAX_BASE_CAPACITY) return;
  const next = base.queue.shift();
  base.inProgress = { unitType: next.unitType, remainingTurns: buildTurns(next.unitType) };
}

/** Queues a build at `base` (§2: max 5 pending; queuing doesn't itself consume a capacity slot,
 * only starting does). Starts immediately if the base is idle and has room. No-op if the unit
 * type isn't buildable there, the queue is already full, or `base` isn't owned by
 * `activePlayerId` (§3 — see moveUnit's own doc comment for why this is enforced here now, not
 * just by the UI). */
export function queueBuild(state, baseId, unitType, activePlayerId) {
  const base = state.bases.find((b) => b.id === baseId);
  if (!base) return state;
  if (base.ownerId !== activePlayerId) return state;
  if (base.queue.length >= MAX_QUEUE_LENGTH) return state;
  if (!buildableUnitTypes(base.type, base.adjacentToDeepWater).includes(unitType)) return state;

  base.queue.push({ unitType });
  maybeStartNextBuild(base);
  return state;
}

/** Removes a pending (not-yet-started) queue entry (implementation-spec.md §2's queue slot
 * click). No-op if the index is out of range, or if `base` isn't owned by `activePlayerId` (§3). */
export function cancelQueuedBuild(state, baseId, queueIndex, activePlayerId) {
  const base = state.bases.find((b) => b.id === baseId);
  if (!base) return state;
  if (base.ownerId !== activePlayerId) return state;
  if (queueIndex < 0 || queueIndex >= base.queue.length) return state;
  base.queue.splice(queueIndex, 1);
  return state;
}

/** Swaps a queue entry with its neighbor one step towards the front (`direction: -1`) or back
 * (`direction: 1`) — implementation-spec.md §2's Move up/Move down queue controls. No-op if
 * either index is out of range (already at that end of the queue), or if `base` isn't owned by
 * `activePlayerId` (§3). */
export function reorderQueuedBuild(state, baseId, queueIndex, direction, activePlayerId) {
  const base = state.bases.find((b) => b.id === baseId);
  if (!base) return state;
  if (base.ownerId !== activePlayerId) return state;
  const target = queueIndex + direction;
  if (queueIndex < 0 || queueIndex >= base.queue.length) return state;
  if (target < 0 || target >= base.queue.length) return state;
  [base.queue[queueIndex], base.queue[target]] = [base.queue[target], base.queue[queueIndex]];
  return state;
}

/** One unit per cell, regardless of owner — bases block regular movement too, since entering a
 * base's own cell is the separate load/unload interaction, not a plain move (game spec §1/§3). */
function isBlockedForMovement(state, col, row) {
  return Boolean(unitAtHex(state, col, row) || baseAtHex(state, col, row));
}

/** Moves a field unit one hex, if the target is adjacent, passable, unoccupied, and affordable
 * from the unit's remaining actions (game spec §3). No-op otherwise; also a no-op if `unit` isn't
 * owned by `activePlayerId` — previously enforced only by the UI wiring up controls for the
 * player's own units, which stopped being safe to rely on once attack/claim exist (§3). */
export function moveUnit(state, grid, unitId, targetCol, targetRow, activePlayerId) {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return state;
  if (unit.ownerId !== activePlayerId) return state;
  if (offsetDistance(unit, { col: targetCol, row: targetRow }) !== 1) return state;
  if (!grid.isInMap(targetCol, targetRow)) return state;
  if (isBlockedForMovement(state, targetCol, targetRow)) return state;

  const cost = moveCost(unit.unitType, grid.get(targetCol, targetRow));
  if (cost === null || cost > unit.remainingActions) return state;

  unit.remainingActions -= cost;
  unit.col = targetCol;
  unit.row = targetRow;
  return state;
}

/** Whether `targetCol`/`targetRow` is a valid unload destination for `garrisoned` out of `base`
 * (implementation-spec.md §1's unload destination picker) — adjacent to the base, passable for
 * the unit's type, unoccupied, and affordable within the unit's full action budget. Exported so
 * the UI can compute which adjacent hexes to highlight without duplicating this logic. */
export function isValidUnloadTarget(state, grid, base, garrisoned, targetCol, targetRow) {
  if (offsetDistance({ col: base.col, row: base.row }, { col: targetCol, row: targetRow }) !== 1) return false;
  if (!grid.isInMap(targetCol, targetRow)) return false;
  if (isBlockedForMovement(state, targetCol, targetRow)) return false;
  const cost = moveCost(garrisoned.unitType, grid.get(targetCol, targetRow));
  if (cost === null) return false;
  return 1 + cost <= UNIT_TYPES[garrisoned.unitType].actionsPerTurn;
}

/** Unloads a garrisoned unit from `base` onto the given (player-chosen) adjacent hex —
 * implementation-spec.md §1's unload destination picker. Costs 1 action + the destination's move
 * cost, from the unit's own fresh action budget (game spec §3). No-op if the destination isn't a
 * valid unload target, or if `base` isn't owned by `activePlayerId` (§3 — see moveUnit's own doc
 * comment for why this is enforced here now, not just by the UI). */
export function unloadUnit(state, grid, baseId, unitId, targetCol, targetRow, activePlayerId) {
  const base = state.bases.find((b) => b.id === baseId);
  if (!base) return state;
  if (base.ownerId !== activePlayerId) return state;
  const index = base.garrison.findIndex((u) => u.id === unitId);
  if (index === -1) return state;

  const garrisoned = base.garrison[index];
  if (!isValidUnloadTarget(state, grid, base, garrisoned, targetCol, targetRow)) return state;

  const stats = UNIT_TYPES[garrisoned.unitType];
  const cost = moveCost(garrisoned.unitType, grid.get(targetCol, targetRow));
  base.garrison.splice(index, 1);
  state.units.push({
    id: garrisoned.id,
    ownerId: base.ownerId,
    unitType: garrisoned.unitType,
    col: targetCol,
    row: targetRow,
    sp: garrisoned.sp, // carried over — a damaged unit stays damaged when it exits (§3/§4)
    maxSp: stats.strength,
    remainingActions: stats.actionsPerTurn - (1 + cost),
    remainingAttacks: stats.attacksPerTurn,
  });
  return state;
}

/** Loads a field unit into an adjacent friendly base of a type that accepts its category, if the
 * base has spare capacity and the unit can afford 1 action + the base's own terrain's move cost
 * (game spec §2/§3). No-op otherwise, or if `unit` isn't owned by `activePlayerId` (§3). */
export function loadUnit(state, grid, unitId, activePlayerId) {
  const index = state.units.findIndex((u) => u.id === unitId);
  if (index === -1) return state;
  const unit = state.units[index];
  if (unit.ownerId !== activePlayerId) return state;
  const category = UNIT_TYPES[unit.unitType].category;

  const target = grid
    .neighborsOf(unit.col, unit.row)
    .map((n) => baseAtHex(state, n.col, n.row))
    .find((b) => b && b.ownerId === unit.ownerId && BASE_CATEGORIES[b.type].includes(category));
  if (!target) return state;
  if (capacityUsed(target) >= MAX_BASE_CAPACITY) return state;

  const cost = moveCost(unit.unitType, grid.get(target.col, target.row));
  if (cost === null) return state;
  const totalCost = 1 + cost;
  if (totalCost > unit.remainingActions) return state;

  state.units.splice(index, 1);
  target.garrison.push({ id: unit.id, unitType: unit.unitType, sp: unit.sp }); // sp carried over (§3/§4)
  return state;
}

// --- Combat (game spec §3's Actions, §4's base capture) ---

/** Whether `attacker` could attack `defender` right now: different owner, within attack range
 * (game spec §3's per-unit table), and `attacker` still has both an attack and an action left
 * this turn. Exported so the UI can route a click to attack without duplicating this logic
 * (implementation-spec.md §1). No LOS-blocking check yet — every actionable unit's range is 1
 * (Tank) until boats/planes land, so "in range" and "adjacent" already coincide with nothing in
 * between to block. */
export function isValidAttackTarget(attacker, defender) {
  if (!attacker || !defender) return false;
  if (attacker.ownerId === defender.ownerId) return false;
  if (attacker.remainingAttacks <= 0 || attacker.remainingActions < 1) return false;
  return offsetDistance(attacker, defender) <= UNIT_TYPES[attacker.unitType].attackRange;
}

/** Open-field unit-vs-unit combat (game spec §3): `attacker`'s atk value against `defender`'s
 * target type (ground/air) is subtracted from `defender`'s sp; destroyed (removed from
 * `state.units`) at 0. Costs 1 action + 1 of the attacker's attacks this turn. No-op if either
 * unit is missing, `attackerUnitId` isn't owned by `activePlayerId`, or the target isn't valid
 * (`isValidAttackTarget`). */
export function attackUnit(state, attackerUnitId, defenderUnitId, activePlayerId) {
  const attacker = state.units.find((u) => u.id === attackerUnitId);
  if (!attacker || attacker.ownerId !== activePlayerId) return state;
  const defenderIndex = state.units.findIndex((u) => u.id === defenderUnitId);
  if (defenderIndex === -1) return state;
  const defender = state.units[defenderIndex];
  if (!isValidAttackTarget(attacker, defender)) return state;

  const atkStats = UNIT_TYPES[attacker.unitType];
  const targetType = UNIT_TYPES[defender.unitType].targetType;
  const damage = targetType === "air" ? atkStats.airAtk : atkStats.groundAtk;

  attacker.remainingActions -= 1;
  attacker.remainingAttacks -= 1;
  defender.sp -= damage;
  if (defender.sp <= 0) state.units.splice(defenderIndex, 1);
  return state;
}

/** Whether `attacker` could attack `base` right now: it's enemy-owned (not neutral, not the
 * attacker's own), and `attacker` is in range with an attack and an action left. Exported for the
 * same reason as `isValidAttackTarget` (§1). */
export function isValidAttackBaseTarget(attacker, base) {
  if (!base || base.ownerId === null || base.ownerId === attacker.ownerId) return false;
  if (attacker.remainingAttacks <= 0 || attacker.remainingActions < 1) return false;
  return offsetDistance(attacker, base) <= UNIT_TYPES[attacker.unitType].attackRange;
}

/** Attacking a claimed (enemy-owned) base (game spec §4): damage first destroys garrisoned
 * units, oldest-entered first, 1 SP of damage each regardless of their own strength stat; any
 * remaining damage spills onto the base's own sp. A unit still under construction is never
 * destroyed. If the base's sp reaches 0, it goes neutral (`ownerId` null) and remembers
 * `lastOwnerId` for §4's recapture rule — a build already in progress survives this unaborted.
 * Costs 1 action + 1 of the attacker's attacks this turn. No-op if either side is missing,
 * `attackerUnitId` isn't owned by `activePlayerId`, or the target isn't valid
 * (`isValidAttackBaseTarget`). */
export function attackBase(state, attackerUnitId, baseId, activePlayerId) {
  const attacker = state.units.find((u) => u.id === attackerUnitId);
  if (!attacker || attacker.ownerId !== activePlayerId) return state;
  const base = state.bases.find((b) => b.id === baseId);
  if (!isValidAttackBaseTarget(attacker, base)) return state;

  attacker.remainingActions -= 1;
  attacker.remainingAttacks -= 1;

  const atkStats = UNIT_TYPES[attacker.unitType];
  let damage = atkStats.groundAtk; // bases are always "ground" targets (§3)
  while (damage > 0 && base.garrison.length > 0) {
    base.garrison.shift(); // oldest-entered first, 1 SP each regardless of their own strength
    damage -= 1;
  }
  if (damage > 0) {
    base.sp = Math.max(0, base.sp - damage);
    if (base.sp === 0) {
      base.lastOwnerId = base.ownerId;
      base.ownerId = null;
    }
  }
  return state;
}

/** Whether `unit` could claim `base` right now: `base` is neutral, `unit`'s type can capture
 * (tank/fighter/fregat) and its category is one `base` accepts, adjacent, and `unit` can afford
 * 1 action + the base's terrain move cost. Exported for the same reason as `isValidUnloadTarget`
 * (§1). */
export function isValidClaimTarget(grid, unit, base) {
  if (!base || base.ownerId !== null) return false;
  if (!CAPTURING_UNIT_TYPES.includes(unit.unitType)) return false;
  if (!BASE_CATEGORIES[base.type].includes(UNIT_TYPES[unit.unitType].category)) return false;
  if (offsetDistance(unit, base) !== 1) return false;
  const cost = moveCost(unit.unitType, grid.get(base.col, base.row));
  if (cost === null) return false;
  return 1 + cost <= unit.remainingActions;
}

/** Claims a neutral base (`ownerId` null — bases start the match already owned by a player, game
 * spec §5, so this only ever applies post-combat) with a unit of a capturing type
 * (tank/fighter/fregat, game spec §4), terrain-gated the same as any base entry. Ownership
 * transfers to the claiming unit's owner, the unit garrisons inside, and sp resets to 4. Only a
 * claim by an owner different from the base's `lastOwnerId` (an actual capture, as opposed to a
 * recapture) clears the queue and in-progress build. Costs 1 action + the base's terrain move
 * cost, same as loading (§2). No-op if `unitId` isn't owned by `activePlayerId` or the target
 * isn't valid (`isValidClaimTarget`). */
export function claimBase(state, grid, unitId, baseId, activePlayerId) {
  const index = state.units.findIndex((u) => u.id === unitId);
  if (index === -1) return state;
  const unit = state.units[index];
  if (unit.ownerId !== activePlayerId) return state;
  const base = state.bases.find((b) => b.id === baseId);
  if (!isValidClaimTarget(grid, unit, base)) return state;

  const isRecapture = base.lastOwnerId === unit.ownerId;
  state.units.splice(index, 1);
  base.garrison.push({ id: unit.id, unitType: unit.unitType, sp: unit.sp });
  base.ownerId = unit.ownerId;
  base.sp = 4;
  if (!isRecapture) {
    base.queue = [];
    base.inProgress = null;
  }
  return state;
}

/** Turn-start processing (game spec §7's per-turn sequence) for whichever player's turn is
 * beginning, in order (implementation-spec.md §2):
 * 1. Passive base repair: +1 SP/turn (capped at max) for every base this player owns and is
 *    damaged, regardless of garrison.
 * 2. Per-unit repair: the first 5 damaged garrisoned units in entry order at each of this
 *    player's bases repair +5 SP/turn each (10 SP per bbr = 2 turns), capped at their own max.
 * 3. Build-timer tick + completion: ticks down in-progress builds; on completion, adds the unit
 *    to the garrison (at full sp) and starts the next queued item if there's room.
 * 4. Automatic neutral-base recapture (game spec §4): also runs for a base this player doesn't
 *    currently own, if it's neutral and they're its `lastOwnerId` — a build survives its base
 *    going neutral, so this is where it finally resolves. Ownership returns to this player and sp
 *    resets to 1 (lower than a manual claim, commands.js's claimBase) once that build completes.
 * Also resets this player's field units back to full actions/attacks per turn (game spec §3). */
export function processTurnStart(state, playerId) {
  for (const base of state.bases) {
    const ownsIt = base.ownerId === playerId;
    const awaitingRecapture = base.ownerId === null && base.lastOwnerId === playerId;
    if (!ownsIt && !awaitingRecapture) continue;

    if (ownsIt) {
      if (base.sp < base.maxSp) base.sp = Math.min(base.maxSp, base.sp + 1);

      let repairing = 0;
      for (const garrisoned of base.garrison) {
        if (repairing >= 5) break;
        const maxSp = UNIT_TYPES[garrisoned.unitType].strength;
        if (garrisoned.sp >= maxSp) continue;
        garrisoned.sp = Math.min(maxSp, garrisoned.sp + 5);
        repairing += 1;
      }
    }

    if (base.inProgress) {
      base.inProgress.remainingTurns -= 1;
      if (base.inProgress.remainingTurns <= 0) {
        const unitType = base.inProgress.unitType;
        base.garrison.push({ id: state.nextUnitId++, unitType, sp: UNIT_TYPES[unitType].strength });
        base.inProgress = null;
        if (awaitingRecapture) {
          base.ownerId = playerId;
          base.sp = 1;
        }
      }
    }
    if (base.ownerId === playerId) maybeStartNextBuild(base);
  }

  for (const unit of state.units) {
    if (unit.ownerId !== playerId) continue;
    unit.remainingActions = UNIT_TYPES[unit.unitType].actionsPerTurn;
    unit.remainingAttacks = UNIT_TYPES[unit.unitType].attacksPerTurn;
  }
  return state;
}

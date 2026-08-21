// Command handlers — the only code allowed to mutate canonical state (tech-stack.md's CQRS-lite
// rule: "separate the code that mutates state from the code that reads/renders it").
import { UNIT_TYPES, BASE_CATEGORIES, buildTurns, buildableUnitTypes, moveCost } from "./unit-types.js";
import { offsetDistance } from "../map/hex-coords.js";
import { baseAtHex, unitAtHex } from "./game-state.js";

const MAX_QUEUE_LENGTH = 5; // §2
const MAX_BASE_CAPACITY = 15; // §2: garrisoned + in-progress builds count against it

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
 * type isn't buildable there or the queue is already full. */
export function queueBuild(state, baseId, unitType) {
  const base = state.bases.find((b) => b.id === baseId);
  if (!base) return state;
  if (base.queue.length >= MAX_QUEUE_LENGTH) return state;
  if (!buildableUnitTypes(base.type, base.adjacentToDeepWater).includes(unitType)) return state;

  base.queue.push({ unitType });
  maybeStartNextBuild(base);
  return state;
}

/** One unit per cell, regardless of owner — bases block regular movement too, since entering a
 * base's own cell is the separate load/unload interaction, not a plain move (game spec §1/§3). */
function isBlockedForMovement(state, col, row) {
  return Boolean(unitAtHex(state, col, row) || baseAtHex(state, col, row));
}

/** Moves a field unit one hex, if the target is adjacent, passable, unoccupied, and affordable
 * from the unit's remaining actions (game spec §3). No-op otherwise. */
export function moveUnit(state, grid, unitId, targetCol, targetRow) {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return state;
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

/** Unloads a garrisoned unit from `base` onto the first valid adjacent hex (passable, unoccupied,
 * affordable) — no destination picker for v1 (implementation-spec.md §2). Costs 1 action + the
 * destination's move cost, from the unit's own fresh action budget (game spec §3). No-op if no
 * valid destination exists. */
export function unloadUnit(state, grid, baseId, unitId) {
  const base = state.bases.find((b) => b.id === baseId);
  if (!base) return state;
  const index = base.garrison.findIndex((u) => u.id === unitId);
  if (index === -1) return state;

  const garrisoned = base.garrison[index];
  const stats = UNIT_TYPES[garrisoned.unitType];

  for (const n of grid.neighborsOf(base.col, base.row)) {
    if (isBlockedForMovement(state, n.col, n.row)) continue;
    const cost = moveCost(garrisoned.unitType, grid.get(n.col, n.row));
    if (cost === null) continue;
    const totalCost = 1 + cost;
    if (totalCost > stats.actionsPerTurn) continue;

    base.garrison.splice(index, 1);
    state.units.push({
      id: garrisoned.id,
      ownerId: base.ownerId,
      unitType: garrisoned.unitType,
      col: n.col,
      row: n.row,
      sp: stats.strength,
      maxSp: stats.strength,
      remainingActions: stats.actionsPerTurn - totalCost,
    });
    return state;
  }
  return state;
}

/** Loads a field unit into an adjacent friendly base of a type that accepts its category, if the
 * base has spare capacity and the unit can afford 1 action + the base's own terrain's move cost
 * (game spec §2/§3). No-op otherwise. */
export function loadUnit(state, grid, unitId) {
  const index = state.units.findIndex((u) => u.id === unitId);
  if (index === -1) return state;
  const unit = state.units[index];
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
  target.garrison.push({ id: unit.id, unitType: unit.unitType });
  return state;
}

/** Turn-start processing (game spec §7's "complete any builds whose timer expired") for
 * whichever player's turn is beginning:
 * - ticks down that player's bases' in-progress build timers, garrisoning the unit on completion
 *   and starting the next queued item if there's room;
 * - resets that player's field units back to their full actions/turn (game spec §3).
 * Passive base repair and neutral-base recapture, also part of §7's turn-start sequence, stay
 * deferred to Stage 6. */
export function processTurnStart(state, playerId) {
  for (const base of state.bases) {
    if (base.ownerId !== playerId) continue;

    if (base.inProgress) {
      base.inProgress.remainingTurns -= 1;
      if (base.inProgress.remainingTurns <= 0) {
        base.garrison.push({ id: state.nextUnitId++, unitType: base.inProgress.unitType });
        base.inProgress = null;
      }
    }
    maybeStartNextBuild(base);
  }

  for (const unit of state.units) {
    if (unit.ownerId !== playerId) continue;
    unit.remainingActions = UNIT_TYPES[unit.unitType].actionsPerTurn;
  }
  return state;
}

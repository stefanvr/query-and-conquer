// Command handlers — the only code allowed to mutate canonical state (tech-stack.md's CQRS-lite
// rule: "separate the code that mutates state from the code that reads/renders it").
import { UNIT_TYPES, BASE_CATEGORIES, CARGO_CATEGORY, buildTurns, buildableUnitTypes, moveCost } from "./unit-types.js";
import { offsetDistance, hexLine } from "../map/hex-coords.js";
import { baseAtHex, unitAtHex } from "./game-state.js";
import { currentlyVisibleCells } from "./visibility.js";

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

/** Merges `playerId`'s currently-visible cells (their own field units' + bases' view radii, game
 * spec §6, via visibility.js's shared computation) into their persisted `exploredCells` — the
 * "once explored, terrain stays revealed" half of fog of war. `getVisibleState` (queries.js)
 * computes "currently visible" fresh on every read, with no persistence needed there; only the
 * sticky "ever explored" memory needs an actual write, and only commands.js may write canonical
 * state (tech-stack.md's CQRS-lite rule). Called after anything that changes `playerId`'s own
 * vision footprint (moveUnit, unloadUnit, unloadCargo, claimBase) and once every turn-start
 * (processTurnStart) as a passive baseline resync — exploredCells only ever grows, so calling
 * this more often than strictly necessary is always safe, never wrong. */
export function markExplored(state, playerId) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  const explored = new Set(player.exploredCells);
  for (const key of currentlyVisibleCells(state, playerId)) explored.add(key);
  player.exploredCells = [...explored];
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
 * player's own units, which stopped being safe to rely on once attack/claim exist (§3).
 *
 * For a plane (`roundTripRange` set, game spec §3's Generic Planes rules), this also tracks its
 * fuel/mandatory-movement counters: `actionsSpentMoving` +cost (the mandatory-≥50%-movement
 * floor, §3's Plane rearm & fuel — never touched by attackUnit/attackBase, so attacks don't
 * count), and `cellsFlown` +1 per hex regardless of that hex's own cost (the round-trip fuel
 * budget). The move still completes even if this pushes `cellsFlown` past `roundTripRange`, but
 * the plane then crashes — destroyed on the spot, read literally from "crashes if range limit is
 * exceeded" rather than as a pre-emptive can't-get-home guard. */
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

  const stats = UNIT_TYPES[unit.unitType];
  if (stats.roundTripRange) {
    unit.actionsSpentMoving += cost;
    unit.cellsFlown += 1;
    if (unit.cellsFlown > stats.roundTripRange) {
      state.units.splice(state.units.indexOf(unit), 1); // crash: fuel exhausted (game spec §3)
    }
  }
  markExplored(state, activePlayerId); // the move may have revealed new cells (§6)
  return state;
}

/** This player's own field planes that still owe their mandatory movement this turn (game spec
 * §3's Generic Planes rules: "must mandatory at least move 50%... when not Garrisoned") — able to
 * move further (`remainingActions > 0`) but under half their type's `actionsPerTurn` spent on
 * movement (`actionsSpentMoving`, attacks excluded — see moveUnit). The `remainingActions > 0`
 * half matters: a plane that spent its whole turn attacking instead has nothing left it could do
 * about it, so it must not block ending the turn. A garrisoned plane never appears in
 * `state.units` at all, so it's naturally exempt too. Exported so the HUD can gate/label End Turn
 * without duplicating this logic (implementation-spec.md §6). */
export function planesOwingMovement(state, playerId) {
  return state.units.filter((u) => {
    if (u.ownerId !== playerId || u.remainingActions <= 0) return false;
    const stats = UNIT_TYPES[u.unitType];
    return Boolean(stats.roundTripRange) && u.actionsSpentMoving < stats.actionsPerTurn / 2;
  });
}

/** Field-unit shape a garrisoned/cargo entry becomes on exit (unload/unloadCargo) — sp carried
 * over (a damaged unit stays damaged, §3/§4), a fresh cargo hold if the exiting type has one. A
 * plane (`roundTripRange` set) also gets its rearm/fuel counters, always starting fresh at 0 —
 * every entry into a garrison/cargo hold is a rearm event for whichever plane type can reach it
 * at all: a base entry always rearms (§3's Plane rearm & fuel), and the only plane that can ever
 * board a Carrier (`boardsCarrier`, loadIntoBoat) always rearms there too, by definition. */
function toFieldUnit(entry, ownerId, targetCol, targetRow, remainingActions) {
  const stats = UNIT_TYPES[entry.unitType];
  const unit = {
    id: entry.id,
    ownerId,
    unitType: entry.unitType,
    col: targetCol,
    row: targetRow,
    sp: entry.sp,
    maxSp: stats.strength,
    remainingActions,
    remainingAttacks: stats.attacksPerTurn,
  };
  if (stats.holdCapacity) unit.cargo = [];
  if (stats.roundTripRange) {
    unit.strikesUsed = 0;
    unit.cellsFlown = 0;
    unit.actionsSpentMoving = 0;
  }
  return unit;
}

/** Whether `targetCol`/`targetRow` is a valid unload destination for `garrisoned` out of
 * `container` (a base or a boat — implementation-spec.md §1's unload destination picker) —
 * adjacent to the container, passable for the unit's type, unoccupied, and affordable within the
 * unit's full action budget. Exported so the UI can compute which adjacent hexes to highlight
 * without duplicating this logic. */
export function isValidUnloadTarget(state, grid, container, garrisoned, targetCol, targetRow) {
  if (offsetDistance({ col: container.col, row: container.row }, { col: targetCol, row: targetRow }) !== 1) return false;
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

  const cost = moveCost(garrisoned.unitType, grid.get(targetCol, targetRow));
  base.garrison.splice(index, 1);
  const remainingActions = UNIT_TYPES[garrisoned.unitType].actionsPerTurn - (1 + cost);
  state.units.push(toFieldUnit(garrisoned, base.ownerId, targetCol, targetRow, remainingActions));
  markExplored(state, base.ownerId); // a new field unit is a new vision source (§6)
  return state;
}

/** Unloads a cargo unit from `boat` onto the given adjacent hex — the same destination picker
 * and cost pattern as unloadUnit, just from a boat's cargo hold instead of a base's garrison
 * (§1/§3). No-op if the destination isn't valid, or `boat` isn't owned by `activePlayerId`. */
export function unloadCargo(state, grid, boatId, unitId, targetCol, targetRow, activePlayerId) {
  const boat = state.units.find((u) => u.id === boatId);
  if (!boat) return state;
  if (boat.ownerId !== activePlayerId) return state;
  const index = boat.cargo.findIndex((u) => u.id === unitId);
  if (index === -1) return state;

  const cargoUnit = boat.cargo[index];
  if (!isValidUnloadTarget(state, grid, boat, cargoUnit, targetCol, targetRow)) return state;

  const cost = moveCost(cargoUnit.unitType, grid.get(targetCol, targetRow));
  boat.cargo.splice(index, 1);
  const remainingActions = UNIT_TYPES[cargoUnit.unitType].actionsPerTurn - (1 + cost);
  state.units.push(toFieldUnit(cargoUnit, boat.ownerId, targetCol, targetRow, remainingActions));
  markExplored(state, boat.ownerId); // a new field unit is a new vision source (§6)
  return state;
}

/** The move-cost component of "1 action + move cost" for `unit` entering any container — a base
 * or a boat (game spec §3's Actions) — based on the terrain `unit` is already standing on, not
 * the container's own cell. Neither side of most entries can actually stand on the other's
 * terrain: a base's own cell is land, impassable for any boat entering it (game spec §3: "for a
 * boat this can happen anywhere water is adjacent to land"), and a boat's own cell is water,
 * impassable for e.g. a tank boarding it — so the container's own cell is never a meaningful
 * move-cost source; the entering unit's own current cell always is. */
function enterCost(grid, unit) {
  return moveCost(unit.unitType, grid.get(unit.col, unit.row));
}

/** `unit`'s adjacency/ownership/category/cost checks for entering `base` — everything
 * isValidLoadTarget checks except capacity, since enterBaseWithCargo (§2) needs a different
 * (combined boat + cargo) capacity rule than a lone unit's. */
function canEnterBase(grid, unit, base) {
  if (!base) return false;
  if (base.ownerId !== unit.ownerId) return false;
  if (!BASE_CATEGORIES[base.type].includes(UNIT_TYPES[unit.unitType].category)) return false;
  if (offsetDistance(unit, base) !== 1) return false;
  const cost = enterCost(grid, unit);
  if (cost === null) return false;
  return 1 + cost <= unit.remainingActions;
}

/** Whether `unit` could load into `base` right now (implementation-spec.md §1's Load destination
 * picker): friendly, category-accepted, adjacent, affordable, and spare capacity for the one
 * unit. Exported for the same reason as isValidUnloadTarget. */
export function isValidLoadTarget(grid, unit, base) {
  return canEnterBase(grid, unit, base) && capacityUsed(base) < MAX_BASE_CAPACITY;
}

/** Loads a field unit into an adjacent friendly base of a type that accepts its category, if the
 * base has spare capacity and the unit can afford 1 action + its own current terrain's move cost
 * (game spec §2/§3, enterCost). No-op otherwise, or if `unit` isn't owned by `activePlayerId`
 * (§3). A boat (transporter/carrier) uses enterBaseWithCargo instead, even when empty — see its
 * own doc comment. */
export function loadUnit(state, grid, unitId, baseId, activePlayerId) {
  const index = state.units.findIndex((u) => u.id === unitId);
  if (index === -1) return state;
  const unit = state.units[index];
  if (unit.ownerId !== activePlayerId) return state;
  const base = state.bases.find((b) => b.id === baseId);
  if (!isValidLoadTarget(grid, unit, base)) return state;

  state.units.splice(index, 1);
  base.garrison.push({ id: unit.id, unitType: unit.unitType, sp: unit.sp }); // sp carried over (§3/§4)
  return state;
}

/** A transporter/carrier entering a friendly base (Load destination picker, §1) unloads for
 * free — itself and every unit it's carrying join the garrison directly, at no extra action cost
 * beyond the boat's own entry (game spec §2). Only if the base has enough spare capacity for the
 * boat *and* everything it's carrying; otherwise the whole entry is rejected (all-or-nothing).
 * Costs 1 action + the boat's own current terrain's move cost (enterCost), same as loadUnit, but
 * only spent on success. No-op if `boatId` isn't owned by `activePlayerId`. */
export function enterBaseWithCargo(state, grid, boatId, baseId, activePlayerId) {
  const index = state.units.findIndex((u) => u.id === boatId);
  if (index === -1) return state;
  const boat = state.units[index];
  if (boat.ownerId !== activePlayerId) return state;
  const base = state.bases.find((b) => b.id === baseId);
  if (!canEnterBase(grid, boat, base)) return state;
  const cargo = boat.cargo ?? [];
  if (capacityUsed(base) + 1 + cargo.length > MAX_BASE_CAPACITY) return state;

  state.units.splice(index, 1);
  base.garrison.push({ id: boat.id, unitType: boat.unitType, sp: boat.sp });
  for (const cargoUnit of cargo) base.garrison.push({ id: cargoUnit.id, unitType: cargoUnit.unitType, sp: cargoUnit.sp });
  return state;
}

/** Whether `unit` could load into `boat`'s cargo hold right now (implementation-spec.md §1's
 * Load destination picker): friendly, `boat`'s one accepted cargo category matches `unit`'s
 * (CARGO_CATEGORY), adjacent, affordable, and spare capacity. A boat can't load into another
 * boat — only a vehicle/plane-category unit can be cargo. A Bomber can never board a Carrier at
 * all (`boardsCarrier` unset — game spec §3's asymmetric rearm note isn't just "doesn't rearm
 * there," it can't be carried there in the first place; a Carrier is the only boat that accepts
 * planes as cargo, so this is the one case that check applies to). Exported for the same reason
 * as isValidUnloadTarget. */
export function isValidLoadIntoBoatTarget(grid, unit, boat) {
  if (!boat || boat.id === unit.id) return false;
  if (boat.ownerId !== unit.ownerId) return false;
  const capacity = UNIT_TYPES[boat.unitType].holdCapacity;
  if (!capacity || boat.cargo.length >= capacity) return false;
  if (CARGO_CATEGORY[boat.unitType] !== UNIT_TYPES[unit.unitType].category) return false;
  if (boat.unitType === "carrier" && !UNIT_TYPES[unit.unitType].boardsCarrier) return false;
  if (offsetDistance(unit, boat) !== 1) return false;
  const cost = enterCost(grid, unit);
  if (cost === null) return false;
  return 1 + cost <= unit.remainingActions;
}

/** Loads a field unit into an adjacent friendly boat's cargo hold (game spec §3's
 * `holdCapacity`) — same cost/ownership pattern as loadUnit, just into a boat instead of a base.
 * No-op if the target isn't valid (isValidLoadIntoBoatTarget) or `unit` isn't owned by
 * `activePlayerId`. Never carries `strikesUsed`/`cellsFlown` into the cargo entry — the only
 * plane that can ever reach a Carrier's cargo hold is one with `boardsCarrier` set (Fighter), and
 * that always rearms on entry, so a fresh 0/0 (toFieldUnit's own default) is always correct here;
 * a Bomber never gets this far (isValidLoadIntoBoatTarget rejects it outright). */
export function loadIntoBoat(state, grid, unitId, boatId, activePlayerId) {
  const index = state.units.findIndex((u) => u.id === unitId);
  if (index === -1) return state;
  const unit = state.units[index];
  if (unit.ownerId !== activePlayerId) return state;
  const boat = state.units.find((u) => u.id === boatId);
  if (!isValidLoadIntoBoatTarget(grid, unit, boat)) return state;

  state.units.splice(index, 1);
  boat.cargo.push({ id: unit.id, unitType: unit.unitType, sp: unit.sp });
  return state;
}

// --- Combat (game spec §3's Actions, §4's base capture) ---

/** Whether line of sight from `from` to `to` is clear: no mountain cell, unit, or base anywhere
 * strictly between the two endpoints (game spec §1). Traces the actual hex line (hexLine) rather
 * than assuming a straight run of same-row/col cells, since ranges are hex-distance radii, not
 * lines — an off-axis target at distance 2+ still has real cells in between to check. */
function hasLineOfSight(state, grid, from, to) {
  const line = hexLine(from, to);
  for (let i = 1; i < line.length - 1; i++) {
    // excludes both endpoints — line[0] is `from` itself, line[last] is `to` itself
    const { col, row } = line[i];
    if (grid.get(col, row) === "mountain") return false;
    if (unitAtHex(state, col, row) || baseAtHex(state, col, row)) return false;
  }
  return true;
}

/** Whether `attacker` could attack `defender` right now: different owner, within attack range
 * (game spec §3's per-unit table), line of sight clear if `attacker`'s type needs it (game spec
 * §1 — moot for a range-1 attacker, since there's no cell in between to block), and `attacker`
 * still has both an attack and an action left this turn. Exported so the UI can route a click to
 * attack without duplicating this logic (implementation-spec.md §1). */
export function isValidAttackTarget(state, grid, attacker, defender) {
  if (!attacker || !defender) return false;
  if (attacker.ownerId === defender.ownerId) return false;
  if (attacker.remainingAttacks <= 0 || attacker.remainingActions < 1) return false;
  const stats = UNIT_TYPES[attacker.unitType];
  if (stats.maxStrikes && attacker.strikesUsed >= stats.maxStrikes) return false;
  if (offsetDistance(attacker, defender) > stats.attackRange) return false;
  return !stats.needsLOS || hasLineOfSight(state, grid, attacker, defender);
}

/** Open-field unit-vs-unit combat (game spec §3): `attacker`'s atk value against `defender`'s
 * target type (ground/air) is subtracted from `defender`'s sp; destroyed (removed from
 * `state.units`) at 0. Costs 1 action + 1 of the attacker's attacks this turn. No-op if either
 * unit is missing, `attackerUnitId` isn't owned by `activePlayerId`, or the target isn't valid
 * (`isValidAttackTarget`). */
export function attackUnit(state, grid, attackerUnitId, defenderUnitId, activePlayerId) {
  const attacker = state.units.find((u) => u.id === attackerUnitId);
  if (!attacker || attacker.ownerId !== activePlayerId) return state;
  const defenderIndex = state.units.findIndex((u) => u.id === defenderUnitId);
  if (defenderIndex === -1) return state;
  const defender = state.units[defenderIndex];
  if (!isValidAttackTarget(state, grid, attacker, defender)) return state;

  const atkStats = UNIT_TYPES[attacker.unitType];
  const targetType = UNIT_TYPES[defender.unitType].targetType;
  const damage = targetType === "air" ? atkStats.airAtk : atkStats.groundAtk;

  attacker.remainingActions -= 1;
  attacker.remainingAttacks -= 1;
  if (atkStats.maxStrikes) attacker.strikesUsed += 1;
  defender.sp -= damage;
  if (defender.sp <= 0) state.units.splice(defenderIndex, 1);
  return state;
}

/** Whether `attacker` could attack `base` right now: it's enemy-owned (not neutral, not the
 * attacker's own), in range with line of sight clear if needed (see `isValidAttackTarget`), and
 * `attacker` has an attack and an action left. Exported for the same reason as
 * `isValidAttackTarget` (§1). */
export function isValidAttackBaseTarget(state, grid, attacker, base) {
  if (!base || base.ownerId === null || base.ownerId === attacker.ownerId) return false;
  if (attacker.remainingAttacks <= 0 || attacker.remainingActions < 1) return false;
  const stats = UNIT_TYPES[attacker.unitType];
  if (stats.maxStrikes && attacker.strikesUsed >= stats.maxStrikes) return false;
  if (offsetDistance(attacker, base) > stats.attackRange) return false;
  return !stats.needsLOS || hasLineOfSight(state, grid, attacker, base);
}

/** Attacking a claimed (enemy-owned) base (game spec §4): damage first destroys garrisoned
 * units, oldest-entered first, 1 SP of damage each regardless of their own strength stat; any
 * remaining damage spills onto the base's own sp. A unit still under construction is never
 * destroyed. If the base's sp reaches 0, it goes neutral (`ownerId` null) and remembers
 * `lastOwnerId` for §4's recapture rule — a build already in progress survives this unaborted.
 * Costs 1 action + 1 of the attacker's attacks this turn. No-op if either side is missing,
 * `attackerUnitId` isn't owned by `activePlayerId`, or the target isn't valid
 * (`isValidAttackBaseTarget`). */
export function attackBase(state, grid, attackerUnitId, baseId, activePlayerId) {
  const attacker = state.units.find((u) => u.id === attackerUnitId);
  if (!attacker || attacker.ownerId !== activePlayerId) return state;
  const base = state.bases.find((b) => b.id === baseId);
  if (!isValidAttackBaseTarget(state, grid, attacker, base)) return state;

  attacker.remainingActions -= 1;
  attacker.remainingAttacks -= 1;

  const atkStats = UNIT_TYPES[attacker.unitType];
  if (atkStats.maxStrikes) attacker.strikesUsed += 1;
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
 * (tank/fighter/fregat — game spec §4: "no other unit type can capture a base"), adjacent, and
 * `unit` can afford 1 action + its own current terrain's move cost (enterCost). Deliberately does
 * *not* gate on `BASE_CATEGORIES` (the base-*build*-eligibility table) — the design doc's own
 * claim rule has no base-type restriction beyond natural terrain reachability: "since fregats
 * can't move onto land, they can only ever claim a port base; a mountain base... can only be
 * claimed by a fighter." Both of those already fall out of `enterCost`/adjacency on their own
 * (a fregat is always on water, and a land-only base is by definition never water-adjacent so a
 * fregat can never be next to one; a tank's `moveCost.mountain` is 0, so it can never stand
 * adjacent to a mountain base either, since every one of its neighbors is also mountain) — reusing
 * `BASE_CATEGORIES` on top of that incorrectly blocked e.g. a Fighter claiming a Land or Port
 * base, which the design doc never restricts. Exported for the same reason as
 * `isValidUnloadTarget` (§1). */
export function isValidClaimTarget(grid, unit, base) {
  if (!base || base.ownerId !== null) return false;
  if (!CAPTURING_UNIT_TYPES.includes(unit.unitType)) return false;
  if (offsetDistance(unit, base) !== 1) return false;
  const cost = enterCost(grid, unit);
  if (cost === null) return false;
  return 1 + cost <= unit.remainingActions;
}

/** Claims a neutral base (`ownerId` null — bases start the match already owned by a player, game
 * spec §5, so this only ever applies post-combat) with a unit of a capturing type
 * (tank/fighter/fregat, game spec §4), terrain-gated the same as any base entry. Ownership
 * transfers to the claiming unit's owner, the unit garrisons inside, and sp resets to 4. Only a
 * claim by an owner different from the base's `lastOwnerId` (an actual capture, as opposed to a
 * recapture) clears the queue and in-progress build. Costs 1 action + its own current terrain's
 * move cost, same as loading (§2). No-op if `unitId` isn't owned by `activePlayerId` or the target
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
  markExplored(state, unit.ownerId); // the base is a new vision source for its new owner (§6)
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
 * Also resets this player's field units back to full actions/attacks per turn (game spec §3), a
 * plane's `actionsSpentMoving` back to 0 (its mandatory-movement floor is this-turn-only, §3's
 * Plane rearm & fuel — `strikesUsed`/`cellsFlown` are untouched here, since those only reset on
 * an actual rearm, not every turn), and resyncs this player's persisted fog-of-war exploration
 * (§6's markExplored) as a passive baseline — the other call sites (moveUnit, unloadUnit,
 * unloadCargo, claimBase) already cover anything that changes mid-turn; this catches everything
 * else (a stationary base's own view, a turn where nothing moved). */
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
    const stats = UNIT_TYPES[unit.unitType];
    unit.remainingActions = stats.actionsPerTurn;
    unit.remainingAttacks = stats.attacksPerTurn;
    if (stats.roundTripRange) unit.actionsSpentMoving = 0; // this-turn-only (§3's Plane rearm & fuel)
  }
  markExplored(state, playerId); // passive baseline vision resync (§6) — safe even if nothing moved
  return state;
}

// Command handlers — the only code allowed to mutate canonical state (tech-stack.md's CQRS-lite
// rule: "separate the code that mutates state from the code that reads/renders it").
import { buildTurns, buildableUnitTypes } from "./unit-types.js";

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

/** Turn-start build processing (game spec §7's "complete any builds whose timer expired") for
 * whichever player's turn is beginning — ticks down each of their bases' in-progress builds,
 * completing and garrisoning the unit when the timer reaches 0, then starting the next queued
 * item if there's room. Passive base repair and neutral-base recapture, also part of §7's
 * turn-start sequence, stay deferred to Stage 6. */
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
  return state;
}

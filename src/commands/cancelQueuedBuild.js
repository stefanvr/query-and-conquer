/**
 * Command handler: remove a pending (not-yet-started) order from a
 * base's build queue. Only the queue is touched -- the in-progress
 * build (base.currentBuild) can't be cancelled this way; queuing costs
 * no actions, so cancelling doesn't refund anything either.
 */

/**
 * @param {object} canonicalState
 * @param {{baseId: number, queueIndex: number}} payload
 * @returns {{success: boolean, reason?: string, removedType?: string}}
 */
export function cancelQueuedBuild(canonicalState, { baseId, queueIndex }) {
  const base = canonicalState.bases.find((b) => b.id === baseId);
  if (!base) return { success: false, reason: "No such base." };

  const activePlayer = canonicalState.players[canonicalState.turn.activePlayerIndex];
  if (base.ownerId !== activePlayer.id) {
    return { success: false, reason: "Not your base, or not your turn." };
  }
  if (queueIndex < 0 || queueIndex >= base.buildQueue.length) {
    return { success: false, reason: "No such queued build." };
  }

  const [removedType] = base.buildQueue.splice(queueIndex, 1);
  return { success: true, removedType };
}

/**
 * Win/elimination detection (design doc §6): "A player who loses all
 * bases is eliminated ... The game ends when only one player still owns
 * any base." Purely derived from current bases -- no separate
 * "eliminated" flag is stored on canonical state, so there's nothing
 * for a command to forget to update when a base changes hands.
 */

/**
 * @param {object} canonicalState
 * @returns {{isOver: boolean, winnerId: (number|string|null), eliminatedPlayerIds: (number|string)[]}}
 */
export function getGameStatus(canonicalState) {
  const { players, bases } = canonicalState;
  const ownsABase = (playerId) => bases.some((b) => b.ownerId === playerId);

  const remaining = players.filter((p) => ownsABase(p.id));
  const eliminatedPlayerIds = players.filter((p) => !ownsABase(p.id)).map((p) => p.id);

  // Guard against a degenerate single-player sandbox (no AI yet, no
  // opponent) trivially reporting "game over, you win" from turn one.
  const isOver = players.length > 1 && remaining.length <= 1;

  return {
    isOver,
    winnerId: isOver && remaining.length === 1 ? remaining[0].id : null,
    eliminatedPlayerIds,
  };
}

// Command handlers — the only code allowed to mutate canonical state (tech-stack.md's CQRS-lite
// rule: "separate the code that mutates state from the code that reads/renders it").

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

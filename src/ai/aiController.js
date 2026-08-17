/**
 * Top-level AI turn driver. Wires together a player's strategy
 * (src/ai/strategies/*.js) and difficulty (src/ai/difficulty/*.js),
 * runs base build decisions once, then walks units. Every mutation
 * goes through the normal command dispatch table (src/commands/index.js)
 * -- AI never has an alternate mutation path, only a different (or, for
 * hard AI in Stage 7, unfiltered) READ path.
 *
 * Speed pacing (design doc §6: "AI: actions play out step by step, at a
 * configurable speed (instant / fast [1s per action] / slow [2s per
 * action])") is implemented by draining src/ai/priorityWalk.js's
 * generator with an awaited delay between each yielded action, calling
 * onStep() (typically a redraw) after every one -- runAiTurn (the
 * synchronous entry point, used by instant speed and by tests) just
 * drains the same generator with no delay.
 */
import { STRATEGIES } from "./strategies/index.js";
import { DIFFICULTIES } from "./difficulty/index.js";
import { decideBaseBuilds } from "./baseBuildDecision.js";
import { walkUnits } from "./priorityWalk.js";

export const AI_SPEEDS = { instant: 0, fast: 1000, slow: 2000 };

function resolvePlayer(canonicalState, aiPlayerId) {
  const player = canonicalState.players.find((p) => p.id === aiPlayerId);
  const strategy = STRATEGIES[player.strategy];
  const deps = DIFFICULTIES[player.difficulty]();
  return { player, strategy, deps };
}

/**
 * Runs one AI player's entire turn immediately (no pacing) -- used by
 * "instant" speed and by tests.
 * @param {object} canonicalState
 * @param {number|string} aiPlayerId
 */
export function runAiTurn(canonicalState, aiPlayerId) {
  const { strategy, deps } = resolvePlayer(canonicalState, aiPlayerId);
  decideBaseBuilds(canonicalState, aiPlayerId, strategy);
  for (const _step of walkUnits(canonicalState, aiPlayerId, strategy, deps)) {
    // drain synchronously, no pacing
  }
}

/**
 * Runs one AI player's entire turn with a delay between each action,
 * for "fast"/"slow" speed -- calls onStep() (typically a redraw) after
 * every single dispatched command.
 * @param {object} canonicalState
 * @param {number|string} aiPlayerId
 * @param {{delayMs?: number, onStep?: (step: object) => void}} [opts]
 */
export async function runAiTurnAnimated(canonicalState, aiPlayerId, { delayMs = 0, onStep } = {}) {
  const { strategy, deps } = resolvePlayer(canonicalState, aiPlayerId);
  decideBaseBuilds(canonicalState, aiPlayerId, strategy);
  onStep?.({ unitId: null, action: "build", result: { success: true } });

  for (const step of walkUnits(canonicalState, aiPlayerId, strategy, deps)) {
    onStep?.(step);
    if (delayMs > 0) await sleep(delayMs);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

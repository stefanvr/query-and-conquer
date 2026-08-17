/**
 * Difficulty registry, keyed by name for lookup from a player's
 * `difficulty` field. Each entry is a FACTORY (called with no args) --
 * see src/ai/difficulty/easy.js -- returning a fresh deps bundle per
 * call, since some future difficulty could reasonably want per-call
 * state (e.g. a hard AI cache) rather than a shared singleton.
 *
 * Only "easy" exists yet (design doc §9's difficulty table -- Stage 6
 * scope). "hard" (full map knowledge, real pathfinding/targeting)
 * arrives in Stage 7 and slots in here without changing anything else
 * -- every strategy module already calls into `deps` generically.
 */
import { createEasyDeps } from "./easy.js";

export const DIFFICULTIES = { easy: createEasyDeps };
export const DIFFICULTY_NAMES = Object.keys(DIFFICULTIES);

/**
 * getVisibleState(canonicalState, viewerId) -- the CQRS "query" seam.
 * Stub only -- implemented for real in Stage 3 (as a thin terrain-only
 * projection) and extended with fog-of-war filtering in Stage 4.
 *
 * This is the ONE function rendering, human UI, and easy-difficulty AI
 * are allowed to read game state through. Nothing else reads
 * canonicalState directly except command handlers (which mutate it)
 * and hard-difficulty AI (the one documented exception, per
 * doc/tech-stack.md's "State access rule").
 */
export {};

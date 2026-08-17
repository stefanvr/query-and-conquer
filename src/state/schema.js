/**
 * Save-compatibility check for canonical state. `CURRENT_SCHEMA_VERSION`
 * itself lives in src/state/initialState.js (where the shape it
 * describes is actually defined); this module is where a version
 * mismatch gets decided what to do about, and where future migrations
 * would be registered -- none exist yet, since v1 has nothing to
 * migrate from, but the seam exists from Stage 5 on so a shape change
 * later doesn't silently corrupt an old save (see the implementation
 * plan's "save schema versioning" risk note).
 */
import { CURRENT_SCHEMA_VERSION } from "./initialState.js";

/**
 * @param {object} data - a parsed save blob
 * @returns {boolean}
 */
export function isCompatibleSave(data) {
  return !!data && typeof data === "object" && data.schemaVersion === CURRENT_SCHEMA_VERSION;
}

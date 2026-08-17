/**
 * Reads color values out of the CSS custom properties defined in
 * src/styles/tokens.css, so canvas rendering (which needs actual hex
 * strings, not var() references) still has exactly one source of
 * truth for the palette instead of a second hard-coded copy in JS.
 * Cached per token name -- these values don't change at runtime.
 */

const cache = new Map();

/**
 * @param {string} tokenName - e.g. "--t-gras"
 * @returns {string} the resolved CSS value (e.g. "#4F5D33")
 */
export function getCssToken(tokenName) {
  if (!cache.has(tokenName)) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
    cache.set(tokenName, value);
  }
  return cache.get(tokenName);
}

const TERRAIN_TOKENS = {
  gras: "--t-gras",
  gravel: "--t-gravel",
  mountain: "--t-mountain",
  sand: "--t-sand",
  shallow: "--t-shallow",
  deep: "--t-deep",
};

/**
 * @param {string} terrain
 * @returns {string} resolved hex color for that terrain type
 */
export function getTerrainColor(terrain) {
  const token = TERRAIN_TOKENS[terrain];
  if (!token) throw new Error(`Unknown terrain type: ${terrain}`);
  return getCssToken(token);
}

const PLAYER_ACCENT_TOKENS = ["--p-human", "--p-ai-1", "--p-ai-2", "--p-ai-3", "--p-ai-4", "--p-ai-5"];

/**
 * @param {number} playerIndex - 0 = human, 1-5 = AI slots (style-guide.md §3's fixed order)
 * @returns {string} resolved hex color for that player slot
 */
export function getPlayerColor(playerIndex) {
  const token = PLAYER_ACCENT_TOKENS[playerIndex] ?? PLAYER_ACCENT_TOKENS[PLAYER_ACCENT_TOKENS.length - 1];
  return getCssToken(token);
}

/**
 * @returns {number} the confirmed fog "explored, not visible" dim alpha (0.30)
 */
export function getFogDimAlpha() {
  return parseFloat(getCssToken("--fog-dim-alpha"));
}

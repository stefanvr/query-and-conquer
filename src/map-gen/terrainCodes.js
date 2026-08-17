/**
 * Terrain type definitions and compact single-digit codes, shared by
 * the map generator (Node, writes data/maps/*.json) and by the
 * renderer (browser, Stage 3+, reads the same files) -- one place
 * owns the terrain <-> code mapping so the two never drift apart.
 *
 * Design doc §1: Land = gras, gravel, mountain, sand. Water = shallow,
 * deep.
 */

export const LAND_TERRAINS = ["gras", "gravel", "mountain", "sand"];
export const WATER_TERRAINS = ["shallow", "deep"];
export const ALL_TERRAINS = [...LAND_TERRAINS, ...WATER_TERRAINS];

/** Terrain name -> single-digit code used in the row-string encoding. */
export const TERRAIN_TO_CODE = {
  gras: "0",
  gravel: "1",
  mountain: "2",
  sand: "3",
  shallow: "4",
  deep: "5",
};

/** Single-digit code -> terrain name. */
export const CODE_TO_TERRAIN = Object.fromEntries(
  Object.entries(TERRAIN_TO_CODE).map(([name, code]) => [code, name])
);

/**
 * @param {string} terrain
 * @returns {boolean}
 */
export function isLand(terrain) {
  return LAND_TERRAINS.includes(terrain);
}

/**
 * @param {string} terrain
 * @returns {boolean}
 */
export function isWater(terrain) {
  return WATER_TERRAINS.includes(terrain);
}

/**
 * Encode one grid row (array of terrain names) as a compact digit string.
 * @param {string[]} row
 * @returns {string}
 */
export function encodeRow(row) {
  return row.map((terrain) => TERRAIN_TO_CODE[terrain]).join("");
}

/**
 * Decode a compact digit string back into an array of terrain names.
 * @param {string} rowString
 * @returns {string[]}
 */
export function decodeRow(rowString) {
  return rowString.split("").map((code) => CODE_TO_TERRAIN[code]);
}

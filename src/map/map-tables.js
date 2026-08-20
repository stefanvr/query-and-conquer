// Size/type tables — mirrors query-and-conquer.md §1 "Generation" exactly. Single source of
// truth so the generator, its tests, and the build script all agree on the numbers.

export const SIZES = {
  small: { maxDimension: 60, maxCells: 1600 },
  medium: { maxDimension: 80, maxCells: 4800 },
  large: { maxDimension: 100, maxCells: 8000 },
  extraLarge: { maxDimension: 120, maxCells: 12000 },
};

export const TYPES = {
  landOnly: {},
  mixed: { waterMin: 0.1, waterMax: 0.3, minDeepCoasts: 2 },
  islands: {
    waterMin: 0.35,
    waterMax: 0.4,
    minIslandSize: 180,
    minIslands: 6,
    minDeepIslands: 3,
  },
};

export const SHAPE_KINDS = ["rectangle", "square", "hexagon", "circle"];

export const LAND_TERRAINS = ["gras", "gravel", "mountain", "sand"];
export const WATER_TERRAINS = ["shallow", "deep"];

/** Minimum contiguous bounding-box extent for any disconnected land or water body (§1). */
export const MIN_BODY_EXTENT = 4;

/** Maximum width of a shallow-water band before it must be enclosed by land (§1). */
export const MAX_SHALLOW_CHAIN = 3;

/** Candidate maps pre-generated per size x type combination (§1 "Generation"). */
export const CANDIDATES_PER_COMBO = 10;

/**
 * Static per-base-type stats (design doc §2 "Buildings"). Pure data,
 * pulled forward from its originally-planned Stage 5 slot because
 * Stage 4 needs `view` (fog-of-war visibility) and `locationRequirement`
 * (base placement, §7) now. The build/repair ECONOMY -- queueing,
 * capacity enforcement, repair timing -- is still Stage 5; only the
 * numbers live here so far.
 *
 * `canBuild` reflects design doc §2's Can-Build column read through the
 * unit categories in src/units/unitDefs.js (UNIT_CATEGORIES) -- Land =
 * the Vehicle category (tank only), Port = Boats + Vehicles (boats
 * plus tank), Mountain = Planes only. Land base's canBuild used to list
 * all 6 unit types (reading "All vehicles" as "all unit types", since
 * §3 titles the whole roster "Vehicles" too) -- that let a land base
 * build boats it could never move anywhere, since a land base is by
 * definition never adjacent to water and every boat has move cost 0 on
 * every land terrain.
 */

export const BASE_TYPES = ["land", "port", "mountain"];

export const BASE_DEFS = {
  land: {
    canBuild: ["tank"],
    view: 4,
    strength: 20,
  },
  port: {
    canBuild: ["fregat", "transporter", "carrier", "tank"],
    view: 4,
    strength: 20,
  },
  mountain: {
    canBuild: ["fighter", "bomber"],
    view: 8,
    strength: 20,
  },
};

/** design doc §2 "Build cost (x bbt)" -- bbt = 5 turns (BUILD_TIME_TURNS below). */
export const BUILD_COST_MULTIPLIER = {
  tank: 1,
  transporter: 1,
  fighter: 2,
  fregat: 3,
  bomber: 5,
  carrier: 8,
};

export const BUILD_TIME_TURNS = 5; // bbt
export const REPAIR_TIME_TURNS = 2; // bbr
export const REPAIR_RATE_PER_BBR = 10; // SP per bbr, per unit under repair
export const PASSIVE_BASE_REPAIR_PER_TURN = 1; // SP/turn, whether or not garrisoned
export const MAX_PARALLEL_REPAIRS = 5;
export const MAX_BUILD_QUEUE = 5;
export const MAX_BASE_CAPACITY = 15; // garrisoned + in-progress builds
export const NEUTRAL_BASE_RECAPTURE_STRENGTH = 1;
export const CAPTURED_BASE_RESET_STRENGTH = 4;

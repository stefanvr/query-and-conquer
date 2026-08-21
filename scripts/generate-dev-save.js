#!/usr/bin/env node
// Generates assets/dev-save.json — a fixed, deterministic save for the main menu's dev-only
// "Load test game" entry (implementation-spec.md §8/§10). Built with the same createGameState/
// commands used by real matches, so its shape can never drift from what the app actually
// produces; run manually when you want to refresh it (e.g. Stage 5 added a tank next to the
// human's base, to exercise movement/load/unload without playing out a full build queue first).
//
// Stage 6 additions: the base and its second garrisoned tank are damaged (sp set directly —
// there's no command path to simulate combat damage without actually playing out a battle, so
// this one exception aside, everything else here still goes through real commands), to exercise
// repair without playing a battle first. A neutral base is hand-placed near the human's own
// (map generation only ever places bases already owned, one per player, §5 — a real
// pre-neutral/contestable base is Stage 13 backlog, not built yet) so the Claim command has
// something to test the same way.
//
// Stage 7 additions: the dev map is land-only (no water anywhere, so no port base could ever
// come from real placement either), so a small coastal patch and a port base are hand-carved in
// after placement has already settled the rest — same reasoning as the neutral base above. A
// transporter carrying a tank sits on the water next to it, for cargo/boat-entry testing without
// needing to build and sail one out first.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGameState, playerBase } from "../src/state/game-state.js";
import { queueBuild, processTurnStart, unloadUnit } from "../src/state/commands.js";
import { deserializeGrid, serializeGrid } from "../src/map/map-serialize.js";
import { buildTurns, UNIT_TYPES } from "../src/state/unit-types.js";
import { mulberry32 } from "../src/map/prng.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const mapData = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "assets", "maps", "small-landOnly-0.json"), "utf8"),
);

const options = {
  aiDifficulties: ["easy"],
  mapSize: "small",
  mapType: "landOnly",
  fogOfWar: true,
};

const state = createGameState(options, mapData, mulberry32(1));
const grid = deserializeGrid(state.map.width, state.map.height, state.map.rows);

const humanBase = playerBase(state, 0);
queueBuild(state, humanBase.id, "tank", 0);
queueBuild(state, humanBase.id, "tank", 0);
for (let i = 0; i < buildTurns("tank") * 2; i++) processTurnStart(state, 0);
// (humanBase.col + 1, humanBase.row) — e2e tests assume the tank lands one hex east of the base.
unloadUnit(state, grid, humanBase.id, humanBase.garrison[0].id, humanBase.col + 1, humanBase.row, 0);

// The second tank stays garrisoned, damaged, to exercise per-unit repair (game spec §2) without
// playing out a battle first.
humanBase.garrison[0].sp = 4;
humanBase.sp = 12;

// Hand-placed neutral base near the human's, for the Claim command (see this file's own header
// comment for why this can't come from the real placement algorithm yet).
state.bases.push({
  id: state.bases.length,
  ownerId: null,
  lastOwnerId: 1,
  type: "land",
  col: humanBase.col + 2,
  row: humanBase.row,
  adjacentToDeepWater: false,
  sp: 0,
  maxSp: 20,
  garrison: [],
  queue: [],
  inProgress: null,
});

// Coastal patch: (5,2)/(6,2) turned to deep water, a couple hexes east of the neutral base so
// nothing collides. (4,2) stays land for the port base itself; (5,2) is its east neighbor
// (always adjacent regardless of column parity), satisfying both "port needs adjacent water" and
// "carrier needs adjacent deep water" (game spec §2) in one cell.
grid.set(5, 2, "deep");
grid.set(6, 2, "deep");
state.map.rows = serializeGrid(grid);

const portBase = {
  id: state.bases.length,
  ownerId: 0,
  lastOwnerId: null,
  type: "port",
  col: 4,
  row: 2,
  adjacentToDeepWater: true,
  sp: 20,
  maxSp: 20,
  garrison: [],
  queue: [],
  inProgress: null,
};
state.bases.push(portBase);

state.units.push({
  id: state.nextUnitId++,
  ownerId: 0,
  unitType: "transporter",
  col: 5,
  row: 2,
  sp: UNIT_TYPES.transporter.strength,
  maxSp: UNIT_TYPES.transporter.strength,
  remainingActions: UNIT_TYPES.transporter.actionsPerTurn,
  remainingAttacks: UNIT_TYPES.transporter.attacksPerTurn,
  cargo: [{ id: state.nextUnitId++, unitType: "tank", sp: UNIT_TYPES.tank.strength }],
});

fs.writeFileSync(path.join(repoRoot, "assets", "dev-save.json"), JSON.stringify(state));
console.log("Wrote assets/dev-save.json");

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
// something to test the same way. A human-owned tank is also hand-placed next to the AI's own
// base, for manually testing attack/claim against an actual enemy base without having to walk
// one over first — tuned so 2 attacks neutralize it and the next End Turn auto-recaptures it
// (see below).
//
// Stage 7 additions: the dev map is land-only (no water anywhere, so no port base could ever
// come from real placement either), so a small coastal patch and a port base are hand-carved in
// after placement has already settled the rest — same reasoning as the neutral base above. A
// transporter carrying a tank sits on the water next to it, for cargo/boat-entry testing without
// needing to build and sail one out first. A second, separate water chain next to the AI's own
// base carries a human fregat and carrier at their own max attack range, for manually testing
// ranged attacks without having to sail one all the way out there first.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGameState, playerBase } from "../src/state/game-state.js";
import { queueBuild, processTurnStart, unloadUnit } from "../src/state/commands.js";
import { deserializeGrid, serializeGrid } from "../src/map/map-serialize.js";
import { buildTurns, UNIT_TYPES } from "../src/state/unit-types.js";
import { offsetDistance } from "../src/map/hex-coords.js";
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

// Hand-placed human tank next to the AI's own base, for manually testing attack/claim against a
// real enemy base (see this file's own header comment). Its sp is set so exactly 2 tank attacks
// (attacksPerTurn, game spec §3) zero it out in one turn, and it has an in-progress build that
// completes on the AI's very next turn-start -- so ending the human's turn right after
// neutralizing it demonstrates the auto-recapture rule (game spec §4) without a multi-turn wait.
const aiBase = playerBase(state, 1);
aiBase.sp = UNIT_TYPES.tank.groundAtk * UNIT_TYPES.tank.attacksPerTurn;
aiBase.inProgress = { unitType: "tank", remainingTurns: 1 };
const [aiBaseNeighbor] = grid.neighborsOf(aiBase.col, aiBase.row);
state.units.push({
  id: state.nextUnitId++,
  ownerId: 0,
  unitType: "tank",
  col: aiBaseNeighbor.col,
  row: aiBaseNeighbor.row,
  sp: UNIT_TYPES.tank.strength,
  maxSp: UNIT_TYPES.tank.strength,
  remainingActions: UNIT_TYPES.tank.actionsPerTurn,
  remainingAttacks: UNIT_TYPES.tank.attacksPerTurn,
});

// Coastal patch: (5,2)/(6,2) turned to deep water, a couple hexes east of the neutral base so
// nothing collides. (4,2) stays land for the port base itself; (5,2) is its east neighbor
// (always adjacent regardless of column parity), satisfying both "port needs adjacent water" and
// "carrier needs adjacent deep water" (game spec §2) in one cell. Extended down and to the right
// from there (a real hex-adjacency chain, not just col+1/row+1 pairs, which isn't always a true
// neighbor step) so a boat has an actual body of water to move around in, not just one hex.
grid.set(5, 2, "deep");
grid.set(6, 2, "deep");
for (const [col, row] of [
  [7, 2],
  [8, 3],
  [9, 3],
  [10, 4],
  [11, 4],
  [12, 5],
]) {
  grid.set(col, row, "deep");
}

// A second, separate water chain next to the AI's own base -- a straight 6-cell hex line (same
// direction repeated, so hex-distance from the base equals the step count exactly), for manually
// testing ranged attacks. A fregat sits at distance 2 (its max range) and a carrier at distance 4
// (its own max range); the chain continues to distance 6 so the carrier also has room to move
// out of its own range.
let aiWaterCell = grid.neighborsOf(aiBase.col, aiBase.row)[2];
const aiWaterChain = [aiWaterCell];
for (let distance = 2; distance <= 6; distance++) {
  aiWaterCell = grid.neighborsOf(aiWaterCell.col, aiWaterCell.row).find((n) => offsetDistance(aiBase, n) === distance);
  aiWaterChain.push(aiWaterCell);
}
for (const { col, row } of aiWaterChain) grid.set(col, row, "deep");

state.map.rows = serializeGrid(grid);

// aiWaterChain is 0-indexed from distance 1, so index (distance - 1) is that distance's cell.
const fregatCell = aiWaterChain[1]; // distance 2 -- fregat's max range
const carrierCell = aiWaterChain[3]; // distance 4 -- carrier's max range
state.units.push(
  {
    id: state.nextUnitId++,
    ownerId: 0,
    unitType: "fregat",
    col: fregatCell.col,
    row: fregatCell.row,
    sp: UNIT_TYPES.fregat.strength,
    maxSp: UNIT_TYPES.fregat.strength,
    remainingActions: UNIT_TYPES.fregat.actionsPerTurn,
    remainingAttacks: UNIT_TYPES.fregat.attacksPerTurn,
  },
  {
    id: state.nextUnitId++,
    ownerId: 0,
    unitType: "carrier",
    col: carrierCell.col,
    row: carrierCell.row,
    sp: UNIT_TYPES.carrier.strength,
    maxSp: UNIT_TYPES.carrier.strength,
    remainingActions: UNIT_TYPES.carrier.actionsPerTurn,
    remainingAttacks: UNIT_TYPES.carrier.attacksPerTurn,
    cargo: [],
  },
);

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

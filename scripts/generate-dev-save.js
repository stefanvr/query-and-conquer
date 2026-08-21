#!/usr/bin/env node
// Generates assets/dev-save.json — a fixed, deterministic save for the main menu's dev-only
// "Load test game" entry (implementation-spec.md §8/§10). Built with the same createGameState
// used by real matches, so its shape can never drift from what the app actually produces; run
// manually when you want to refresh it (e.g. once Stage 4 adds bases to the state shape).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGameState } from "../src/state/game-state.js";
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
fs.writeFileSync(path.join(repoRoot, "assets", "dev-save.json"), JSON.stringify(state));
console.log("Wrote assets/dev-save.json");

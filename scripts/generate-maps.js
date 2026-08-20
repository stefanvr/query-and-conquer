#!/usr/bin/env node
// Build-time map generation — per tech-stack.md's "Pre-generated maps" design choice: maps are
// generated as static JSON files checked into the repo, and only regenerated when this script
// (or the generation modules it depends on) actually changes. Run with `npm run maps:generate`;
// pass --force to regenerate regardless of the hash check.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { generateCandidatesForCombo } from "../src/map/generate.js";
import { serializeGrid } from "../src/map/map-serialize.js";
import { SIZES, TYPES, SHAPE_KINDS, isComboSupported } from "../src/map/map-tables.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const mapSrcDir = path.join(repoRoot, "src", "map");
const outDir = path.join(repoRoot, "assets", "maps");
const hashFile = path.join(outDir, ".source-hash");

function computeSourceHash() {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(fileURLToPath(import.meta.url)));
  for (const file of fs.readdirSync(mapSrcDir).sort()) {
    hash.update(file);
    hash.update(fs.readFileSync(path.join(mapSrcDir, file)));
  }
  return hash.digest("hex");
}

function deriveSeed(key) {
  // FNV-1a — deterministic per-combo base seed, so re-running the script (with --force but no
  // source changes) reproduces the same maps.
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function main() {
  const force = process.argv.includes("--force");
  fs.mkdirSync(outDir, { recursive: true });

  const currentHash = computeSourceHash();
  const previousHash = fs.existsSync(hashFile) ? fs.readFileSync(hashFile, "utf8").trim() : null;
  if (!force && currentHash === previousHash) {
    console.log("Map generation source unchanged — skipping (pass --force to regenerate anyway).");
    return;
  }

  const index = [];
  for (const sizeKey of Object.keys(SIZES)) {
    for (const typeKey of Object.keys(TYPES)) {
      if (!isComboSupported(sizeKey, typeKey)) continue;

      const baseSeed = deriveSeed(`${sizeKey}:${typeKey}`);
      const candidates = generateCandidatesForCombo({ sizeKey, typeKey, baseSeed, shapeKinds: SHAPE_KINDS });

      candidates.forEach(({ grid, shapeKind, seed }, i) => {
        const fileName = `${sizeKey}-${typeKey}-${i}.json`;
        const mapData = {
          size: sizeKey,
          type: typeKey,
          shape: shapeKind,
          seed,
          width: grid.width,
          height: grid.height,
          rows: serializeGrid(grid),
        };
        fs.writeFileSync(path.join(outDir, fileName), JSON.stringify(mapData));
        index.push({ size: sizeKey, type: typeKey, shape: shapeKind, file: fileName });
      });
      console.log(`Generated ${candidates.length} maps for ${sizeKey}/${typeKey}.`);
    }
  }

  fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(index, null, 2));
  fs.writeFileSync(hashFile, currentHash);
  console.log(`Wrote ${index.length} maps to ${path.relative(repoRoot, outDir)}/.`);
}

main();

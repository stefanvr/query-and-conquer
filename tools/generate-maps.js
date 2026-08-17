#!/usr/bin/env node
/**
 * Build-time map generation. Run manually:
 *
 *   npm run generate-maps
 *
 * Writes data/maps/<size>-<type>.json for every size x type combination,
 * each holding 10 pre-generated terrain candidates (design doc §1). Per
 * tech-stack.md's "Pre-generated maps" design choice, this is only run
 * when tools/generate-maps.js or src/map-gen/ changes -- output is
 * checked into the repo, not regenerated at app startup.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { MAP_SIZES, MAP_TYPES, CANDIDATES_PER_COMBO, dimensionForMultiplier } from "../src/map-gen/sizes.js";
import { generateCandidates } from "../src/map-gen/generate.js";
import { encodeRow } from "../src/map-gen/terrainCodes.js";
import { waterFraction } from "../src/map-gen/constraints.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "data", "maps");
mkdirSync(outDir, { recursive: true });

/** Deterministic 32-bit seed base from a combo's name, so reruns without code changes are stable. */
function seedFor(name) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

let combosDone = 0;
const totalCombos = Object.keys(MAP_SIZES).length * MAP_TYPES.length;

for (const [sizeName, multiplier] of Object.entries(MAP_SIZES)) {
  const dim = dimensionForMultiplier(multiplier);

  for (const type of MAP_TYPES) {
    const comboName = `${sizeName}-${type}`;
    const start = Date.now();

    const candidates = generateCandidates({
      width: dim,
      height: dim,
      type,
      count: CANDIDATES_PER_COMBO,
      seedBase: seedFor(comboName),
    });

    const fractions = candidates.map((c) => waterFraction(c.grid));
    const minFrac = Math.min(...fractions).toFixed(2);
    const maxFrac = Math.max(...fractions).toFixed(2);

    const payload = {
      size: sizeName,
      type,
      width: dim,
      height: dim,
      candidateCount: candidates.length,
      candidates: candidates.map(({ seed, grid }) => ({
        seed,
        rows: grid.map(encodeRow),
      })),
    };

    writeFileSync(join(outDir, `${comboName}.json`), JSON.stringify(payload));

    combosDone++;
    const ms = Date.now() - start;
    console.log(
      `[${combosDone}/${totalCombos}] ${comboName}: ${dim}x${dim}, ` +
        `water ${minFrac}-${maxFrac}, ${ms}ms`
    );
  }
}

console.log(`Done. Wrote ${totalCombos} files to ${outDir}`);

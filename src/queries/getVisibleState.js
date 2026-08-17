/**
 * getVisibleState(canonicalState, viewerId) -- the CQRS "query" seam.
 *
 * This is the ONE function rendering, human UI, and easy-difficulty AI
 * are allowed to read game state through (design doc's fog-of-war
 * rules, §5; tech-stack.md's "State access rule"). Nothing else reads
 * canonicalState directly except command handlers (which mutate it)
 * and hard-difficulty AI (the one documented exception, Stage 7).
 *
 * PURE FUNCTION -- it must not mutate canonicalState. Fog-of-war
 * "explored" memory is persistent per-player state, but it's written
 * by command handlers via src/queries/fog.js's updateExploredCells(),
 * not from here; this function only reads that memory. See fog.js's
 * module doc for why that split matters.
 *
 * @param {object} canonicalState
 * @param {number|string} viewerId
 * @returns {object} filtered projection safe for the given viewer
 */
import { computeCurrentlyVisible } from "./fog.js";

export function getVisibleState(canonicalState, viewerId) {
  const { width, height, terrain } = canonicalState.map;
  const player = canonicalState.players.find((p) => p.id === viewerId);

  if (!player) {
    // No player context (e.g. Stage 3's pre-player debug flows) --
    // unfiltered terrain-only projection.
    return { map: canonicalState.map, units: [], bases: [], turn: canonicalState.turn, players: [], viewerId };
  }

  const currentlyVisible = computeCurrentlyVisible(canonicalState, viewerId);

  const visibleTerrain = [];
  const fogState = [];
  for (let row = 0; row < height; row++) {
    const terrainRow = [];
    const fogRow = [];
    for (let col = 0; col < width; col++) {
      const key = `${col},${row}`;
      const explored = player.exploredGrid[row][col];
      const visible = currentlyVisible.has(key);
      terrainRow.push(explored ? terrain[row][col] : null);
      fogRow.push(visible ? "visible" : explored ? "explored" : "unexplored");
    }
    visibleTerrain.push(terrainRow);
    fogState.push(fogRow);
  }

  // Units: always show the viewer's own (they always know where their
  // own units are); other players' units only where currently visible
  // -- design doc §5: units re-hide once out of view, unlike terrain.
  const units = canonicalState.units.filter(
    (u) => u.ownerId === viewerId || currentlyVisible.has(`${u.position.col},${u.position.row}`)
  );

  // Bases: treated like terrain (sticky once explored, not just while
  // currently visible) rather than like units -- a base is a fixed
  // structure, not a moving fog-sensitive entity. Not stated explicitly
  // by §5, which only calls out "units" re-hiding; this is the
  // resolved interpretation for bases.
  const bases = canonicalState.bases.filter((b) => player.exploredGrid[b.position.row][b.position.col]);

  return {
    map: { ...canonicalState.map, terrain: visibleTerrain, fogState },
    units,
    bases,
    turn: canonicalState.turn,
    // Player identity/slot order (for accent-color lookup, style-guide.md
    // §3) isn't secret state -- always included in full, unlike units/bases.
    players: canonicalState.players.map((p) => ({ id: p.id, kind: p.kind })),
    viewerId,
  };
}

/**
 * Per-player explored/visible cell computation (design doc §5 "Fog of
 * War"). Split deliberately:
 *
 *  - computeCurrentlyVisible() is a PURE function of canonical state --
 *    safe to call from getVisibleState.js (a query) on every render.
 *  - updateExploredCells() MUTATES a player's persistent "explored"
 *    memory and must only be called from command handlers (moveUnit,
 *    endTurn, new-game setup, ...) after they change positions --
 *    calling it from the read path would make getVisibleState an
 *    impure query, breaking the CQRS seam tech-stack.md establishes.
 *
 * Implementation note: view range also respects line-of-sight (mountain
 * cells/units/bases block vision, not just attacks). The design doc
 * states LOS-blocking as a general Layout rule and view ranges as plain
 * hex-distance radii without explicitly cross-referencing the two --
 * applying LOS to vision as well is the more standard reading for this
 * genre and is treated as the resolved interpretation here.
 */
import { cellsWithinRadius } from "../hex/distance.js";
import { hasLineOfSight } from "../hex/lineOfSight.js";
import { UNIT_DEFS } from "../units/unitDefs.js";
import { BASE_DEFS } from "../buildings/baseDefs.js";

const cellKey = (c) => `${c.col},${c.row}`;

/**
 * @param {object} canonicalState
 * @param {number|string} playerId
 * @returns {Set<string>} cellKeys currently visible to that player's units/bases
 */
export function computeCurrentlyVisible(canonicalState, playerId) {
  const { width, height, terrain } = canonicalState.map;
  const visible = new Set();

  const observers = [
    ...canonicalState.units
      .filter((u) => u.ownerId === playerId)
      .map((u) => ({ position: u.position, view: UNIT_DEFS[u.type].view })),
    ...canonicalState.bases
      .filter((b) => b.ownerId === playerId)
      .map((b) => ({ position: b.position, view: BASE_DEFS[b.type].view })),
  ];

  for (const observer of observers) {
    for (const cell of cellsWithinRadius(observer.position, observer.view, width, height)) {
      const key = cellKey(cell);
      if (visible.has(key)) continue;
      if (
        hasLineOfSight(observer.position, cell, {
          terrain,
          units: canonicalState.units,
          bases: canonicalState.bases,
        })
      ) {
        visible.add(key);
      }
    }
  }
  return visible;
}

/**
 * Merges a player's currently-visible cells into their persistent
 * "explored" memory. Command-side only -- see module doc.
 * @param {object} canonicalState
 * @param {number|string} playerId
 */
export function updateExploredCells(canonicalState, playerId) {
  const player = canonicalState.players.find((p) => p.id === playerId);
  if (!player) return;

  const visible = computeCurrentlyVisible(canonicalState, playerId);
  for (const key of visible) {
    const [col, row] = key.split(",").map(Number);
    player.exploredGrid[row][col] = true;
  }
}

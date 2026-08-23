// Movement reach + routing over the hex grid — implementation-spec.md §1's Movement targeting.
// Read-only: it never mutates state, and the caller walks a returned route through the ordinary
// moveUnit command rather than this module moving anything itself.
//
// Its own module rather than living in the UI because hard AI (Stage 12) needs the same
// lowest-cost routing (game spec §8's Difficulty table). Easy AI deliberately does *not* use it —
// its naive step-toward is the whole point of that difficulty (src/ai/ai-turn.js).
import { offsetKey } from "../map/hex-coords.js";
import { moveCost } from "./unit-types.js";
import { baseAtHex, unitAtHex } from "./game-state.js";

/** One unit per cell, regardless of owner (game spec §1) — a base blocks too, since entering a
 * base's cell is the separate load interaction, not a plain move. Mirrors commands.js's own
 * `isBlockedForMovement`, which is module-private there. */
function isBlocked(state, col, row) {
  return Boolean(unitAtHex(state, col, row) || baseAtHex(state, col, row));
}

/**
 * Every hex `unit` can reach this turn, with the cheapest route to each — a Dijkstra expansion
 * over per-terrain move costs (game spec §3), bounded by the unit's remaining actions.
 *
 * Blocked and impassable hexes are neither entered nor traversed, so the result is genuine reach
 * rather than straight-line distance: a unit boxed in by its own units gets a small set, and one
 * on open ground gets a wide one.
 *
 * @returns {Map<string, {col: number, row: number, cost: number, path: {col:number,row:number}[]}>}
 *   keyed by `offsetKey`; `path` is the sequence of hexes to step through, excluding the unit's
 *   own starting hex and ending on the destination. The unit's own hex is not included.
 */
export function reachableCells(state, grid, unit) {
  const budget = unit.remainingActions;
  const reached = new Map();
  if (budget <= 0) return reached;

  // A plain array used as the frontier: hex grids here are small enough per turn (a unit's
  // budget is single digits) that a binary heap would be more code than it saves.
  const frontier = [{ col: unit.col, row: unit.row, cost: 0, path: [] }];
  const bestCost = new Map([[offsetKey(unit.col, unit.row), 0]]);

  while (frontier.length > 0) {
    let bestIndex = 0;
    for (let i = 1; i < frontier.length; i++) {
      if (frontier[i].cost < frontier[bestIndex].cost) bestIndex = i;
    }
    const current = frontier.splice(bestIndex, 1)[0];
    // A cheaper route to this hex was found after it was queued — that one already expanded it.
    if (current.cost > (bestCost.get(offsetKey(current.col, current.row)) ?? Infinity)) continue;

    for (const n of grid.neighborsOf(current.col, current.row)) {
      if (!grid.isInMap(n.col, n.row)) continue;
      if (isBlocked(state, n.col, n.row)) continue;
      const step = moveCost(unit.unitType, grid.get(n.col, n.row));
      if (step === null) continue; // impassable for this unit type
      const cost = current.cost + step;
      if (cost > budget) continue;

      const key = offsetKey(n.col, n.row);
      if (cost >= (bestCost.get(key) ?? Infinity)) continue;
      bestCost.set(key, cost);
      const entry = { col: n.col, row: n.row, cost, path: [...current.path, { col: n.col, row: n.row }] };
      reached.set(key, entry);
      frontier.push(entry);
    }
  }
  return reached;
}

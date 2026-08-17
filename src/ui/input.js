/**
 * Click/hover -> hex cell mapping and local unit-selection UI state.
 * Selection lives here, NOT in canonical state -- it's presentation
 * state, not game state. Decision logic (what's at a clicked cell,
 * what's reachable) reads only through getVisibleState, same as
 * rendering; the actual move is submitted through the command
 * dispatch table like any other mutation.
 */
import { dispatch } from "../commands/index.js";
import { getVisibleState } from "../queries/getVisibleState.js";
import { reachableCells } from "../hex/pathfinding.js";
import { moveCostFor } from "../units/unitDefs.js";

/**
 * @param {{canonicalState: object, viewerId: number|string, renderer: {setSelection: Function, redraw: Function}}} opts
 */
export function createInputController({ canonicalState, viewerId, renderer }) {
  let selectedUnitId = null;

  function computeReachableKeys(unit, visibleState) {
    const { width, height, terrain } = visibleState.map;
    const occupied = new Set(
      visibleState.units
        .filter((u) => u.id !== unit.id)
        .map((u) => `${u.position.col},${u.position.row}`)
    );

    function costFn(to) {
      if (occupied.has(`${to.col},${to.row}`)) return Infinity;
      const terrainType = terrain[to.row][to.col];
      if (terrainType == null) return Infinity; // unexplored: unknown cost, can't preview a route through it
      return moveCostFor(unit.type, terrainType);
    }

    const dist = reachableCells({ start: unit.position, width, height, costFn, budget: unit.actionsRemaining });
    return new Set(dist.keys());
  }

  function select(unitId) {
    const visibleState = getVisibleState(canonicalState, viewerId);
    const unit = visibleState.units.find((u) => u.id === unitId);
    if (!unit) {
      deselect();
      return;
    }
    selectedUnitId = unitId;
    renderer.setSelection(unitId, computeReachableKeys(unit, visibleState));
  }

  function deselect() {
    selectedUnitId = null;
    renderer.setSelection(null, null);
  }

  function unitAt(units, cell, ownerId) {
    return units.find(
      (u) => u.position.col === cell.col && u.position.row === cell.row && (ownerId == null || u.ownerId === ownerId)
    );
  }

  /** @param {{col: number, row: number}} cell */
  function handleCellClick(cell) {
    const visibleState = getVisibleState(canonicalState, viewerId);

    if (selectedUnitId != null) {
      const selectedUnit = visibleState.units.find((u) => u.id === selectedUnitId);
      const clickedOwnUnit = unitAt(visibleState.units, cell, viewerId);
      const clickedSelectedUnitsCell =
        selectedUnit && cell.col === selectedUnit.position.col && cell.row === selectedUnit.position.row;

      if (selectedUnit && !clickedSelectedUnitsCell) {
        const result = dispatch(canonicalState, "moveUnit", { unitId: selectedUnitId, destination: cell });
        if (result.success) {
          select(selectedUnitId); // refresh the reachable-cell highlight from the new position
          return;
        }
        // Move rejected (unreachable, occupied, etc.) -- fall through
        // and treat the click as a normal selection attempt instead.
      }

      if (clickedOwnUnit) {
        select(clickedOwnUnit.id);
      } else {
        deselect();
      }
      return;
    }

    const clickedUnit = unitAt(visibleState.units, cell, viewerId);
    if (clickedUnit) select(clickedUnit.id);
  }

  return { handleCellClick, deselect };
}

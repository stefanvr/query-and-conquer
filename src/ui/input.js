/**
 * Click/hover -> hex cell mapping and local unit/base/garrison
 * selection UI state. Selection lives here, NOT in canonical state --
 * it's presentation state, not game state. Decision logic (what's at a
 * clicked cell, what's reachable) reads only through getVisibleState,
 * same as rendering; every mutation is submitted through the command
 * dispatch table like any other change.
 *
 * Three selection kinds:
 *  - "unit": a field unit (garrisonedAt == null) selected by clicking
 *    it on the map.
 *  - "base": a base selected by clicking it -- shows its build/queue/
 *    garrison panel (src/ui/hud.js).
 *  - "garrison": a garrisoned unit selected from within that panel
 *    (there's no way to click a garrisoned unit on the map -- it isn't
 *    drawn as a separate token, see unitLayer.js).
 *
 * Click behavior, roughly:
 *  - nothing selected: click your own unit or base to select it.
 *  - unit selected, click an enemy unit/base in range: attack.
 *  - unit selected, click another own unit: switch selection to it.
 *  - unit selected, click your own unit-free base: select the base.
 *  - unit selected, click elsewhere: move there.
 *  - base selected, click a garrisoned unit's panel slot (HUD, not the
 *    map): select it ("garrison").
 *  - garrison selected, click any base (same or different): cancel
 *    back to that base's panel.
 *  - garrison selected, click a map cell: exit the base and move there
 *    in one motion (two commands, two actions -- exitBase + moveUnit).
 *
 * Claiming/entering/exiting/building aren't triggered by plain cell
 * clicks (they need context a raw click doesn't carry) -- they're
 * exposed as explicit action methods for the HUD's contextual buttons.
 *
 * Every selection-changing function takes an internal {clearMessage}
 * option (default true): switching what's selected clears any stale
 * status message from a previous action, but an action method's OWN
 * follow-up re-selection (to refresh reachable cells/panel contents
 * after a successful command) passes clearMessage: false so the
 * message it just set survives that refresh. Getting this wrong was a
 * real bug -- e.g. selecting a different base after queuing a build
 * left "Queued tank." visible indefinitely, since nothing ever cleared
 * it on unrelated navigation.
 */
import { dispatch } from "../commands/index.js";
import { canBuildAt } from "../commands/buildUnit.js";
import { getVisibleState } from "../queries/getVisibleState.js";
import { reachableCells } from "../hex/pathfinding.js";
import { offsetDistance } from "../hex/distance.js";
import { moveCostFor, UNIT_DEFS, UNIT_TYPES } from "../units/unitDefs.js";
import { MAX_BASE_CAPACITY } from "../buildings/baseDefs.js";

/**
 * @param {{canonicalState: object, viewerId: number|string, renderer: {setSelection: Function}, onChange?: (status: {message: string|null, context: object|null}) => void}} opts
 */
export function createInputController({ canonicalState, viewerId, renderer, onChange }) {
  let selection = null; // {type: "unit"|"base", id} | {type: "garrison", id, baseId} | null
  let lastMessage = null;

  function emitChange() {
    onChange?.(buildStatus());
  }

  function currentBaseId() {
    if (selection?.type === "base") return selection.id;
    if (selection?.type === "garrison") return selection.baseId;
    return null;
  }

  function buildStatus() {
    if (!selection) return { message: lastMessage, context: null };
    const visibleState = getVisibleState(canonicalState, viewerId);

    if (selection.type === "unit") {
      const unit = visibleState.units.find((u) => u.id === selection.id);
      if (!unit) return { message: lastMessage, context: null };
      return {
        message: lastMessage,
        context: { type: "unit", unit, canClaim: canClaimNearby(unit, visibleState), loadTargets: computeLoadTargets(unit, visibleState) },
      };
    }

    if (selection.type === "garrison") {
      const base = visibleState.bases.find((b) => b.id === selection.baseId);
      const unit = visibleState.units.find((u) => u.id === selection.id);
      if (!base || !unit) return { message: lastMessage, context: null };
      return {
        message: lastMessage,
        context: {
          type: "garrison",
          base,
          unit,
          canExit: unit.actionsRemaining >= 1,
          garrisonUnits: resolveGarrisonUnits(base, visibleState),
          buildOptions: buildOptionsFor(base),
        },
      };
    }

    const base = visibleState.bases.find((b) => b.id === selection.id);
    if (!base) return { message: lastMessage, context: null };
    return {
      message: lastMessage,
      context: { type: "base", base, garrisonUnits: resolveGarrisonUnits(base, visibleState), buildOptions: buildOptionsFor(base) },
    };
  }

  function canClaimNearby(unit, visibleState) {
    if (!UNIT_DEFS[unit.type].canCapture) return false;
    const nearbyUnclaimed = visibleState.bases.find((b) => b.ownerId == null && offsetDistance(unit.position, b.position) <= 1);
    return !!nearbyUnclaimed;
  }

  /**
   * Bases the selected field unit could garrison into right now -- on
   * or adjacent to it (see enterBase.js's module doc for why adjacency,
   * not just "standing on it", is required: a boat can never physically
   * be on a port base's own land cell). Only ever at most one in
   * practice (bases are always >= 5 cells apart from EVERY other base,
   * design doc §1, so two can never both be within range of the same
   * unit) -- but returns a list, and is named/shaped generically
   * ("loadTargets", not "nearbyBase"), because the same UI pattern
   * ("one button per nearby thing you could load into") is meant to
   * extend to transporter/carrier cargo loading later. That part isn't
   * implemented yet -- Stage 5 never built cargo mechanics for those,
   * only base garrisoning -- so only base-kind targets appear today.
   */
  function computeLoadTargets(unit, visibleState) {
    if (unit.garrisonedAt != null) return [];
    const targets = [];
    for (const base of visibleState.bases) {
      if (base.ownerId !== viewerId) continue;
      if (offsetDistance(unit.position, base.position) > 1) continue;
      const inProgressSlot = base.currentBuild ? 1 : 0;
      const hasCapacity = base.garrison.length + inProgressSlot + 1 <= MAX_BASE_CAPACITY;
      const hasActions = unit.actionsRemaining >= 1;
      const reason = !hasActions ? "No actions remaining." : !hasCapacity ? "Base is at capacity." : null;
      targets.push({ kind: "base", id: base.id, label: "Load into base", enabled: hasActions && hasCapacity, reason });
    }
    return targets;
  }

  /** Base.garrison is just an ordered list of unit IDs -- resolve to full unit objects for the HUD's panel. */
  function resolveGarrisonUnits(base, visibleState) {
    return base.garrison.map((id) => visibleState.units.find((u) => u.id === id)).filter(Boolean);
  }

  /**
   * Every unit type, each tagged with whether it's currently buildable
   * at this base and why not if not -- reuses buildUnit.js's own
   * canBuildAt() so the UI's disabled state can never drift from what
   * the command will actually accept. Previously the HUD only ever
   * rendered a button for base-type-eligible types (hiding the rest
   * entirely) and never reflected the carrier deep-water rule or
   * capacity/queue limits until a click failed after the fact; now
   * every type always shows, disabled with a reason when it doesn't
   * currently apply.
   */
  function buildOptionsFor(base) {
    return UNIT_TYPES.map((type) => ({ type, ...canBuildAt(canonicalState, base, type) }));
  }

  function computeReachableKeys(unit, visibleState) {
    const { width, height, terrain } = visibleState.map;
    const occupied = new Set(
      visibleState.units
        .filter((u) => u.id !== unit.id && u.garrisonedAt == null)
        .map((u) => `${u.position.col},${u.position.row}`)
    );
    function costFn(to) {
      if (occupied.has(`${to.col},${to.row}`)) return Infinity;
      const terrainType = terrain[to.row][to.col];
      if (terrainType == null) return Infinity;
      return moveCostFor(unit.type, terrainType);
    }
    return new Set(reachableCells({ start: unit.position, width, height, costFn, budget: unit.actionsRemaining }).keys());
  }

  function selectUnit(unitId, { clearMessage = true } = {}) {
    const visibleState = getVisibleState(canonicalState, viewerId);
    const unit = visibleState.units.find((u) => u.id === unitId);
    if (!unit) return deselect();
    if (clearMessage) lastMessage = null;
    selection = { type: "unit", id: unitId };
    renderer.setSelection(selection, computeReachableKeys(unit, visibleState));
    emitChange();
  }

  function selectBase(baseId, { clearMessage = true } = {}) {
    if (clearMessage) lastMessage = null;
    selection = { type: "base", id: baseId };
    renderer.setSelection(selection, null);
    emitChange();
  }

  /** Selects a unit garrisoned inside a base -- only reachable via the base's HUD panel, never a map click. */
  function selectGarrisonedUnit(unitId, baseId, { clearMessage = true } = {}) {
    if (clearMessage) lastMessage = null;
    selection = { type: "garrison", id: unitId, baseId };
    renderer.setSelection(selection, null);
    emitChange();
  }

  function deselect() {
    lastMessage = null;
    selection = null;
    renderer.setSelection(null, null);
    emitChange();
  }

  function setMessage(message) {
    lastMessage = message;
    emitChange();
  }

  function entityAt(visibleState, cell) {
    const unit = visibleState.units.find((u) => u.position.col === cell.col && u.position.row === cell.row && u.garrisonedAt == null);
    const base = visibleState.bases.find((b) => b.position.col === cell.col && b.position.row === cell.row);
    return { unit, base };
  }

  /** @param {{col: number, row: number}} cell */
  function handleCellClick(cell) {
    const visibleState = getVisibleState(canonicalState, viewerId);
    const { unit: clickedUnit, base: clickedBase } = entityAt(visibleState, cell);

    if (selection?.type === "garrison") {
      const selectedUnit = visibleState.units.find((u) => u.id === selection.id);
      if (!selectedUnit) return deselect();

      // Garrisoned units can attack without exiting (attackUnit.js /
      // attackBase.js's module docs) -- an enemy in range takes
      // priority over the base-click-cancels behavior below, so a
      // base-defender can actually defend by clicking a nearby threat.
      if (clickedUnit && clickedUnit.ownerId !== viewerId) {
        const result = dispatch(canonicalState, "attackUnit", { attackerUnitId: selectedUnit.id, defenderUnitId: clickedUnit.id });
        setMessage(result.success ? `Hit for ${result.attackValue}${result.destroyed ? " -- destroyed!" : ""}` : result.reason);
        if (result.success) return selectGarrisonedUnit(selection.id, selection.baseId, { clearMessage: false });
        return;
      }
      if (clickedBase && clickedBase.ownerId != null && clickedBase.ownerId !== viewerId) {
        const result = dispatch(canonicalState, "attackBase", { attackerUnitId: selectedUnit.id, baseId: clickedBase.id });
        setMessage(result.success ? `Hit base for ${result.baseDamageDealt}${result.wentNeutral ? " -- base neutralized!" : ""}` : result.reason);
        if (result.success) return selectGarrisonedUnit(selection.id, selection.baseId, { clearMessage: false });
        return;
      }

      // "if clicked on base it will cancel selection of the unit" --
      // any other base click (your own, or an unclaimed one -- nothing
      // left to attack there) backs out to that base's own panel.
      if (clickedBase) return selectBase(clickedBase.id);

      // "if clicked on cell the unit will be move" -- exit the base and
      // move there in one motion. Two real commands (two actions spent):
      // exitBase, then moveUnit, matching design doc §3's "entering or
      // exiting costs 2 actions total" structure (see moveUnit.js's
      // module doc for why that's two separate commands, not a
      // flat-cost override).
      const exitResult = dispatch(canonicalState, "exitBase", { unitId: selection.id });
      if (!exitResult.success) {
        setMessage(exitResult.reason);
        return;
      }
      const moveResult = dispatch(canonicalState, "moveUnit", { unitId: selection.id, destination: cell });
      if (moveResult.success) {
        setMessage(null);
        return selectUnit(selection.id, { clearMessage: false });
      }
      // Move failed after a successful exit -- the unit is now a field
      // unit standing on the base's cell; keep it selected as such
      // rather than silently reverting, so the player can see where it
      // ended up and try a different destination.
      setMessage(moveResult.reason);
      return selectUnit(selection.id, { clearMessage: false });
    }

    if (selection?.type === "unit") {
      const selectedUnit = visibleState.units.find((u) => u.id === selection.id);
      if (!selectedUnit) return deselect();
      const onSelectedCell = cell.col === selectedUnit.position.col && cell.row === selectedUnit.position.row;

      if (clickedUnit && clickedUnit.ownerId !== viewerId) {
        const result = dispatch(canonicalState, "attackUnit", { attackerUnitId: selectedUnit.id, defenderUnitId: clickedUnit.id });
        setMessage(result.success ? `Hit for ${result.attackValue}${result.destroyed ? " -- destroyed!" : ""}` : result.reason);
        if (result.success) return selectUnit(selectedUnit.id, { clearMessage: false });
        return;
      }
      if (clickedBase && clickedBase.ownerId != null && clickedBase.ownerId !== viewerId) {
        const result = dispatch(canonicalState, "attackBase", { attackerUnitId: selectedUnit.id, baseId: clickedBase.id });
        setMessage(result.success ? `Hit base for ${result.baseDamageDealt}${result.wentNeutral ? " -- base neutralized!" : ""}` : result.reason);
        if (result.success) return selectUnit(selectedUnit.id, { clearMessage: false });
        return;
      }
      if (clickedUnit && clickedUnit.ownerId === viewerId && clickedUnit.id !== selectedUnit.id) {
        return selectUnit(clickedUnit.id);
      }
      // An owned base (regardless of what's garrisoned inside it) takes
      // priority over "move here" -- so clicking your own base always
      // opens its panel, rather than being swallowed by a successful
      // move onto its cell.
      if (clickedBase && clickedBase.ownerId === viewerId && !clickedUnit) {
        return selectBase(clickedBase.id);
      }
      if (onSelectedCell) {
        // Clicking the selected unit's own cell again (with nothing
        // else to interact with there) toggles it off.
        return deselect();
      }
      const result = dispatch(canonicalState, "moveUnit", { unitId: selectedUnit.id, destination: cell });
      if (result.success) {
        setMessage(null);
        return selectUnit(selectedUnit.id, { clearMessage: false });
      }
      setMessage(result.reason);
      return;
    }

    if (selection?.type === "base") {
      if (clickedBase && clickedBase.id === selection.id) return; // no-op, still selected
    }

    if (clickedUnit && clickedUnit.ownerId === viewerId) return selectUnit(clickedUnit.id);
    if (clickedBase && clickedBase.ownerId === viewerId) return selectBase(clickedBase.id);
    deselect();
  }

  function claimSelectedUnitsBase() {
    if (selection?.type !== "unit") return;
    const visibleState = getVisibleState(canonicalState, viewerId);
    const unit = visibleState.units.find((u) => u.id === selection.id);
    if (!unit) return;
    const nearbyUnclaimed = visibleState.bases.find((b) => b.ownerId == null && offsetDistance(unit.position, b.position) <= 1);
    if (!nearbyUnclaimed) return;
    const result = dispatch(canonicalState, "claimBase", { unitId: unit.id, baseId: nearbyUnclaimed.id });
    setMessage(result.success ? "Base claimed." : result.reason);
    if (result.success) selectUnit(unit.id, { clearMessage: false });
  }

  /** @param {number|string} baseId - which nearby base to garrison into (src/ui/hud.js passes the specific loadTargets entry clicked) */
  function enterSelectedUnitsBase(baseId) {
    if (selection?.type !== "unit") return;
    const result = dispatch(canonicalState, "enterBase", { unitId: selection.id, baseId });
    setMessage(result.success ? "Unit garrisoned." : result.reason);
    if (result.success) selectGarrisonedUnit(selection.id, baseId, { clearMessage: false });
  }

  /** Exits the currently-selected garrisoned unit WITHOUT also moving it -- it stays a field unit on the base's cell. */
  function exitSelectedUnit() {
    if (selection?.type !== "garrison") return;
    const baseId = selection.baseId;
    const result = dispatch(canonicalState, "exitBase", { unitId: selection.id });
    setMessage(result.success ? "Unit exited base." : result.reason);
    if (result.success) selectUnit(selection.id, { clearMessage: false });
    else selectGarrisonedUnit(selection.id, baseId, { clearMessage: false });
  }

  function buildAtSelectedBase(unitType) {
    const baseId = currentBaseId();
    if (baseId == null) return;
    const result = dispatch(canonicalState, "buildUnit", { baseId, unitType });
    setMessage(result.success ? (result.startedImmediately ? `Started building ${unitType}.` : `Queued ${unitType}.`) : result.reason);
    if (result.success) {
      if (selection.type === "garrison") selectGarrisonedUnit(selection.id, baseId, { clearMessage: false });
      else selectBase(baseId, { clearMessage: false });
    }
  }

  /** Removes a pending (not-yet-started) queue entry -- "clicking items in the queue removes them". */
  function cancelQueuedBuild(queueIndex) {
    const baseId = currentBaseId();
    if (baseId == null) return;
    const result = dispatch(canonicalState, "cancelQueuedBuild", { baseId, queueIndex });
    setMessage(result.success ? `Removed ${result.removedType} from the queue.` : result.reason);
    if (result.success) {
      if (selection.type === "garrison") selectGarrisonedUnit(selection.id, baseId, { clearMessage: false });
      else selectBase(baseId, { clearMessage: false });
    }
  }

  return {
    handleCellClick,
    deselect,
    claimSelectedUnitsBase,
    enterSelectedUnitsBase,
    exitSelectedUnit,
    selectGarrisonedUnit,
    buildAtSelectedBase,
    cancelQueuedBuild,
    getStatus: buildStatus,
  };
}

/**
 * Shared per-unit greedy engine (design doc §9): "Each turn, per unit
 * -- processed in order base-defenders -> field units -> newly
 * completed units -- the AI walks its strategy's priority list top to
 * bottom and takes the first applicable action, until its action
 * budget runs out or nothing applies."
 *
 * "Newly completed units" are NOT a separate third pass here: Stage 5's
 * build completion always garrisons the new unit immediately (see
 * buildTick.js/recaptureTick.js), so a freshly-built unit already IS a
 * base-defender by construction -- it's processed in that bucket, and
 * (for Aggressive/Balanced) typically exits and acts as a field unit
 * within the same turn once processed, per the per-strategy exit
 * behavior described below. There's nothing a distinct third bucket
 * would add beyond what "base-defenders, processed first" already gives.
 *
 * A garrisoned unit ("base-defender") always gets first crack at
 * attacking whatever's in range. Whether it's ALSO willing to exit the
 * base afterward (graduating to a normal field unit for the rest of
 * its actions this turn) is a per-strategy choice made inside each
 * strategy module's own garrisonedAt branch -- Aggressive/Balanced
 * exit when nothing's in range (their intent is to advance/expand, so
 * a freshly-built unit needs to actually leave the base to do that);
 * Defensive does not (its intent -- hold, don't wander -- means a
 * garrisoned unit with nothing to shoot at is correctly idle, not
 * something to force out). This is NOT the same thing as "naval
 * logistics" (§9's explicitly-out-of-scope AI loading cargo onto
 * transporters/carriers) -- exiting your OWN base's garrison is a
 * basic action every unit type has, not a transporter/carrier-specific
 * cargo mechanic. An earlier version of this file conflated the two
 * and made every AI-built unit permanently inert once garrisoned,
 * which stalled games indefinitely (nothing ever left a base to fight).
 *
 * This is a per-unit greedy loop, not coordinated multi-unit planning
 * -- a deliberate v1 simplification (§9).
 *
 * Exposed as a GENERATOR (walkUnits) yielding after every individual
 * dispatched command, so src/ai/aiController.js can either drain it
 * immediately (instant speed / Node tests) or step through it with a
 * delay between each action (fast/slow speed, design doc §6's "AI:
 * actions play out step by step, at a configurable speed").
 */
import { dispatch } from "../commands/index.js";

const MAX_ACTIONS_PER_UNIT_PER_TURN = 20; // safety guard against a pathological decide()/dispatch() loop, well above any real actionsRemaining budget (max 8)

/**
 * @param {object} canonicalState
 * @param {number|string} aiPlayerId
 * @param {{decide: Function, BUILD_ORDER: string[]}} strategy
 * @param {object} deps - difficulty-specific execution primitives (src/ai/difficulty/easy.js)
 * @yields {{unitId: number|string, action: string, result: object}} one entry per dispatched command
 */
export function* walkUnits(canonicalState, aiPlayerId, strategy, deps) {
  const aiUnits = canonicalState.units.filter((u) => u.ownerId === aiPlayerId);
  const baseDefenders = aiUnits.filter((u) => u.garrisonedAt != null).sort((a, b) => a.id - b.id);
  const fieldUnits = aiUnits.filter((u) => u.garrisonedAt == null).sort((a, b) => a.id - b.id);

  for (const unit of [...baseDefenders, ...fieldUnits]) {
    yield* walkSingleUnit(canonicalState, unit, aiPlayerId, strategy, deps);
  }
}

function* walkSingleUnit(canonicalState, unit, aiPlayerId, strategy, deps) {
  let iterations = 0;
  while (unit.actionsRemaining > 0 && iterations++ < MAX_ACTIONS_PER_UNIT_PER_TURN) {
    // Re-fetch the observable state fresh each iteration -- the board
    // (and this unit's own position/strength) can change between
    // actions within the same unit's turn.
    const state = deps.getState(canonicalState, aiPlayerId);
    const decision = strategy.decide(unit, { state, viewerId: aiPlayerId, deps });

    if (decision.action === "attack") {
      const result =
        decision.target.kind === "unit"
          ? dispatch(canonicalState, "attackUnit", { attackerUnitId: unit.id, defenderUnitId: decision.target.id })
          : dispatch(canonicalState, "attackBase", { attackerUnitId: unit.id, baseId: decision.target.id });
      yield { unitId: unit.id, action: "attack", result };
      if (!result.success) return; // candidates were pre-filtered as valid; a failure here means stop rather than loop forever
      continue;
    }

    if (decision.action === "move") {
      const result = dispatch(canonicalState, "moveUnit", { unitId: unit.id, destination: decision.destination });
      yield { unitId: unit.id, action: "move", result };
      if (!result.success) return; // naive movement hit an obstacle -- "wastes" the rest of this unit's actions, per design doc §9's difficulty table
      continue;
    }

    if (decision.action === "enter") {
      const result = dispatch(canonicalState, "enterBase", { unitId: unit.id, baseId: decision.baseId });
      yield { unitId: unit.id, action: "enter", result };
      return; // entering (successful or not) ends this unit's turn -- it's either now garrisoned (no more actions to take) or failed for a reason that won't change by retrying
    }

    if (decision.action === "exit") {
      const result = dispatch(canonicalState, "exitBase", { unitId: unit.id });
      yield { unitId: unit.id, action: "exit", result };
      if (!result.success) return;
      continue; // now a field unit -- loop back and let the strategy's full rule chain decide what to do with its remaining actions
    }

    return; // "none" -- nothing applies, stop (don't waste iterations re-deciding an unchanged situation)
  }
}

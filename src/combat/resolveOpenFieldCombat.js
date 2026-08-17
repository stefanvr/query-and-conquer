/**
 * Open-field unit-vs-unit combat resolution (design doc §3): "attacker's
 * attack value is subtracted from the defender's strength; the defender
 * is destroyed at 0."
 */
import { UNIT_DEFS } from "../units/unitDefs.js";

/** Fighter/bomber are the only "air" targets; everything else (including
 * boats/bases, per §3's explicit "always classified as ground") is ground. */
const AIR_UNIT_TYPES = new Set(["fighter", "bomber"]);

/**
 * @param {string} unitType
 * @returns {"air"|"ground"}
 */
export function targetCategory(unitType) {
  return AIR_UNIT_TYPES.has(unitType) ? "air" : "ground";
}

/**
 * Mutates `defender.strength`. Does not remove a destroyed unit from
 * canonical state -- that's the calling command's job (it also needs to
 * update stats/garrison bookkeeping).
 * @param {object} attacker - unit
 * @param {object} defender - unit
 * @returns {{attackValue: number, destroyed: boolean}}
 */
export function resolveOpenFieldCombat(attacker, defender) {
  const category = targetCategory(defender.type);
  const attackValue = category === "air" ? UNIT_DEFS[attacker.type].airAttack : UNIT_DEFS[attacker.type].groundAttack;

  defender.strength -= attackValue;
  return { attackValue, destroyed: defender.strength <= 0 };
}

/**
 * Base attack/capture resolution (design doc §4). Per the worked
 * example: damage first destroys garrisoned units 1 SP each,
 * oldest-entered-first (base.garrison is kept in that order by
 * src/commands/enterBase.js), then any remaining damage spills onto the
 * base's own strength.
 *
 * Resolved ambiguity: §4's opening sentence ("destroying it costs
 * damage equal to the base's own strength + 1 SP per unit inside
 * (garrisoned OR UNDER CONSTRUCTION)") reads as if a unit under
 * construction adds to the damage total, but the worked example right
 * below it only accounts for garrisoned units, and a separate bullet
 * states a unit under construction "can never be destroyed by attacks
 * -- it's always safe." Followed here: the worked example and the
 * explicit safety bullet are authoritative; a base's currentBuild is
 * never touched by this function, consistent with never being
 * destroyable and never absorbing damage.
 *
 * Does NOT decide what happens when the base goes neutral (ownerId
 * change, previousOwnerId bookkeeping) -- that's the calling command's
 * job (src/commands/attackBase.js), since it also needs to remove
 * destroyed units from canonical state and update stats.
 */

/**
 * @param {object} base - mutated in place (garrison array shrinks, strength drops)
 * @param {number} damage
 * @returns {{destroyedUnitIds: (number|string)[], baseDamageDealt: number, wentNeutral: boolean}}
 */
export function resolveBaseAttack(base, damage) {
  let remaining = damage;
  const destroyedUnitIds = [];

  while (remaining > 0 && base.garrison.length > 0) {
    destroyedUnitIds.push(base.garrison.shift()); // oldest-entered-first
    remaining -= 1; // 1 SP each
  }

  const baseDamageDealt = Math.max(0, remaining);
  if (baseDamageDealt > 0) {
    base.strength -= baseDamageDealt;
  }

  return { destroyedUnitIds, baseDamageDealt, wentNeutral: base.strength <= 0 };
}

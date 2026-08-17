/**
 * Strategy registry -- design doc §9's three strategies, keyed by name
 * for lookup from a player's `strategy` field (src/state/initialState.js).
 */
import * as aggressive from "./aggressive.js";
import * as defensive from "./defensive.js";
import * as balanced from "./balanced.js";

export const STRATEGIES = { aggressive, defensive, balanced };
export const STRATEGY_NAMES = Object.keys(STRATEGIES);

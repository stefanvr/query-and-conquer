// Base type data — game spec §2's base table. View isn't used until fog of war (Stage 9), but
// costs nothing to record now alongside the rest of the table.
export const BASE_TYPES = {
  land: { strength: 20, view: 4 },
  port: { strength: 20, view: 4 },
  mountain: { strength: 20, view: 8 },
};

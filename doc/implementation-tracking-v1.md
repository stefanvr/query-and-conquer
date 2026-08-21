# Implementation tracking v1

Stage-by-stage build checklist, sequenced so each stage is playable and testable using only what
earlier stages have already built — no stage's tasks should depend on something a later stage
hasn't built yet. Cross-references: game design in [query-and-conquer.md](query-and-conquer.md),
tech decisions in [tech-stack.md](tech-stack.md), visuals in [style-guide.md](style-guide.md).

**Workflow, per stage:**
1. **Review the plan.** Re-read the stage's own checklist below and check whether it still holds
   up — add, remove, or tweak steps based on what's been learned since it was written (e.g. from
   how the previous stage actually went). Do this before touching the spec or any code.
2. **Fill in the spec, then stop.** Check the relevant section(s) of
   [implementation-spec.md](implementation-spec.md) — organized by game element/module, not by
   stage, so a stage typically touches a handful of sections there, not one exclusively — and
   write/update whichever of them the stage's features need (see that doc's own Format note).
   That's the "Spec" checkbox at the top of each stage below. Present the result and wait for
   explicit sign-off before writing any implementation code; update the section again if the
   design shifts once implementation starts.
3. **Implement with one commit per step.** Once the spec is confirmed, work through the stage's
   checklist items and commit each one separately rather than bundling the whole stage into a
   single commit.

---

## Stage 1 — App skeleton
- [x] Spec
- [x] Style page for development
- [x] Simple opening page with background
- [X] Deployment (GitHub Pages, per tech-stack.md)

## Stage 2 — Map creation
- [x] Spec
- [x] Implement map generation (§1: terrain rules, land/water body sizing, shallow-water chains,
      size/type tables)
- [x] Create build run script (regenerate maps only when the generation script changes)
- [x] Create maps preview page
- [x] Verify shallow/deep water adjacency doesn't always cap at exactly 3 shallow cells, so
      deep-water-adjacent ports (and therefore carriers) stay buildable — 70/70 generated maps
      with deep water have land directly adjacent to it
- [x] Verify the islands map type actually lands in the 35–40% water range — 30/30 generated
      islands maps measure 35.0-39.9% water

## Stage 3 — Outer game loop
- [x] Spec
- [x] Game options menu: AI count (1–5), per-AI difficulty, map size, map type (islands disabled
      when size is small, per map-tables.js's isComboSupported), fog of war toggle. Map size +
      type determine a candidate pool in assets/maps/; the actual map is picked at random from
      it (§1) — not a separate user-facing control.
- [x] Turn order randomized once at game start, then fixed for the match (§7)
- [x] Add start game in main menu
- [x] Create skeleton game
  - [x] render map: viewport-clipped canvas draw (never the full map — up to 12,000 cells),
        pan, zoom (+/- buttons and pinch), unified mouse/touch input layer, `touch-action: none`
        on the canvas (tech-stack.md's Mobile & touch support)
  - [x] add end turn option
  - [x] mid-turn: save (single slot, exact state)
  - [x] mid-turn: quit (exit to menu, last save intact, no result recorded)
  - [x] mid-turn: surrender (instant elimination)
- [x] Add load game to main menu
- [x] Create dev save game with test map
- [x] Add dev-only "load test game" option

## Stage 4 — Base build economy
- [x] Spec
- [x] Unit spec with build cost table (§2)
- [x] Game start: deployment bases
- [x] Turn option: build unit / queue unit (max 5 queued, 15 total capacity)
- [x] Turn start: unit ready / build next from queue
- [x] Update save/load for bases

## Stage 5 — Tank
- [ ] Spec
- [ ] Extend unit type data with full stats (§3: actions/turn, attacks/turn, attack range, needs
      LOS, view, strength, ground/air atk) — full table for all 6 units now, even though only
      Tank becomes actionable this stage, same pattern as Stage 4's build-cost table
- [ ] Unit movement: single-hop click-to-move (click an adjacent, passable, unoccupied hex;
      spends that terrain's AP cost from the unit's remaining actions/turn). No multi-hex
      pathfinding/path-preview for v1 human play — that's an AI-difficulty concern (§8, Stage
      12), not a human-UX one
- [ ] Unit selection + panel (AP remaining), distinct from the base panel (§4)
- [ ] Unit unload from base (choose a valid adjacent destination hex; costs 1 action + move cost)
- [ ] Unit load into base (costs 1 action + move cost; base needs capacity)
- [ ] Extend dev save game with tank next to base
- [ ] Fix: a base's map label can render partly overlapped by a later-drawn terrain hex —
      map-canvas.js's draw() interleaves terrain and label drawing in one pass; labels need
      their own pass after all terrain tiles are drawn

## Stage 6 — Combat, base capture & repair economy
*Repair only becomes testable once a unit can move, take damage, and re-enter a base to
garrison — this stage comes right after Tank so both halves land together, damage and its
recovery, on the same reference unit.*
- [ ] Spec
- [ ] Open-field unit-vs-unit combat resolution (§3)
- [ ] Claim an unclaimed base (tank/fighter/fregat only, terrain-gated per unit type — tank
      claiming is the only one testable until Boats/Planes land)
- [ ] Attack a claimed base: garrisoned units die first (oldest-entered), spillover hits base SP
      (§4)
- [ ] Base hits 0 SP → neutral; original-owner auto-recapture on completed build; open capture by
      anyone else
- [ ] Capture by attacker: clear queue/in-progress build, reset SP to 4
- [ ] Recapture by original owner: reset SP to 4, in-progress build keeps going
- [ ] Passive base repair (1 SP/turn)
- [ ] Per-unit repair (10 SP per bbr, up to 5 units in parallel, first-come queue beyond that)
- [ ] Extend dev save game with a damaged base and a damaged garrisoned tank, to exercise repair
      without having to play out a full battle each time

## Stage 7 — Boats: Fregat, Transporter, Carrier
- [ ] Spec
- [ ] Movement over water terrain, per unit
- [ ] Load/unload cargo: transporter holds 5 tanks, carrier holds 5 planes
- [ ] Boat entering a base with cargo unloads for free if the base has spare capacity for boat +
      cargo
- [ ] Base claim via fregat (port bases only — fregats can't move onto land) (§4)
- [ ] Port base build restriction: carrier only buildable adjacent to deep water
- [ ] Extend dev save game with boats + cargo

## Stage 8 — Planes: Fighter, Bomber
- [ ] Spec
- [ ] Air movement, no LOS requirement
- [ ] Rearm limits (fighter 4 strikes, bomber 2) — must return to base/carrier to rearm
- [ ] Round-trip range limit (fighter 100 cells, bomber 200) + crash on exceeding it
- [ ] Mandatory ≥50% action usage when not garrisoned (attacks excluded from that count)
- [ ] Mountain base (planes only; requires all-mountain neighbors)
- [ ] Base claim via fighter, including a mountain base unreachable by tank or boat (§4)

## Stage 9 — Fog of war
- [ ] Spec
- [ ] `getVisibleState(canonicalState, viewerId)` projection (tech-stack.md state-access rule)
- [ ] Hide cells/units outside current view range
- [ ] Distinguish "explored, not currently visible" vs. "currently in view" (style-guide.md)
- [ ] Fog of war on/off game option wired through

## Stage 10 — End game, outer loop
- [ ] Spec
- [ ] Elimination check (zero bases **and** zero units, including a unit still under
      construction at a currently-neutral former base)
- [ ] Win/lose detection (single remaining base owner)
- [ ] End screen: full map reveal, read-only, all bases/units annotated
- [ ] Stats dialog (units built/lost per player)
- [ ] Save/load for units

## Stage 11 — Easy AI
- [ ] Spec
- [ ] Strategy assignment (Aggressive/Defensive/Balanced, even spread per §8's formula)
- [ ] Per-unit greedy loop, processed base-defenders → field units → newly completed units
- [ ] Aggressive: priority list, build order, target priority
- [ ] Defensive: priority list, build order, target priority
- [ ] Balanced: priority list, build order, target priority
- [ ] Easy difficulty traits: fog-respecting info, first-valid-target, naive pathing,
      visible-threats-only reaction
- [ ] AI speed setting (instant/fast/slow) with actions visibly animating one at a time

## Stage 12 — Hard AI
- [ ] Spec
- [ ] Full map knowledge, ignores fog of war
- [ ] Strategy's real target-priority rule (not first-valid-target)
- [ ] Full pathfinding (lowest-cost route, respects LOS)
- [ ] Reacts to threats anywhere on the map, not just currently visible ones
- [ ] Enable "Hard" per-AI in the game options menu (keep Easy-only until this stage lands)

## Stage 13 — Polishing v1
*A deliberate closing pass before considering the build done.*
- [ ] Spec
- [ ] Edge-case sweep against query-and-conquer.md
- [ ] UI/UX pass
- [ ] Audit implementation-spec.md and query-and-conquer.md against the actual implementation,
      and document any remaining gaps

---

# Backlog — features to plan later

Genuinely out of scope for this build, per what the design/tech docs themselves call out as
deferred — not a place to park anything that's merely unfinished.

- [ ] AI combined-arms coordination beyond the per-unit greedy loop — §8 names this "a candidate
      for later" explicitly
- [ ] AI naval logistics (AI loading its own units onto transporters/carriers) — §8 explicitly
      scopes this out for v1
- [ ] Multiplayer/server mode — tech-stack.md's "future direction"; the canonical/visible-state
      split is already built to make this a relocation later, not a rewrite
- [ ] Save storage beyond localStorage, if capacity turns out to be a real constraint
      (tech-stack.md accepted this risk for v1)

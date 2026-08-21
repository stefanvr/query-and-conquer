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
4. **Push the feature branch before merging to main.** Push the working branch (e.g. `build-v2`)
   to its own remote first, so its full commit history is backed up on origin independent of
   main, then merge/fast-forward main and push that.

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
- [x] Spec
- [x] Extend unit type data with full stats (§3: actions/turn, attacks/turn, attack range, needs
      LOS, view, strength, ground/air atk) — full table for all 6 units now, even though only
      Tank becomes actionable this stage, same pattern as Stage 4's build-cost table
- [x] Unit movement: single-hop click-to-move (click an adjacent, passable, unoccupied hex;
      spends that terrain's AP cost from the unit's remaining actions/turn). No multi-hex
      pathfinding/path-preview for v1 human play — that's an AI-difficulty concern (§8, Stage
      12), not a human-UX one
- [x] Unit selection + panel (AP remaining), distinct from the base panel (§4)
- [x] Unit unload from base (choose a valid adjacent destination hex; costs 1 action + move cost)
- [x] Unit load into base (costs 1 action + move cost; base needs capacity)
- [x] Extend dev save game with tank next to base
- [x] Fix: a base's map label can render partly overlapped by a later-drawn terrain hex —
      map-canvas.js's draw() interleaves terrain and label drawing in one pass; labels need
      their own pass after all terrain tiles are drawn

## Stage 5b — Base panel slots & unload destination picker
*A UX pass on Stage 5's base panel and unload interaction, prompted by revisiting build-v1's
slot-grid panel and garrison-select flow — the plain-text queue/garrison lists and
auto-picked unload destination were meant as v1 placeholders, not the intended end state.*
- [x] Spec
- [x] Base panel: Building/Queue/Garrison as visual slot grids (icon + label per slot, empty
      slots dimmed), replacing the plain-text lines (§2)
- [x] `cancelQueuedBuild(state, baseId, queueIndex)` and
      `reorderQueuedBuild(state, baseId, queueIndex, direction)` commands
- [x] Queue slot interaction: click a filled slot to reveal Remove / Move up / Move down controls
      (§2)
- [x] `unloadUnit` takes an explicit destination instead of auto-picking the first valid hex
- [x] Garrison slot interaction: click a filled, owned slot to enter unload-preview mode — base
      panel closes, the unit's token draws on top of the base on the map, valid adjacent
      destinations highlight (§1/§2)
- [x] Unload-preview mode: click the base/unit to cancel back to the base panel; click a
      highlighted hex to confirm the unload there (§1/§2)
- [x] Update dev save script + e2e tests for the new unload flow

## Stage 6 — Combat, base capture & repair economy
*Repair only becomes testable once a unit can move, take damage, and re-enter a base to
garrison — this stage comes right after Tank so both halves land together, damage and its
recovery, on the same reference unit.*
- [x] Spec
- [x] Unit `remainingAttacks` (resets each turn like `remainingActions`, §3's Attacks/turn cap)
- [x] Attack targeting: with a unit selected, click an adjacent enemy unit or enemy-owned base to
      attack instead of move (mirrors move-targeting's click pattern)
- [x] Open-field unit-vs-unit combat: attacker's ground/air atk (by defender's target type)
      subtracted from defender's SP; destroyed at 0 (§3)
- [x] Claim command: enter (garrison into) a neutral base with a tank/fighter/fregat, terrain-
      gated per unit type — tank-only testable until boats/planes land (§4)
- [x] Attack a claimed base: garrisoned units die first (oldest-entered, 1 SP each flat — not
      their own strength stat), remaining damage spills onto base SP (§4)
- [x] Base hits 0 SP → neutral (`ownerId` null); records who to auto-recapture for
- [x] Turn-start: auto-recapture via the original owner's completed build (SP → 1) — this must
      run on that owner's turn even though the base currently has no owner
- [x] Claim resolution: both open capture (different owner) and manual recapture (original owner
      walks a unit in) set SP to 4; only capture (not recapture) clears the queue/in-progress build
- [x] Passive base repair: 1 SP/turn per owned, damaged base, at turn-start, before build
      completion (§7's per-turn sequence order)
- [x] Per-unit repair: up to 5 damaged garrisoned units repaired in parallel, 5 SP/turn each (10
      SP/bbr), first-come = garrison array order
- [x] Garrisoned-unit SP persists through load/unload (currently dropped on load, reset to full
      on unload — a damaged unit needs to carry its SP through both)
- [x] Bug fix found while planning this stage: `moveUnit`/`loadUnit`/`unloadUnit` don't check the
      acting unit/base is the active player's own — only the UI wires up controls for your own
      units/bases today, so nothing stops a direct call from acting on someone else's. Add the
      check to those commands and the new attack/claim ones, now that acting on another player's
      unit or base is a real mistake to guard against, not just a hypothetical one
- [x] An enemy-owned base discloses no interior state — no SP, garrison, queue, or in-progress
      build, on its map marker label or its panel; only type + owner (already visible without
      clicking it). Matches build-v1's own precedent ("a base's strength stays unknown until it's
      demolished"). Requires telling "is this base mine" apart from "is it currently my turn" —
      today's `isOwnTurn` check conflates the two, which happens to have been harmless so far
      since it only ever gated interactivity, never display
- [x] Combat/capture feedback (attack result, base-neutral/capture/recapture indicators) — already
      covered by the panel/marker work above (live SP/owner display) plus the map's own token
      removal on death; no dedicated animation/toast for v1 (§4)
- [ ] Extend dev save game with a damaged base, a damaged garrisoned tank, and a neutral
      (unclaimed) base near the human's own — the last one hand-placed for this save only, ahead
      of the real map-generation feature (Stage 13 backlog above), so the Claim command has
      something to test without playing out a full battle to neutral first

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
  - [ ] On narrow (mobile) viewports, an open side panel (base/unit) can visually overlap
        canvas-center, so a tap there hits the panel instead of the hex underneath it — known
        since Stage 5's movement tests, worked around there and in Stage 5b's e2e tests by
        clicking a panel's own close button first rather than tapping through it. Needs an actual
        layout fix (e.g. panel width/position that never covers canvas-center, or canvas taps
        during an open panel routing to the hex regardless of panel bounds).
- [ ] Map generation: place extra bases beyond the current 1-per-player (query-and-conquer.md
      §5's placement is currently exactly N seeds for N players, so every base starts owned —
      "claim an unclaimed base," Stage 6, only ever applies post-combat today). Extra
      pre-neutral bases would give players a real land-grab to contest from turn 1, not just a
      post-battle mechanic. Requires revisiting §5's own placement algorithm/text, not just the
      implementation, since it changes a stated game rule. Stage 6 front-runs this for its own
      dev-save testing by hand-placing one neutral base near the human's, rather than waiting on
      the real map-generation feature.
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

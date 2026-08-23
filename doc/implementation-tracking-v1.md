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
   design shifts once implementation starts. Skip the wait only when the user has explicitly
   said to for that stage (e.g. "if no significant question just do the spec and start
   implementation") — then note any real open design questions in the spec text itself and pick
   the sensible default rather than blocking on them, proceed straight into implementation, and
   let review happen against the finished result instead of the spec draft.
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
- [x] Extend dev save game with a damaged base, a damaged garrisoned tank, and a neutral
      (unclaimed) base near the human's own — the last one hand-placed for this save only, ahead
      of the real map-generation feature (Stage 13 backlog above), so the Claim command has
      something to test without playing out a full battle to neutral first
- [x] Ad hoc: the ownership-guard bug fix above only named `moveUnit`/`loadUnit`/`unloadUnit`/the
      new attack/claim commands — `queueBuild`/`cancelQueuedBuild`/`reorderQueuedBuild` had the
      same gap and were missed at the time. Give them the same `activePlayerId` check
- [x] Ad hoc: no SP indication existed anywhere for a unit — neither its map token (only showed
      AP) nor a garrison slot (only showed the unit type). Both now show current SP too, matching
      the existing convention (label line under the token; second line in the slot)
- [x] Ad hoc: hand-place a human-owned tank next to the AI's own base in the dev save, for
      manually testing attack/claim against a real enemy base without walking one over first
- [x] Ad hoc: tune that tank/base pair so the full neutral → auto-recapture cycle is manually
      testable in a couple of clicks — the AI base's sp is set to exactly 2 tank hits
      (groundAtk × attacksPerTurn) and it has an in-progress build completing in 1 turn, so
      attacking twice neutralizes it and the very next End Turn auto-recaptures it (game spec §4)

## Stage 7 — Boats: Fregat, Transporter, Carrier
- [x] Spec
- [x] Movement over water terrain, per unit — already generic (moveUnit/isBlockedForMovement
      aren't unit-type-specific); confirmed via e2e coverage against the dev save's transporter,
      no new movement code needed
- [x] Real line-of-sight blocking: hex-line tracing (cube-coordinate lerp + round, per hex step)
      between attacker and target, blocked by a mountain cell, a unit, or a base anywhere along
      it (game spec §1) — deferred since Stage 6 since every actionable unit had range 1 until
      now; Fregat (range 2, needs LOS) is the first that needs it for real
- [x] Generalize load/unload/the destination-picker command layer to work against either a base
      or a boat ("container" concept) — cargo entries share the garrison entry's `{id, unitType,
      sp}` shape
- [x] Load destination picker (§1): unit panel's Load button becomes a single button + map-click
      picker (highlights every valid adjacent base/boat; click one to confirm, click the unit's
      own hex to cancel) — replaces one-button-per-target, which breaks once more than one
      target can be adjacent at once (bases are ≥5 apart, but boats aren't)
- [x] Cargo: transporter holds 5 tanks, carrier holds 5 planes (game spec §3); unit panel shows a
      boat's cargo as a slot row (§3)
- [x] Boat entry with cargo unloads for free into a base with spare capacity for boat + cargo
      combined; rejected entirely (all-or-nothing) if there isn't room (§2)
- [x] Bug found while implementing: entering/claiming a base (and boarding a boat) computed move
      cost from the *target's* own cell — worked for a land unit entering a base (its cell is
      always land), but a boat's target base is always land (impassable for the boat) and a land
      unit's target boat is always water (impassable for it), making both permanently
      unenterable. Fixed to use the entering unit's own current cell instead (`enterCost`),
      consistent with query-and-conquer.md §3's "for a boat this can happen anywhere water is
      adjacent to land"
- [x] Base claim via fregat (port bases only — fregats can't move onto land) — already generic
      via claimBase's existing capturing-type + category checks; confirmed via a dedicated
      node:test (fregat claiming a neutral port base)
- [x] Port base build restriction: carrier only buildable adjacent to deep water — already
      implemented (buildableUnitTypes), already covered by an existing node:test
- [x] Extend dev save game with a hand-placed coastal patch + port base (the land-only dev map
      has neither, and base placement already ran before boats existed as a concept — same
      hand-splice pattern as Stage 6's neutral base) plus boats with cargo
- [x] Ad hoc: only Tank had a real shape — everything else fell back to a circle, so boats/planes
      were visually indistinguishable from each other everywhere (map token, garrison/queue/cargo
      slots, build buttons). Style-guide.md §9 already specifies the full table (Fighter
      triangle, Bomber hexagon, Fregat bar, Transporter circle, Carrier star); implemented it for
      real — one canvas path-tracing function (map-canvas.js's `traceShape`) and matching CSS
      classes, both keyed off the same `UNIT_SHAPES` map, in every one of those views including
      build buttons (which didn't show a shape at all before). Found and fixed a real bug in the
      same pass: the icon's default color matched the build button's own background exactly,
      making it invisible there — fixed via a CSS custom property so just that one context can
      override the icon color
- [x] Ad hoc: extend the dev save's coastal water patch 6 more cells down and to the right (a
      real hex-adjacency chain, not just col+1/row+1 pairs) so the transporter has an actual body
      of water to move around in, not just its starting hex and one neighbor
- [x] Ad hoc: a separate water chain next to the AI's own base, straight (same hex direction
      repeated, so hex-distance from the base equals the step count exactly) — a human fregat
      sits at distance 2 and a carrier at distance 4 (each unit's own max attack range), with the
      chain continuing to distance 6 so the carrier also has room to move itself out of range.
      Verified against the regenerated save: both can hit the base from their placed hex, and the
      carrier can no longer hit it after moving one more step out
- [x] Ad hoc: swapped Fregat and Transporter's shapes (Fregat: circle, Transporter: bar,
      style-guide.md §9) and left-aligned build button icon/label content (was centered)

## Stage 8 — Planes: Fighter, Bomber
- [x] Spec
- [x] Air movement, no LOS requirement — already generic (moveCost/isBlockedForMovement aren't
      unit-type-specific, LOS only ever gated attacks); confirmed, no new movement code needed
- [x] Rearm limits (fighter 4 strikes, bomber 2) — must return to base/carrier to rearm
- [x] Round-trip range limit (fighter 100 cells, bomber 200) + crash on exceeding it
- [x] Mandatory ≥50% action usage when not garrisoned (attacks excluded from that count) —
      `planesOwingMovement` gates/labels End Turn (§6), unit panel shows strikes/fuel remaining
      for a plane (§3), and moveUnit's own fuel-crash is handled in the UI too (selection/panel
      close on a crashed plane, not a stale render)
- [x] Mountain base (planes only; requires all-mountain neighbors) — already generic (base
      placement's `eligibleBaseType`, `BASE_CATEGORIES.mountain`, base panel's `buildableUnitTypes`
      all predate this stage); already covered by base-placement/terrain-texture tests, confirmed,
      no new code needed
- [x] Base claim via fighter, including a mountain base unreachable by tank or boat (§4) — already
      generic via claimBase's existing capturing-type + category checks; confirmed via a dedicated
      node:test (fighter claiming a neutral mountain base)
- [x] Dev-map fixtures: human + enemy mountain base, a fighter and a bomber near the enemy base
      with partial fuel spent but enough left to reach the human mountain base, and an enemy tank
      within the existing human fregat's range

## Stage 9 — Fog of war
- [x] Spec
- [x] `getVisibleState(canonicalState, viewerId)` projection (tech-stack.md state-access rule) —
      real filtering now (bases by ever-explored, units by currently-visible), backed by a new
      shared currentlyVisibleCells (visibility.js) and persisted per-player exploredCells
      (commands.js's markExplored); passthrough unchanged when options.fogOfWar is off
- [x] Hide cells/units outside current view range — map-canvas.js's draw() now skips terrain
      color for an unexplored cell (solid `--ink`) and never draws a unit/base the caller's own
      getVisibleState already filtered out; the camera holds a fresh filtered bases/units/fog via
      a new setVisibleState, refreshed on every redraw (Stage 8's shared helper, extended here)
- [x] Distinguish "explored, not currently visible" vs. "currently in view" (style-guide.md §7) —
      a 30% black overlay on top of the terrain fill for explored-not-visible; visually confirmed
      via a scratch Playwright screenshot before committing (a fresh match's own base surroundings
      revealed, the rest solid ink)
- [x] Fog of war on/off game option wired through — already collected by options-menu.js;
      getVisibleState's own `fogOfWar === false` passthrough confirmed end-to-end (node:test +
      e2e), dev save's own option flipped to off for tester ergonomics (implementation-spec.md §5)

## Stage 10 — End game, outer loop
- [x] Spec
- [x] Elimination check (zero bases **and** zero units, including a unit still under
      construction at a currently-neutral former base) — `isEliminated` (commands.js), used by
      `endTurn`'s own turn-skip loop
- [x] Win/lose detection (single remaining base owner) — `checkGameEnd`, sets `gameEnded`/
      `winnerId` from `endTurn`; `terminate` (surrender) is a separate always-a-loss path
- [x] End screen: full map reveal, read-only, all bases/units annotated — new `end-screen.js` +
      `#screen-end`, reusing the game screen's own `createMapCamera` with a new `revealAll` option
      (bypasses enemy-base non-disclosure); reached from both a natural win/loss and Surrender
      (`game-screen.js`'s `onGameOver`, replacing the old straight-to-main-menu `onTerminate`)
- [x] Stats dialog (units built/lost per player) — overlay on the End screen, reusing the
      mid-turn menu's own backdrop/panel-swap pattern; visually verified via a scratch Playwright
      screenshot before committing
- [x] Save/load for units — already generic (state.units has been part of canonical state since
      Stage 5); confirmed with a dedicated round-trip test, no new code needed

## Stage 11 — Easy AI
- [x] Spec
- [x] Strategy assignment (Aggressive/Defensive/Balanced, even spread per §8's formula) —
      `assignStrategies` (src/ai/strategies.js), applied once in `createGameState` alongside each
      AI's own difficulty and fixed for the match
- [x] Per-unit greedy loop, processed base-defenders → field units → newly completed units —
      `aiTurnActions` (src/ai/ai-turn.js), a generator so the caller owns pacing. "Newly
      completed" needed a way to be told apart from an existing defender, since both live in
      `base.garrison`: `processTurnStart` now tags a finished build with `builtOnTurn`
- [x] Aggressive: priority list, build order, target priority
- [x] Defensive: priority list, build order, target priority
- [x] Balanced: priority list, build order, target priority
- [x] Easy difficulty traits: fog-respecting info, first-valid-target, naive pathing,
      visible-threats-only reaction — decisions read `getVisibleState`, while commands still take
      canonical state so a rule resolves against reality (implementation-spec.md §11)
- [x] Ad hoc: the strategy lists only describe *field* units, so a garrisoned one would never
      leave and an AI would build units that sit in the base forever. Added deploy-from-base as
      the garrisoned equivalent, and wrote the rule into query-and-conquer.md §8 (Deploying)
      rather than leaving it an undocumented implementation choice — it changes AI behavior, so
      it belongs in the design doc, along with the lightly-garrisoned-bases consequence it has
- [x] AI speed setting (instant/fast/slow) with actions visibly animating one at a time — HUD
      select; Instant stays fully synchronous (no `await` on that path) so ending a turn still
      resolves inside the same click, and existing e2e timing is unaffected

## Stage 11b — Map interaction pass
*An intermediate stage pulling three items forward out of Stage 13, rather than waiting for the
closing pass: the two map-interaction complaints raised reviewing build-v2, and the boat-unload
gap found back in Stage 7. Same shape as Stage 5b — a focused UX pass on something already
built, not new game rules.*
- [x] Spec
- [x] Reachable-range movement: highlight every hex the selected unit can afford to reach, and
      move it there on click (walking the route, paying real terrain costs). Reverses
      implementation-spec.md §1's "no multi-hex pathfinding for human play in v1" — one hex per
      click is the tedium the review flagged
- [x] Shared `reachableCells` pathfinding module (Dijkstra over move costs, bounded by remaining
      AP) — Stage 12's hard AI needs the same "lowest-cost route" (§8's Difficulty table), so this
      lands as its own module rather than inside the UI
- [x] Attack target highlighting: mark every enemy unit/base the selected unit could actually
      attack right now (range + LOS + attacks remaining), so the LOS rule and per-unit ranges stop
      being guesswork
- [x] Unload straight into an adjacent friendly boat (moved up from Stage 13) — the picker only
      ever highlighted empty terrain, so only the boat → base direction worked. Costs 2 (1 load
      action + the 1-AP floor every move pays)
- [x] Ad hoc: garrison/cargo entries now carry `spentActions`, so entering a container costs
      something that survives the trip. Every entry was previously an affordability gate that the
      exit then forgot, letting a unit launder a spent budget by ducking into a base or boat and
      back out, and making a base → boat → shore hop *cheaper* than unloading straight to shore.
      Pre-dated this stage (`enterBaseWithCargo` always allowed it) but the new boat direction
      made it reachable one more way. Cleared at the owner's turn-start, like a field unit's own
      actions
- [x] style-guide.md §8: replace the text-only placeholder with the real on-map overlay
      vocabulary — that section already anticipated this ("range overlays... expected to replace
      this in a later pass")

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
  - [ ] Improve attack UX — flagged during a build-v2 review as needing a better pass than
        today's plain click-an-enemy-hex targeting; to be described in more detail when this
        stage is planned
  - [ ] Improve movement UX — flagged during the same review, alongside the attack UX item above;
        to be described in more detail when this stage is planned
- [ ] Map generation: place extra bases beyond the current 1-per-player (query-and-conquer.md
      §5's placement is currently exactly N seeds for N players, so every base starts owned —
      "claim an unclaimed base," Stage 6, only ever applies post-combat today). Extra
      pre-neutral bases would give players a real land-grab to contest from turn 1, not just a
      post-battle mechanic. Requires revisiting §5's own placement algorithm/text, not just the
      implementation, since it changes a stated game rule. Stage 6 front-runs this for its own
      dev-save testing by hand-placing one neutral base near the human's, rather than waiting on
      the real map-generation feature.
- [ ] Unloading a garrisoned/cargo unit straight into an adjacent friendly boat isn't possible —
      the unload destination picker (§1) only ever highlights empty passable terrain, since
      isValidUnloadTarget rejects any already-occupied hex outright, boat included. Needs the
      same kind of exit-target generalization enterBaseWithCargo (§2) already does for the
      opposite direction (boat → base): the picker would need to also treat "a friendly boat with
      room" as a valid destination, and unloadUnit/unloadCargo would need to route into that
      boat's cargo instead of the field on confirm. Not a minor tweak — found while reviewing
      Stage 7, deferred here rather than rushed in
- [ ] Hex selection/targeting (game-screen.js's `selectHex`) reads canonical state directly, not
      the fog-filtered projection (Stage 9) — a precisely-aimed click can still select/inspect a
      unit or base outside current fog. Tech-stack.md's "no cheating via inspecting client state"
      framing is explicit multiplayer future-readiness, not a v1 requirement, so Stage 9 left this
      as-is rather than rewiring every selection/targeting lookup for a risk that doesn't exist yet
- [ ] Planes' mandatory ≥50% movement (query-and-conquer.md §3) is only enforced against the
      *human*, as an End Turn gate (`planesOwingMovement`, Stage 8) — an AI's planes are never
      held to it, since an AI turn has no End Turn button to block. It's a game rule, not a UI
      rule, so the two sides should be symmetrical: either the AI's own turn has to satisfy it
      before ending, or the rule needs a penalty that applies to whoever breaks it. Noticed while
      building Stage 11; left alone rather than guessing at which of those two the design intends
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

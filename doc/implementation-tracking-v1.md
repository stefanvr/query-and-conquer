# Implementation tracking v1

**Purpose.** The build plan and its running record: what gets built, in what order, and what
actually happened.

**What belongs here.** Stages, their checklists, notes on how each item really went, and the
backlog of deferred work.

**What doesn't.** The process itself — that's [workflow.md](workflow.md), which every stage below
follows. Don't restate it per stage.

**Sequencing rule.** Each stage is playable and testable using only what earlier stages have
already built — no stage's tasks depend on something a later stage hasn't built yet.

Stages from 12 onward carry a **Try it:** line: how you'd actually exercise the thing once the
stage is done, written *while planning it*. If that can't be answered concretely the stage is
scoped wrong, and finding out at planning time costs a sentence instead of a rewrite. (Earlier
stages predate the convention; they aren't worth backfilling.)

Cross-references: game design in [query-and-conquer.md](query-and-conquer.md), tech decisions in
[tech-stack.md](tech-stack.md), visuals in [style-guide.md](style-guide.md), code style in
[code-conventions.md](code-conventions.md), machine setup in [environment.md](environment.md).

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
- [x] Strategy assignment (Aggressive/Defensive/Balanced, even spread per §8) —
      `assignStrategies` (src/ai/strategies.js)
- [x] Per-unit greedy loop, base-defenders → field units → newly completed units —
      `aiTurnActions` (src/ai/ai-turn.js), a generator so the caller owns pacing
- [x] Aggressive: priority list, build order, target priority
- [x] Defensive: priority list, build order, target priority
- [x] Balanced: priority list, build order, target priority
- [x] Easy difficulty traits: fog-respecting, first-valid-target, naive pathing
      (implementation-spec.md §11)
- [x] Ad hoc: deploy-from-base, so a garrisoned unit isn't stuck forever — written into
      query-and-conquer.md §8 (Deploying) as a real rule, not left an implementation detail
- [x] AI speed setting (instant/fast/slow); Instant stays synchronous so End Turn resolves in
      one click

## Stage 11b — Map interaction pass
*Pulls three items forward out of Stage 13 — the map-interaction review findings and the
boat-unload gap from Stage 7 — rather than waiting for the closing pass.*
- [x] Spec
- [x] Reachable-range movement (`reachableCells`, src/state/pathfinding.js) — reverses
      implementation-spec.md §1's original "no multi-hex pathfinding" call
- [x] Attack target highlighting: mark every enemy unit/base actually attackable right now
      (range + LOS + attacks remaining)
- [x] Unload straight into an adjacent friendly boat (was base → boat only); costs 2
- [x] Ad hoc: garrison/cargo entries now carry `spentActions`, closing a budget-laundering gap
      where entering then exiting a container was cheaper than it should be
- [x] style-guide.md §8: real on-map overlay vocabulary replacing the text-only placeholder

## Stage 12 — Hard AI

**Try it:** start a match with one Easy and one Hard AI, both on a paced AI speed, and watch a
turn of each — the Hard one should route around obstacles the Easy one walks into, and act on
threats outside its own view.

*Plan revised before starting (workflow.md step 1) — two planned items collapsed into one, two
missing ones surfaced. See "Stage 12: spec for hard AI, and a revised plan".*

- [x] Spec
- [x] **First:** hold the AI to planes' mandatory ≥50% movement (query-and-conquer.md §3),
      previously only enforced against the human — see "Hold the AI to the mandatory
      plane-movement rule". Led the stage deliberately: Hard is the first AI to move planes with
      intent, so measuring it before fixing this would compare it against an exempt human
- [x] Difficulty branch point (`ctx.traits`, one seam the engine selects on rather than
      scattered `if (hard)` checks) — see "Give difficulty a seam to hang off"
- [x] Perception: canonical state instead of `getVisibleState` — "reacts to threats anywhere"
      falls out of this, not a second mechanism — see "Let hard AI see the whole board"
- [x] Real target-priority rule (`lowestStrength`/`highestAttack`) — see "Turn on the
      strategies' target priorities for hard AI"
- [x] Full pathfinding: an unbounded route search (A\*), not `reachableCells` (bounded by the
      turn's own AP, so it can't answer "which way") — see "Give hard AI a route search"
- [x] Firing-position movement ("respects LOS") and a full action budget, in one commit since
      the first isn't observable without the second — see "Hard AI: firing positions, and a
      full action budget"
- [x] Easy AI regression: pre-stage engine vs. new, 40 seeded matches, 2000 AI turns compared
      action-for-action, 0 differing
- [x] Enable "Hard" per-AI in the game options menu
- [x] Verified the "Try it" claim by measurement: hard 14, easy 0 over 30 seeded matches (16
      hit the turn cap undecided; none lost by hard)
- [x] Ad hoc: measured the tempo gap rather than estimating it — 1.38×, far below the ~3×
      predicted, since most units have no second rule once they've moved. The difficulty gap is
      more about *what* hard does than *how much*

## Stage 13 — Map generation & hex misc
*Split out of the old single "Stage 13 — Polishing v1" catch-all (2026-08) — one closing stage
had become four different kinds of work, none plannable together. See "Split the old Stage 13
catch-all into four focused stages".*
- [x] Spec — see "Stage 13: spec for neutral bases and fog-honest selection" and its follow-up
      revision after review
- [x] Neutral bases seeded alongside player ones, scaling with player count and usable map
      area — see "Seed neutral bases alongside player ones" for what shipped, including a real
      mid-build correction (the reviewed formula broke `islands` maps) and the graceful-degradation
      fallback that came out of it
- [x] Hex selection/targeting now reads the fog-filtered projection, not canonical state — see
      "Read the fog-filtered projection for hex selection, not canonical state"
- [x] *Resolved* — no more hex-misc items surfaced beyond the two above.

## Stage 14 — UI/UX pass

**Try it:** on a phone-width viewport, select a plane mid-move (HUD notice appears without
shifting End Turn/Menu), select a tank (its stats sit inline with the title, Load button visible
without scrolling), open its Load picker (range dims to just the highlighted destinations, tap
anywhere else to cancel back to the panel with the unit still selected), then open the mid-turn
menu and change AI speed there instead of in the HUD.

*Plan revised before starting (workflow.md step 1) — see "Stage 14: plan review and spec sign-off"
for what changed and why.*

- [x] Spec — see "Stage 14: plan review and spec sign-off"
- [x] An open side panel could overlap the map, so a tap meant for a hex hit the panel instead —
      worst on narrow viewports where it covered canvas-centre, but it hid the zoom buttons at
      any width. Fixed by making the panel a layout sibling of the canvas rather than an overlay:
      it takes its own space, the canvas shrinks to what's left, and nothing tappable can sit
      underneath it. Narrow viewports stack it below the map instead of beside it. Removed the
      four mobile-only test skips and both close-the-panel-first workarounds this had forced
      since Stage 5 — the e2e suite now runs every test on both viewports. *(Landed while this
      was still filed under the old Stage 13, before the split above — kept here since this is
      where the rest of the UI/UX pass now lives.)*
- [x] Unit panel: SP/AP/strikes/fuel move inline with the title on narrow viewports
      (implementation-spec.md §3) — see "Unit panel: stats inline with the title on narrow
      viewports"; first instance of a pattern meant for reuse in a later panel GUI-style pass
- [x] Load/unload destination picker: dim (suppress) the stale move/attack/claim overlay while a
      picker is open, and cancel back to the relevant panel on any click that isn't a highlighted
      destination (implementation-spec.md §1) — see "Load/unload picker: dim the stale range
      overlay, cancel from anywhere"; applies to both pickers, a consistency call made at sign-off
- [x] HUD: reserve space for the "plane still owes its movement" notice, and move AI speed
      (Instant/Fast/Slow) out of the HUD into the mid-turn menu (implementation-spec.md §6/§8) —
      see "HUD: reserve space for the End Turn blocker notice; move AI speed to the mid-turn menu"
- [x] On mobile, selecting a tank opened its panel with the Load button below the fold. First fix
      ("Mobile panel: dvh alongside vh for the side-panel max-height") guessed wrong — user
      confirmed on-device it didn't help, and follow-up questioning placed the real cause
      elsewhere: Android Chrome, reliably on every cold load, the whole *page* needed scrolling
      (not the panel's own), which pointed at `min-height: 100vh` on the page's own full-screen
      containers rather than the panel. See "Mobile page height: dvh alongside vh, the fold bug's
      real location" for the corrected fix — confirmed working on-device
- [x] No dedicated attack/capture animation or toast — closed by decision during Stage 14's plan
      review, not left open any longer: the base/unit panel's own SP/owner display
      (implementation-spec.md §2/§3) and the map's own token/marker removal on death are the v1
      answer in full
- [x] The mandatory-movement notice named every owing plane inline by type — didn't scale. Fell
      off the radar until flagged post-review; see "Mandatory action: a scaling button + panel,
      replacing the per-unit HUD message" (implementation-spec.md §6/§7)
- [x] Ad hoc: on a narrow viewport, a plane's unit panel (4 stats: SP, AP, strikes, fuel) wrapped
      stat-by-stat and let fuel spill onto its own line under the title — an overflow the earlier
      inline-stats work missed since it was only exercised against a 2-stat (SP/AP) unit at the
      time. Paired the stats two per line instead (implementation-spec.md §3); desktop's stacked
      layout is unchanged
- [x] Ad hoc: two more requests against the stat block above — center the two lines relative to
      each other (was right-aligned) for a more settled look where they're uneven lengths, and a
      long title (Transporter/Carrier) risked the same kind of overflow the plane fix just solved,
      just from title width instead of stat-line count. Added flex-wrap so the stat block drops to
      its own line below the title if the two genuinely can't share one row, rather than clipping
      against the close button. Centering confirmed working; the wrap fix reduced but didn't fully
      resolve Transporter/Carrier's overflow — user confirmed some right-edge overflow remains on
      their device (a case local testing, down to a 320px viewport and simulated larger font
      scales, still hasn't reproduced), but called it good enough to move on from for now. Left
      open in Stage 16's closing-pass sweep below rather than chased further here

## Stage 15 — Balance & gameplay
*A real-play pass rather than a code-correctness one: settling the open design questions that
only a played match can answer, not a unit test. Game spec §9 ("Balance considerations") moves
here in full — decided-on-paper-only tuning content doesn't belong in a doc meant to state
settled rules (workflow.md's "when a rule turns out to be wrong" applies in reverse: this is
content that was never a rule to begin with). Whatever gets decided writes back into
query-and-conquer.md as ordinary rule text; §9 itself goes away once nothing is left open there.*

*Plan reviewed before starting (workflow.md step 1): the questionnaire still holds — nothing in
Stages 13/14 touched AI difficulty, plane movement, rearm, or mountain bases. Two corrections:
game spec §9 has already been fully extracted (it's gone from query-and-conquer.md; this
checklist already carries its content, so there's no separate move-the-section step left to do),
and "the Stage 12 manual match test" doesn't refer to existing notes — Stage 12's own "Try it" was
verified by a 30-match seeded simulation, not an actually-watched match, so that bullet just means
folding in whatever this stage's own play surfaces. Sequencing agreed with the user: mountain-base
first (zero setup, the dev save already has the fixture), then Hard-vs-Easy feel + plane
purposefulness together in one match, then rearm timing last (needs a dev-only toggle built first
to compare against, agreed with the user rather than assumed).*

*Process note, explicitly a temporary deviation per the user, scoped to this stage: workflow.md's
push-then-review-then-merge gate is relaxed here — each finding merges straight to `main` once
its own commit lands, so the user can playtest each change on their phone between findings rather
than waiting for the whole stage. This stage is tuning values/algorithms against feedback, not
building a feature; normal branch discipline resumes once this stage wraps.*

- [x] Ad hoc, found during plan review: `assets/dev-save.json` was stale — regenerating it (no
      code changes, same seed) added one neutral base that wasn't there before, Stage 13's own
      neutral-base seeding never having been reflected in the committed save. Confirmed via a
      structural diff that nothing else changed (map, units, the other bases all identical bar an
      id renumbering to make room) and the full suite still passes — base ids aren't referenced by
      number anywhere in code or tests, only by position, so the shift is harmless
- [ ] Spec — implementation-spec.md §3's Plane rearm & fuel section already flags the rearm-timing
      question as open; update it (and any other affected section) once each questionnaire item
      resolves, not upfront — there's no new UX to spec ahead of a decision that doesn't exist yet
- [ ] Gameplay questionnaire — gaps a played match can surface that a seeded sim or a unit test
      structurally can't (a sim has no opinion on whether something *feels* right):
  - **Resolved:** Mountain-base takedown (moved from game spec §9) — not the Bomber+Fighter
      pairing itself, but a broader strength/attack imbalance it surfaced (Fighter tougher than a
      Tank; Tank's air atk barely a threat). See "Balance pass: Fighter strength down, Tank air
      attack up" for the numbers and reasoning
  - **Resolved, not a bug:** user also reported not seeing AI planes attack tanks — a throwaway
      simulation (deleted, per code-conventions.md) showed planes attacking tanks 196/1722 times
      in a 20-match sample, the most common plane-vs-unit target; read as the one short session
      not catching it, not a structural gap. No code change
  - Does Hard AI feel meaningfully stronger than Easy in a real match, or does the measured 1.38×
      action-tempo gap (Stage 12) read as too close for the difficulty label to be honest?
  - Now that an AI's planes are held to the mandatory ≥50% movement rule (Stage 12), does a
      Hard AI's plane use look purposeful in a real game, or does the forced movement read as
      erratic/wasteful?
  - Plane rearm/refuel timing: instant, same-turn rearm vs. resolving at the owner's next
      turn-start — play both and compare tempo via a temporary dev-only toggle, don't just reason
      about it
  - **Resolved, in two passes:** user's finding — AI builds planes too soon, tanks feel
      under-favored. Verified the actual cause with a throwaway sim (deleted): plain fewest-first
      made every strategy's Land-base production identical (Tank, Fighter, Bomber, Tank, ...
      regardless of strategy), independent of AI-vs-AI combat. First fix (a divisor) shipped to
      main, tested by the user, and confirmed *not actually working* — traced to a real
      mathematical gap (a divisor can't delay a type's first appearance past count 1, regardless
      of the divisor's size) and replaced with a head-start subtraction, which measures correctly
      as 3 tanks before the first plane on re-verification. See "AI build order: weight Tank..."
      and its follow-up "AI build order: fix the head start..." commits, and query-and-conquer.md
      §8
  - **Resolved:** user's finding — Defensive/Balanced units run from fights instead of landing a
      last hit, and only fight once truly cornered. Traced to `retreatToRepair` being rule 1 for
      both strategies, gated on *any* damage at all, ahead of every attack rule. Fixed with a 50%
      SP threshold plus a kill-shot override (take a lethal attack regardless of own damage) — see
      "AI: don't flee a kill, and don't flee a scratch" and query-and-conquer.md §8
  - Anything else surfaced along the way
- [ ] Decide and implement whatever the questionnaire above settles; fold each resolved question
      back into query-and-conquer.md's normal rule text (not a new open-questions appendix)

## Stage 16 — Closing pass
*The deliberate closing sweep before considering v1 done — what's left once map/hex, UI/UX, and
balance have their own stages above.*
- [ ] Spec
- [ ] Edge-case sweep against query-and-conquer.md
- [ ] Audit implementation-spec.md and query-and-conquer.md against the actual implementation,
      and document any remaining gaps
- [ ] From Stage 15: the unclaimed (neutral) base's map-marker color is hard to distinguish —
      user flagged this during balance playtesting as worth a look, not investigated yet
- [ ] Moved from Stage 14: `unit-movement.spec.js`'s "moving the tank to an adjacent hex" failed
      twice in about sixteen full-suite runs during Stage 12, then passed twelve consecutive runs
      and always passes in isolation. Both failures were in runs that took 30s and 15s against a
      normal 6–7s, so machine load is the likely cause rather than a logic defect — but the test
      computes a screen position from the canvas box and assumes the camera is still centred on
      the base at the default hex size, and canvas re-measurement became asynchronous
      (`ResizeObserver`) in Stage 14's panel-overlay fix. A widened timing window under load fits
      what was seen. Not chased further because it wouldn't reproduce; if it resurfaces, the fix
      is to make the test wait for stable canvas dimensions rather than assuming them. Watch-item,
      not an open task
- [ ] Moved from Stage 14: on mobile, a long unit-panel title (Transporter/Carrier) plus its stat
      block (implementation-spec.md §3) still overflows on the right on the user's real device,
      despite two rounds of fixes (centering the stat lines, then adding flex-wrap so the block
      drops below the title rather than clipping) — the wrap fix helped but didn't fully resolve
      it. Not reproduced locally at any tested width (down to 320px) or simulated font scale, so
      the next step needs either the exact device/viewport width that shows it, or an on-device
      screenshot with computed element sizes, rather than another guess. Called "good enough for
      now" by the user rather than chased further at the time

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

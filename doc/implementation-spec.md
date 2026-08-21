# Implementation spec

Companion to [query-and-conquer.md](query-and-conquer.md): that document specifies the game's
*rules*; this one specifies the **UX interaction and application behavior** built around them —
how each game element is presented and operated, plus the application-only modules (menus, HUD,
save/load) that have no rule-level counterpart. Organized by game element/module, mirroring the
game spec's own structure where a section corresponds directly to one of its sections.

Sections start `_Not started._`. Fill a section in once [implementation-tracking-v1.md](implementation-tracking-v1.md)
is about to build the feature it covers — a tracking stage typically touches a handful of
sections here, not one exclusively, so check this file's relevant sections before starting a
stage rather than a single same-named one. Keep a section updated if the design shifts during
implementation.

**Format:** keep sections to short bullet-point guidance for *implementing* the feature — not
prose paragraphs explaining rationale, backstory, or restating what the game spec, tech stack
doc, or tracking doc already cover. Favor something like "circular background visual + title +
Start button, per style-guide.md §9" over a multi-paragraph explanation of why each visual choice
was made or how it maps to CSS — that level of detail belongs in code comments or the tracking
doc, not here.

---

## 1. Map & camera
*(game spec §1 — rendering, pan/zoom, hex selection & highlight, terrain legend, tile hover
states. Base placement, §5, is fully automatic and has no dedicated UX surface — note any
placement-adjacent UI, e.g. a start-of-game camera focus, here instead. Pan/zoom design here
must account for touch (drag-pan, pinch-zoom, `touch-action: none` on the canvas) alongside
mouse — see tech-stack.md's Mobile & touch support section.)*

### Maps preview page (dev-only)
- Static grid render of each pre-generated map, flat terrain colors (style-guide.md §4), no
  pan/zoom/interaction — a visual check on generation output, not the real game camera.

### In-game map render
- Canvas render (tech-stack.md), viewport-clipped — only draws cells currently on screen, never
  the full map (up to 12,000 cells).
- Pan: mouse/touch drag. Zoom: scroll wheel / pinch, plus on-screen +/- buttons as a fallback.
  `touch-action: none` on the canvas element only.
- Initial camera: centered on the map. Base-relative start focus is deferred to Stage 4 (no
  bases exist yet this stage).
- No hex selection/highlight/hover interaction yet — nothing to select on an empty map. Lands
  with Bases/Units (§2/§3) in later stages.

## 2. Bases
*(game spec §2 — base info panel, build/queue interaction, capacity display, repair status)*
_Not started._

## 3. Units
*(game spec §3 — selection, movement (path preview, action-point display), attack targeting,
load/unload and cargo interaction)*
_Not started._

## 4. Combat & capture
*(game spec §4 — attack feedback/animation, damage display, capture and neutral-base
indicators)*
_Not started._

## 5. Fog of war
*(game spec §6 — visual treatment of hidden / explored-but-not-visible / currently-visible
cells and units)*
_Not started._

## 6. HUD
*(app-only — persistent on-screen chrome: turn/player indicator, end-turn control, AI-speed
control, entry point to the mid-turn menu)*
- Persistent bar: current player/turn indicator, End Turn button.
- Entry point (button/icon) opening the mid-turn menu (§8).
- AI-speed control deferred — no visible AI actions to pace until Stage 11.

## 7. Side menu & selection panel
*(app-only — the contextual detail/action panel shown for whatever's currently selected, base
or unit; hosts the interaction described in §2/§3 above)*
_Not started._

## 8. Menus & screens
*(app-only — start screen, main menu (new game / load game), game options menu, mid-turn menu
(save/surrender/quit), end screen; game spec §7 for the flows these implement)*

### Start screen
- Circular background visual + title + `Start` button, per style-guide.md §9.
- `Start` is a placeholder for testing — no main menu to navigate to until Stage 3.

### Dev style guide page (dev-only)
- `dev/style-guide.html` — living reference of style-guide.md's tokens/components, not part of
  the shipped app. Pulls the app's own CSS rather than duplicating values.

### Main menu
- Named "Main menu", not "Game room" — this screen is solo-game entry only; "Game room"
  connotes a multiplayer lobby (join/host, other players present), which doesn't exist yet.
  When multiplayer lands (tech-stack.md's future direction), it gets its own entry here
  pointing at an actual lobby screen, rather than this one being reinterpreted.
- Shown after Start (replaces the Stage 1 stub in `src/main.js`).
- Two entries: New game (→ game options menu) and Load game (enabled only when the save slot has
  a save, §10).
- Dev-only entry: "Load test game", loads the fixed dev save (§10). Gated behind a `?dev` URL
  query param, not a build-time flag — no build step exists to gate it at (tech-stack.md).

### Game options menu
- Controls: AI count (1–5), per-AI difficulty (Easy only — Hard stays disabled until Stage 12),
  map size, map type (Islands option disabled when size = Small), fog of war toggle.
- Dropdowns per style-guide.md §9 "Selection components".
- Confirm: picks a random map from `assets/maps/` matching the chosen size + type, randomizes
  turn order, navigates to the game screen.

### Mid-turn menu
- Reached via the HUD's entry point (§6), any time during the human player's own turn.
- Three actions, in this order: Save (§10), Surrender (instant elimination — irreversible;
  shows an in-app confirmation panel, not a native `confirm()`, before applying), Quit (return
  to main menu; save slot untouched).
- The confirmation panel reuses the mid-turn menu's own overlay backdrop, swapping which inner
  panel is shown, rather than stacking a second overlay on top.

## 9. Stats display
*(app-only — running in-HUD stats if any, and the end-of-game stats dialog per game spec §7)*
_Not started._

## 10. Save/Load
*(app-only — save/load UI flow, dev save game and dev-only load-test-game option)*
- Single save slot, localStorage-backed (tech-stack.md), exact mid-turn canonical state.
- Only the mid-turn menu's Save action writes to the slot — quitting does not autosave.
- Dev save: a fixed, hand-authored save (small test map, no bases/units yet — those land in
  Stage 4+) separate from the player's slot, reached via the main menu's `?dev`-gated "Load test
  game" entry (§8).

## 11. AI behavior UX
*(game spec §8 — visible per-action animation during an AI turn, and how the instant/fast/slow
speed setting affects it)*
_Not started._

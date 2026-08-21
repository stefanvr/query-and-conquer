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

Each section describes the end state to reach once its stage finishes, not a chronological build
log — drop current/past-stage references (e.g. "(Stage 4)") once they're no longer forward-looking;
that history belongs in the tracking doc/git log, not here. References to a *future*, not-yet-built
stage are fine and worth keeping — they explain why something isn't specced yet.

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
- Initial camera: centered on the human player's own base.
- Field units: drawn per style-guide.md §9 — shape by unit type (Tank: square),
  owner's accent-color fill, white stroke if selected else `rgba(0,0,0,0.5)`, radius `0.4 ×
  hexSize`. Plain-text AP label near the token (style-guide.md §8), same pattern as base labels.
  Garrisoned units are never drawn as tokens (style-guide.md §9) — only the owning base's marker
  shows.

### Hex selection (tap/click)
- A tap/click that doesn't move (or moves under a small pixel threshold) selects the hex under
  the pointer; anything past that threshold is a pan, not a selection — reuses map-canvas.js's
  existing pointer tracking, no separate gesture system.
- Selecting a hex with a base on it opens that base's panel (§2/§7); a hex with a field unit
  opens the unit panel instead (§3/§7); selecting empty terrain clears the current selection.
- Selected hex: white outline stroke on the hex (style-guide.md §9's existing selected-unit
  stroke rule extended to hexes — no new token needed).

### Movement targeting
- With a unit selected, tapping/clicking an adjacent (hex-distance 1), passable, unoccupied hex
  moves the unit there instead of reselecting — spends that terrain's move cost (game spec §3)
  from the unit's remaining actions. Tapping anything else (non-adjacent, impassable, occupied,
  or no unit selected) falls back to normal selection/deselection.
- No multi-hex pathfinding or path preview for human play in v1 — click-to-move one hex at a
  time. (Hard AI's "full pathfinding," §8/Stage 12, is a separate AI-quality concern, not this.)

### Unload destination picker
- Clicking a filled, owned garrison slot (§2) closes the base panel and enters unload-preview
  mode: the garrisoned unit's own token (style-guide.md §9) draws on top of the base hex, and
  every valid adjacent destination (passable for its type, unoccupied, affordable within its
  full action budget) highlights.
- Clicking the base hex, or the previewed unit's own hex, cancels back to the base panel.
  Clicking a highlighted hex confirms — unloads the unit there (§2) and opens its unit panel
  (§3). Clicking anything else is a no-op; stays in preview mode.

## 2. Bases
*(game spec §2 — base info panel, build/queue interaction, capacity display, repair status)*

### Base placement (game spec §5)
- Runs once at match start (createGameState), after a map is picked — not pre-baked into the
  map JSON, since it depends on player count, which varies per match.
- N seed points (N = player count) via farthest-point sampling over in-map cells: first seed
  random, each next seed is the in-map cell maximizing its minimum distance to seeds already
  chosen. Every in-map cell's region = its nearest seed (implicit Voronoi tessellation, no
  explicit region-boundary construction needed).
- Per region: rejection-sample a candidate cell — its own terrain determines which base type(s)
  it's eligible for (Land/Port/Mountain location rules, game spec §2); check hex-distance >= 5
  from every already-placed base (any player, §1's min-base-distance rule); place if valid, else
  try another candidate cell (bounded attempts), then reseed the whole map (bounded attempts) if
  a region still can't produce a valid base.
- One base per player, regions assigned in player order (all regions are equivalent by
  construction, so assignment order doesn't bias placement).
- Base SP starts at full strength (20, §2) — no damage exists yet (combat lands Stage 6).

### Base panel (side menu, §7)
- Opens on selecting a base (§1). Shows: base type, SP (`20/20`, style-guide.md §8's text
  treatment), garrison count / capacity (`X/15`).
- Three labeled slot grids (icon + label per slot, style-guide.md §9's token styling; empty
  slots dimmed):
  - **Building** — 1 slot: current in-progress build (`unit type` + `remaining/total` turns), or
    idle.
  - **Queue** — 5 slots: one per queued item, in order.
  - **Garrison** — `capacity - 1` slots (`14`), growing to fit if the garrison count ever
    exceeds that (no build in progress); filled front-to-back in entry order.
- Queue slot click (own base/turn only, filled slot): toggles that slot's inline controls —
  Remove, Move up (disabled at index 0), Move down (disabled at the last index). Only one slot's
  controls are open at a time.
- Garrison slot click (own base/turn only, filled slot): enters unload-preview mode (§1) instead
  of anything within the panel itself.
- A base selected while it isn't the active player's own turn (or isn't owned by the active
  player) still shows all three grids, read-only — no slot click handlers, no build buttons.
- One build button per unit type the base's category allows (game spec §2: Land → Tank; Port →
  Tank/Fregat/Transporter/Carrier; Mountain → Fighter/Bomber) — Fighter/Bomber/Fregat/
  Transporter/Carrier buttons exist now even though those unit types have no movement/combat
  until their own stage (boats: 7, planes: 8) lands; they just sit garrisoned until then.
- Build button disabled when the queue already holds 5 pending items — not when capacity is
  full, since queuing (unlike starting) doesn't consume a capacity slot (game spec §2).
- Unload has no dedicated button — triggered via the garrison slot click above (§1's unload
  destination picker), which lets the player choose the destination instead of auto-picking.
  Costs 1 action + the destination's move cost (game spec §3), taken from the unit's own action
  budget as it becomes a field unit.

### Turn-start build processing
- When a player's turn begins (including cascading through AI turns): tick down that
  player's bases' in-progress build timers; on completion, add the unit to the garrison and, if
  capacity allows, pull the next queued item into "in-progress" with a fresh timer
  (cost-multiplier × bbt, game spec §2).
- Passive base repair and neutral-base recapture — also part of game spec §7's turn-start
  sequence — stay deferred to Stage 6 along with the rest of the repair economy.

## 3. Units
*(game spec §3 — selection, movement (path preview, action-point display), attack targeting,
load/unload and cargo interaction)*

### Unit type data
- full stat block added for all 6 units (actions/turn, attacks/turn, attack range,
  needs LOS, view, strength, ground/air atk, move cost per terrain, game spec §3).

### Field units
- A unit leaving a base (unload, §2) becomes a field entry: id (carried over from its
  garrisoned id), ownerId, unitType, col/row, sp (starts at the type's max strength — no damage
  exists yet, Stage 6), remainingActions (starts at the type's full actions/turn *before* the
  unload's own 1-action + move-cost is deducted, so a freshly-unloaded unit can still act with
  whatever's left that same turn). Resets to the full actions/turn again at the owner's next
  turn-start, alongside build processing (game spec §7).
- Move cost is spent from remainingActions per hex entered (game spec §3's terrain cost table;
  `0` = impassable, not free). A unit with 0 remaining actions can't move or load/unload.

### Unit panel (side menu, §7)
- Opens on selecting a field unit (§1). Shows: unit type, SP (`10/10`), actions
  (`X/5 AP`, style-guide.md §8).
- Load button: shown when adjacent to a friendly base with spare capacity: costs 1 action + the
  base's own terrain's move cost, removes the unit from the map and appends it back to that
  base's garrison (game spec §2).

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
- Two panel types (base panel §2, unit panel §3), same side-panel chrome, swapped by what's
  currently selected (§1) — never both at once, since only one hex can be selected at a time.

## 8. Menus & screens
*(app-only — start screen, main menu (new game / load game), game options menu, mid-turn menu
(save/surrender/quit), end screen; game spec §7 for the flows these implement)*

### Start screen
- Circular background visual + title + `Start` button, per style-guide.md §9.
- `Start` navigates to the main menu (§8, below).

### Dev style guide page (dev-only)
- `dev/style-guide.html` — living reference of style-guide.md's tokens/components, not part of
  the shipped app. Pulls the app's own CSS rather than duplicating values.

### Main menu
- Named "Main menu", not "Game room" — this screen is solo-game entry only; "Game room"
  connotes a multiplayer lobby (join/host, other players present), which doesn't exist yet.
  When multiplayer lands (tech-stack.md's future direction), it gets its own entry here
  pointing at an actual lobby screen, rather than this one being reinterpreted.
- Shown after Start.
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
- Dev save: a fixed save built with the app's own `createGameState`/placement logic (not
  hand-authored — see `scripts/generate-dev-save.js`), separate from the player's slot, reached
  via the main menu's `?dev`-gated "Load test game" entry (§8). Regenerated whenever the state
  shape changes.

## 11. AI behavior UX
*(game spec §8 — visible per-action animation during an AI turn, and how the instant/fast/slow
speed setting affects it)*
_Not started._

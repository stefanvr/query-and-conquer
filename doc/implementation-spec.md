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
- Base markers: owner's accent-color stroke, or steel-gray if unowned (§2/§4). A label under
  your own base shows its SP and, if a build's in progress, `Building: [unit type]` — an
  enemy-owned base's marker has no label at all, matching its panel's own non-disclosure (§2/§4).
- Field units: drawn per style-guide.md §9 — shape by unit type (its full table: Tank square,
  Fighter triangle, Bomber hexagon, Fregat circle, Transporter bar, Carrier star), owner's
  accent-color fill, white stroke if selected else `rgba(0,0,0,0.5)`, radius `0.4 × hexSize`.
  Plain-text SP then AP labels near the token (style-guide.md §8), same pattern as base labels —
  shown for every unit regardless of owner, unlike a base's own SP (§2/§4's non-disclosure is
  base-specific; a visible enemy unit's strength has always been shown, same as its panel, §3).
- The same shape table draws build buttons and garrison/queue/cargo slot icons (§2/§3) — one
  shared per-unit-type shape mapping (map-canvas.js's `UNIT_SHAPES`), each context (canvas vs.
  CSS) tracing that same shape natively rather than sharing literal drawing code.
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
- Clicking a filled, owned garrison/cargo slot (§2/§3) closes the base/unit panel and enters
  unload-preview mode: the garrisoned/cargo unit's own token (style-guide.md §9) draws on top of
  the base or boat's hex, and every valid adjacent destination (passable for its type,
  unoccupied, affordable within its full action budget) highlights.
- Clicking the base/boat hex, or the previewed unit's own hex, cancels back to its panel.
  Clicking a highlighted hex confirms — unloads the unit there (§2/§3) and opens its unit panel
  (§3). Clicking anything else is a no-op; stays in preview mode.

### Load destination picker
- The unit panel's Load button (§3) is a single button, shown whenever at least one adjacent
  base or boat could accept this unit right now (friendly, category-compatible, spare capacity,
  affordable) — not one button per candidate. A friendly base/boat is independently selectable on
  its own (to inspect or act on later), so a plain click-to-load with no explicit mode-entry step
  would collide with that — especially on touch, with no hover to disambiguate intent first.
- Clicking it doesn't act immediately: it closes the unit panel and enters load-preview mode,
  mirroring the unload picker above — every valid adjacent base/boat highlights.
- Clicking the unit's own hex cancels back to its panel. Clicking a highlighted hex confirms —
  loads the unit into that base or boat (§2/§3); its panel opens if it's still a field unit
  afterward, otherwise the map/HUD alone reflects the change. Clicking anything else is a no-op;
  stays in preview mode.

### Attack & claim targeting
- With a unit selected, tapping/clicking a hex resolves in priority order before falling back to
  Movement targeting or normal selection: an enemy unit or enemy-owned base there → attack; a
  neutral base there, if the unit's type can capture it (tank/fighter/fregat, game spec §4) →
  claim. Unlike Movement targeting, the target doesn't have to be adjacent — attack range can
  exceed 1 (game spec §3's per-unit table; Fregat's is 2).
- **Attack**: costs 1 action and 1 of the unit's remaining attacks this turn (game spec §3's
  Attacks/turn cap, §3 below); no-op if either is exhausted, the target's outside attack range,
  or (for a unit with `needsLOS`) line of sight to it is blocked (game spec §1: mountain cells,
  units, or bases anywhere along the hex line between attacker and target — not just the
  endpoints). Every actionable unit through Stage 6 had range 1, where "in range" and "adjacent"
  coincided with nothing in between to block; Fregat (range 2, needs LOS) is the first that
  doesn't, so this is where the real check starts mattering.
- **Claim**: costs 1 action + the claiming unit's own current terrain's move cost (same pattern
  as loading, §2 — the base's own cell is never the cost source, since it's always land, and a
  boat's claimable base entry can't step onto that at all) and garrisons the claiming unit
  inside, transferring ownership (§4). Terrain-gated per unit type same as any base entry.
- Either action refreshes the acting unit's own panel (updated AP/attacks-remaining) and redraws
  the map afterward; no dedicated animation/toast for v1 (§4).

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
- Opens on selecting a base (§1). Always shows: base type, owner (the same "Human"/`AI n` label +
  accent color the HUD turn indicator uses, or "Neutral" in steel-gray if unowned, game spec §4).
- **Your own base** (regardless of whose turn it currently is) additionally shows SP (`20/20`,
  style-guide.md §8's text treatment — no longer always full once combat/repair land, §4),
  garrison count / capacity (`X/15`), and the three labeled slot grids below (icon + label per
  slot, style-guide.md §9's token styling; empty slots dimmed):
  - **Building** — 1 slot: current in-progress build (`unit type` + `remaining/total` turns), or
    idle.
  - **Queue** — 5 slots: one per queued item, in order.
  - **Garrison** — `capacity - 1` slots (`14`), growing to fit if the garrison count ever
    exceeds that (no build in progress); filled front-to-back in entry order, each slot's second
    line showing that unit's current SP (`X/max`, §4).
- **An enemy-owned base** shows nothing past type + owner — no SP, capacity, or slot grids. It
  discloses no interior state (game spec §4: "a base's strength stays unknown until it's
  demolished" — build-v1's own phrasing, matching this build's intent too), unlike an enemy
  *unit*'s panel, which does show its SP (§3). A neutral base has no interior state to hide
  (SP sits near 0 while unclaimed either way), so it's unaffected by this distinction.
- "Your own base" here means owned by the *viewing* player, not "owned by whoever's turn it
  currently is" — those differ when your own base's panel is left open while an AI's cascaded
  turn plays out; it should stay fully visible. Interactivity (queue/garrison slot clicks, build
  buttons) still separately requires it being that owner's actual turn, per the bullets below.
- Queue slot click (own base, own turn, filled slot): toggles that slot's inline controls —
  Remove, Move up (disabled at index 0), Move down (disabled at the last index). Only one slot's
  controls are open at a time.
- Garrison slot click (own base, own turn, filled slot): enters unload-preview mode (§1) instead
  of anything within the panel itself.
- Your own base, viewed on a turn that isn't yours, shows the same full grids read-only — no slot
  click handlers, no build buttons.
- One build button per unit type the base's category allows (game spec §2: Land → Tank; Port →
  Tank/Fregat/Transporter/Carrier; Mountain → Fighter/Bomber) — Fighter/Bomber buttons exist now
  even though those unit types have no movement/combat until their own stage (planes: 8) lands;
  they just sit garrisoned until then. Fregat/Transporter/Carrier are fully actionable as of this
  stage (§3/§4).
- Build button disabled when the queue already holds 5 pending items — not when capacity is
  full, since queuing (unlike starting) doesn't consume a capacity slot (game spec §2).
- Unload has no dedicated button — triggered via the garrison slot click above (§1's unload
  destination picker), which lets the player choose the destination instead of auto-picking.
  Costs 1 action + the destination's move cost (game spec §3), taken from the unit's own action
  budget as it becomes a field unit.

### Boat entry (cargo, game spec §2/§3)
- A transporter/carrier entering a friendly base (via the Load destination picker, §1) that's
  currently carrying cargo unloads for free — itself and every unit it's carrying join the
  garrison directly, at no extra action cost beyond the boat's own entry. Only possible if the
  base has enough spare capacity for the boat *and* everything it's carrying; otherwise the
  whole entry is rejected (all-or-nothing) — same 1 action + move cost as any other Load, still
  spent from the boat's own budget, but only on success.
- An empty boat, or a unit loading into a boat, follows the ordinary Load rule above — no free
  bulk behavior; that's specific to a boat's own cargo riding along with it into a base.

### Turn-start processing (game spec §7)
- Order, per player's turn-start (including cascading through AI turns): (1) passive base
  repair, (2) per-unit repair, (3) build-timer tick + completion, (4) automatic neutral-base
  recapture (§4 — runs here too, keyed off a different base field than the rest of this list; see
  that section for the full rule).
- Passive base repair: +1 SP/turn (capped at max) for every base the player currently owns and
  that's damaged, regardless of garrison (game spec §2).
- Per-unit repair: the first 5 damaged garrisoned units in entry order at each base repair +5
  SP/turn each (10 SP per bbr = 2 turns), capped at their own max strength (game spec §2). No
  separate repair-queue data — just derived each turn from garrison order + damage state.
- Build-timer tick + completion: tick down in-progress builds; on completion, add the unit to the
  garrison (starting SP: its own max strength) and, if capacity allows, pull the next queued item
  into "in-progress" with a fresh timer (cost-multiplier × bbt, game spec §2).

## 3. Units
*(game spec §3 — selection, movement (path preview, action-point display), attack targeting,
load/unload and cargo interaction)*

### Unit type data
- full stat block added for all 6 units (actions/turn, attacks/turn, attack range,
  needs LOS, view, strength, ground/air atk, move cost per terrain, game spec §3).

### Field units
- A unit leaving a base (unload, §2) becomes a field entry: id (carried over from its garrisoned
  id), ownerId, unitType, col/row, sp (carried over from its garrisoned sp — no longer always
  full once repair/damage exist, §4), remainingActions (starts at the type's full actions/turn
  *before* the unload's own 1-action + move-cost is deducted, so a freshly-unloaded unit can
  still act with whatever's left that same turn), remainingAttacks (starts at the type's full
  attacks/turn, game spec §3's Attacks/turn cap — separate budget from remainingActions, though
  each individual attack spends 1 of *both*). Both reset to full again at the owner's next
  turn-start, alongside build processing (game spec §7).
- Garrisoned units carry the same sp field (no longer just `{id, unitType}`) so damage persists
  across load/unload rather than resetting — loading keeps the unit's current sp, unloading keeps
  it too (only a freshly-completed build starts at full sp).
- Move cost is spent from remainingActions per hex entered (game spec §3's terrain cost table;
  `0` = impassable, not free). A unit with 0 remaining actions can't move or load/unload.
- Both moveUnit and loadUnit/unloadUnit (and the new attack/claim commands, §1) reject a unit
  that isn't owned by the currently active player — previously enforced only by the UI only
  wiring up controls for the player's own units/bases; now enforced in the commands themselves,
  since attack/claim make acting on another player's unit or base a real (not just
  hypothetical) mistake to guard against.

### Open-field combat
- Attacker's atk value against the defender's target type (ground or air, game spec §3's per-unit
  table) is subtracted from the defender's sp; destroyed (removed from `state.units`) at 0.
- Boats and bases are always "ground" targets for this purpose; a garrisoned unit is too, but
  garrisoned combat instead follows §4's base-attack rule, not this one.

### Cargo (boats)
- A transporter holds up to 5 vehicle-category units (tanks); a carrier holds up to 5
  plane-category units (game spec §3's `holdCapacity`). Cargo entries carry the same shape as a
  base's garrison (`{id, unitType, sp}`) — sp persists the same way across load/unload (§2).
- A unit loads into an adjacent friendly boat with spare capacity the same way it loads into a
  base — same Load destination picker (§1), same 1 action + move cost, gated to the one category
  the boat's own type accepts. Unloading cargo uses the same destination-picker pattern as
  unloading from a base (§1).
- A boat can't load into another boat — only into a base (§2's Boat entry). Cargo is strictly
  unit-into-boat; boats themselves are the "garrisonable" side when it comes to entering
  something.

### Unit panel (side menu, §7)
- Opens on selecting a field unit (§1). Shows: unit type, SP (`10/10`), actions
  (`X/5 AP`, style-guide.md §8) — plus, for a boat (`holdCapacity` > 0), its cargo as a slot row
  below (same slot styling as the base panel's garrison, style-guide.md §9).
- Load button: single button, shown whenever at least one adjacent base or boat could accept
  this unit (§1's Load destination picker) — opens the picker rather than acting immediately.

## 4. Combat & capture
*(game spec §4 — attack feedback/animation, damage display, capture and neutral-base
indicators)*

### Attacking a claimed (enemy-owned) base
- Damage first destroys garrisoned units, oldest-entered first, 1 SP of damage each regardless
  of their own strength stat — a garrisoned unit is either alive or destroyed, never partially
  damaged this way (only open-field damage, §3, is partial). Remaining damage (if any) spills
  onto the base's own SP.
- A unit still under construction (`inProgress`) is never destroyed by an attack.

### Neutral base lifecycle
- A base's SP hitting 0 sets `ownerId` to `null` (neutral) and records `lastOwnerId` — whoever
  owned it right before, distinct from the base's original placement owner if it's changed hands
  more than once. A build already in progress survives this transition unaborted.
- Turn-start (§2's turn-start processing, step 4): if the neutral base's in-progress build
  completes on `lastOwnerId`'s own turn, it auto-recaptures — ownership returns to `lastOwnerId`,
  SP resets to 1 (not 4 — lower than a manual claim below), and the completed unit garrisons as
  normal.
- Until then, it's open: any player, including `lastOwnerId` itself, can claim it (§1's Attack &
  claim targeting) on their own turn, whichever happens first.

### Claim
- Only a neutral base (`ownerId` null) can be claimed — bases start the match already owned by
  a player (game spec §5), so this only ever applies post-combat.
- Ownership transfers to the claiming unit's owner and the unit garrisons inside (§1); SP resets
  to 4 either way.
- Only a claim by an owner *different* from `lastOwnerId` (an actual capture) clears the base's
  queue and in-progress build. A claim by `lastOwnerId` itself (a manual recapture, as opposed to
  the automatic one above) leaves an in-progress build running uninterrupted.

### Feedback & indicators
- Neutral base: steel-gray owner stroke instead of a player accent color (map-canvas.js's
  `ownerColorVar`, extended with a "no owner" case) — same treatment the base panel's owner line
  uses (§2).
- No dedicated attack/capture animation or toast for v1 — the base/unit panel's own SP/owner
  display (§2/§3, already live) and the map's own token/marker removal on death are the only
  feedback. A full pass on this belongs to Stage 13's UI/UX polish, not here.

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

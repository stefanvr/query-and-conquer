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
- The selection panel (§7) is a **layout sibling** of the canvas, never an overlay on it: the map
  shrinks to the space left over, so nothing the player can tap is ever underneath the panel. Wide
  viewports put it beside the map, narrow ones below it. Floating it over the canvas meant an open
  panel sat on the very hexes being tapped — and hid the zoom buttons at any width.
- The canvas re-measures whenever its own box changes, not only on window resize, since a panel
  opening or closing changes it. A stale canvas size misplaces every hex, so taps hit-test against
  the previous geometry. Panel toggles re-measure synchronously; a `ResizeObserver` catches
  anything else. Resizing keeps whatever was at the centre centred, rather than pinning the
  top-left corner.
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
- Selecting your own unit, on your own turn, highlights every hex it can afford to reach this
  turn (style-guide.md §8's move-range overlay). Tapping/clicking any highlighted hex moves it
  there; tapping anything else falls back to the priority order in Attack & claim targeting
  below, then normal selection/deselection.
- Reach is computed by `reachableCells` (`src/state/pathfinding.js`): a Dijkstra expansion over
  per-terrain move costs (game spec §3) from the unit's position, bounded by its remaining
  actions. Impassable terrain (cost `0`) and occupied hexes — any unit or base, one unit per cell
  (§1) — are neither entered nor traversed, so the highlight only ever shows genuinely reachable
  ground, not straight-line distance.
- Confirming walks the stored route one hex at a time through the ordinary `moveUnit` command
  rather than teleporting: every per-hex rule still fires exactly as it would have for individual
  clicks (AP spend, fog reveal, a plane's fuel tick and possible crash mid-route, §3). If the unit
  is destroyed partway, the walk stops there and its panel closes.
- Its own module rather than UI-local, because hard AI needs the same lowest-cost routing
  (game spec §8's Difficulty table, Stage 12).
- **This replaces v1's original one-hex-per-click rule.** That was chosen to keep the first
  movement pass small; reviewing build-v2 it read as tedium (a tank crossing open ground needed a
  click per hex) with no rules benefit, since single-hop clicks and a walked route spend exactly
  the same AP. Hard AI's pathfinding remains a separate concern — this shares the module, not the
  decision.
- Movement never requires line of sight for any unit type — LOS only ever gates attacks (§1's
  Attack & claim targeting). A plane's move can still destroy it outright via a fuel crash (§3's
  Plane rearm & fuel) — the map/unit panel simply reflect the unit's removal afterward, same as
  any other destruction.

### Unload destination picker
- Clicking a filled, owned garrison/cargo slot (§2/§3) closes the base/unit panel and enters
  unload-preview mode: the garrisoned/cargo unit's own token (style-guide.md §9) draws on top of
  the base or boat's hex, and every valid adjacent destination highlights. A destination is
  either **open terrain** (passable for its type, unoccupied, affordable within its full action
  budget) or **an adjacent friendly boat** whose hold accepts this unit's category and still has
  room (§3's Cargo).
- Clicking the base/boat hex, or the previewed unit's own hex, cancels back to its panel.
  Clicking a highlighted hex confirms — the unit either becomes a field unit there, or joins that
  boat's cargo — and its unit panel opens if it's a field unit afterward (§3). Clicking anything
  else is a no-op; stays in preview mode.
- Unloading straight into a boat costs **2**: 1 for the load/unload action itself (game spec §3),
  + 1 as the floor every move pays. No terrain is crossed — the unit goes hold to hold, and each
  container's own cell is impassable to the other's occupant anyway — but a transfer must not come
  out cheaper than the cheapest possible step onto open ground, which is what a free transfer
  would have made it.
- That cost is real, not just a gate: it's added to the entry's own `spentActions` (§3's Field
  units), which its eventual exit is charged against. So a unit that has already used most of its
  turn can be refused the transfer outright, and one that hops base → boat → shore in a single
  turn arrives with strictly less left than if it had unloaded straight to shore.

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
- Selecting your own unit, on your own turn, highlights what it can act on right now, alongside
  the move-range overlay above: every enemy unit/base it could actually attack (attack-target
  overlay), and every neutral base it could claim (claim-target overlay) — style-guide.md §8.
  Both use the same predicates the click itself resolves through (`isValidAttackTarget`,
  `isValidAttackBaseTarget`, `isValidClaimTarget`), so a hex is highlighted exactly when clicking
  it would work — never a target that then no-ops. This is what makes per-unit attack ranges and
  the LOS rule legible: before, a blocked shot and an out-of-range one were both just a click
  that did nothing.
- **Attack**: costs 1 action and 1 of the unit's remaining attacks this turn (game spec §3's
  Attacks/turn cap, §3 below); no-op if either is exhausted, the target's outside attack range,
  or (for a unit with `needsLOS`) line of sight to it is blocked (game spec §1: mountain cells,
  units, or bases anywhere along the hex line between attacker and target — not just the
  endpoints). Every actionable unit through Stage 6 had range 1, where "in range" and "adjacent"
  coincided with nothing in between to block; Fregat (range 2, needs LOS) is the first that
  doesn't, so this is where the real check starts mattering. A plane (Fighter/Bomber) additionally
  can't attack once it's used up its rearm-limited strikes (§3's Plane rearm & fuel).
- **Claim**: costs 1 action + the claiming unit's own current terrain's move cost (same pattern
  as loading, §2 — the base's own cell is never the cost source, since it's always land, and a
  boat's claimable base entry can't step onto that at all) and garrisons the claiming unit
  inside, transferring ownership (§4). Gated only by the claiming unit's own type
  (tank/fighter/fregat, game spec §4) and natural terrain reachability (adjacency + move cost) —
  *not* by the target base's own build-category table, so e.g. a Fighter can claim a Land or Port
  base too, not just Mountain.
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
- One build button per unit type the base's category allows (game spec §2: Land → Tank/Fighter/
  Bomber; Port → Tank/Fregat/Transporter/Carrier; Mountain → Fighter/Bomber) — all six unit types
  are fully actionable (§3/§4). A Mountain base needs no panel special-casing beyond this: its
  build buttons, garrison/queue slots, and repair/capacity rules already fall out of the same
  generic logic every other base type uses.
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
- A completed build's garrison entry is tagged `builtOnTurn` (the turn number it finished on).
  A base's garrison otherwise gives no way to tell an **existing defender** from a **newly
  completed unit** — both are just entries in `base.garrison` — and the AI's own processing order
  (§11, game spec §8) treats those as two separate groups, acted on at different points in the
  turn. Comparing the tag against the current `turnNumber` is what separates them; it needs no
  clearing, since "newly completed" simply stops being true once the turn number moves on. Set
  for every player's builds, not just an AI's — canonical state doesn't branch on who owns a base
  — and it round-trips through save/load like any other garrison field.

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
- A garrison/cargo entry also carries `spentActions`: what that unit has already used this turn,
  including whatever getting *into* the container cost. A container entry has no
  `remainingActions` of its own — it isn't a field unit — so this is what stands in for one:
  entering adds the entry cost to it, exiting subtracts it (plus the exit's own 1 + move cost)
  from a full turn's budget, and the owner's turn-start clears it, exactly as a field unit's
  actions reset. Without it a unit could launder a spent budget by stepping into a base or boat
  and straight back out, arriving fresh — and a mid-turn hop through a hold would come out
  cheaper than going directly. A freshly-completed build starts at 0, having done nothing yet.
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
  below (same slot styling as the base panel's garrison, style-guide.md §9). For a plane
  (category `plane`), also shows strikes remaining (`maxStrikes - strikesUsed`, e.g. `3/4`) and
  fuel remaining (`roundTripRange - cellsFlown`, e.g. `62/100`) — same plain-text treatment as
  SP/AP (style-guide.md §8).
- Load button: single button, shown whenever at least one adjacent base or boat could accept
  this unit (§1's Load destination picker) — opens the picker rather than acting immediately.

### Plane rearm & fuel (game spec §3's Generic Planes rules)
- A plane field unit carries three extra counters beyond the fields every field unit has (§3
  above): `strikesUsed` (attacks since its last rearm), `cellsFlown` (hexes moved since its last
  rearm), `actionsSpentMoving` (this-turn-only, movement AP spent — see the mandatory-movement
  bullet below).
- **Rearm** (resets `strikesUsed` and `cellsFlown` to 0): happens on entering a base (Load
  destination picker, §1/§2) — for either plane type. Fighter also rearms entering a carrier
  (loadIntoBoat, §3's Cargo) — Bomber can't board a carrier at all (`boardsCarrier` unset;
  `isValidLoadIntoBoatTarget` rejects it outright, a carrier being the only boat that accepts
  planes as cargo), matching the game spec's asymmetric wording ("Fighter: base/carrier",
  "Bomber: base") read as a hard boarding restriction, not just a rearm-location nuance. A
  freshly-built plane starts at `0`/`0` (already rearmed). Rearm is instant, same turn as entry —
  query-and-conquer.md §9 flags "resolve at the owner's next turn-start instead" as an open
  rebalancing option, not yet decided; revisit this bullet if that changes.
- **Strike limit**: `isValidAttackTarget`/`isValidAttackBaseTarget` also reject a plane whose
  `strikesUsed` has reached its type's `maxStrikes` — same no-op-if-exhausted treatment as
  `remainingAttacks`/`remainingActions` (§1). A successful attack increments `strikesUsed`.
- **Fuel/crash**: every hex a plane moves (`moveUnit`, regardless of that hex's own AP cost)
  increments `cellsFlown` by 1. If this pushes `cellsFlown` past the type's `roundTripRange`, the
  move still completes but the plane is then destroyed on the spot (removed from `state.units`) —
  a crash, not a blocked move; the game spec's "crashes if range limit is exceeded" is read
  literally, not as a pre-emptive can't-get-home guard.
- **Mandatory movement**: `actionsSpentMoving` accumulates the AP cost of each move this turn
  (attacks don't count, game spec §3), and resets to 0 at the owner's own turn-start alongside
  `remainingActions`/`remainingAttacks` (§2's turn-start processing). Ending the turn (§6) is
  blocked while any of the player's own field planes (a garrisoned one is exempt — it isn't a
  field unit) have `remainingActions > 0` *and* `actionsSpentMoving` under half their type's
  `actionsPerTurn`. The `remainingActions > 0` half of that guard matters: a plane that spent its
  whole turn attacking instead of moving has nothing left it could do about it, so it can't
  soft-lock the End Turn button.

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

### `getVisibleState` (tech-stack.md's state-access rule)
- `state.options.fogOfWar === false` → pure passthrough (today's behavior — every cell/unit/base
  visible, no filtering), so fog can be fully disabled per-match via the existing game-options
  checkbox (already wired into `options.fogOfWar`, game spec §7).
- `true` → returns canonical state with `bases`/`units` filtered and a `fog: { exploredCells,
  visibleCells }` field added (both `Set`s of `"col,row"` keys) for the renderer's three-state
  treatment below. Everything else (commands, panels, HUD text) keeps reading canonical state
  directly, exactly as before — this projection is consumed by the map render only (and, once
  Stage 11 lands, easy AI's own decisions).
- **View range is a pure hex-distance radius** (game spec §1: "Ranges (view, attack) are
  hex-distance radii"), not blocked by mountains/units/bases — unlike attack LOS, view has no
  per-unit-type `needsLOS`-style toggle in the design doc, so it's treated as unconditional.
- **Visible now** = union of `hexesInRange` around every one of the viewer's own field units and
  owned bases, using each one's own `view` stat (`UNIT_TYPES`/`BASE_TYPES`) — recomputed fresh on
  every call, never cached, since it only depends on current canonical positions.
- **Explored (ever seen)** persists per-player (`player.exploredCells`, an array of `"col,row"`
  keys — plain data, JSON-serializable, survives save/load for free) since it accumulates history
  a live recomputation can't reconstruct. Because only commands.js may mutate canonical state
  (tech-stack.md), the persisted write itself happens there, in a new `markExplored(state,
  playerId)`, not inside `getVisibleState` — called after anything that changes that player's own
  vision footprint (moveUnit, unloadUnit, unloadCargo, claimBase) and once every turn-start
  (processTurnStart) as a passive baseline resync. Also called once for every player right when a
  match starts (game-screen.js), so turn order landing on the human first doesn't leave their own
  starting base unexplored until their second turn.
- **Modeling call:** a base, being a fixed structure, stays revealed once its cell is explored —
  same as terrain — rather than disappearing again once out of current view like a mobile unit.
  The design doc's §6 wording only explicitly distinguishes "cells" (permanent) from "units"
  (hidden again out of range); a base isn't named either way, and this reads as the more natural
  fit of the two given it can't move. `bases` are filtered by `exploredCells`; `units` are
  filtered by `visibleCells` (current view only, matching the design doc's explicit unit rule).
- **Not in scope for this stage:** hex selection/targeting (game-screen.js's `selectHex` and its
  `unitAtHex`/`baseAtHex` lookups) keeps reading canonical state, so a precisely-aimed click could
  still select/inspect something outside current fog. Tech-stack.md's "no cheating via inspecting
  client state" framing is explicit multiplayer future-readiness, not a v1 requirement — tracked
  on Stage 13's backlog instead of blocking this stage.

### In-game map render (extends §1's own section)
- Three visual states per style-guide.md §7: **unexplored** — nothing drawn at all, no terrain
  color, no selection/target highlight (can't meaningfully be either); **explored, not visible** —
  terrain color at full value, then an `rgba(0, 0, 0, 0.30)` overlay on top; **visible** — terrain
  color only, today's unchanged behavior. Applies only when `fog` is present (i.e. `fogOfWar` is
  on) — the fog-off/passthrough case renders exactly as before.
- The whole visible viewport is pre-filled solid `--ink` before any tile is drawn, whenever fog is
  on — not just each in-map unexplored hex. An off-map cell (outside the actual map shape, e.g. a
  circular/hexagonal map) is never touched by the per-cell draw loop at all, so without this the
  canvas's own background color showed through there, distinct from an in-map unexplored hex's
  `--ink` fill — giving away the map's shape/edges, and the viewer's own position relative to
  them, through territory that's supposed to disclose nothing. The pre-fill makes both cases
  identical.
- The camera holds live references to `bases`/`units` today; fog needs it to redraw from a fresh
  filtered set on every change instead, so it gains a `setVisibleState({ bases, units, fog })`
  method, called (alongside `.draw()`) from every point game-screen.js currently redraws — a
  single shared `redraw()` helper already centralizes most of these (Stage 8), extended here to
  recompute `getVisibleState` first.

### Dev save
- `scripts/generate-dev-save.js`'s own `options.fogOfWar` is set to `false` — a deliberate
  dev-tool call, not a change to the real game option's own default (still on, per the options
  menu). The dev save exists specifically to let a tester reach and inspect fixtures scattered
  across the whole map (the AI's base, the far mountain bases, ranged units, etc.); fogging all of
  that by default would make the save far less useful for its actual purpose without buying any
  fog-of-war coverage that dedicated node:test/e2e coverage doesn't already provide more directly.

## 6. HUD
*(app-only — persistent on-screen chrome: turn/player indicator, end-turn control, AI-speed
control, entry point to the mid-turn menu)*
- Persistent bar: current player/turn indicator, End Turn button.
- End Turn is disabled, with a short inline message below the button, while the human player has
  any field plane that still owes its mandatory movement this turn (§3's Plane rearm & fuel) —
  message names the blocking unit(s) by type, e.g. "Fighter still needs to move (2/4 AP)".
- Entry point (button/icon) opening the mid-turn menu (§8).
- AI-speed select (Instant / Fast / Slow, game spec §7) — HUD chrome rather than a game option,
  since it's changeable mid-match and changes nothing about the match's own rules or save. See
  §11's Pacing & HUD control for what each setting does.

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
- Confirming Surrender now routes to the End screen below (`state.terminated`) instead of
  straight back to the main menu — surrender "ends the match immediately" (game spec §7) the same
  way a natural win/loss does, just always as a loss for the human, regardless of `winnerId`.

### End screen (game spec §7's "Elimination & end of game")
- Reached whenever `state.gameEnded` (a natural win/loss — see commands.js's `endTurn`/
  `checkGameEnd`) or `state.terminated` (surrender, above) becomes true — checked right after
  every `endTurn()` call, both in the End Turn button's own handler and while cascading through
  AI turns, so the game can end mid-cascade without waiting for the human's turn to come back
  around.
- Reuses the game screen's own map camera (`createMapCamera`) in a read-only mode: no HUD, no
  side panels, no click-to-act — pan/zoom only. A new `revealAll` camera option bypasses the
  enemy-base label-suppression rule (§2/§4's non-disclosure) so every base's own SP/building
  status shows too, not just type + owner — "full map reveal" (game spec §7). Fog is not applied
  regardless of the match's own `fogOfWar` option, for the same reason.
- Result banner: "Victory" (`--signal`) if `state.winnerId === humanId`, otherwise "Defeat"
  (`--rust`) — covers both a natural elimination loss and `state.terminated` (always a defeat,
  since `winnerId` is never set on that path).
- A "Stats" button opens the stats dialog (§9) as an overlay on top, reusing the mid-turn menu's
  own overlay-backdrop/panel-swap pattern rather than a second stacked overlay.
- A "Main Menu" button returns to the main menu — no autosave, matching Quit's own rule (§10);
  there's nothing meaningful left to save once the match has ended anyway.

## 9. Stats display
*(app-only — running in-HUD stats if any, and the end-of-game stats dialog per game spec §7)*
- End-of-game only for v1 — no running in-HUD stats during play.
- One row per player (Human/`AI n` label + accent color, matching the HUD turn indicator's own
  treatment, §6) showing units built and units lost — `state.players[i].stats`, two counters
  incremented by commands.js at every build-completion (`processTurnStart`) and every point a unit
  is actually destroyed (`attackUnit`, `attackBase`'s garrisoned-unit damage, a plane's fuel
  crash) — not at a mere relocation (load/unload/claim never destroy a unit, just move it between
  field and garrison/cargo).
- Opened from the End screen's Stats button (§8); closes back to the End screen underneath, same
  overlay-swap pattern as the mid-turn menu's own Surrender confirmation.

## 10. Save/Load
*(app-only — save/load UI flow, dev save game and dev-only load-test-game option)*
- Single save slot, localStorage-backed (tech-stack.md), exact mid-turn canonical state.
- Only the mid-turn menu's Save action writes to the slot — quitting does not autosave.
- Dev save: a fixed save built with the app's own `createGameState`/placement logic (not
  hand-authored — see `scripts/generate-dev-save.js`), separate from the player's slot, reached
  via the main menu's `?dev`-gated "Load test game" entry (§8). Regenerated whenever the state
  shape changes.
- Field units already round-trip for free — save/load serializes canonical state wholesale
  (`JSON.stringify`/`parse`, no field-by-field logic), and `state.units` has been part of that
  object since Stage 5. No unit-specific save/load code exists or is needed.

## 11. AI behavior UX
*(game spec §8 — visible per-action animation during an AI turn, and how the instant/fast/slow
speed setting affects it)*

### Module layout
- `src/ai/strategies.js` — the three strategies as data (priority-rule list, build order, target
  priority, game spec §8), no state access of its own; `src/ai/ai-turn.js` — the turn engine that
  walks a strategy against the board. Its own directory rather than `src/state/`: hard AI (Stage
  12) shares the same strategy data but swaps perception/pathing, so the two axes stay separate
  files rather than one growing module.
- Strategy is assigned once at match start (`createGameState`) and stored on the player, like
  `difficulty`: build `["aggressive","defensive","balanced"]` repeated `ceil(numAI / 3)` times,
  truncate to the AI count, shuffle with the match's own rng, assign in order (game spec §8).

### Perception (easy difficulty)
- Every decision reads `getVisibleState(state, aiId)` (§5) — easy AI respects fog, so it only
  knows currently-visible enemy units and ever-explored bases. Hard AI's canonical-state exemption
  (tech-stack.md) is Stage 12; nothing here reads canonical state to decide.
- Commands still take canonical `state`, not the projection — a rule must resolve against reality
  (e.g. LOS blocked by a unit the AI can't see). The projection filters *which* objects the AI
  considers; it doesn't change how an action then resolves. Safe because `getVisibleState`
  filters by reference, so a chosen unit/base is the same object canonical state holds.
- With fog off, `getVisibleState` is a passthrough and the AI simply sees everything — correct,
  not a special case.

### Turn engine
- `aiTurnActions(state, grid, playerId)` is a generator: it performs one action (via commands.js,
  never by mutating state itself) and yields a short descriptor of what it did, then continues.
  The caller (§6's HUD pacing) decides whether to drain it instantly or step it with a delay —
  the engine has no timing concerns of its own, and no DOM access.
- Per game spec §8's processing order: **base-defenders** (garrison entries without a
  `builtOnTurn` of the current turn) → **field units** (`state.units`) → **newly completed units**
  (garrison entries tagged `builtOnTurn === state.turnNumber`, set on build completion — see §2's
  turn-start processing for why the tag exists at all). Both garrisoned groups deploy rather than
  running the priority list (game spec §8's Deploying rule); snapshot all three groups before
  acting, so a unit that deploys can't be picked up again by the field-unit pass in the same turn.
- Each unit walks its strategy's priority list top to bottom and takes the first applicable
  action, then stops (one action per unit per turn — easy AI's "often leaves actions unspent",
  game spec §8's Difficulty table, falls out of this rather than needing a separate rule).
- Each base evaluates its build order once per turn, queueing the first type it's allowed to
  build; skipped entirely if the base is at capacity or its queue is full (game spec §8).
- Ties (equally close, equally valid) break by lowest id — determinism, so a seeded match replays
  identically and tests are stable.

### Easy-difficulty execution traits (game spec §8's Difficulty table)
- **First valid target, no optimization**: each strategy's stated target priority (lowest
  strength / highest attack) is deliberately *not* applied — easy takes the first valid target in
  id order. The priority data still lives in `strategies.js` unused, so Stage 12 turns it on
  without restructuring.
- **Naive pathing**: `naiveStepToward` picks the single neighbor hex that most reduces hex-
  distance to the target and moves there. If that one hex is blocked/impassable/unaffordable, the
  unit's turn ends there — no routing around obstacles, which is exactly the "may waste actions
  on obstacles" the design doc calls for, and leaves Stage 12's real pathfinding a genuine upgrade.
- **Visible threats only** falls out of the perception rule above; no separate check.

### Strategy rules
- Rules are the design doc's own lists (game spec §8), with these implementation readings:
  - "Move toward X" also *arrives*: adjacent to a claimable neutral base → claim it; adjacent to
    the friendly base it's retreating to → load into it. Otherwise the move is a naive step.
  - Defensive rule 1 / Balanced rule 1's "a friendly base can repair it this turn" = a friendly
    base with spare capacity (that's what actually gates entry; the ≤5-repairs-per-turn cap only
    changes how fast it heals once inside, §2's turn-start processing).
  - Aggressive rule 3's "nearest unexplored area" = nearest in-map cell absent from the player's
    own `exploredCells`, found by expanding-ring search from the unit and capped at a small radius
    — an uncapped nearest-unexplored scan over a 12,000-cell map, per unit per turn, is the one
    place this loop could get expensive.
  - Balanced rule 4's "never leave a player owned base with zero units" = don't take the move if
    this unit is the last one of its owner's within view range of, or garrisoned at, one of their
    own bases.

### Pacing & HUD control (extends §6)
- HUD gains an AI-speed select: Instant / Fast (1s per action) / Slow (2s per action), game spec
  §7. HUD chrome, not a game option — it's changeable mid-match and doesn't affect the match's
  own rules or its save.
- **Instant is the default and runs fully synchronously** — no `await` at all on that path, so an
  AI turn resolves within the same click that ended the human's turn.
- Fast/slow await between yielded actions, redrawing the map each step (§5's fog is recomputed
  per redraw, so an AI unit stepping into view appears as it happens). While an AI turn is
  animating, End Turn is disabled and map clicks are ignored — the human can't act out of turn.
- Match start can land on an AI (turn order is randomized, §8) — that opening AI turn animates
  the same way rather than being a special silent case.

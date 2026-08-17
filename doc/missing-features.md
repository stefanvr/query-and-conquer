# Missing Features

Audit of [query-and-conquer.md](query-and-conquer.md) against the current codebase, listing spec-described
behavior that is not yet implemented. Each entry cites the relevant spec section, what the spec says, what the
code currently does instead, and impact. This is a snapshot as of Stage 6 completion (AI Easy difficulty, full
playable game) — it should be re-checked as the codebase evolves rather than trusted as permanently current.

## 1. Transporter/carrier cargo (loading boats and planes)

**Spec (§2, §3):** Transporters hold 5 tanks, carriers hold 5 planes. Loading/unloading a boat costs 1 action.
"A boat entering a base with loaded units unloads them for free, directly into the base — but only if the base
has enough spare capacity for the boat and everything it's carrying."

**Code:** [unitDefs.js](../src/units/unitDefs.js) defines `holdCapacity`/`holds` on `transporter`/`carrier`, and
[createUnit.js](../src/units/createUnit.js) reserves a `cargo` array on every unit, but nothing ever populates
it. There is no `loadIntoTransporter`/`loadIntoCarrier` command, no UI affordance to select a field unit and load
it onto an adjacent boat, and no unload-on-base-entry logic that accounts for cargo. [input.js](../src/ui/input.js)'s
`computeLoadTargets` only computes base-entry targets for the boat/unit itself, and its docstring explicitly
flags cargo loading as unbuilt.

**Impact:** Transporters and carriers can move, attack, and enter bases, but can never actually carry anything —
their core purpose (ferrying tanks/planes across water) is unusable. This is the gap the user already knew about.

## 2. Turn order randomization

**Spec (§6):** "Turn order is randomized once at game start and then stays fixed for the rest of the match."

**Code:** [newGame.js](../src/state/newGame.js) always builds the player list as `[humanPlayer, ...aiPlayers]` —
the human is always first, then AI players in the order their difficulties were configured. Nothing shuffles this
order; [turnLoop.js](../src/turn/turnLoop.js)'s `advanceTurn` cycles through `players` in that fixed array order.
(Map generation does use a `shuffle` helper, but only for terrain seed points in
[basePlacement.js](../src/state/basePlacement.js) — unrelated to turn order.)

**Impact:** The human always moves first, every game. No functional bug, but a deviation from spec — an easy fix
(shuffle `allPlayers` once in `setupNewGame` before turn index 0 is assigned).

## 3. Mid-turn Quit and Terminate

**Spec (§6):** Three mid-turn options: save, quit (exits to the main menu, last save stays intact, no result is
recorded), and terminate (instant self-elimination, treated exactly like losing all bases, ends the player's
participation immediately).

**Code:** [hud.js](../src/ui/hud.js) only offers "End Turn" and "Save" (plus the AI-speed selector). There is no
Quit button and no Terminate button/flow anywhere in the running game.

**Impact:** A human player can't back out to the menu mid-game without a save, and can't voluntarily concede.
The underlying elimination mechanic itself (0 bases → eliminated, checked in
[gameStatus.js](../src/queries/gameStatus.js) and skipped over in `advanceTurn`) already works and could be
reused to implement Terminate as "remove all my bases/units" — but no UI triggers it today.

## 4. End-screen full map reveal

**Spec (§6):** The end screen should show "full map reveal (fog removed, but read-only — no further actions),
all bases/units annotated with details" alongside the stats dialog.

**Code:** [endScreen.js](../src/ui/endScreen.js) renders only the victory/defeat title and the stats table (bases
owned, units built/lost per player) plus a "Back to menu" button. It never renders the map/canvas at all.
`getEndGameState` (the documented fog-bypass exception) already exists and correctly returns unfogged data — it's
the visualization of it that's missing.

**Impact:** Players can't see the final board state (where everything ended up, what the enemy had) at the end
of a match — only the numeric stats summary.

## 5. Hard AI difficulty

**Spec (§8, §9):** Each AI opponent can be independently set to Easy or Hard difficulty; Hard AI reads canonical
state directly (bypassing fog), uses real pathfinding, and picks targets by the strategy's actual priority rule
instead of first-valid-target.

**Code:** [hard.js](../src/ai/difficulty/hard.js) is a placeholder stub (`export {}`) — never implemented.
[optionsScreen.js](../src/ui/optionsScreen.js) deliberately only offers "Easy" per AI slot, with a comment
explaining Hard is withheld until it exists. `DIFFICULTY_LABELS` in the options screen and
`DIFFICULTY_NAMES` in [difficulty/index.js](../src/ai/difficulty/index.js) both still list `hard`, but nothing
backs it.

**Impact:** This is a known, deliberate scope decision (per your "skip hard AI for now" call), not a surprise
gap — listed here for completeness since it's directly named in the spec's Options and AI Behavior sections.
Every game currently plays against Easy-only opponents.

# Not as intended
* Map generation deep & shallow water rule (always shallow three, so carrier never possible, spec seem correct bug in implementation)
* Map generation island type (to much water, need different spec)
* AI animation (all or nothing, instead of show visible actions)
# Implementation tracking v1

Stage-by-stage build checklist, sequenced so each stage is playable and testable using only what
earlier stages have already built — no stage's tasks should depend on something a later stage
hasn't built yet. Cross-references: game design in [query-and-conquer.md](query-and-conquer.md),
tech decisions in [tech-stack.md](tech-stack.md), visuals in [style-guide.md](style-guide.md).

**Workflow, per stage:** before starting a stage's build tasks, check the relevant section(s) of
[implementation-spec.md](implementation-spec.md) — organized by game element/module, not by
stage, so a stage typically touches a handful of sections there — and write/update whichever of
them the stage's features need. That's the "Spec" checkbox at the top of each stage below. Only
start the build checkboxes once those sections are filled in; update them again if the design
shifts during implementation.

---

## Stage 1 — App skeleton
- [ ] Spec
- [ ] Style page for development
- [ ] Simple opening page with background
- [ ] Deployment (GitHub Pages, per tech-stack.md)

## Stage 2 — Map creation
- [ ] Spec
- [ ] Implement map generation (§1: terrain rules, land/water body sizing, shallow-water chains,
      size/type tables)
- [ ] Create build run script (regenerate maps only when the generation script changes)
- [ ] Create maps preview page
- [ ] Verify shallow/deep water adjacency doesn't always cap at exactly 3 shallow cells, so
      deep-water-adjacent ports (and therefore carriers) stay buildable
- [ ] Verify the islands map type actually lands in the 35–40% water range

## Stage 3 — Outer game loop
- [ ] Spec
- [ ] Game options menu: AI count (1–5), per-AI difficulty, map size, map type, fog of war
      toggle, map selection
- [ ] Turn order randomized once at game start, then fixed for the match (§7)
- [ ] Add start game in game room
- [ ] Create skeleton game
  - [ ] render map
  - [ ] add end turn option
  - [ ] mid-turn: save (single slot, exact state)
  - [ ] mid-turn: quit (exit to menu, last save intact, no result recorded)
  - [ ] mid-turn: terminate (instant elimination)
- [ ] Add load game to game room
- [ ] Create dev save game with test map
- [ ] Add dev-only "load test game" option

## Stage 4 — Base build economy
- [ ] Spec
- [ ] Unit spec with build cost table (§2)
- [ ] Game start: deployment bases
- [ ] Turn option: build unit / queue unit (max 5 queued, 15 total capacity)
- [ ] Turn start: unit ready / build next from queue
- [ ] Update save/load for bases

## Stage 5 — Tank
- [ ] Spec
- [ ] Unit movement (action points, terrain cost table)
- [ ] Unit unload from base
- [ ] Unit load into base
- [ ] Extend dev save game with tank next to base

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

# Query and Conquer — Game Design Spec

Turn-based hex-grid strategy game. Single human player vs. 1–5 AI opponents. Each player starts
with one base; win by capturing/destroying every other base on the map.

**Purpose.** What the game *is* and what its rules are, independent of how it's built. Written so
someone could reason about — or play — the game without reading a line of code.

**What belongs here.** Entities, their properties, the rules governing them, and the edge cases
those rules produce.

**What doesn't.** Technical choices ([tech-stack.md](tech-stack.md)), how anything is presented or
operated ([implementation-spec.md](implementation-spec.md)), visuals
([style-guide.md](style-guide.md)), build order
([implementation-tracking-v1.md](implementation-tracking-v1.md)).

**Rule of thumb.** If changing it would change *what the game does*, it belongs here. If it would
only change *how the game is made*, it doesn't.

---

## 1. Map

### Terrain
- **Land:** gras, gravel, mountain, sand
- **Water:** shallow, deep

### Layout rules
- Hex grid, 2D top-down. Minimum map size: 40×40 cells.
- Every disconnected land or water body is at least a 4×4 contiguous region.
- Shallow water is only adjacent to land or other shallow water.
- A chain of shallow water can be at most 3 cells deep before reaching land.
- Minimum distance between any two bases: 5 cells, regardless of owner.
- One unit per cell, regardless of player — for both occupying and passing through. (Bases and
  units with hold capacity are the exception; see §3.)
- Ranges (view, attack) are hex-distance radii — number of hex steps away.
- Line of sight is blocked by mountain cells, units, and bases.

### Generation
| Size | max single dimension | max cells
|---|---|---|
| Small | 60 | 1600
| Medium | 80  | 4800 |
| Large | 100 | 8000 |
| Extra large | 120 | 12000 |

| Type | Definition |
|---|---|
| Land-only | No water |
| Mixed | Between 10% and 30% water; Minimum of 2 coasts with deepwater adjecent |
| Islands |  Between 35% and 40% water; islands may touch the map border; minimum island size 180; minimum islands is 6; Minimum of 3 island with deepwater adjecent |

Islands is not offered at Small size: 6 islands × 180 cells is already 1,080+ land cells, which
can't fit alongside 35–40% water within Small's 1,600-cell cap. Islands becomes available
starting at Medium.

For each size × type combination (except Small × Islands), 10 candidate maps are pre-generated; one is picked at random
based on the chosen game options. Within the max single dimension and max cells specified, the shape of the map can be rectangle portrait/landscape, square, hexagonal or circle shaped, trying to maximize number of cells.

Bases are placed automatically once the terrain map is generated (see §5 Base Placement).

---

## 2. Buildings

Each base has a **strength (SP)** pool separate from its garrisoned units. Garrisoned units each
contribute 1 SP to the base's combined defense and are destroyed before the base's own SP is hit
(see §4 Combat).

| Base | Can build | Location requirement | View | Strength |
|---|---|---|---|---|
| Land base | Vehicles, Planes | Gras/gravel/sand; not adjacent to any water | 4 | 20 |
| Port base | Boats + Vehicles | Gras/gravel/sand; must be adjacent to water. Carrier only buildable if adjacent to deep water | 4 | 20 |
| Mountain base | Planes only | Mountain, with all neighbors also mountain | 8 | 20 |

### Build & repair economy
- **bbt** (base build time) = 5 turns. **bbr** (base repair time) = 2 turns.
- A base builds 1 unit at a time, can repair up to 5 units in parallel, and holds a queue of up
  to 5 pending builds. Capacity: 15 units max (garrisoned + in-progress builds count against it).
- Repair queueing at a base (when more than 5 units need it) is first-come, arrival order.
- A build in progress occupies 1 capacity slot. If the base is at max capacity, new builds cannot
  start until a slot frees up.
- A boat entering a base with loaded units unloads them for free, directly into the base — but
  only if the base has enough spare capacity for the boat *and* everything it's carrying. If not,
  it cannot enter.

**Build cost (× bbt):**

| Unit | Cost |
|---|---|
| Tank | 1× |
| Fighter | 2× |
| Bomber | 5× |
| Fregat | 3× |
| Transporter | 1× |
| Carrier | 8× |

**Repair rate:** every vehicle repairs 10 SP per bbr. A damaged base recovers 1 SP per turn
(1 SP per 0.5 bbr) passively, whether or not it's garrisoned.

---

## 3. Units

Move cost is action points spent to enter a cell of that terrain (no partial moves; `0` = impassable).
Garrisoned state of unit means loaded into other unit or base 

**Unit Spec**

| Unit | Category | Target type | Actions/turn | Attacks/turn | Attack range | Needs LOS | View | Strength | Ground / Air atk | Special |
|---|---|---|---|---|---|---|---|---|---|---|
| Tank | Vehicle | ground | 5 | 2 | 1 | Yes | 3 | 10 | 4 / 1 | — |
| Fighter | Plane | air | 8 | 1 | 2 | No | 5 | 15 | 2 / 4 | Max 4 strikes before returning to base/carrier to rearm; 100-cell round-trip range limit |
| Bomber | Plane | air | 6 | 1 | 1 | No | 8 | 10 | 8 / 1 | Max 2 strikes before returning to base to rearm; 200-cell round-trip range limit; cannot board a Carrier at all (unlike Fighter) |
| Fregat | Boat | ground | 5 | 1 | 2 | Yes | 6 | 15 | 6 / 4 | — |
| Transporter | Boat | ground | 8 | 1 | 1 | Yes | 3 | 30 | 0 / 0 | Holds 5 tanks |
| Carrier | Boat | ground | 3 | 1 | 4 | No | 5 | 25 | 8 / 4 | Holds 5 planes |

Generic Planes rules:
* crashes if range limit is exceeded
* must mandatory at least move 50% of their total availble actions when not Garrisoned, an attack does not count as action for this purpose. The idea is that planes need to refuel hence the range limit.

**Move cost per terrain (action points):**

| Unit | Gras | Gravel | Mountain | Sand | Shallow | Deep |
|---|---|---|---|---|---|---|
| Tank | 1 | 2 | 0 | 3 | 0 | 0 |
| Fighter | 1 | 1 | 2 | 1 | 1 | 1 |
| Bomber | 1 | 1 | 1 | 1 | 1 | 1 |
| Fregat | 0 | 0 | 0 | 0 | 1 | 1 |
| Transporter | 0 | 0 | 0 | 0 | 1 | 1 |
| Carrier | 0 | 0 | 0 | 0 | 0 | 1 |

### Actions
- Attacking costs 1 action.
- For loading/entering the target base or unit construction or garrison types determine access. e.g. tank can move onto transporter on water as the transporter can garrison tanks.
- Loading/unloading a boat or base costs 1 action; entering or exiting therefore costs 1 actions + move cost in
  total (e.g tank on grass 1 move + 1 load/unload = 2). For a boat this can happen anywhere water is adjacent to land.
- Open-field unit-vs-unit combat: attacker's attack value is subtracted from the defender's
  strength; the defender is destroyed at 0.
- Boats and bases are always classified as "ground" targets for attack-type purposes.
- Garrisoned units are always classified as "ground" targets for attack-type purposes.

---

## 4. Base Combat & Capture

**Claiming an unclaimed base:** enter it with a tank, fighter, or fregat. No other unit type can
capture a base. Since fregats can't move onto land, they can only ever claim a port base; a
mountain base (unreachable by tank or boat) can only be claimed by a fighter.

**Attacking a claimed (enemy-owned) base:**
- Destroying it costs damage equal to the base's own strength + 1 SP per unit inside
  (garrisoned only; under construction is not included).
- Each attack first destroys garrisoned units (1 SP each, oldest-entered first), then spills
  remaining damage onto the base's own strength.
  *Example:* a base with 4 garrisoned units + 1 unit under construction is hit by a tank
  (4 damage): the 4 garrisoned units die, base strength untouched. Hit instead by a bomber
  (8 damage): the 4 garrisoned units die (4 damage used), and the remaining 4 damage carries
  over onto the base, dropping it from 20 to 16.
- A unit under construction can never be destroyed by attacks — it's always safe.

**Base strength reaching 0:** the base becomes neutral/unclaimed — not captured by the attacker.
- No surviving units are required for what happens next.
- On the *original owner's own next turn*, if a unit finishes construction, that unit
  auto-recaptures the base and its strength resets to 1.
- Until then, it's open: any player (including a third party) can walk in a capturing unit
  (tank/fighter/fregat) and claim it on their own turn, whichever comes first.
- A build already in progress is only aborted once the base is actually captured by an enemy —
  so a multi-turn build survives the base sitting neutral, as long as no one captures it first.

**On capture by an attacker:** any in-progress build and the queue are cleared, and base strength
is restored to 4 (recovering the remaining 16 via normal 1/turn passive repair).

**On re-capture by an original owner:** which can only be done if no build finishes (as it would auto re-capture instead), the base strength
is restored to 4 and any in-progress build keeps continuing.

---

## 5. Base Placement

Bases are distributed automatically at game start using a **Grid-cell / Voronoi-region**
heuristic: the map is divided into roughly equal regions (seeded from evenly spaced points), and
one base is placed per region via rejection sampling against each base type's terrain and
min-distance rules. Chosen so this heuristic can be swapped for another later without changing
anything else.

---

## 6. Fog of War

- Hides both cells and units outside current view range.
- Once a cell is explored, its terrain stays revealed, but units on it are hidden again once out
  of view range. Visually distinguish "explored, not currently visible" from "currently in view."

---

## 7. Game Setup, Loop and turns

### Match setup
1. Load a saved game if one exists, or choose game options (see Game Options below) and start a new game.
2. Turn order is randomized once at game start and then stays fixed.

### Game Options

- 1 to 5 AI opponents.
- Per-AI difficulty: easy or hard.
- Map size: small / medium / large / extra large.
- Map type: land-only / mixed / islands (islands unavailable when map size is small — see §1).
- Fog of war: on/off.
  
### Per-turn sequence
1. Recalculate base repairs.
2. Complete any builds whose timer expired.
3. Resolve automatic neutral-base recapture (see §4).
4. Hand control to the active player.
   - **Human:** freely selects actions between units in any order until every unit's own action
     budget is spent (see §3's per-unit Actions/turn) or they choose to end the turn early. No
     unused actions carry over. No undo once an action is taken.
   - **AI:** actions play out step by step, at a configurable speed (instant / fast [1s per
     action] / slow [2s per action]).
5. Mid-turn options for the human player: 
   1. save (captures exact mid-turn state, single slot)
   2. quit (exits to menu, last save intact, no result recorded)
   3. terminate (instant elimination — treated exactly like losing all bases — ends the match immediately)
6. Check elimination (see below), then end turn; advance to the next player.

### Elimination & end of game
- A player is eliminated when they own **zero bases and have zero units** anywhere — none in the
  field, none garrisoned, and none under construction. Both conditions together, not either alone:
  - Owning a base keeps you in the game even with zero current units (you can just queue a build).
  - Having any unit keeps you in the game even with zero bases — including a unit still under
    construction at a former base that's currently neutral (per §4, a build survives its base
    going neutral), which is what lets that base's auto-recapture actually get a chance to happen
    before elimination is evaluated.
- Remaining players keep their existing turn order (the eliminated player's slot is simply
  skipped).
- The game ends when only one player has not been eliminated — not simply "owns the most bases,"
  since a player who's lost every base can still be fighting to get one back via a build already
  in progress (the elimination rule's own recapture exception above). A simultaneous all-neutral
  state where no player currently owns a base is not itself an end condition — the game continues
  until eliminations or recaptures resolve it to one remaining player.
- End screen: victory/loss result, full map reveal (fog removed, but read-only — no further
  actions), all bases/units annotated with details, and a stats dialog (units built/lost per
  player).

---

## 8. AI Behavior

### Assignment
- **Strategy** (Aggressive / Defensive / Balanced) is auto-assigned per AI: build a list of the
  three strategies repeated `ceil(numAI / 3)` times, truncate to `numAI`, shuffle, and assign in
  order. This guarantees an even spread by construction (e.g. 5 AI → 2/2/1) with no separate
  balancing check needed.
- **Difficulty** (easy / hard) is set per AI independently, via game options.

### Decision model
Strategy defines **intent** — a ranked priority list of what the AI wants to do. Difficulty
defines **execution quality** — how well it perceives the board and carries that intent out.
These are independent axes.

Each turn, per unit — processed in order **base-defenders → field units → newly completed
units** — the AI walks its strategy's priority list top to bottom and takes the first applicable
action, until its action budget runs out or nothing applies. Each base independently evaluates
its build-priority list once per turn and queues one unit: of the types it's actually allowed to
build, whichever the player currently owns **fewest** of, ties broken by position in the build
order. If the base is at capacity or its queue is full, it skips production that turn.

*Fewest-first, not simply the highest-priority buildable type* — that earlier rule made every
entry after the first unreachable, since the first is always allowed. A land or port base built
nothing but tanks forever and a mountain base nothing but fighters, which left an AI structurally
unable to take a mountain base: cracking one needs a bomber's ground attack, and it would never
build a bomber. Ties falling back to build-order position keeps the order meaningful — it decides
what arrives first, and what a base reaches for once its army is even.

This is a **per-unit greedy loop**, not coordinated multi-unit planning — a deliberate v1
simplification; combined-arms coordination is a candidate for later. Naval logistics (AI loading
units onto transporters/carriers) is likewise out of scope for v1 — AI acts only within
landmasses it already occupies. "Nearest" is always measured from the acting unit's own current
position, not a base or army-wide centroid — this keeps evaluation cheap, at the cost of
aggressive AI sometimes looking more opportunistic than coordinated.

**Field units** = any unit not currently garrisoned/stationed at a base or other unit.
**Ties** (equally close/equally weak options) are broken by lowest unit ID, for determinism.

**Deploying.** Every strategy's priority list describes what a *field* unit does — a garrisoned
unit can't attack, advance, or capture from inside a base. So a garrisoned unit's one available
action is to deploy: step out onto a valid adjacent hex, at the usual cost of exiting a base
(§3). Without this an AI would build units that never leave, and its whole priority list would
be unreachable. Deploying is the action for that unit's turn — it starts following its
strategy's list as a field unit from the next turn, rather than deploying and acting again in
the same one. This applies to both garrisoned groups (existing base-defenders and newly
completed units); each simply deploys at its own point in the processing order above.

Note this makes AI bases lightly garrisoned by default, since units leave as soon as they can —
a known consequence, and one of the things holding back a *defensive* AI in particular. Deciding
per strategy how many units to keep home as garrison (a defensive AI holding some back, an
aggressive one committing everything) is a candidate refinement, not v1 behavior.

### Strategies

**Aggressive**
1. Attack any enemy unit/base in range.
2. Else move toward the nearest known enemy unit/base.
3. Else move toward the nearest unexplored area or unclaimed base.
4. Never retreats — fights or advances until destroyed.
- Build order: Tank > Fighter > Bomber > Fregat > Carrier > Transporter (cheap combat units first).
- Target priority: lowest remaining strength (finish off weakened targets).

**Defensive**
1. If damaged and a friendly base can repair it this turn, retreat toward it.
2. Else attack an enemy in range that's threatening a friendly base (within that base's view).
3. Else hold near the nearest friendly base — only move toward it if farther away than
   (that base's view + this unit's view). E.g. a tank near a land base: 4 + 3 = 7 cells.
4. Idle at full strength with no threat present, and not capture-eligible or no known unclaimed
   base exists: takes no action (unused budget is intentional).
5. Else (capture-eligible, a known unclaimed base exists, and rules 1–4 found nothing to do):
   pathfind toward the nearest known unclaimed base to expand.
- Build order: cheapest to most expensive by bbt — Tank/Transporter (1×) > Fighter (2×) >
  Fregat (3×) > Bomber (5×) > Carrier (8×).
- Target priority: highest attack value first (neutralize the biggest threat, not the easiest kill).

**Balanced**
1. If damaged, retreat to repair (as Defensive).
2. Else attack an enemy in range.
3. Else, if a known unclaimed base exists and this unit can capture it, move toward it.
4. Else move toward the nearest known enemy — but never leave a player owned base with zero units, either units in view
   range or garissoned, to do so.
- Build order: an even mix — Tank > Fighter > Transporter > Fregat > Bomber > Carrier.
- Target priority: lowest remaining strength (same simplification as Aggressive for v1).

### Difficulty

| | Easy | Hard |
|---|---|---|
| Information | Respects fog of war | Full map knowledge, ignores fog |
| Targeting | First valid target found (no optimization) | Applies strategy's target-priority rule correctly |
| Pathing | Naive — moves straight toward target, may waste actions on obstacles | Full pathfinding — lowest-cost route, respects LOS |
| Action efficiency | Often leaves actions unspent/wasted (consequence of naive play) | Uses full action budget effectively |
| Reaction | Only responds to currently visible threats | Can react anywhere on the map immediately |

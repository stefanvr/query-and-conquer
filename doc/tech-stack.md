# tech stack

Web based video game

## base
* html
* css
* (plain) javascript

## architecture

* modular design
* CQRS

## hosting

* Git hub pages

## tech choices

* live-server

## Design choices for v1
* Save system - start with localStorage - risk not enough storage for now accepted
* Pre-generated maps
  * at build time as static JSON files checked into the repo/shipped as assets
  * create separate script for generating maps
  * only build maps when generation script is changed
* AI computation cost - on main thread - risk UI freezing for now accepted

* Modular design - native ES modules
* Use CQRS loosely — just "separate the code that mutates state from the code that reads/renders it"

* Rendering approach for the hex grid - use canvas

* Browser target: no need for legacy support, but keep it a most used
* Dev tooling: make sure it can be run locally with live update
* Testing: no testing

## Hex coordinate system

The game design spec fixes flat-top hex orientation and column-offset display layout
(style-guide.md §6) but doesn't specify internal coordinate math — this was an open decision,
resolved as follows:

* Internal logic (distance, neighbors, line-of-sight, pathfinding, map generation) works in
  **cube coordinates** `{x, y, z}` (x + y + z === 0), since neighbor/distance/adjacency math is
  simple constant-time arithmetic there.
* **Offset coordinates** `{col, row}` — specifically the "odd-q" scheme (odd columns pushed down
  half a cell), matching flat-top orientation — are used only at the two boundaries that need a
  rectangular grid shape: the map JSON format and on-screen pixel placement.
* One module owns the conversion between the two; nothing else hand-rolls it.

## State access rule (canonical vs. visible state)

Future direction: a multiplayer mode with a server, where commands and results are passed
back and forth, and clients only ever receive information that excludes enemy units/cells
hidden by fog of war (no cheating via inspecting client state).

No networking or server code is built now — that's out of scope for v1. But a single
architectural rule is adopted from the start, because v1 already needs the same boundary for
its own reasons (see below), and building it in from day one costs nothing extra while making
a later move to a server a matter of relocating state, not rewriting consumers.

**The rule:**
* **Canonical state** — the true, complete game state (every unit, every base, the full map) —
  lives in one place, and is mutated only by command handlers (move, attack, build, end-turn,
  etc.). This is the CQRS "command" side.
* **Nothing else reads canonical state directly.** Rendering, the human player's UI, and
  easy-difficulty AI decision-making all go through one function:
  `getVisibleState(canonicalState, viewerId)` → a filtered projection with fog-of-war rules
  applied (hidden cells omitted, units outside view range stripped, "explored but not visible"
  flagged per the style guide's fog-of-war states). This is the CQRS "query" side.
* **Hard-difficulty AI is the one documented exception** allowed to read canonical state
  directly — per the design doc, hard AI has full map knowledge and ignores fog of war by
  design, so it's supposed to bypass the filter.

**Why this isn't speculative extra work:** the design doc already requires this exact
filtering for fog of war in single-player (§5, and the AI difficulty table's "Information" row).
This rule doesn't add a feature — it just fixes *where* that filtering logic lives (one
function, one seam) instead of letting it leak into rendering code or AI code ad hoc.

**Why it pays off later:** if/when a server is introduced, canonical state moves server-side,
commands become network messages sent to the server, and `getVisibleState` becomes "what the
server computes and sends to a given client." Rendering code and AI code don't change, because
they were never touching canonical state directly to begin with.

**Explicitly out of scope for now:** no server process, no network protocol, no message-passing
code, no speculative serialization format. Canonical state being JSON-serializable falls out of
this design for free (it's the same requirement the save-game system already has), so no extra
work is needed there either.

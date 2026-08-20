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

* GitHub Pages

## tech choices

* live-server for local development
* Node's built-in test runner (`node:test`) for unit/integration tests
* Playwright for a thin layer of UI-wiring tests

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

* Browser target: no need for legacy support, but target the most widely used current browsers,
  desktop and mobile alike — see Mobile & touch support below for what that requires concretely.

* Dev tooling: make sure it can be run locally with live update
* Testing:
  * Unit/integration tests carry the bulk of coverage, driven through the code interface —
    command handlers and queries operate on plain canonical-state objects with no DOM involved,
    so they're cheap to test directly with `node:test` and need no build step or browser.
  * Playwright is reserved for a small number of UI-wiring/smoke tests only (e.g. a click reaches
    the right command, the canvas actually draws something) — kept deliberately thin, since
    browser-driven tests are slower and more brittle than testing the command/query layer directly.

## Mobile & touch support

Single responsive codebase — no separate mobile site/app. Desktop mouse and mobile touch are
both first-class inputs, not touch bolted onto a mouse-first build.

* **Input:** one input-handling layer maps pointer events for mouse and touch alike — tap =
  click/select, drag = pan, pinch = zoom (with on-screen +/- zoom buttons as a fallback where
  pinch isn't practical, e.g. a trackpad-less desktop). No feature may depend on a hover-only
  state (a tile/unit tooltip revealed only on `:hover`, say) — touch devices have no hover, so
  anything hover reveals must also be reachable by tap.
* **Touch targets:** HUD buttons, side-menu actions, and other UI chrome use a minimum ~44×44
  CSS px touch target (standard mobile accessibility guidance). Hex cells themselves render
  smaller than that at most zoom levels on a phone screen, so cell selection needs a
  tap-tolerance radius (nearest cell within N px of the tap), not exact-pixel hit testing.
* **Layout:** HUD, side menu, and other screens (implementation-spec.md §6-8) use responsive
  flexbox/grid plus media queries to go from a wide desktop layout to a narrow phone-portrait
  one; support both portrait and landscape rather than locking to one orientation.
* **Rendering performance:** the canvas draws only the current viewport, not the full map —
  maps run up to 12,000 cells (Extra Large, per query-and-conquer.md §1), and mobile CPUs/GPUs
  sit at the weaker end of the target range, so a full-map redraw every frame would not hold an
  acceptable frame rate there.
* **Testing:** Playwright's thin UI-wiring layer (see Testing above) includes at least one
  touch-driven smoke test (tap-select, drag-pan) alongside the mouse-driven ones, since touch
  runs through the same input-handling layer but is a distinct path worth covering.

Risk accepted: a unified pointer/touch input layer plus tap-tolerance hit-testing is more
upfront work than a mouse-only build — accepted, since retrofitting touch later would mean
touching every input call site instead of one seam.

**Native gesture conflict:** the canvas/game-viewport element sets `touch-action: none`, so the
browser hands it every touch event untouched instead of trying to pan/zoom the page with it.
Scoped to that element only — HUD and menu chrome outside the canvas keep normal touch
behavior. Considered and rejected: disabling zoom page-wide via the viewport meta's
`user-scalable=no` (kills accessibility zoom for HUD/menu text too, and recent iOS Safari
versions ignore the flag anyway); manually calling `preventDefault()` in non-passive touch
handlers (strictly more code and a perf risk for the same outcome `touch-action` gets
declaratively); and letting native pinch-zoom the page instead of the map (would contradict the
pinch-zooms-the-map decision above).

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
filtering for fog of war in single-player (§6, and the AI difficulty table's "Information" row).
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

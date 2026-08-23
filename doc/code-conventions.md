# Code conventions

**Purpose.** How code is written and organized here, and how it stays connected to the documents
that specify it.

**What belongs here.** Conventions applying across the codebase: file organization, what comments
are for, determinism, dev-only affordances.

**What doesn't.** Technology choices and architectural rules ([tech-stack.md](tech-stack.md)),
what a feature does ([implementation-spec.md](implementation-spec.md),
[query-and-conquer.md](query-and-conquer.md)), machine setup ([environment.md](environment.md)).

These are descriptive, not aspirational — the codebase already follows them. Written down so they
survive a new subsystem, a gap between sessions, or a different contributor.

---

## Every module says what it implements

Each module opens with a comment naming the doc section it implements and the constraint it's
under — not a restatement of what the code does.

```js
// Read side of tech-stack.md's CQRS-lite / state-access rule. Rendering and UI must go through
// this, never touch canonical state directly — a deliberate seam established from Stage 3
// onward. Stage 9 (Fog of war) fills in real per-viewer filtering (implementation-spec.md §5).
```

```js
// Movement reach + routing over the hex grid — implementation-spec.md §1's Movement targeting.
// Read-only: it never mutates state, and the caller walks a returned route through the ordinary
// moveUnit command rather than this module moving anything itself.
```

This is the most load-bearing convention in the file, and it works both directions: reading code
you can find the rule it satisfies; changing a rule you can grep for who depends on it. Without
it the docs drift from the code silently, and the drift is only discovered when someone
implements against a spec that stopped being true several stages ago.

Section references (`game spec §3`, `implementation-spec.md §1`) are used throughout and are worth
keeping precise — they're the actual index into the docs.

## Comments explain *why*, especially "why not the obvious thing"

The diff shows what changed. A comment carries the reasoning that isn't recoverable from the code
— most valuably where a naive reading suggests a different approach, because otherwise someone
"fixes" it back:

```css
/* .menu-panel's own display: flex above (class, 0-1-0) would otherwise beat the native
   [hidden] default — this rule (1-1-0) makes hidden win. */
```

```js
// `+ 0` normalizes a possible -0 -- -0 === 0 but Object.is(-0, 0) is false, which deepEqual in
// tests (correctly) does distinguish.
```

Three cases that always earn one:

- **A non-obvious constraint** that makes the simple version wrong — e.g. `enterCost` reading the
  *entering unit's* own terrain rather than the container's, because each container's cell is
  impassable to the other's occupant.
- **A deliberate asymmetry** — two similar things treated differently on purpose. Say why, or it
  reads as an oversight and gets tidied away (Fighter boards a Carrier, Bomber doesn't).
- **A shared helper's reason for existing** — "extracted because X also needs this" is invisible
  from a single call site (`reachableCells` exists partly for Stage 12's hard AI).

## Tests mirror the source layout

`test/{area}/` mirrors `src/{area}/` — `test/state/`, `test/map/`, `test/ai/`, `test/save/`.
Finding a module's tests requires no searching, and a module without a matching test file is
conspicuous.

Name tests as the behavior claimed, not the function called — `a boat's reach follows water, not
land` rather than `reachableCells works`. A failing test should describe the broken behavior in
its own name before anyone opens the file.

Per [tech-stack.md](tech-stack.md)'s Testing section: `node:test` carries the bulk against the
command/query layer directly; Playwright stays a thin UI-wiring layer for what the fast layer
structurally cannot see.

## Anything random is seeded

Randomness goes through `mulberry32` (`src/map/prng.js`), never `Math.random` in logic. A given
seed reproduces a given result exactly — used for map generation, base placement, turn order, and
AI strategy assignment.

This isn't only for tests, though it makes them possible: it's what lets a generated map be
regenerated identically, and a long AI simulation be re-run to confirm a fix.

Where two options are equally valid, break the tie **deterministically** — lowest id, or a fixed
direction order — rather than leaving it to iteration order. Game spec §8 states this for AI; the
same applies anywhere else it comes up.

## Commands own mutation

Only `src/state/commands.js` mutates canonical state (tech-stack.md's CQRS-lite rule). Everything
else — rendering, UI, the AI — reads through `getVisibleState` and acts by *calling commands*.

The AI is the clearest test of this: it plays by exactly the rules a human click does, because it
has no other way to change anything.

## Dev-only affordances are built, and gated

- `assets/dev-save.json` — a fixed save reaching an interesting board state without playing there.
- `dev/style-guide.html`, `dev/maps-preview.html` — reference pages rendering real output from
  the real code.
- `?dev` — URL gate revealing the dev-only main menu entry.

Document them in the README as they're built; they're forgotten within a month otherwise.

When a fixture needs a situation normal generation can't produce, hand-construct it *after* the
normal path has run, and **verify the construction** — `scripts/generate-dev-save.js` does this,
using real adjacency/distance checks rather than hand-worked coordinates. A fixture that's subtly
wrong costs more than no fixture; that script has had an off-by-one placement bug found exactly
that way.

## Scratch work leaves no trace

Throwaway verification scripts are encouraged (see the verification notes in
[implementation-tracking-v1.md](implementation-tracking-v1.md)'s workflow) — but delete them in
the same session. A `_probe.mjs` left in `scripts/` reads as real code to whoever comes next.

Write their output to `/tmp`, never anywhere the dev server watches — see
[environment.md](environment.md).

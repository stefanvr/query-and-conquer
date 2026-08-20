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

---

## 1. Map & camera
*(game spec §1 — rendering, pan/zoom, hex selection & highlight, terrain legend, tile hover
states. Base placement, §5, is fully automatic and has no dedicated UX surface — note any
placement-adjacent UI, e.g. a start-of-game camera focus, here instead. Pan/zoom design here
must account for touch (drag-pan, pinch-zoom, `touch-action: none` on the canvas) alongside
mouse — see tech-stack.md's Mobile & touch support section.)*
_Not started._

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
_Not started._

## 7. Side menu & selection panel
*(app-only — the contextual detail/action panel shown for whatever's currently selected, base
or unit; hosts the interaction described in §2/§3 above)*
_Not started._

## 8. Menus & screens
*(app-only — start screen, game room (new game / load game), game options menu, mid-turn menu
(save/quit/terminate), end screen; game spec §7 for the flows these implement)*

### Start screen (Stage 1)
- Single screen, no routing yet — this is the only screen the app skeleton renders. Game
  room, options menu, mid-turn menu and end screen are built in later stages (see tracking doc);
  this section only covers what Stage 1 needs.
- Structure and visuals follow `style-guide.md` §9 "Start screen"/"Buttons" exactly:
  full-bleed circular crop of `assets/background.png`, radial-gradient vignette to `--ink`,
  Staatliches title (`QUERY & CONQUER`, `CONQUER` in `--signal`) near the top of the circle,
  primary CTA button (`Start`) near the bottom.
- The `Start` button is wired (click listener attached in `src/main.js`) but is currently a
  stub — it has no game room to navigate to yet, so it only logs a placeholder action. Its
  hover/active press states are pure CSS (`:hover`/`:active`), so they already work without any
  JS, including on touch (`:active` fires on tap). Real navigation to the game room lands in
  Stage 3.
- Responsive per `tech-stack.md`'s Mobile & touch support: the circle scales via
  `min(92vw, 640px)` and `aspect-ratio`, so it shrinks to fit a phone-portrait viewport without a
  separate layout; the button already meets the ~44×44px touch-target minimum via its padding.
- One webfont load (Staatliches via Google Fonts), rest is system font stack — per style guide §5.

### Dev style guide page (Stage 1, dev-only)
- `dev/style-guide.html` — a living reference page for development, not part of the shipped app
  (not linked from the start screen, not deployed as a game screen). Renders the same tokens the
  app itself uses (`src/styles/tokens.css`, `src/styles/main.css`), so it can never drift from
  the real palette the way a hand-copied reference doc can.
- Shows: full color token swatches, terrain hex swatches (§4), player accent swatches (§3), fog
  of war's three states (§7), the phase-1 text-only status treatment (§8), and unit shapes (§9)
  once those exist. Grows alongside the app as later stages add components — e.g. selection
  panel styles land here once Stage 7 (Side menu) builds them.

## 9. Stats display
*(app-only — running in-HUD stats if any, and the end-of-game stats dialog per game spec §7)*
_Not started._

## 10. Save/Load
*(app-only — save/load UI flow, dev save game and dev-only load-test-game option)*
_Not started._

## 11. AI behavior UX
*(game spec §8 — visible per-action animation during an AI turn, and how the instant/fast/slow
speed setting affects it)*
_Not started._

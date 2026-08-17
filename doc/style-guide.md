# Query and Conquer — Style Specification

v1 visual style. Scope: enough to start implementation. Real art (tile sprites, unit
sprites, UI chrome) can replace flat colors later without changing this spec's structure.

---

## 1. Reference

Source reference art (illustrated soldiers/tank, dark vignette, olive/rust/orange military
tones) informed the palette below, but is **not** used directly except for the start-screen
background image (`background.png`). All other surfaces — tiles, buttons, UI — use flat
colors derived from that reference, not sprite art, to keep v1 simple.

---

## 2. Color tokens

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#0B0400` | Page background, deepest shadow |
| `--olive` | `#262714` | Panels, secondary surfaces |
| `--steel` | `#6B7276` | Borders, muted UI, secondary text |
| `--rust` | `#B81C00` | Button pressed/shadow state, danger/damage indicators |
| `--signal` | `#F59100` | Primary CTA, human-player accent |
| `--parchment` | `#EDE4D3` | Text on dark backgrounds |

## 3. Player accent colors

One color per player slot (human + up to 5 AI), used for unit/base ownership indication
(borders, markers, etc.). Chosen to sit in the same mid-tone, moderately desaturated register
as the rest of the palette — distinct hues, but none neon, so they read as "faction colors on a
battlefield" rather than UI-bright.

| Slot | Token | Hex | Note |
|---|---|---|---|
| Human (P1) | `--p-human` | `#F59100` | Same as `--signal`; human is always this color |
| AI slot 2 | `--p-ai-1` | `#3B7CB8` | Blue |
| AI slot 3 | `--p-ai-2` | `#7A4F9E` | Purple |
| AI slot 4 | `--p-ai-3` | `#C9A227` | Yellow/mustard |
| AI slot 5 | `--p-ai-4` | `#2E8C74` | Teal |
| AI slot 6 | `--p-ai-5` | `#C24E7A` | Rose/magenta |

Deliberately avoids `--rust` (reserved for danger/damage) and stays distinct from the terrain
tones in §4 (e.g. AI blue/teal are more saturated than `--t-shallow`/`--t-deep` so ownership
markers don't blend into water tiles).

AI slots are assigned in a fixed order (slot 2 → blue, slot 3 → purple, etc.) regardless of
strategy/difficulty — this is purely a visual identity, unrelated to the AI behavior spec.

## 4. Terrain tile colors (flat)

Placeholder flat colors for the 6 terrain types, until real tile art exists.

| Terrain | Token | Hex |
|---|---|---|
| Gras | `--t-gras` | `#4F5D33` |
| Gravel | `--t-gravel` | `#8D8370` |
| Mountain | `--t-mountain` | `#6B7276` |
| Sand | `--t-sand` | `#8C6B44` |
| Shallow water | `--t-shallow` | `#4C7A82` |
| Deep water | `--t-deep` | `#1F3F49` |

## 5. Typography

| Role | Font | Notes |
|---|---|---|
| Display (titles, button labels) | **Staatliches** (Google Font) | Condensed/stencil, used sparingly — headings and buttons only |
| Body / UI text | System sans stack: `system-ui, -apple-system, "Segoe UI", sans-serif` | No extra webfont load; keeps v1 lightweight |

Only one webfont is loaded (Staatliches). Body text uses the OS default stack.

## 6. Hex tile geometry

- **Orientation: flat-top** hexagons (flat edge on top/bottom, points left/right).
- CSS clip path for a flat-top hex:
  ```css
  clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
  ```
- Grid layout follows column-offset placement to match flat-top orientation.

## 7. Fog of war treatment

Three visual states per cell:

| State | Treatment |
|---|---|
| Unexplored | Not rendered — full `--ink`, no terrain color shown |
| Explored, not currently visible | Terrain color shown, **dimmed 30%** |
| Currently visible | Terrain color shown at full value, no dimming |

"Dimmed 30%" = an `rgba(0, 0, 0, 0.30)` overlay drawn on top of the tile's terrain color (or
equivalently, a `brightness(0.70)` filter on the tile). Applies to the tile's terrain fill only;
units are not shown at all in the "explored, not visible" state (per the design doc — units are
always hidden outside current view, only terrain stays revealed once explored).

## 8. Damage / selection / highlight states (phase 1)

Phase 1 uses **text only** — no color-coded highlight boxes, icons, or glow effects yet. This is
an intentional placeholder; dedicated UI elements (selection rings, health bars, range overlays)
are expected to replace this in a later pass.

| State | Phase 1 treatment |
|---|---|
| Selected unit/base | Plain text label rendered near the entity, e.g. `[SELECTED]` |
| Damage / current health | Plain text, e.g. `7/10 SP`, rendered near the entity |
| In attack range / reachable | Plain text label, e.g. `IN RANGE`, rendered on the relevant cell |

Text uses `--parchment` on a small `--ink` backing (for legibility over any terrain color),
`system-ui` body font, no Staatliches (that's reserved for titles/buttons per §5).

## 9. Components (v1)

### Start screen
- Full-bleed circular crop of `background.png`, edge-darkened with a radial-gradient vignette
  (`transparent` center fading to `--ink` at the edge) so it blends into the page background
  regardless of the source image's own framing.
- Title in Staatliches, `--parchment` with a `--signal`-colored accent word, centered near the
  top of the circle.
- Primary button (see below) centered near the bottom of the circle.

### Buttons (primary / CTA)
- Background: `--signal`
- Text: `--ink`, Staatliches, uppercase tracking
- Border-radius: `6px`
- Resting shadow: `0 4px 0 var(--rust)` (flat drop, not a blur) + soft ambient shadow
- Hover: translate down `2px`, shadow reduces to `0 2px 0 var(--rust)`
- Active/pressed: translate down `4px`, shadow flattens to `0`
- No gradients — flat fill only, consistent with "colors for buttons, not imagery" decision

### Terrain legend / tile swatches
- Flat-top hex shape (see §6), one per terrain type
- Thin inset border: `inset 0 0 0 1px rgba(0,0,0,0.35)` for edge definition against similar-toned
  neighbors
- Label below each swatch: `--steel`, uppercase, 11px, letterspaced

---

## 10. Open items (not yet decided)

None remaining from the initial v1 pass. Future candidates as implementation progresses:
real tile/unit sprite art to replace flat colors, and dedicated selection/health/range UI
elements to replace the phase-1 text treatment in §8.

---

## 11. Reference implementation

See `style-preview.html` for a working example of the start screen and terrain legend using
these tokens.

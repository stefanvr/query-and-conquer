# Query and Conquer

Turn-based hex-grid strategy game

## Documents

Each opens with a Purpose / What belongs here / What doesn't block, so there's one obvious home
for any given kind of decision.

| Doc | Owns |
|---|---|
| [doc/workflow.md](doc/workflow.md) | How work gets planned, reviewed, committed, merged |
| [doc/query-and-conquer.md](doc/query-and-conquer.md) | The game and its rules |
| [doc/tech-stack.md](doc/tech-stack.md) | What it's built with, and the trade-offs accepted |
| [doc/environment.md](doc/environment.md) | Running it on a real machine — and what fails *silently* if wrong |
| [doc/style-guide.md](doc/style-guide.md) | Tokens, components, visual states |
| [doc/code-conventions.md](doc/code-conventions.md) | How code is written, and how it stays tied to these docs |
| [doc/implementation-spec.md](doc/implementation-spec.md) | How each part is presented and operated |
| [doc/implementation-tracking-v1.md](doc/implementation-tracking-v1.md) | The build plan and its running record |

## Development

```
npm install
npm run dev       # live-server on http://127.0.0.1:8080
npm test          # node:test — unit/integration tests
npm run test:e2e  # Playwright — thin UI-wiring smoke tests
```

### Dev-only pages

Open these through the dev server, not by double-clicking the file — they use `fetch` and ES
module imports, which browsers block under the `file://` protocol (that's the permission error
you'll see otherwise). With `npm run dev` running:

- `http://127.0.0.1:8080/dev/style-guide.html` — living reference of the design
  tokens/components in [doc/style-guide.md](doc/style-guide.md).
- `http://127.0.0.1:8080/dev/maps-preview.html` — static render of any pre-generated map in
  `assets/maps/`, picked from a dropdown.

### Dev-only main menu option

`http://127.0.0.1:8080/?dev` — the app itself, with the main menu's "Load Test Game" button
revealed (hidden otherwise). Loads `assets/dev-save.json`, a fixed save with no combat/build
progress, to jump straight into a match without playing through the game options menu each
time.
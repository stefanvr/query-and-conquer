# Query and Conquer

Turn-based hex-grid strategy game

See [doc/query-and-conquer.md](doc/query-and-conquer.md) for the game design spec,
[doc/tech-stack.md](doc/tech-stack.md) for tech decisions, and
[doc/implementation-tracking-v1.md](doc/implementation-tracking-v1.md) for the build plan.

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
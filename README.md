# Query and Conquer

Turn-based hex-grid strategy game

## Docs

- [doc/query-and-conquer.md](doc/query-and-conquer.md) — game design spec
- [doc/tech-stack.md](doc/tech-stack.md) — implementation guidance
- [doc/style-guide.md](doc/style-guide.md) / [doc/style-preview.html](doc/style-preview.html) — visual style spec

## Run locally

Requires Node.js and npm.

```sh
npm install
npm start
```

Serves the app at `http://localhost:8080` with live reload on save.

`dev/style-reference.html` is a living cross-check of the style-guide tokens (terrain legend, player
accents, fog-of-war states, phase-1 status text) — open it directly (no build step needed) to verify
CSS token changes against the spec.

## Generate maps

Pre-generated map JSON lives in `data/maps/` and is checked into the repo. Regenerate only when
`tools/generate-maps.js` or `src/map-gen/` changes:

```sh
npm run generate-maps
```

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

## Deployment (GitHub Pages)

The site is fully static (no build step — see `doc/tech-stack.md`'s "hosting"/"tech choices"), so
[.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml) just publishes the repo
as-is via GitHub's Pages Actions pipeline on every push to `main` (or manually via the Actions tab
→ "Deploy to GitHub Pages" → Run workflow).

One-time manual setup, in the repo's GitHub settings (not something a workflow file can do):

1. **Settings → Pages → Build and deployment → Source** → select **GitHub Actions**.
2. Push this workflow to `main` (or run it manually) once — the run publishes the site and the
   Pages URL then appears at the top of Settings → Pages, and as the workflow run's environment URL.

All asset and module paths in the app are relative (no leading `/`), so the site works correctly at
a GitHub Pages project URL (`https://<user>.github.io/<repo>/`), which serves from a subpath.

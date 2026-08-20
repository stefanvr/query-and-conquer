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

`dev/style-guide.html` is a living reference of the design tokens/components in
[doc/style-guide.md](doc/style-guide.md), served the same way as the app itself.
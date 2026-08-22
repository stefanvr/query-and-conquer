import { test, expect } from "@playwright/test";

// UI-wiring smoke test for Stage 9's fog of war — per doc/tech-stack.md, Playwright stays a thin
// layer; the actual filtering logic (getVisibleState, currentlyVisibleCells, markExplored's
// persistence) is covered precisely by node:test, and the three-state canvas rendering itself was
// visually verified with a scratch screenshot before committing (matching earlier stages'
// practice) rather than asserting on raw canvas pixel data here — no existing e2e test in this
// project inspects canvas pixels, and the render code is a handful of straightforward conditional
// fillStyle branches already exercised by every other game-flow e2e test through this same code
// path. This test's job is narrower: catch an actual runtime error in the new rendering/redraw
// wiring (an undefined import, a bad Set access, etc.) that unit tests on the pure logic wouldn't.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("a fresh match (fog of war on by default) renders, pans, and zooms without errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.click("#start-button");
  await page.click("#new-game-button");
  // Fog of war defaults to on (options-menu.js) — left untouched, so this exercises the real
  // filtered/dimmed render path, not the fogOfWar:false passthrough.
  await expect(page.locator("#opt-fog")).toBeChecked();
  await page.click("#start-match-button");
  await expect(page.locator("#screen-game")).toBeVisible();

  const canvas = page.locator("#map-canvas");
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 80, cy - 40, { steps: 5 });
  await page.mouse.up();
  await page.click("#zoom-in-button");
  await page.click("#zoom-out-button");
  // A click here (base, unit, unexplored fog, or empty terrain, depending on exactly where the
  // drag/zoom above landed) exercises selectHex -> setSelectedHex/closeAllPanels -> camera.draw(),
  // the same fog-aware render path either way — the point is just that none of it throws.
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });

  expect(errors).toEqual([]);
});

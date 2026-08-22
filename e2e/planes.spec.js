import { test, expect } from "@playwright/test";

// UI-wiring smoke tests for Stage 8's planes — per doc/tech-stack.md, Playwright stays a thin
// layer; the command logic itself (rearm limits, fuel crash, mandatory movement, mountain-base
// claim) is covered by node:test, including a dedicated verification pass against this exact dev
// save's fighter/bomber/mountain-base fixtures (see scripts/generate-dev-save.js's own Stage 8
// comment). The dev save's fighter and bomber sit far from the human's own base (right next to
// the AI's, for ranged-attack testing), too far to reach by click without panning, so these tests
// stick to what's reachable without it: the End Turn gate engages immediately on load (position-
// independent — it only reads state, not the canvas), and the human's own new mountain base
// (close to their main base) opens with the right panel.

function hexToPixel(col, row, size) {
  return { x: size * 1.5 * col, y: size * Math.sqrt(3) * (row + 0.5 * (((col % 2) + 2) % 2)) };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/?dev");
  await page.evaluate(() => localStorage.clear());
  await page.click("#start-button");
  await page.click("#load-test-game-button");
  await expect(page.locator("#screen-game")).toBeVisible();
});

/** Screen position for a map hex, given the camera is centered on the base at (0, 2) with the
 * default (unzoomed) hex size — true right after loading the dev save. */
async function screenPosFor(page, col, row) {
  const box = await page.locator("#map-canvas").boundingBox();
  const size = 14;
  const base = hexToPixel(0, 2, size);
  const p = hexToPixel(col, row, size);
  return { x: box.x + box.width / 2 + (p.x - base.x), y: box.y + box.height / 2 + (p.y - base.y) };
}

test("End Turn is disabled on load, naming the fighter/bomber that still owe their mandatory movement", async ({ page }) => {
  await expect(page.locator("#end-turn-button")).toBeDisabled();
  const message = page.locator("#hud-end-turn-blocked");
  await expect(message).toBeVisible();
  await expect(message).toContainText("Fighter");
  await expect(message).toContainText("Bomber");
});

test("selecting the human's own mountain base shows its type and Fighter/Bomber build buttons", async ({ page }) => {
  const pos = await screenPosFor(page, 5, 4);
  await page.mouse.click(pos.x, pos.y);

  await expect(page.locator("#base-panel")).toBeVisible();
  await expect(page.locator("#base-panel-title")).toContainText("Mountain Base");
  const buttons = page.locator("#base-panel-build-buttons button");
  await expect(buttons).toContainText(["Build fighter", "Build bomber"]);
});

import { test, expect } from "@playwright/test";

// UI-wiring smoke tests for Stage 7's boats/cargo — per doc/tech-stack.md, Playwright stays a
// thin layer; the command logic itself is covered by node:test. Uses the ?dev-gated dev save
// (assets/dev-save.json), which hand-places a small coastal patch, a port base, and a
// transporter carrying a tank two hexes east of the human's land base.

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

test("selecting the dev-save transporter shows its cargo slot with the tank it's carrying", async ({ page }) => {
  const boat = await screenPosFor(page, 5, 2);
  await page.mouse.click(boat.x, boat.y);

  await expect(page.locator("#unit-panel")).toBeVisible();
  await expect(page.locator("#unit-panel-title")).toContainText("Transporter");
  await expect(page.locator("#unit-panel-cargo-section")).toBeVisible();
  await expect(page.locator("#unit-panel-cargo")).toContainText("TANK");
});

test("moving the transporter onto adjacent deep water spends AP (movement over water)", async ({ page }, testInfo) => {
  testInfo.skip(testInfo.project.name === "mobile-chromium", "destination hex falls under the open side panel on narrow viewports");

  const boat = await screenPosFor(page, 5, 2);
  await page.mouse.click(boat.x, boat.y);
  const apBefore = await page.locator("#unit-panel-ap").textContent();

  const dest = await screenPosFor(page, 6, 2); // deep water, adjacent
  await page.mouse.click(dest.x, dest.y);

  const apAfter = await page.locator("#unit-panel-ap").textContent();
  expect(apAfter).not.toBe(apBefore);
});

test("the transporter entering the port base with the Load picker unloads it and its cargo for free", async ({ page }, testInfo) => {
  testInfo.skip(testInfo.project.name === "mobile-chromium", "base hex falls under the open side panel on narrow viewports");

  const boat = await screenPosFor(page, 5, 2);
  await page.mouse.click(boat.x, boat.y);
  await page.click("#unit-panel-actions button"); // opens the load destination picker

  const base = await screenPosFor(page, 4, 2); // the port base, adjacent
  await page.mouse.click(base.x, base.y); // confirm: enter with cargo

  await page.mouse.click(base.x, base.y); // open its panel
  await expect(page.locator("#base-panel")).toBeVisible();
  await expect(page.locator("#base-panel-owner")).toContainText("Human");
  await expect(page.locator("#base-panel-capacity")).toContainText("2/15"); // the boat + its one tank
});

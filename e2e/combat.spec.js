import { test, expect } from "@playwright/test";

// UI-wiring smoke test for Stage 6's claim targeting — per doc/tech-stack.md, Playwright stays a
// thin layer; the command logic itself (attackUnit/attackBase/claimBase) is covered by
// node:test. Uses the ?dev-gated dev save (assets/dev-save.json), which hand-places a neutral
// base two hexes east of the human's own, adjacent to the dev-save tank, specifically so this
// doesn't need a played-out battle to reach a neutral base to claim.

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

test("clicking an adjacent neutral base with a selected tank claims it", async ({ page }) => {
  const tank = await screenPosFor(page, 1, 2);
  await page.mouse.click(tank.x, tank.y);
  await expect(page.locator("#unit-panel")).toBeVisible();

  const neutralBase = await screenPosFor(page, 2, 2);
  await page.mouse.click(neutralBase.x, neutralBase.y);

  // The claiming tank is gone (garrisoned into the base it just took) — no unit panel left open.
  await expect(page.locator("#unit-panel")).toBeHidden();

  // Recomputed rather than reused: closing the panel gave its space back to the map, so the canvas
  // resized and the earlier screen position no longer points at the same hex.
  const baseAfterClaim = await screenPosFor(page, 2, 2);
  await page.mouse.click(baseAfterClaim.x, baseAfterClaim.y);
  await expect(page.locator("#base-panel")).toBeVisible();
  await expect(page.locator("#base-panel-owner")).toContainText("Human");
  await expect(page.locator("#base-panel-capacity")).toContainText("1/15");
});

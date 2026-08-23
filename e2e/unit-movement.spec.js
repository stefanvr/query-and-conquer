import { test, expect } from "@playwright/test";

// UI-wiring smoke tests for Stage 5's tank movement/load/unload — per doc/tech-stack.md,
// Playwright stays a thin layer; the command logic itself is covered by node:test. Uses the
// ?dev-gated dev save (assets/dev-save.json), which always places a tank one hex from the
// human's land base, so hex positions here are deterministic rather than depending on a random
// new-game map.

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

/** Clicks a hex, resolving its position at the moment of the click. Always prefer this to holding
 * a position in a variable: opening or closing a panel resizes the canvas, so a coordinate worked
 * out beforehand can point at a different hex by the time it's used. */
async function clickHex(page, col, row) {
  const pos = await screenPosFor(page, col, row);
  await page.mouse.click(pos.x, pos.y);
}

test("selecting the dev-save tank shows its panel with AP and a Load button", async ({ page }) => {
  const tank = await screenPosFor(page, 1, 2);
  await page.mouse.click(tank.x, tank.y);

  await expect(page.locator("#unit-panel")).toBeVisible();
  await expect(page.locator("#unit-panel-title")).toContainText("Tank");
  await expect(page.locator("#unit-panel-ap")).toContainText("AP");
  await expect(page.locator("#unit-panel-actions button")).toContainText("Load");
});

test("moving the tank to an adjacent hex spends AP and leaves the base-adjacent action unavailable", async ({ page }) => {
  const tank = await screenPosFor(page, 1, 2);
  await page.mouse.click(tank.x, tank.y);
  const apBefore = await page.locator("#unit-panel-ap").textContent();

  // (1,3) is adjacent to (1,2) but not to the base at (0,2).
  const dest = await screenPosFor(page, 1, 3);
  await page.mouse.click(dest.x, dest.y);

  const apAfter = await page.locator("#unit-panel-ap").textContent();
  expect(apAfter).not.toBe(apBefore);
  await expect(page.locator("#unit-panel-actions")).toBeEmpty();
});

test("the Load picker loads the tank in; a unit that spent its turn getting in can't turn straight around, but a rested one unloads", async ({ page }) => {
  const tank = await screenPosFor(page, 1, 2);
  await page.mouse.click(tank.x, tank.y);
  await expect(page.locator("#unit-panel-actions button")).toBeEnabled();

  await page.click("#unit-panel-actions button"); // opens the load destination picker
  await expect(page.locator("#unit-panel")).toBeHidden();

  await clickHex(page, 0, 2); // confirm: load into the base
  await expect(page.locator("#unit-panel")).toBeHidden(); // no panel auto-opens after a successful load
  await expect(page.locator("#base-panel")).toBeHidden();

  await clickHex(page, 0, 2); // open its panel
  await expect(page.locator("#base-panel")).toBeVisible();
  // The dev save already garrisons one (damaged) tank for repair testing (Stage 6) -- this makes
  // a second, in the next slot.
  await expect(page.locator("#base-panel-capacity")).toContainText("2/15");

  // The tank that just walked in has nothing left this turn: it arrived on 3 AP and loading cost
  // 2, so it can't afford the 2 to step back out (implementation-spec.md §3's spentActions).
  // Its picker opens, but that hex isn't a valid destination, so confirming there does nothing.
  await page.locator("#base-panel-garrison button").nth(1).click();
  await expect(page.locator("#base-panel")).toBeHidden();
  await clickHex(page, 1, 2); // back where it started -- adjacent, passable, empty
  await expect(page.locator("#unit-panel")).toBeHidden(); // no unit placed -- still in the picker
  await clickHex(page, 0, 2); // cancel back out of the picker
  await expect(page.locator("#base-panel")).toBeVisible();
  await expect(page.locator("#base-panel-capacity")).toContainText("2/15"); // both still inside

  // The tank that's been garrisoned since the save was made hasn't spent anything, so it leaves
  // normally -- the unload picker itself works fine.
  await page.locator("#base-panel-garrison button").nth(0).click();
  await expect(page.locator("#base-panel")).toBeHidden();
  await clickHex(page, 1, 2);
  await expect(page.locator("#unit-panel")).toBeVisible(); // the newly-placed unit's own panel opens
  await expect(page.locator("#unit-panel-title")).toContainText("Tank");

  // Clicking straight through to the base hex, with the unit panel still open — the panel takes
  // its own space rather than floating over the map, so there is nothing underneath it to miss.
  await clickHex(page, 0, 2);
  await expect(page.locator("#base-panel-capacity")).toContainText("1/15"); // back to just the damaged one
});

test("clicking the unit's own hex while the load destination picker is open cancels back to its panel", async ({ page }) => {
  const tank = await screenPosFor(page, 1, 2);
  await page.mouse.click(tank.x, tank.y);
  await page.click("#unit-panel-actions button"); // opens the load destination picker
  await expect(page.locator("#unit-panel")).toBeHidden();

  await page.mouse.click(tank.x, tank.y); // cancel
  await expect(page.locator("#unit-panel")).toBeVisible();
  await expect(page.locator("#unit-panel-actions button")).toContainText("Load");
});

test("clicking the base while the unload destination picker is open cancels back to the base panel", async ({ page }) => {
  const tank = await screenPosFor(page, 1, 2);
  await page.mouse.click(tank.x, tank.y);
  await page.click("#unit-panel-actions button"); // opens the load destination picker

  const base = await screenPosFor(page, 0, 2);
  await page.mouse.click(base.x, base.y); // confirm: load into the base
  await page.mouse.click(base.x, base.y); // open its panel

  await page.locator("#base-panel-garrison button").nth(1).click(); // the newly-loaded tank's slot
  await expect(page.locator("#base-panel")).toBeHidden();

  await page.mouse.click(base.x, base.y); // cancel
  await expect(page.locator("#base-panel")).toBeVisible();
  await expect(page.locator("#base-panel-capacity")).toContainText("2/15");
});

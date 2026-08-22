import { test, expect } from "@playwright/test";

// UI-wiring smoke tests for Stage 10's End screen/stats dialog — per doc/tech-stack.md,
// Playwright stays a thin layer; elimination/win-detection and the stats counters themselves are
// covered precisely by node:test. Surrender is the cheapest deterministic way to reach the End
// screen in e2e (a natural win/loss needs a full match played out, already exercised at the
// command level instead — game-flow.spec.js's own Surrender test covers the confirm-then-defeat
// path; this file covers what's reachable once already there).

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click("#start-button");
  await page.click("#new-game-button");
  await page.click("#start-match-button");
  await expect(page.locator("#screen-game")).toBeVisible();
  await page.click("#menu-button");
  await page.click("#surrender-button");
  await page.click("#surrender-confirm-yes");
  await expect(page.locator("#screen-end")).toBeVisible();
});

test("the Stats dialog lists every player with Built/Lost counts, and closes back to the End screen", async ({ page }) => {
  await page.click("#end-stats-button");
  await expect(page.locator("#end-stats-overlay")).toBeVisible();
  const rows = page.locator("#end-stats-rows .menu-body-text");
  await expect(rows).toHaveCount(2); // human + the one default AI opponent
  await expect(rows.first()).toContainText("Built:");
  await expect(rows.first()).toContainText("Lost:");

  await page.click("#end-stats-close-button");
  await expect(page.locator("#end-stats-overlay")).toBeHidden();
  await expect(page.locator("#screen-end")).toBeVisible();
});

test("the End screen's map pans and zooms without errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));

  const canvas = page.locator("#end-map-canvas");
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 60, cy - 30, { steps: 5 });
  await page.mouse.up();
  await page.click("#end-zoom-in-button");
  await page.click("#end-zoom-out-button");

  expect(errors).toEqual([]);
});

import { test, expect } from "@playwright/test";

// UI-wiring smoke tests for Stage 3's outer game loop — per doc/tech-stack.md, Playwright stays
// a thin layer; the state/save logic itself is covered by node:test.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("start -> game room -> options -> start match reaches the game screen with a rendered map", async ({ page }) => {
  await page.click("#start-button");
  await expect(page.locator("#screen-game-room")).toBeVisible();
  await expect(page.locator("#load-game-button")).toBeDisabled();

  await page.click("#new-game-button");
  await expect(page.locator("#screen-options")).toBeVisible();

  await page.click("#start-match-button");
  await expect(page.locator("#screen-game")).toBeVisible();
  await expect(page.locator("#hud-turn-indicator")).toContainText("Turn 1");

  const canvas = page.locator("#map-canvas");
  const box = await canvas.boundingBox();
  expect(box.width).toBeGreaterThan(100);
  expect(box.height).toBeGreaterThan(100);
});

test("Islands is not offered as a map type when size is Small", async ({ page }) => {
  await page.click("#start-button");
  await page.click("#new-game-button");
  await page.selectOption("#opt-map-size", "small");
  const values = await page.locator("#opt-map-type option").allTextContents();
  expect(values).not.toContain("islands");
});

test("End Turn cascades past AI players and back to the human", async ({ page }) => {
  await page.click("#start-button");
  await page.click("#new-game-button");
  await page.click("#start-match-button");
  await expect(page.locator("#screen-game")).toBeVisible();

  await page.click("#end-turn-button");
  await expect(page.locator("#hud-turn-indicator")).toContainText("Human");
});

test("mid-turn Save then Quit then Load Game round-trips back into the match", async ({ page }) => {
  await page.click("#start-button");
  await page.click("#new-game-button");
  await page.click("#start-match-button");
  await expect(page.locator("#screen-game")).toBeVisible();

  await page.click("#menu-button");
  await expect(page.locator("#mid-turn-menu")).toBeVisible();
  await page.click("#save-button");
  await expect(page.locator("#mid-turn-menu")).toBeHidden();

  await page.click("#menu-button");
  await page.click("#quit-button");
  await expect(page.locator("#screen-game-room")).toBeVisible();
  await expect(page.locator("#load-game-button")).toBeEnabled();

  await page.click("#load-game-button");
  await expect(page.locator("#screen-game")).toBeVisible();
});

test("dragging the map canvas pans the camera without errors", async ({ page }) => {
  // Pointer Events unify mouse and touch in map-canvas.js's own input handling, so a
  // mouse-driven drag here exercises the same code path a touch drag would; the
  // mobile-chromium Playwright project (playwright.config.js) additionally runs every test in
  // this file via touch taps, per tech-stack.md's Mobile & touch support section.
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.click("#start-button");
  await page.click("#new-game-button");
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

  expect(errors).toEqual([]);
});

test("Terminate asks for confirmation before returning to the game room", async ({ page }) => {
  await page.click("#start-button");
  await page.click("#new-game-button");
  await page.click("#start-match-button");
  await expect(page.locator("#screen-game")).toBeVisible();

  let dialogMessage = null;
  page.once("dialog", async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.accept();
  });
  await page.click("#menu-button");
  await page.click("#terminate-button");

  await expect(page.locator("#screen-game-room")).toBeVisible();
  expect(dialogMessage).toMatch(/terminate/i);
});

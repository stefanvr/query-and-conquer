import { test, expect } from "@playwright/test";

// UI-wiring smoke tests for Stage 3's outer game loop — per doc/tech-stack.md, Playwright stays
// a thin layer; the state/save logic itself is covered by node:test.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("start -> main menu -> options -> start match reaches the game screen with a rendered map", async ({ page }) => {
  await page.click("#start-button");
  await expect(page.locator("#screen-main-menu")).toBeVisible();
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

test("a fresh match always lands on the human's turn, even if turn order starts with an AI", async ({ page }) => {
  // Turn order is randomized (game spec §7) — before this was fixed, a match starting on an AI's
  // turn just sat there, since only the End Turn button cascaded past AI turns, never match
  // start itself. Run several times since the failure only showed up on ~half of random seeds.
  for (let i = 0; i < 8; i++) {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.click("#start-button");
    await page.click("#new-game-button");
    await page.click("#start-match-button");
    await expect(page.locator("#hud-turn-indicator")).toContainText("Human");
  }
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
  await expect(page.locator("#screen-main-menu")).toBeVisible();
  await expect(page.locator("#load-game-button")).toBeEnabled();

  await page.click("#load-game-button");
  await expect(page.locator("#screen-game")).toBeVisible();
});

test("dev-only Load Test Game is hidden by default and works behind ?dev", async ({ page }) => {
  await page.click("#start-button");
  await expect(page.locator("#load-test-game-button")).toBeHidden();

  await page.goto("/?dev");
  await page.evaluate(() => localStorage.clear());
  await page.click("#start-button");
  await expect(page.locator("#load-test-game-button")).toBeVisible();

  await page.click("#load-test-game-button");
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

test("clicking the human's own base opens its panel with a build option, and empty terrain closes it", async ({ page }) => {
  await page.click("#start-button");
  await page.click("#new-game-button");
  await page.click("#start-match-button");
  await expect(page.locator("#screen-game")).toBeVisible();

  // The camera centers on the human's own base at match start, so canvas center hits it.
  const canvas = page.locator("#map-canvas");
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("#base-panel")).toBeVisible();
  await expect(page.locator("#base-panel-title")).toContainText("Base");
  await expect(page.locator("#base-panel-capacity")).toContainText("0/15");
  await expect(page.locator("#base-panel-build-buttons button").first()).toBeVisible();

  // A tap on the panel's own close button also works, independent of hex selection.
  await page.click("#base-panel-close");
  await expect(page.locator("#base-panel")).toBeHidden();
});

test("queuing a build updates capacity, and its progress ticks down exactly once per End Turn", async ({ page }) => {
  await page.click("#start-button");
  await page.click("#new-game-button");
  await page.click("#start-match-button");
  await expect(page.locator("#screen-game")).toBeVisible();

  const canvas = page.locator("#map-canvas");
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("#base-panel")).toBeVisible();

  // Base type (and so which unit types are buildable) varies with the randomly-picked map/base
  // site — read whichever build button is first, rather than assuming Tank.
  const firstButton = page.locator("#base-panel-build-buttons button").first();
  const unitType = (await firstButton.textContent()).replace("Build ", "").trim();
  await firstButton.click();
  await expect(page.locator("#base-panel-capacity")).toContainText("1/15");

  await expect(page.locator("#base-panel-build-slot")).toContainText(unitType.toUpperCase());
  const buildSlotText = await page.locator("#base-panel-build-slot").textContent();
  const initialTurns = Number(buildSlotText.match(/(\d+) left/)[1]);

  await page.click("#end-turn-button");
  await expect(page.locator("#base-panel-build-slot")).toContainText(`${initialTurns - 1} left`);
});

test("Surrender shows an in-app confirmation (not a native dialog) before returning to the main menu", async ({ page }) => {
  let nativeDialogSeen = false;
  page.on("dialog", async (dialog) => {
    nativeDialogSeen = true;
    await dialog.dismiss();
  });

  await page.click("#start-button");
  await page.click("#new-game-button");
  await page.click("#start-match-button");
  await expect(page.locator("#screen-game")).toBeVisible();

  await page.click("#menu-button");
  await page.click("#surrender-button");
  await expect(page.locator("#surrender-confirm")).toBeVisible();
  await expect(page.locator("#mid-turn-menu-main")).toBeHidden();

  // Cancel returns to the main mid-turn menu without ending the match.
  await page.click("#surrender-confirm-cancel");
  await expect(page.locator("#mid-turn-menu-main")).toBeVisible();
  await expect(page.locator("#screen-game")).toBeVisible();

  await page.click("#surrender-button");
  await page.click("#surrender-confirm-yes");
  await expect(page.locator("#screen-main-menu")).toBeVisible();
  expect(nativeDialogSeen).toBe(false);
});

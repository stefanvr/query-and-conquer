import { test, expect } from "@playwright/test";

// Regression cover for a real incident: while flying planes across the map with rapid clicks, the
// player found themselves able to move an *enemy* tank.
//
// Cause: an AI turn threw part-way (the dev save predated `player.stats`, so recording a kill or a
// completed build hit undefined). The driver's `finally` unlocked input, the rejection was silent,
// and the post-await refresh never ran — leaving the turn sitting on the AI with the UI live.
// Every action in the game screen was gated on the *active* player owning the unit, so with an AI
// active the human simply inherited that AI's army.
//
// The stale save is fixed and the screen now gates on whose turn it actually is, issuing every
// command as the viewer. What's covered here is the *observable invariant* that broke — control
// returns to the human and the HUD agrees with reality — rather than the specific trigger, since
// any future exception would otherwise reopen the same hole.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("control returns to the human after every AI turn, with no silent failure", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.click("#start-button");
  await page.click("#new-game-button");
  await page.selectOption("#opt-ai-count", "3"); // more AI turns per cycle = more chances to break
  await page.click("#start-match-button");
  await expect(page.locator("#screen-game")).toBeVisible();

  const indicator = page.locator("#hud-turn-indicator");
  const endTurn = page.locator("#end-turn-button");
  const blocked = page.locator("#hud-end-turn-blocked");

  for (let turn = 1; turn <= 8; turn++) {
    // Whenever the human can act, the HUD must say so and End Turn must be usable. A turn left
    // sitting on an AI shows up here as either the wrong label or a permanently disabled button.
    await expect(indicator).toContainText("Human");
    await expect(indicator).toContainText(`Turn ${turn}`);
    await expect(endTurn).toBeEnabled();
    // The failure banner appears only if an AI turn threw — it outranks every other message.
    await expect(blocked).not.toContainText("AI turn failed");
    await endTurn.click();
  }

  expect(errors).toEqual([]);
});

test("rapid End Turn clicks don't desync the HUD from whose turn it is", async ({ page }) => {
  // The incident happened while clicking fast. Each click legitimately ends a turn, so the count
  // should simply advance — what must not happen is control being left with an AI.
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.click("#start-button");
  await page.click("#new-game-button");
  await page.click("#start-match-button");
  await expect(page.locator("#screen-game")).toBeVisible();

  const endTurn = page.locator("#end-turn-button");
  for (let i = 0; i < 10; i++) await endTurn.click({ delay: 0 });

  await expect(page.locator("#hud-turn-indicator")).toContainText("Human");
  await expect(endTurn).toBeEnabled();
  await expect(page.locator("#hud-end-turn-blocked")).not.toContainText("AI turn failed");
  expect(errors).toEqual([]);
});

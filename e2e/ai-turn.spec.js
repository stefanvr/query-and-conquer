import { test, expect } from "@playwright/test";

// UI-wiring smoke tests for Stage 11's AI turns — per doc/tech-stack.md, Playwright stays a thin
// layer; the decision logic itself (strategy rules, naive pathing, fog-respecting perception) is
// covered precisely by node:test in test/ai/. What's worth covering here is the wiring the unit
// tests can't see: the HUD speed control existing, Instant staying synchronous, and a paced run
// actually locking the human out while it plays.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

async function startMatch(page) {
  await page.click("#start-button");
  await page.click("#new-game-button");
  await page.click("#start-match-button");
  await expect(page.locator("#screen-game")).toBeVisible();
}

test("the HUD exposes an AI speed control, defaulting to Instant", async ({ page }) => {
  await startMatch(page);
  const speed = page.locator("#hud-ai-speed");
  await expect(speed).toBeVisible();
  await expect(speed).toHaveValue("0"); // Instant
});

test("on Instant, ending a turn plays out the AI and hands control straight back", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await startMatch(page);

  const turnIndicator = page.locator("#hud-turn-indicator");
  await expect(turnIndicator).toContainText("Human");
  await expect(turnIndicator).toContainText("Turn 1");

  await page.click("#end-turn-button");

  // Back on the human immediately -- no waiting, and a full turn has elapsed.
  await expect(turnIndicator).toContainText("Human");
  await expect(turnIndicator).toContainText("Turn 2");
  await expect(page.locator("#end-turn-button")).toBeEnabled();
  expect(errors).toEqual([]);
});

test("on a paced speed, End Turn locks out while the AI plays, then re-enables", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await startMatch(page);

  await page.selectOption("#hud-ai-speed", "1000"); // Fast: 1s per AI action
  await page.click("#end-turn-button");

  // The AI's first action holds the turn, so the human can't act out of turn.
  await expect(page.locator("#end-turn-button")).toBeDisabled();

  // ...and control comes back on its own once the AI is done.
  await expect(page.locator("#end-turn-button")).toBeEnabled({ timeout: 30000 });
  await expect(page.locator("#hud-turn-indicator")).toContainText("Human");
  expect(errors).toEqual([]);
});

test("many AI turns in a row run against a real generated map without a runtime error", async ({ page }) => {
  // The node:test suite exercises the rules on small hand-built boards; this covers what those
  // can't -- the AI loose on an actual generated map (real water, mountains, map edges, units
  // being built and destroyed) for long enough to hit the awkward cases. A thrown error anywhere
  // in the engine surfaces here as a pageerror.
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await startMatch(page);

  for (let turn = 0; turn < 25; turn++) {
    await page.click("#end-turn-button");
  }

  await expect(page.locator("#hud-turn-indicator")).toContainText("Turn 26");
  await expect(page.locator("#hud-turn-indicator")).toContainText("Human");
  expect(errors).toEqual([]);
});

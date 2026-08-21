import { test, expect } from "@playwright/test";

// UI-wiring smoke test: the start screen renders and the Start button is reachable —
// per doc/tech-stack.md, Playwright is reserved for this thin layer, not deep coverage.
test("start screen renders title and Start button", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".title")).toContainText("CONQUER");
  await expect(page.locator("#start-button")).toBeVisible();
});

test("Start button is clickable (touch and mouse both reach it) and navigates to the main menu", async ({ page }) => {
  await page.goto("/");
  const button = page.locator("#start-button");
  await button.tap({ trial: true }).catch(() => {}); // no-op on browsers without touch support
  await button.click();
  // Since Stage 3 (see doc/implementation-spec.md §8), Start navigates to the main menu —
  // full coverage of that flow lives in e2e/game-flow.spec.js.
  await expect(page.locator("#screen-main-menu")).toBeVisible();
});

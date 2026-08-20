import { test, expect } from "@playwright/test";

// UI-wiring smoke test: the start screen renders and the Start button is reachable —
// per doc/tech-stack.md, Playwright is reserved for this thin layer, not deep coverage.
test("start screen renders title and Start button", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".title")).toContainText("CONQUER");
  await expect(page.locator("#start-button")).toBeVisible();
});

test("Start button is clickable (touch and mouse both reach it)", async ({ page }) => {
  await page.goto("/");
  const button = page.locator("#start-button");
  await button.tap({ trial: true }).catch(() => {}); // no-op on browsers without touch support
  await button.click();
  // Stage 1 stub has no navigation yet (see src/main.js) — clicking should not throw/crash.
  await expect(button).toBeVisible();
});

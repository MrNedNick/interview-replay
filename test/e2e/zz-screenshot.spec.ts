import { test } from "@playwright/test";
import { openSample, setTheme } from "./helpers.ts";
// Produces docs/screenshot.png for the README; skipped unless asked for.
test("README screenshot", async ({ page }, info) => {
  test.skip(!process.env.INTERVIEW_REPLAY_SCREENSHOT || info.project.name !== "desktop", "Only when regenerating the README image.");
  await page.setViewportSize({ width: 1360, height: 860 });
  await openSample(page);
  await setTheme(page, "light");
  await page.getByText("Basket checkout · Session 1").click();
  await page.locator("video").evaluate((v: HTMLVideoElement) => new Promise<void>(r => { v.addEventListener("seeked", () => r(), { once: true }); v.currentTime = 21.5; }));
  await page.getByRole("button", { name: /^Note at 0:18/ }).click();
  await page.locator("video").evaluate((v: HTMLVideoElement) => new Promise<void>(r => { v.addEventListener("seeked", () => r(), { once: true }); v.currentTime = 21.5; }));
  await page.getByLabel("Note", { exact: true }).fill("Re-reads the slot time twice before paying #delivery-slot");
  await page.waitForFunction(() => document.querySelector("video")!.readyState >= 2);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(800);
  await page.screenshot({ path: "docs/screenshot.png" });
});

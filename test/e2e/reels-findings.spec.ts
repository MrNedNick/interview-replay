import { expect, test } from "@playwright/test";
import { openSample } from "./helpers.ts";

test("a reel plays its clips back to back across interviews", async ({ page }) => {
  await openSample(page);
  await page.getByRole("link", { name: /Reels/ }).click();
  await expect(page.getByText("Clip 1 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Play clip 1" }).click();
  await expect.poll(() => page.locator("video").evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
  const end = await page.locator("video").evaluate((v: HTMLVideoElement) => { v.currentTime = 26.5; return v.currentTime; });
  expect(end).toBeGreaterThan(26);
  await expect(page.getByText("Clip 2 of 3")).toBeVisible();
  await expect.poll(() => page.locator("audio").evaluate((a: HTMLAudioElement) => !a.paused && a.currentTime >= 12)).toBe(true);
  await page.getByRole("button", { name: "Move clip 3 up" }).click();
  await expect(page.getByLabel("Clip 2 caption")).toHaveValue(/Maya lost a slot/);
  await page.getByLabel("Clip 1 end").fill("0:18");
  await page.getByLabel("Clip 1 end").blur();
  await expect(page.getByRole("alert")).toContainText("at least a second");
  await expect(page.getByLabel("Clip 1 end")).toHaveValue("0:27");
});

test("a note becomes evidence, and a second participant turns an anecdote into a pattern", async ({ page }) => {
  await openSample(page);
  await page.getByRole("link", { name: /Findings/ }).click();
  await page.getByLabel("New finding").fill("People plan around their lunch break");
  await page.getByRole("button", { name: "Add finding" }).click();
  const card = page.getByRole("listitem").filter({ has: page.getByLabel("Finding 4", { exact: true }) });
  await expect(card).toContainText("No evidence yet");
  await card.getByRole("button", { name: "Add evidence" }).click();
  const picker = page.getByRole("dialog", { name: "Add evidence" });
  await picker.getByLabel("Search notes to cite").fill("#context");
  await picker.getByRole("listitem").filter({ hasText: "lunch break" }).getByRole("button", { name: "Cite" }).click();
  await picker.getByRole("button", { name: "Done" }).click();
  await expect(card).toContainText("One participant · 1 moment");
  await page.getByText("Basket checkout").first().waitFor({ state: "attached" });
  await page.goto("/#/");
  await page.getByText("Basket checkout · Session 1").click();
  await page.getByRole("listitem").filter({ hasText: "Plans groceries" }).getByRole("button", { name: "Use…" }).click();
  await page.getByLabel("Finding", { exact: true }).selectOption({ label: "People plan around their lunch break" });
  await page.getByRole("button", { name: "Link as evidence" }).click();
  await page.getByRole("link", { name: /Findings/ }).click();
  await expect(page.getByRole("listitem").filter({ has: page.getByLabel("Finding 4", { exact: true }) })).toContainText("Pattern · 2 participants · 2 moments");
  await page.getByRole("listitem").filter({ has: page.getByLabel("Finding 4", { exact: true }) }).getByRole("button", { name: /Play Jonas/ }).click();
  await expect.poll(() => page.locator("dialog audio").evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(5);
});

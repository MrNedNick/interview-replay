import { expect, test } from "@playwright/test";
import { noHorizontalScroll, openSample } from "./helpers.ts";

test("notes are pinned to the moment typing began, tagged with #tags and kept after a reload", async ({ page }) => {
  await openSample(page);
  await page.getByText("Basket checkout · Session 1").click();
  await expect(page.getByRole("heading", { name: "Basket checkout · Session 1" })).toBeVisible();
  await page.getByRole("button", { name: "Play from 0:18" }).click();
  await expect.poll(() => page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(18.5);
  await expect(page.getByRole("slider", { name: "Playhead" })).toHaveAttribute("aria-valuetext", /0:1[89]|0:2\d of 0:56/);
  await page.locator("video").evaluate((v: HTMLVideoElement) => { v.pause(); v.currentTime = 31; });
  await expect(page.getByLabel("Note time")).toHaveValue("0:31");
  await page.getByLabel("Note", { exact: true }).fill("Hesitates before tapping Pay #hesitation");
  await page.getByLabel("Note", { exact: true }).press("Enter");
  const note = page.getByRole("listitem").filter({ hasText: "Hesitates before tapping Pay" });
  await expect(note).toContainText("0:31");
  await expect(note).toContainText("#hesitation");
  await expect(note).not.toContainText("Pay #hesitation");
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: "Hesitates before tapping Pay" })).toContainText("#hesitation");
  await noHorizontalScroll(page);
});

test("a typed time works without playing; bad times and empty notes are refused", async ({ page }) => {
  await openSample(page);
  await page.getByText("Basket checkout · Session 2").click();
  await page.getByLabel("Note time").fill("2:00");
  await page.getByLabel("Note", { exact: true }).fill("Past the end");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByRole("alert")).toContainText("past the end of the recording (0:42)");
  await page.getByLabel("Note time").fill("soon");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByRole("alert")).toContainText("isn't a time");
  await page.getByLabel("Note time").fill("0:05");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Past the end" })).toContainText("0:05");
});

test("the timeline zooms, scrolls and moves the playhead from the keyboard", async ({ page }) => {
  await openSample(page);
  await page.getByText("Basket checkout · Session 1").click();
  const slider = page.getByRole("slider", { name: "Playhead" });
  await expect(page.getByText("Whole recording · 0:56")).toBeVisible();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByText(/^0:00 – 0:1\d$/)).toBeVisible();
  await page.getByRole("button", { name: "Later" }).click();
  await expect(page.getByText(/^0:1\d – 0:2\d$/)).toBeVisible();
  await slider.focus();
  await slider.press("ArrowRight");
  await slider.press("Shift+ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuetext", "0:35 of 0:56");
  await slider.press("0");
  await expect(page.getByText("Whole recording · 0:56")).toBeVisible();
  await page.getByRole("button", { name: "Note at 0:50: Wants the slot and the total next to the Pay button" }).click();
  await expect(slider).toHaveAttribute("aria-valuetext", "0:50 of 0:56");
});

test("deleting a cited note asks first and the finding loses that support", async ({ page }) => {
  await openSample(page);
  await page.getByText("Basket checkout · Session 1").click();
  await page.getByRole("button", { name: "Delete note at 0:50" }).click();
  await expect(page.getByRole("dialog", { name: "Delete this note?" })).toContainText("evidence for 1 finding");
  await page.getByRole("button", { name: "Delete note", exact: true }).click();
  await page.getByRole("link", { name: /Findings/ }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "People want one confirmation screen" }).first()).toContainText("One participant · 1 moment");
});

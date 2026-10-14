import { expect, test } from "@playwright/test";
import { openSample } from "./helpers.ts";

test("search finds notes across interviews, by words, accents-insensitive, and by #tag", async ({ page }) => {
  await openSample(page);
  await page.getByRole("link", { name: "Search" }).click();
  await page.getByLabel("Search notes").fill("SUBSTITUTIONS");
  await expect(page.getByText("2 notes in 2 interviews")).toBeVisible();
  await expect(page.locator("mark").first()).toHaveText(/substitutions/i);
  await page.getByLabel("Search notes").fill('"delivery time" #checkout');
  await expect(page.getByText("2 notes in 2 interviews")).toBeVisible();
  await page.getByLabel("Search notes").fill("#nothing");
  await expect(page.getByText("No tag called #nothing")).toBeVisible();
  await page.getByLabel("Search notes").fill("jonas");
  await expect(page.getByText("4 notes in 1 interview")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Search notes")).toHaveValue("jonas");
  await page.getByRole("link", { name: /▶ 0:23/ }).click();
  await expect(page.getByRole("heading", { name: "Basket checkout · Session 2" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Playhead" })).toHaveAttribute("aria-valuetext", /^0:2[23] of 0:42$/);
});

test("spellings of one tag are offered for merging", async ({ page }) => {
  await openSample(page);
  await page.getByText("Basket checkout · Session 2").click();
  const first = page.getByRole("listitem").filter({ hasText: "lunch break" });
  await first.getByRole("button", { name: "+ Tag" }).click();
  await first.getByLabel("Add a tag").fill("check-out");
  await first.getByLabel("Add a tag").press("Enter");
  await expect(first).toContainText("#check-out");
  await page.getByRole("link", { name: "Search" }).click();
  await expect(page.getByText("#check-out and #Checkout look like one tag.")).toBeVisible();
  await page.getByRole("button", { name: "Merge into #Checkout" }).click();
  await expect(page.getByText("look like one tag")).toHaveCount(0);
  await expect(page.getByRole("listitem").filter({ has: page.getByLabel("Rename #Checkout") })).toContainText("5 notes");
});

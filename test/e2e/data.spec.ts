import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { openSample } from "./helpers.ts";

test("a shareable report codes names and leaves out team-only consent", async ({ page }) => {
  await openSample(page);
  await page.getByRole("link", { name: "Data" }).click();
  const preview = page.getByLabel("Report preview");
  await expect(preview).toContainText("names replaced with codes");
  await expect(preview).toContainText("P1 lost a slot this way before");
  await expect(preview).not.toContainText("Maya");
  await expect(preview).not.toContainText("Jonas");
  await expect(preview).toContainText("1 not quoted for consent");
  await page.getByLabel(/For people outside the team/).uncheck();
  await expect(preview).toContainText("— Jonas, Basket checkout · Session 2");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download report (.md)" }).click();
  expect((await download).suggestedFilename()).toMatch(/^findings-\d{4}-\d{2}-\d{2}\.md$/);
});

test("a study file opens in another browser, and media is reconnected there", async ({ page, browser }) => {
  await openSample(page);
  await page.getByRole("link", { name: "Data" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download study" }).click();
  const path = await (await download).path();
  const json = await readFile(path!, "utf8");
  expect(JSON.parse(json)).toMatchObject({ format: "interview-replay-study", version: 1 });

  const other = await browser.newPage();
  await other.goto("/#/data");
  await other.getByLabel("Study file to open").setInputFiles({ name: "not-a-study.json", mimeType: "application/json", buffer: Buffer.from('{"hello":1}') });
  await expect(other.getByRole("alert")).toContainText("wasn't exported from Interview Replay");
  await other.getByLabel("Study file to open").setInputFiles({ name: "study.json", mimeType: "application/json", buffer: Buffer.from(json) });
  await other.getByRole("link", { name: /Interviews/ }).click();
  await expect(other.getByText("File needed")).toHaveCount(2);
  await other.getByText("Basket checkout · Session 2").click();
  const audio = await (await other.request.get("/samples/basket-session-2.m4a")).body();
  await other.getByLabel("File for Basket checkout · Session 2").setInputFiles({ name: "renamed-on-another-laptop.m4a", mimeType: "audio/mp4", buffer: audio });
  await expect(other.getByText("Kept in this browser")).toBeVisible();
  await expect(other.getByRole("listitem").filter({ hasText: "lunch break" })).toBeVisible();
  await other.close();
});

test("deleting a participant removes their sessions and their name everywhere", async ({ page }) => {
  await openSample(page);
  await page.getByRole("link", { name: "Data" }).click();
  await page.getByRole("listitem").filter({ hasText: /^Jonas/ }).getByRole("button", { name: "Delete their data" }).click();
  await expect(page.getByRole("dialog")).toContainText("Their recording and its stored file, 4 notes, 1 clip and 3 citations go");
  await page.getByRole("button", { name: "Delete everything about them" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: /^Jonas/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Report preview")).not.toContainText("Jonas");
  expect(await page.evaluate(() => new Promise<number>(resolve => { const r = indexedDB.open("interview-replay"); r.onsuccess = () => { const g = r.result.transaction("media").objectStore("media").count(); g.onsuccess = () => resolve(g.result); }; }))).toBe(1);
  await page.getByRole("link", { name: /Findings/ }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "delivery slot disappears" }).first()).toContainText("One participant · 2 moments");
});

import { expect, test } from "@playwright/test";
import { noHorizontalScroll, openSample, setTheme, silentWav } from "./helpers.ts";

test("the sample study opens, survives a reload and works in both themes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await openSample(page);
  await expect(page.getByText("Maya · 0:56 · 5 notes")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Jonas · 0:42 · 4 notes")).toBeVisible();
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme);
    await expect(page.locator("html")).toHaveClass(theme);
    await noHorizontalScroll(page);
  }
  expect(errors).toEqual([]);
});

test("import needs consent; an unstored file is asked for again and recognised after a move", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Import recording" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Import a recording" });
  await dialog.getByLabel("Recording file").setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF") });
  await expect(dialog.getByRole("alert")).toContainText("is not an audio or video file");
  await dialog.getByLabel("Recording file").setInputFiles({ name: "lena-call.wav", mimeType: "audio/wav", buffer: silentWav(90) });
  await expect(dialog.getByText("lena-call.wav")).toBeVisible();
  await expect(dialog.getByText("1:30")).toBeVisible();
  await dialog.getByRole("textbox", { name: /^Participant/ }).fill("Lena");
  const importButton = page.getByRole("button", { name: "Import", exact: true });
  await expect(importButton).toBeDisabled();
  await dialog.getByLabel("Lena agreed to be recorded and to this use.").check();
  await dialog.getByLabel(/Keep a copy of the file/).uncheck();
  await importButton.click();
  await expect(page.getByRole("heading", { name: "lena-call" })).toBeVisible();
  await expect(page.getByText("This visit only", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("This recording's file isn't in this browser")).toBeVisible();
  const chooser = page.getByLabel("File for lena-call");
  await chooser.setInputFiles({ name: "other.wav", mimeType: "audio/wav", buffer: silentWav(20) });
  await expect(page.getByRole("alert")).toContainText("other.wav (0:20) isn't this recording: expected lena-call.wav (1:30).");
  await chooser.setInputFiles({ name: "lena-final.wav", mimeType: "audio/wav", buffer: silentWav(90) });
  await expect(page.getByText("Kept in this browser")).toBeVisible();
  await page.reload();
  await expect(page.locator("audio")).toHaveCount(1);
  await expect(page.getByText("This recording's file isn't in this browser")).toHaveCount(0);
});

test("a re-export of the same length is used only after asking", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Import recording" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Import a recording" });
  await dialog.getByLabel("Recording file").setInputFiles({ name: "call.wav", mimeType: "audio/wav", buffer: silentWav(30) });
  await dialog.getByRole("textbox", { name: /^Participant/ }).fill("P7");
  await dialog.getByLabel("P7 agreed to be recorded and to this use.").check();
  await dialog.getByLabel(/Keep a copy of the file/).uncheck();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByRole("heading", { name: "call" })).toBeVisible();
  await page.reload();
  await page.getByLabel("File for call").setInputFiles({ name: "call-v2.wav", mimeType: "audio/wav", buffer: silentWav(30, 8000, 3) });
  await expect(page.getByRole("dialog", { name: "Use this version?" })).toBeVisible();
  await page.getByRole("button", { name: "Use this file" }).click();
  await expect(page.getByText("Kept in this browser")).toBeVisible();
});

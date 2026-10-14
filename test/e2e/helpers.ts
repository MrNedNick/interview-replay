import { expect, type Page } from "@playwright/test";

/** A silent mono WAV of the given length — a recording the browser can measure and play. */
export function silentWav(seconds: number, rate = 8000, fill = 0): Buffer {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(fill, 44 + i * 2);
  return buf;
}

export async function openSample(page: Page) {
  await page.goto("/");
  await expect(page.getByText("No interviews yet")).toBeVisible();
  await page.getByRole("button", { name: "Try the sample study" }).click();
  await expect(page.getByText("Basket checkout · Session 2")).toBeVisible();
}

export async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

export async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate(t => localStorage.setItem("interview-replay-theme", t), theme);
  await page.reload();
}

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: "http://127.0.0.1:4320",
    trace: "retain-on-failure",
    // Recordings play during the scenarios; nothing should be heard.
    launchOptions: { args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required"] },
  },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { browserName: "chromium", hasTouch: true, viewport: { width: 360, height: 800 } } },
  ],
  webServer: {
    command: process.env.INTERVIEW_REPLAY_DEMO === "1" ? "npx vite preview --outDir artifacts/demo --host 127.0.0.1 --port 4320 --strictPort" : "npx vite preview --host 127.0.0.1 --port 4320 --strictPort",
    url: "http://127.0.0.1:4320",
    reuseExistingServer: false,
  },
});

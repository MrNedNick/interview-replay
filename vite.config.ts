import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/interview-replay/" : "/",
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    exclude: ["test/e2e/**", "node_modules/**"],
    setupFiles: ["test/setup.ts"],
  },
});

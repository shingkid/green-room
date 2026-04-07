import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import ViteYaml from "@modyfi/vite-plugin-yaml";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "/green-room/",
  plugins: [react(), ViteYaml()],
  resolve: {
    alias: {
      "@app": resolve(ROOT_DIR, "src/app"),
      "@domain": resolve(ROOT_DIR, "src/domain"),
      "@features": resolve(ROOT_DIR, "src/features"),
      "@shared": resolve(ROOT_DIR, "src/shared"),
      "@styles": resolve(ROOT_DIR, "src/styles"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/vite-env.d.ts", "src/app/main.tsx"],
      thresholds: {
        lines: 70,
        functions: 70,
        // Branch threshold is temporarily lower while branch-heavy interaction paths are
        // incrementally covered in follow-up test hardening.
        branches: 55,
        statements: 70,
      },
    },
  },
});

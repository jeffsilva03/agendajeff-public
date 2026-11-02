import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@motor": path.resolve(import.meta.dirname, "supabase/functions/_shared/motor/index.ts"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
      "@": path.resolve(import.meta.dirname),
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
});

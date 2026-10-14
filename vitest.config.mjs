import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Each test file gets a fresh module registry so process.env mutations
    // in one describe block don't bleed into another.
    isolate: true,
    // Mock `server-only` so it doesn't throw in the Vitest Node environment.
    // In production Next.js builds, `server-only` triggers a bundler error
    // when imported from a client bundle — the mock preserves that intent
    // while allowing unit tests to import the modules normally.
    alias: {
      "server-only": resolve(import.meta.dirname, ".bob/test-mocks/server-only.ts"),
    },
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "."),
      // Duplicate the server-only mock for resolve-time aliasing (ensures
      // both static and dynamic imports are intercepted).
      "server-only": resolve(import.meta.dirname, ".bob/test-mocks/server-only.ts"),
    },
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      // Measure the hand-written source only; generated protobuf code (src/gen)
      // and the vendored extractor are not meaningful coverage targets.
      include: ["src/**/*.ts"],
      exclude: ["src/gen/**", "src/**/*.d.ts", "vendor/**", "tests/**"],
      // Floor chosen just under the current measured baseline (lines ~53%,
      // statements ~52%, functions ~60%, branches ~47%); raise as coverage grows.
      thresholds: {
        lines: 50,
        statements: 50,
        functions: 55,
        branches: 45,
      },
    },
  },
});

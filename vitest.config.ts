import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/tests/**/*.spec.ts", "apps/*/tests/**/*.spec.ts", "integrations/deepseek-harness/runtime/tests/**/*.spec.ts"],
    // Several suites launch HTTP processes and durable SQLite databases. Bound
    // file concurrency so those checks do not compete with every CPU at once.
    // Hosted Windows runners also start bounded PDF child processes. Run files
    // serially there so concurrent hashing/database work cannot consume their
    // parsing deadline; retain the actual production parser time limit.
    maxWorkers: process.env.CI && process.platform === 'win32' ? 1 : 2,
    // These suites start a real HTTP server, migrate a fresh database and log in
    // several accounts before asserting anything. On a two-core hosted runner
    // that setup alone can cross the five-second default, which shows up as a
    // different "timeout" test on each run. The bound is on the harness, not on
    // the behaviour under test: a genuinely hung test still fails.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

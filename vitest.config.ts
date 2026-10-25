import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The real update check goes to the npm registry: commands under test must never do that.
    env: {CLOSEYOURIT_NO_UPDATE_CHECK: '1'},
    // Coverage gate on core (src/lib + src/errors + src/base.ts) AND on the oclif commands
    // (src/commands/**), covered by per-command tests (test/cmd-*.test.ts) and by the cross-command
    // json/null branches (test/cmd-branches.test.ts).
    // Thresholds = ratchet: ONLY raise them. Real baseline 2026-07-02: lines/statements 98.95,
    // functions 98.21, branches 92.75 (src/commands 100% branch; the remaining branch gap lives in
    // src/lib — api.ts/device-flow.ts). The floors below leave a safety margin.
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/errors/**', 'src/base.ts', 'src/commands/**'],
      thresholds: {
        lines: 95,
        statements: 95,
        functions: 95,
        branches: 90,
      },
    },
  },
})

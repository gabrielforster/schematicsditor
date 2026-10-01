import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // UI tests opt into jsdom with a `// @vitest-environment jsdom` first line.
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})

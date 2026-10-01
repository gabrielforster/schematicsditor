import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
// GitHub Pages serves the site from /<repo>/; test the build the same way.
const BASE_PATH = '/schematicsditor/'

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}${BASE_PATH}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Headless Chromium has no GPU: WebGL runs on SwiftShader, which
        // newer Chromium only enables with the "unsafe" opt-in.
        launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
  ],
  webServer: {
    // The production build (relative asset paths, `base: './'`), served under a sub-path.
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort --base ${BASE_PATH}`,
    url: `http://localhost:${PORT}${BASE_PATH}`,
    // Always rebuild: a server left running on the port would serve a stale build.
    reuseExistingServer: false,
    timeout: 120_000,
  },
})

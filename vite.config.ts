import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  // three.js, deepslate and the bundled block data make one ~850 kB main chunk; that is expected.
  build: { chunkSizeWarningLimit: 1200 },
})

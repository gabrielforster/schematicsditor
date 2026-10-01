import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  // three.js, deepslate, React and the bundled block data make one ~1 MB main chunk; that is expected.
  build: { chunkSizeWarningLimit: 1400 },
})

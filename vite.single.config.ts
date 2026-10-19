// Builds the whole app into ONE self-contained HTML file. Opened on its own it runs the demo;
// copied into Apps Script as Index.html (npm run build:apps-script) it is the real app.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  build: { outDir: 'dist-single', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 5000 },
})

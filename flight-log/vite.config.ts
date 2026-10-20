import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Stamp the service worker with a build id so each deploy gets a fresh app cache. */
const stampServiceWorker = () => ({
  name: 'stamp-sw',
  closeBundle() {
    const p = resolve(__dirname, 'dist/sw.js');
    if (existsSync(p)) writeFileSync(p, readFileSync(p, 'utf8').replace('__BUILD__', Date.now().toString(36)));
  },
});

// `base: './'` makes the build work from any sub-path, e.g. https://<user>.github.io/<repo>/
export default defineConfig({
  base: './',
  plugins: [react(), stampServiceWorker()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          map: ['d3-geo', 'd3-zoom', 'd3-selection', 'd3-transition', 'topojson-client'],
        },
      },
    },
  },
  test: { environment: 'node' },
} as any);

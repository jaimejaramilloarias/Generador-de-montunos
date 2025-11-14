import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

const repoBase = process.env.GITHUB_REPOSITORY?.split('/')?.[1];

export default defineConfig(() => ({
  root: resolve(__dirname, '.'),
  base: process.env.GHPAGES_BASE ?? (repoBase ? `/${repoBase}/` : '/'),
  build: {
    outDir: resolve(__dirname, '../docs'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/tone')) {
            return 'tone';
          }
          if (id.includes('node_modules/@tonejs/midi')) {
            return 'midi';
          }
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  optimizeDeps: {
    exclude: ['tone'],
  },
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/e2e/**'],
    environment: 'jsdom',
    restoreMocks: true,
  },
}));

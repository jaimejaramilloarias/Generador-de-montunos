import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

const DEFAULT_REPO_BASE = 'Generador-de-montunos';

export default defineConfig(({ command }) => {
  const envBase = process.env.GHPAGES_BASE ?? process.env.PUBLIC_URL;
  const base = command === 'serve' ? '/' : envBase ?? `/${DEFAULT_REPO_BASE}/`;

  return {
    root: resolve(__dirname, '.'),
    base,
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
      fs: {
        allow: [resolve(__dirname, '..')],
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, '../shared'),
      },
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
  };
});

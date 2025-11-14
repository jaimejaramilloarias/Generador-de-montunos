import { defineConfig } from 'vite';
import { resolve } from 'path';

const repoBase = process.env.GITHUB_REPOSITORY?.split('/')?.[1];

export default defineConfig(({ mode }) => ({
  root: resolve(__dirname, '.'),
  base: process.env.GHPAGES_BASE ?? (repoBase ? `/${repoBase}/` : '/'),
  build: {
    outDir: resolve(__dirname, '../docs'),
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
}));

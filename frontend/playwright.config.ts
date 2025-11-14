import { defineConfig, devices } from '@playwright/test';

const DEFAULT_REPO_BASE = 'Generador-de-montunos';

function normalizeBasePath(value?: string | null): string {
  if (!value || value.trim().length === 0) {
    return `/${DEFAULT_REPO_BASE}/`;
  }

  const trimmed = value.trim();
  if (trimmed === '/') {
    return '/';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

const basePath = normalizeBasePath(process.env.GHPAGES_BASE ?? process.env.PUBLIC_URL);
const baseURL = `http://127.0.0.1:4173${basePath === '/' ? '' : basePath}`;
const previewCommand = [
  'npm run preview -- --host 127.0.0.1 --port 4173',
  basePath === '/' ? '' : `--base ${basePath}`,
]
  .filter(Boolean)
  .join(' ');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    trace: 'on-first-retry',
    headless: true,
  },
  webServer: {
    command: previewCommand,
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
  projects: [
    {
      name: 'chromium',
      use: devices['Desktop Chrome'],
    },
  ],
});

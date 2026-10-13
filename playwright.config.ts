import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'e2e',
    timeout: 60_000,
    retries: 1,
    expect: { timeout: 15_000 },
    use: {
        baseURL: 'http://127.0.0.1:5185',
        viewport: { width: 1200, height: 800 },
    },
    webServer: {
        command: 'npx vite --config demo/vite.config.ts --host 127.0.0.1 --port 5185 --strictPort',
        url: 'http://127.0.0.1:5185',
        reuseExistingServer: true,
    },
});

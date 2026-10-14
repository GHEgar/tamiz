import { chromium, test as base, type Browser } from '@playwright/test';

const CDP = process.env.CDP_URL ?? 'http://127.0.0.1:9222';

async function cdpAvailable(): Promise<boolean> {
    try {
        const response = await fetch(`${CDP}/json/version`, { signal: AbortSignal.timeout(500) });
        return response.ok;
    } catch {
        return false;
    }
}

export const test = base.extend<object, { browser: Browser }>({
    browser: [async ({ playwright }, use) => {
        const browser = await cdpAvailable()
            ? await chromium.connectOverCDP(CDP)
            : await playwright.chromium.launch();
        await use(browser);
        await browser.close();
    }, { scope: 'worker' }],
});

export { expect } from '@playwright/test';

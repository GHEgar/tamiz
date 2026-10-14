import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const CENTER = [-98, 39] as const;
const RESOLUTION = 156543.03392804097 / 16;

const mercator = (lon: number, lat: number): [number, number] => [
    lon * 20037508.342789244 / 180,
    Math.log(Math.tan((90 + lat) * Math.PI / 360)) * 6378137,
];

async function pointOf(page: Page, lon: number, lat: number) {
    const box = await page.getByTestId('map').boundingBox();
    if (!box) {
        throw new Error('map has no box');
    }
    const [cx, cy] = mercator(...CENTER);
    const [x, y] = mercator(lon, lat);
    const point = { x: box.x + box.width / 2 + (x - cx) / RESOLUTION, y: box.y + box.height / 2 - (y - cy) / RESOLUTION };
    expect(point.x).toBeGreaterThan(box.x);
    expect(point.x).toBeLessThan(box.x + box.width);
    expect(point.y).toBeGreaterThan(box.y);
    expect(point.y).toBeLessThan(box.y + box.height);
    return point;
}

async function clickMap(page: Page, lon: number, lat: number, modifier?: 'Control' | 'Shift') {
    const point = await pointOf(page, lon, lat);
    if (modifier) {
        await page.keyboard.down(modifier);
    }
    await page.mouse.click(point.x, point.y);
    if (modifier) {
        await page.keyboard.up(modifier);
    }
}

const total = (page: Page, count: number) => expect(page.getByTestId('pager')).toContainText(`· ${count} records`);

const selected = (page: Page, count: number) =>
    expect(page.getByRole('checkbox', { name: /Selected only/ })).toHaveAccessibleName(`Selected only (${count})`);

async function filterBy(page: Page, column: string, op: string, value?: string) {
    await page.getByLabel('Column').selectOption(column);
    await page.getByLabel('Operator').selectOption(op);
    if (value !== undefined) {
        await page.getByLabel('Value').fill(value);
        await page.getByRole('button', { name: 'Filter', exact: true }).click();
    }
}

const names = (page: Page) => page.locator('[data-testid=grid] tbody td[data-column=STATE_NAME]');

test.beforeEach(async ({ page }) => {
    await page.route(/tile\.openstreetmap\.org/, route => route.abort());
    await page.goto('/');
    await total(page, 49);
});

test('sorts and pages the layer', async ({ page }) => {
    const header = page.locator('th[data-column=STATE_NAME]');
    await header.click();
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    await expect(names(page).first()).toHaveText('Arizona');
    await header.click();
    await expect(names(page).first()).toHaveText('Wyoming');
    await page.getByTestId('pager').getByRole('button', { name: '›' }).click();
    await expect(page.getByTestId('pager')).toContainText('Page 2 of 2');
    await expect(names(page)).toHaveCount(24);
});

test('escapes wildcards in text filters', async ({ page }) => {
    await filterBy(page, 'STATE_NAME', 'contains', '%');
    await total(page, 0);
    await filterBy(page, 'STATE_NAME', 'equals', 'new_york');
    await total(page, 0);
    await filterBy(page, 'STATE_NAME', 'contains', 'new');
    await total(page, 4);
    await expect(page.getByTestId('chips')).toContainText('STATE_NAME contains “new”');
});

test('offers distinct values for the list filter', async ({ page }) => {
    await filterBy(page, 'SUB_REGION', 'list');
    const list = page.getByTestId('list');
    await expect(list).toHaveAttribute('data-status', 'ready');
    await expect(list.getByRole('checkbox')).toHaveCount(9);
    await list.getByLabel('Pacific').check();
    await list.getByLabel('Search value').fill('mt');
    await expect(list.getByRole('checkbox')).toHaveCount(1);
    await list.getByLabel('Mtn').check();
    await list.getByRole('button', { name: 'Filter (2)' }).click();
    await total(page, 11);
});

test('asks distinct values through WPS', async ({ page }) => {
    await page.goto('/?distinct=wps');
    await total(page, 49);
    const wps = page.waitForRequest(request => request.url().includes('/wps') && request.method() === 'POST');
    await filterBy(page, 'SUB_REGION', 'list');
    await wps;
    await expect(page.getByTestId('list').getByRole('checkbox')).toHaveCount(9);
});

test('applies custom CQL and the WMS follows it', async ({ page }) => {
    const wms = page.waitForRequest(request => request.url().includes('/wms') && request.url().includes('CQL_FILTER=PERSONS'));
    await page.getByTestId('cql').fill('PERSONS > 10000000');
    await page.getByRole('button', { name: 'Apply CQL' }).click();
    await total(page, 6);
    await expect(page.getByTestId('chips')).toContainText('Custom CQL');
    await wms;
});

test('selects on the map with click, Ctrl and Shift', async ({ page }) => {
    await clickMap(page, -98, 39);
    await selected(page, 1);
    await clickMap(page, -99.5, 41.5, 'Control');
    await selected(page, 2);
    await clickMap(page, -99, 31.5, 'Shift');
    await selected(page, 3);
    await clickMap(page, -99.5, 41.5, 'Control');
    await selected(page, 2);
    await page.getByRole('checkbox', { name: /Selected only/ }).check();
    await total(page, 2);
    await expect(names(page)).toHaveText(['Kansas', 'Texas']);
    await clickMap(page, -99, 31.5);
    await selected(page, 1);
    await clickMap(page, -104, 28);
    await selected(page, 0);
});

test('selects rows in the table', async ({ page }) => {
    const rows = page.locator('[data-testid=grid] tbody tr');
    await rows.nth(0).click();
    await rows.nth(3).click({ modifiers: ['Shift'] });
    await selected(page, 4);
    await rows.nth(1).click({ modifiers: ['Control'] });
    await selected(page, 3);
    await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'false');
});

test('downloads the filtered layer as CSV', async ({ page }) => {
    await filterBy(page, 'STATE_NAME', 'contains', 'new');
    await total(page, 4);
    let body = '';
    await page.route(/outputFormat=csv/, async route => {
        const response = await route.fetch();
        body = await response.text();
        await route.fulfill({ response, body });
    });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'csv' }).click();
    await expect.poll(() => body.trim().split('\n').length).toBe(5);
    expect(body).toContain('New York');
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);
});

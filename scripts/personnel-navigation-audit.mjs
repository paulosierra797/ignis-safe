import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { installResponsiveFixtures } from '../tests/fixtures/responsive-layout.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:5176';
const output = path.resolve(process.env.AUDIT_OUTPUT || '.release-work.local/personnel-navigation');
const devices = [
  { name: 'small-phone', width: 320, height: 568 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'ipad', width: 768, height: 1024 },
  { name: 'ipad-landscape', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
];

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });

try {
  for (const device of devices) {
    const context = await browser.newContext({ viewport: device, reducedMotion: 'reduce' });
    await installResponsiveFixtures(context);
    const page = await context.newPage();
    const errors = [];
    const importRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (request.url().includes('/personnel-import/')) importRequests.push(request.url());
    });
    const ready = async route => {
      await page.goto(`${baseUrl}${route}`);
      await page.getByRole('tab', { name: 'Personnel Directory', exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
    };
    const assertDirectory = async () => {
      await page.locator('#accounts-tabpanel-personnel').waitFor();
      assert.equal(await page.getByRole('tab', { name: 'Personnel Directory', exact: true }).getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('#accounts-tabpanel-schedule').count(), 0);
      assert.equal(await page.getByRole('button', { name: /Import Personnel/ }).count(), 0);
      assert.equal(await page.locator('input[type="file"]').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    };

    await ready('/dashboard/accounts');
    await assertDirectory();
    assert.deepEqual(await page.getByRole('tablist', { name: 'Personnel module sections' }).getByRole('tab').allTextContents(), [
      'Personnel Directory', 'Personnel Schedule', 'Leave Requests', 'Profile Change Requests',
    ]);
    await page.screenshot({ path: path.join(output, `${device.name}-directory.png`) });

    await page.getByRole('tab', { name: 'Personnel Schedule', exact: true }).click();
    await page.locator('#accounts-tabpanel-schedule').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('tab'), 'schedule');
    await page.getByRole('button', { name: 'Set Shift Dates', exact: true }).waitFor();
    if (device.width <= 900) await page.getByRole('button', { name: 'Toggle navigation menu', exact: true }).click();
    await page.locator('.sidebar').getByRole('link', { name: 'Personnel', exact: true }).click();
    await assertDirectory();
    assert.equal(new URL(page.url()).search, '');
    if (device.width <= 900) await page.locator('.sidebar-backdrop').waitFor({ state: 'hidden' });

    await page.getByRole('button', { name: 'Add Personnel', exact: true }).click();
    await page.locator('#personnel-first-name').fill('Maria');
    await page.getByRole('button', { name: 'Close add personnel modal', exact: true }).click();
    await page.getByRole('heading', { name: 'Discard unsaved personnel details?', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Keep Editing', exact: true }).click();
    assert.equal(await page.locator('#personnel-first-name').inputValue(), 'Maria');
    await page.getByRole('button', { name: 'Close add personnel modal', exact: true }).click();
    await page.getByRole('button', { name: 'Discard Changes', exact: true }).click();
    await page.locator('.accounts-add-personnel-modal').waitFor({ state: 'hidden' });

    await ready('/dashboard/accounts?tab=schedule');
    await page.locator('#accounts-tabpanel-schedule').waitFor();
    await ready('/dashboard/accounts?tab=invalid');
    await assertDirectory();
    await ready('/dashboard/accounts?tab=personnel');
    await assertDirectory();
    assert.deepEqual(importRequests, []);
    assert.deepEqual(errors, []);
    console.log(`PASS ${device.name}: directory first/default, sidebar navigation, no import, existing form safeguards`);
    await context.close();
  }
} finally {
  await browser.close();
}

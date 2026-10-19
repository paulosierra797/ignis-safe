import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installResponsiveFixtures } from '../tests/fixtures/responsive-layout.mjs';
import { MOBILE_APP_RELEASE } from '../src/utils/mobileAppRelease.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const qrRequire = process.env.QR_DECODER_PACKAGE
  ? createRequire(path.resolve(process.env.QR_DECODER_PACKAGE)) : require;
const jsQR = qrRequire('jsqr');
const { PNG } = qrRequire('pngjs');
const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:5185';
const output = path.resolve('.release-work.local/apk-trends-audit');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const sizes = [
  { width: 320, height: 740 }, { width: 390, height: 844 },
  { width: 820, height: 1180 }, { width: 1440, height: 1000 },
];

try {
  for (const viewport of sizes) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce', hasTouch: true });
    await installResponsiveFixtures(context);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    console.log(`START ${viewport.width}`);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    const trends = page.locator('#trends');
    await trends.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelectorAll('#trends canvas').length === 3);
    await page.evaluate(() => document.fonts.ready);
    console.log(`READY ${viewport.width}`);
    const track = page.locator('.trends-grid');
    const previous = page.getByRole('button', { name: 'Previous graph', exact: true });
    const next = page.getByRole('button', { name: 'Next graph', exact: true });

    const layout = await page.locator('.trends-figure').evaluateAll(cards => cards.map(card => {
      const rect = card.getBoundingClientRect();
      return { top: rect.top, width: rect.width, title: card.querySelector('h3').textContent };
    }));
    assert.deepEqual(layout.map(card => card.title), [
      'Participation over time', 'Registered learners over time', 'Barangays represented',
    ]);
    assert(layout.every(card => Math.abs(card.top - layout[0].top) < 1), 'Charts must stay in one row');
    assert(layout.every(card => card.width <= 449), 'Charts should remain compact');
    assert(await previous.isDisabled());
    assert(await next.isEnabled());
    await next.click();
    await page.waitForFunction(() => document.querySelector('.trends-grid').scrollLeft > 10);
    await page.screenshot({ path: path.join(output, `${viewport.width}-carousel-next.png`) });
    for (let index = 0; index < 3 && await next.isEnabled(); index++) {
      await next.click();
      await page.waitForTimeout(80);
    }
    assert(await next.isDisabled(), 'Next arrow must stop at the final graph');
    assert(await previous.isEnabled());
    const end = await track.evaluate(element => element.scrollLeft);
    assert(end > 10);

    const thirdTitle = page.locator('.trends-figure').nth(2).getByRole('button', { name: 'Barangays represented', exact: true });
    await thirdTitle.click();
    const info = page.locator('.trends-tip-bubble.is-info:visible');
    await info.waitFor();
    const box = await info.boundingBox();
    assert(box.x >= 0 && box.x + box.width <= viewport.width + 1, 'Chart explanation must fit the screen');
    assert(box.y >= 0 && box.y + box.height <= viewport.height + 1);
    await page.screenshot({ path: path.join(output, `${viewport.width}-chart-details.png`) });
    await page.keyboard.press('Escape');
    await track.focus();
    await page.keyboard.press('Home');
    await page.waitForFunction(() => document.querySelector('.trends-grid').scrollLeft < 2);
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('.trends-grid').scrollLeft > 10);
    await page.keyboard.press('Home');
    await page.waitForFunction(() => document.querySelector('.trends-grid').scrollLeft < 2);

    await track.scrollIntoViewIfNeeded();
    const dragBox = await page.locator('.trends-chart').first().boundingBox();
    const startX = Math.min(viewport.width - 35, dragBox.x + dragBox.width - 30);
    const y = dragBox.y + dragBox.height / 2;
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(35, y, { steps: 15 });
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('.trends-grid').scrollLeft > 10);
    assert.equal(await track.evaluate(element => element.classList.contains('is-dragging')), false);

    await track.focus();
    await page.keyboard.press('Home');
    await page.waitForFunction(() => document.querySelector('.trends-grid').scrollLeft < 2);
    const touchBox = await page.locator('.trends-chart').first().boundingBox();
    const session = await context.newCDPSession(page);
    const touchX = Math.min(viewport.width - 30, touchBox.x + touchBox.width - 20);
    const touchY = touchBox.y + touchBox.height / 2;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchX, y: touchY }] });
    for (let index = 1; index <= 12; index++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchX - (touchX - 20) * index / 12, y: touchY }] });
      await page.waitForTimeout(20);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(() => document.querySelector('.trends-grid').scrollLeft > 10);
    await page.waitForTimeout(600);
    await session.detach();

    const charts = await page.locator('#trends canvas').evaluateAll(canvases => canvases.map(canvas => {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let ink = 0;
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) ink++;
      return ink;
    }));
    assert(charts.every(pixels => pixels > 100), 'Every graph must be nonblank');
    assert.equal(await trends.locator('table').count(), 3, 'Keep accessible data tables');
    assert(await page.locator('.trends-coverage-track').count());

    await page.locator('.trends-brand-trigger').scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.locator('.trends-brand-trigger').hover();
    const hoverDownload = page.locator('.trends-brand-download:visible');
    await hoverDownload.waitFor();
    assert.equal(await hoverDownload.getAttribute('href'), MOBILE_APP_RELEASE.downloadUrl);
    await page.screenshot({ path: path.join(output, `${viewport.width}-hover-download.png`) });
    await hoverDownload.hover();
    assert(await hoverDownload.isVisible(), 'Hover download must stay reachable');
    await page.keyboard.press('Escape');

    const download = page.locator('.landing-mobile-app-download');
    assert.equal(await download.getAttribute('href'), MOBILE_APP_RELEASE.downloadUrl);
    const qr = page.locator('.landing-mobile-app-qr svg');
    await qr.scrollIntoViewIfNeeded();
    const qrFile = path.join(output, `${viewport.width}-qr.png`);
    await qr.screenshot({ path: qrFile, scale: 'css' });
    const png = PNG.sync.read(await readFile(qrFile));
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    assert.equal(decoded?.data, MOBILE_APP_RELEASE.downloadUrl, 'QR must encode the same current APK URL');
    if (viewport.width === 1440 && process.env.AUDIT_APK_SHA256) {
      const downloaded = page.waitForEvent('download', { timeout: 60000 });
      await download.click();
      const file = await downloaded;
      assert.equal(file.suggestedFilename(), MOBILE_APP_RELEASE.fileName);
      const destination = path.join(output, 'button-download.apk');
      await file.saveAs(destination);
      const digest = createHash('sha256').update(await readFile(destination)).digest('hex');
      assert.equal(digest, process.env.AUDIT_APK_SHA256.toLowerCase());
      console.log(`PASS actual button download SHA-256: ${digest}`);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(overflow <= 1, `Unexpected page overflow: ${overflow}px`);
    assert.deepEqual(errors, []);
    results.push({ viewport, passed: true, charts, qr: decoded.data, mouseDrag: true, touchSwipe: true });
    console.log(`PASS ${viewport.width}: charts, arrows, keyboard, mouse drag, touch swipe, tooltips, download links, QR`);
    await context.close();
  }

  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'no-preference' });
    await installResponsiveFixtures(context);
    if (width === 390) {
      await context.addInitScript(() => localStorage.setItem('ignis-safe:landing-language', 'tagalog'));
    }
    const page = await context.newPage();
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('.trends-carousel').scrollIntoViewIfNeeded();
    const next = page.getByRole('button', { name: width === 390 ? 'Susunod na graph' : 'Next graph', exact: true });
    for (let index = 0; index < 3; index++) {
      const card = page.locator('.trends-figure').nth(index);
      await page.waitForFunction(element => getComputedStyle(element).visibility !== 'hidden'
        && Number(getComputedStyle(element).opacity) > 0.9, await card.elementHandle());
      if (index < 2 && await next.isEnabled()) {
        await next.click();
        await page.waitForTimeout(1000);
      }
    }
    await page.screenshot({ path: path.join(output, `${width}-normal-motion.png`) });
    console.log(`PASS ${width} normal-motion reveal${width === 390 ? ' and Filipino layout' : ''}`);
    await context.close();
  }
} finally {
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
}

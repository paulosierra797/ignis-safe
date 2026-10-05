import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installResponsiveFixtures } from '../tests/fixtures/responsive-layout.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:5176';
const output = path.resolve(process.env.AUDIT_OUTPUT || '.release-work.local/responsive-interactions');
const sizes = [
  { name: 'small-phone', width: 320, height: 568 },
  { name: 'iphone', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
  { name: 'ipad-portrait', width: 768, height: 1024 },
  { name: 'ipad-air-portrait', width: 820, height: 1180 },
  { name: 'ipad-landscape', width: 1024, height: 768 },
  { name: 'laptop', width: 1366, height: 768 },
];
const devices = process.env.AUDIT_DEVICES ? sizes.filter(d => process.env.AUDIT_DEVICES.split(',').includes(d.name)) : sizes;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
await mkdir(output, { recursive: true });

async function ready(page, route) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.app-route-loader').waitFor({ state: 'hidden' });
  await page.locator('#root > *').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function fits(page, selector, { vertical = false } = {}) {
  const data = await page.locator(selector).first().evaluate((el, vertical) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight, vertical, overflow: el.scrollWidth - el.clientWidth };
  }, vertical);
  assert(data.left >= -2 && data.right <= data.width + 2, `${selector} is outside screen: ${JSON.stringify(data)}`);
  if (vertical) assert(data.top >= -2 && data.bottom <= data.height + 2, `${selector} exceeds screen height: ${JSON.stringify(data)}`);
  assert(data.overflow <= 2, `${selector} clips content by ${data.overflow}px`);
}

async function checkPage(page) {
  const issues = await page.evaluate(() => {
    const isVisible = el => {
      if (!el.getClientRects().length) return false;
      if (innerWidth <= 900 && el.closest('.sidebar:not(.sidebar--mobile-open)')) return false;
      for (let p = el; p; p = p.parentElement) {
        const css = getComputedStyle(p);
        if (css.display === 'none' || css.visibility === 'hidden' || Number(css.opacity) === 0) return false;
      }
      return true;
    };
    const scroller = el => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (['auto', 'scroll'].includes(getComputedStyle(p).overflowX) && p.scrollWidth > p.clientWidth + 2) return true;
      }
      return false;
    };
    const clipped = [...document.querySelectorAll('h1,h2,h3,h4,label,button,.responsive-select-label')].filter(isVisible).filter(el => {
      const css = getComputedStyle(el);
      return !scroller(el) && css.textOverflow !== 'ellipsis' && css.clip === 'auto' && css.clipPath === 'none' && el.scrollWidth > el.clientWidth + 2;
    }).map(el => `${el.className}: ${el.textContent.trim().slice(0, 80)}`);
    const overflowElements = [...document.querySelectorAll('*')].filter(el => !scroller(el) && el.getBoundingClientRect().right > innerWidth + 2).slice(0, 12).map(el => `${el.className} (${isVisible(el) ? 'visible' : 'hidden'}): ${el.textContent.trim().slice(0, 60)}`);
    const scrollDetails = [...document.querySelectorAll('*')].filter(el => el.scrollWidth > el.clientWidth + 2 && !scroller(el)).slice(0, 18).map(el => ({ class: String(el.className), scroll: el.scrollWidth, client: el.clientWidth, rect: el.getBoundingClientRect().toJSON() }));
    const overflow = document.documentElement.scrollWidth > innerWidth + 2;
    let pseudoDetails;
    if (overflow) {
      const style = document.createElement('style');
      style.textContent = '*::before, *::after { display: none !important; }';
      document.head.append(style);
      const withoutPseudo = document.documentElement.scrollWidth;
      style.remove();
      pseudoDetails = { withoutPseudo, sections: [...document.querySelectorAll('section,.footer')].map(el => ({ class: el.className, overflow: getComputedStyle(el).overflow, before: getComputedStyle(el, '::before').content, transform: getComputedStyle(el, '::before').transform })) };
    }
    return { overflow, clipped, overflowElements, scrollDetails, pseudoDetails };
  });
  assert(!issues.overflow, `Page scrolls sideways: ${issues.overflowElements.join('; ')} ${JSON.stringify({ scroll: issues.scrollDetails, pseudo: issues.pseudoDetails })}`);
  assert.equal(issues.clipped.length, 0, `Clipped text: ${issues.clipped.join('; ')}`);
}

try {
  for (const device of devices) {
    const context = await browser.newContext({ viewport: { width: device.width, height: device.height }, hasTouch: true, reducedMotion: 'reduce' });
    await installResponsiveFixtures(context);
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    await ready(page, '/');
    const test = async (name, run) => {
      if (process.env.AUDIT_CASES && !process.env.AUDIT_CASES.split(',').some(value => name.includes(value))) return;
      try {
        await run();
        results.push({ device: device.name, name, passed: true });
        console.log(`PASS ${device.name} ${name}`);
      } catch (error) {
        results.push({ device: device.name, name, passed: false, error: error.message });
        console.log(`FAIL ${device.name} ${name}: ${error.message}`);
      }
      await page.screenshot({ path: path.join(output, `${device.name}-${name.replaceAll(/[^a-z0-9]+/gi, '-')}.png`) });
    };

    await test('Public navigation and language', async () => {
      await ready(page, '/');
      if (await page.locator('.menu-btn').isVisible()) {
        await page.locator('.menu-btn').click();
        await page.waitForTimeout(300);
      }
      await page.locator('[aria-controls="resources-menu"]').click();
      await fits(page, '#resources-menu.open');
      await page.locator('[aria-controls="landing-language-menu"]').click();
      await fits(page, '#landing-language-menu.open');
      const languages = page.locator('#landing-language-menu [role="menuitemradio"]');
      assert(await languages.count() >= 2, 'Language choices missing');
      await languages.nth(1).click();
      assert(await page.locator('.landing-language-flag').evaluate(el => el.complete && el.naturalWidth > 0), 'Language flag did not load');
      await checkPage(page);
    });

    await test('Footer links clear the floating message button', async () => {
      await ready(page, '/');
      await page.locator('.footer-bottom').scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      const overlap = await page.evaluate(() => {
        const widget = document.querySelector('.floating-contact-button').getBoundingClientRect();
        return [...document.querySelectorAll('.footer-bottom p, .footer-bottom a')].filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.left < widget.right && rect.right > widget.left && rect.top < widget.bottom && rect.bottom > widget.top;
        }).map(el => el.textContent.trim());
      });
      assert.equal(overlap.length, 0, `Message button covers footer content: ${overlap.join(', ')}`);
      await checkPage(page);
    });

    if (device.width <= 1180) {
      await test('Public menu rotation restores scrolling', async () => {
        await ready(page, '/');
        await page.locator('.menu-btn').click();
        await page.setViewportSize({ width: 1366, height: 768 });
        await page.waitForTimeout(300);
        assert.equal(await page.evaluate(() => document.body.style.overflow), '', 'Public page stays scroll-locked after rotation');
        assert.equal(await page.locator('.landing-nav-backdrop').count(), 0);
      });
      await page.setViewportSize({ width: device.width, height: device.height });
    }

    await test('Announcement popup at two scroll positions', async () => {
      await ready(page, '/');
      const card = page.locator('.landing-announcement-card').first();
      await card.waitFor();
      for (const offset of [0, Math.min(100, device.height / 4)]) {
        await card.evaluate((el, offset) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 170 - offset), offset);
        await card.click();
        await fits(page, '.landing-announcement-modal', { vertical: true });
        await fits(page, '.landing-announcement-modal-close', { vertical: true });
        await checkPage(page);
        await page.keyboard.press('Escape');
        await page.locator('.landing-announcement-modal').waitFor({ state: 'hidden' });
      }
      await card.focus();
      await page.keyboard.press('Enter');
      await page.locator('.landing-announcement-modal-close').click();
      assert(await card.evaluate(el => document.activeElement === el), 'Focus not restored to announcement');
    });

    await test('Independent FAQ expansion', async () => {
      await ready(page, '/');
      const items = page.locator('.faq-item');
      const secondColumn = page.locator('.faq-column').nth(1).locator('.faq-item').first();
      const before = await secondColumn.evaluate(el => el.getBoundingClientRect().height);
      await items.first().locator('button').click();
      const after = await secondColumn.evaluate(el => el.getBoundingClientRect().height);
      assert(Math.abs(after - before) < 2, 'Adjacent FAQ expanded too');
      assert.equal(await page.locator('.faq-item.open').count(), 1);
      await checkPage(page);
    });

    await test('Announcement animation with normal motion', async () => {
      await ready(page, '/');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.locator('.landing-announcement-card').first().click();
      assert(await page.locator('.landing-announcement-modal').evaluate(el => el.getAnimations().some(animation => animation.effect.getTiming().duration === 360)), 'Card expansion animation missing');
      await page.waitForTimeout(450);
      await fits(page, '.landing-announcement-modal', { vertical: true });
      await page.keyboard.press('Escape');
      await page.emulateMedia({ reducedMotion: 'reduce' });
    });

    await test('Admin account menu and security dialog', async () => {
      await ready(page, '/dashboard');
      await page.locator('.page-user').click();
      await fits(page, '.page-user-dropdown', { vertical: true });
      await checkPage(page);
      await page.getByRole('menuitem', { name: 'Forget this device' }).click();
      await fits(page, '.device-dialog', { vertical: true });
      await page.locator('.device-dialog').getByRole('button', { name: /^(Cancel|Close)$/ }).click();
    });

    if (device.width <= 900) {
      await test('Sidebar opens closes and rotates', async () => {
        await ready(page, '/dashboard');
        await page.locator('.sidebar-toggle-btn').click();
        await page.waitForTimeout(300);
        await fits(page, '.sidebar', { vertical: true });
        assert.equal(await page.evaluate(() => document.body.style.position), 'fixed');
        await page.getByRole('button', { name: 'Close navigation menu' }).click({ position: { x: device.width - 10, y: device.height / 2 } });
        assert.equal(await page.evaluate(() => document.body.style.position), '');
        await page.locator('.sidebar-toggle-btn').click();
        await page.setViewportSize({ width: 1024, height: 768 });
        await page.waitForTimeout(400);
        assert.equal(await page.evaluate(() => document.body.style.position), '', 'Page remains locked after rotation');
        assert.equal(await page.locator('.sidebar-backdrop').count(), 0, 'Backdrop remains after rotation');
        await page.setViewportSize({ width: device.width, height: device.height });
      });
      await page.setViewportSize({ width: device.width, height: device.height });
    }

    await test('Personnel calendar day dialog', async () => {
      await ready(page, '/personnel/operations');
      await page.locator('.shift-calendar-day-card').first().click();
      await fits(page, '.personnel-modal', { vertical: true });
      await fits(page, '.personnel-modal-close', { vertical: true });
      await checkPage(page);
      await page.locator('.personnel-modal-close').click();
    });

    await test('Personnel account menu', async () => {
      await ready(page, '/personnel/profile');
      await page.locator('.page-user').click();
      await fits(page, '.page-user-dropdown', { vertical: true });
      await checkPage(page);
    });

    await test('Landing editor text dialog and locked images', async () => {
      await ready(page, '/dashboard/landing-page-editor');
      await page.getByRole('button', { name: 'Edit Mode', exact: true }).click();
      await page.locator('.landing-inline-page .hero-content h1').click();
      await fits(page, '.landing-inline-edit-modal', { vertical: true });
      await page.getByRole('button', { name: 'Close editor', exact: true }).click();
      await page.locator('.landing-inline-page [data-landing-edit-image]').first().click();
      assert.equal(await page.locator('.landing-inline-edit-modal').count(), 0, 'Images must not open an editor');
      assert.equal(await page.locator('.landing-visual-editor input[type=file]').count(), 0);
      assert.equal(await page.locator('.landing-admin-section-tools').count(), 0);
    });

    await test('User profile dialog and outside-city filter', async () => {
      await ready(page, '/dashboard/users');
      await page.getByRole('button', { name: 'User List', exact: true }).click();
      const location = page.locator('select').filter({ has: page.locator('option[value="outside"]') });
      await location.selectOption('outside');
      await checkPage(page);
      await location.selectOption('All');
      await page.locator('.record-actions-trigger[aria-label="Learning profile actions"]:visible').first().click();
      await fits(page, '.record-actions-menu', { vertical: true });
      await page.getByRole('menuitem', { name: 'View details' }).click();
      await fits(page, '.progress-modal', { vertical: true });
      await fits(page, '.progress-modal-close', { vertical: true });
      await checkPage(page);
      await page.locator('.progress-modal-close').click();
    });

    await test('Visitor message thread and confirmation dialog', async () => {
      await ready(page, '/dashboard/visitor-messages');
      await page.locator('.visitor-conversation-select').first().click();
      await page.locator('.visitor-thread-message').first().waitFor();
      await fits(page, '.visitor-thread-composer');
      await checkPage(page);
      const threadActions = page.getByRole('button', { name: 'Conversation actions', exact: true });
      if (await threadActions.isVisible()) await threadActions.click();
      else await page.locator('.visitor-conversation-side .record-actions-trigger:visible').first().click();
      await fits(page, '.record-actions-menu', { vertical: true });
      await page.getByRole('menuitem', { name: 'Delete conversation', exact: true }).click();
      await fits(page, '.visitor-delete-modal', { vertical: true });
      await page.locator('.visitor-delete-modal').getByRole('button', { name: 'Cancel', exact: true }).click();
      const back = page.getByRole('button', { name: 'Back to conversations', exact: true });
      if (await back.isVisible()) await back.click();
    });

    for (const route of ['/', '/portal/login', '/send-message', '/dashboard', '/dashboard/users', '/personnel/operations', '/attendance-confirm?auth=audit-attendance&station=audit-station']) {
      const languages = ['/', '/send-message'].includes(route) ? ['english', 'tagalog'] : ['english'];
      for (const language of languages) {
        await test(`Enlarged text 200 percent ${language} ${route}`, async () => {
          await page.evaluate(language => localStorage.setItem('ignis-safe:landing-language', language), language);
          await ready(page, route);
          await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
          await page.waitForTimeout(200);
          await checkPage(page);
          if (route === '/personnel/operations') {
            const calendarIssues = await page.evaluate(() => {
              const clippedWeekdays = [...document.querySelectorAll('.shift-calendar-weekdays > span')].filter(el => el.scrollWidth > el.clientWidth + 2).length;
              const clippedDays = [...document.querySelectorAll('.shift-calendar-day-card')].filter(el => {
                const card = el.getBoundingClientRect();
                const heading = el.querySelector('.shift-calendar-day-top').getBoundingClientRect();
                return heading.top < card.top || heading.bottom > card.bottom;
              }).length;
              return { clippedWeekdays, clippedDays };
            });
            assert.deepEqual(calendarIssues, { clippedWeekdays: 0, clippedDays: 0 }, 'Enlarged calendar headings do not fit');
          }
          if (route === '/' && await page.locator('.menu-btn').isVisible()) {
            await page.locator('.menu-btn').click();
            await fits(page, '#landing-navigation', { vertical: true });
            await page.locator('[aria-controls="resources-menu"]').click();
            await fits(page, '#resources-menu.open');
            await checkPage(page);
            await page.locator('[aria-controls="landing-language-menu"]').click();
            await fits(page, '#landing-language-menu.open');
            await checkPage(page);
            await page.keyboard.press('Escape');
          }
        });
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ testedAt: new Date().toISOString(), engine: 'Chromium (Chrome)', fixtureMode: true, results }, null, 2));
}
const failures = results.filter(r => !r.passed);
console.log(`Completed ${results.length} interaction/text checks; ${failures.length} failures. Results: ${output}`);
process.exitCode = failures.length ? 1 : 0;

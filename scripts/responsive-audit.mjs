import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installResponsiveFixtures } from '../tests/fixtures/responsive-layout.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:5176';
const output = path.resolve(process.env.AUDIT_OUTPUT || '.release-work.local/responsive-audit');
const devices = [
  { name: 'small-phone', width: 320, height: 568, touch: true },
  { name: 'android-phone', width: 360, height: 800, touch: true },
  { name: 'iphone', width: 390, height: 844, touch: true },
  { name: 'large-phone', width: 430, height: 932, touch: true },
  { name: 'phone-landscape', width: 844, height: 390, touch: true },
  { name: 'ipad-portrait', width: 768, height: 1024, touch: true },
  { name: 'ipad-air-portrait', width: 820, height: 1180, touch: true },
  { name: 'ipad-landscape', width: 1024, height: 768, touch: true },
  { name: 'ipad-air-landscape', width: 1180, height: 820, touch: true },
  { name: 'laptop', width: 1366, height: 768, touch: false },
  { name: 'desktop', width: 1920, height: 1080, touch: false },
];
const routes = [
  '/', '/portal/login', '/confirm-signup', '/send-message', '/terms', '/privacy', '/organizational-chart',
  '/dashboard', '/dashboard/profile', '/dashboard/analytics', '/dashboard/accounts', '/dashboard/users',
  '/dashboard/assessment-questions', '/dashboard/about-us', '/dashboard/learning-materials', '/dashboard/chart',
  '/dashboard/reports', '/dashboard/audit-logs', '/dashboard/announcements', '/dashboard/landing-page-editor', '/dashboard/visitor-messages',
  '/attendance-admin', '/attendance-personnel', '/attendance-scan', '/attendance-confirm?auth=audit-attendance&station=audit-station',
  '/personnel/operations', '/personnel/profile', '/personnel/history', '/personnel/announcements', '/reports',
];
const selectedDevices = process.env.AUDIT_DEVICES ? devices.filter(d => process.env.AUDIT_DEVICES.split(',').includes(d.name)) : devices;
const selectedRoutes = process.env.AUDIT_ROUTES ? routes.filter(r => process.env.AUDIT_ROUTES.split(',').includes(r.split('?')[0])) : routes;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
try {
  for (const device of selectedDevices) {
    const context = await browser.newContext({ viewport: { width: device.width, height: device.height }, hasTouch: device.touch, reducedMotion: 'reduce' });
    // No audit traffic, including writes, may reach a real backend.
    await installResponsiveFixtures(context);
    for (const route of selectedRoutes) {
      const page = await context.newPage();
      const errors = [];
      const errorListener = error => errors.push(error.message);
      page.on('pageerror', errorListener);
      page.on('console', message => {
        if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text());
      });
      let result;
      const slug = route.split('?')[0].replaceAll('/', '-') || '-home';
      try {
        await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
        await page.locator('#root > *').first().waitFor();
        await page.locator('.app-route-loader').waitFor({ state: 'hidden', timeout: 15000 });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(350);
        result = await page.evaluate(() => {
          const w = innerWidth;
          const visible = el => {
            if (!el.getClientRects().length || el.closest('[aria-hidden="true"], [hidden]')) return false;
            if (w <= 900 && el.closest('.sidebar:not(.sidebar--mobile-open)')) return false;
            for (let p = el; p && p !== document.body; p = p.parentElement) {
              const css = getComputedStyle(p);
              if (css.display === 'none' || css.visibility === 'hidden' || Number(css.opacity) === 0) return false;
            }
            return true;
          };
          const inScroller = el => {
            for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
              const css = getComputedStyle(p);
              if (['auto', 'scroll'].includes(css.overflowX) && p.scrollWidth > p.clientWidth + 2) return true;
            }
            return false;
          };
          const label = el => ({ tag: el.tagName, class: String(el.className || ''), text: el.textContent.trim().slice(0, 90) });
          const outside = [...document.querySelectorAll('main, section, form, header, footer, nav, [role="dialog"], input, select, textarea, button')].filter(visible).filter(el => {
            if (inScroller(el)) return false;
            const r = el.getBoundingClientRect();
            return r.right > w + 2 || r.left < -2;
          }).map(label);
          const clipped = [...document.querySelectorAll('h1, h2, h3, h4, label, button, .responsive-select-label')].filter(visible).filter(el => {
            const css = getComputedStyle(el);
            if (inScroller(el) || css.textOverflow === 'ellipsis' || css.clip !== 'auto' || css.clipPath !== 'none') return false;
            return el.scrollWidth > el.clientWidth + 2;
          }).map(label);
          const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible).map(el => {
            const r = el.getBoundingClientRect();
            return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, fits: r.left >= -1 && r.right <= w + 1 && r.top >= -1 && r.bottom <= innerHeight + 1 };
          });
          const overflowElements = document.documentElement.scrollWidth > w + 2 ? [...document.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > w + 2 && !inScroller(el)).slice(0, 12).map(el => ({ ...label(el), visible: visible(el), right: el.getBoundingClientRect().right })) : [];
          return { documentOverflow: document.documentElement.scrollWidth > w + 2, outside, clipped, dialogs, overflowElements, heading: document.querySelector('h1, h2')?.textContent?.trim(), bodyHeight: document.body.scrollHeight };
        });
        result.scrollProbes = [];
        // Some routes scroll the body rather than the window. Verify the actual scroll owner.
        for (const fraction of [0, 0.5, 1]) {
          const probe = await page.evaluate(fraction => {
            const candidates = [document.scrollingElement, document.body];
            const owner = candidates.find(el => el.scrollHeight > el.clientHeight + 2) || document.scrollingElement;
            const maximum = Math.max(0, owner.scrollHeight - owner.clientHeight);
            owner.scrollTo({ top: maximum * fraction, behavior: 'instant' });
            return { fraction, owner: owner.tagName, maximum, actual: owner.scrollTop, reached: Math.abs(owner.scrollTop - maximum * fraction) <= 2 };
          }, fraction);
          result.scrollProbes.push(probe);
          await page.waitForTimeout(80);
          if (process.env.AUDIT_SCREENSHOTS === 'all') {
            const position = fraction === 0 ? 'top' : fraction === 1 ? 'bottom' : 'middle';
            await page.screenshot({ path: path.join(output, `${device.name}${slug}-${position}.png`) });
          }
        }
      } catch (error) { result = { auditError: error.message }; }
      const issues = Boolean(result.auditError || result.documentOverflow || result.outside?.length || result.clipped?.length || result.scrollProbes?.some(probe => !probe.reached) || errors.length || result.heading === 'This page ran into a problem');
      if (issues || process.env.AUDIT_SCREENSHOTS === 'all') {
        await page.screenshot({ path: path.join(output, `${device.name}${slug}.png`), fullPage: result.scrollProbes?.[0]?.owner === 'HTML' });
      }
      results.push({ device: device.name, width: device.width, height: device.height, route, issues, ...result, errors });
      console.log(`${issues ? 'ISSUE' : 'PASS'} ${device.name} ${route}${issues ? ` ${JSON.stringify({ outside: result.outside?.length, clipped: result.clipped?.length, error: result.auditError || errors[0] })}` : ''}`);
      page.off('pageerror', errorListener);
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ testedAt: new Date().toISOString(), engine: 'Chromium (Chrome)', fixtureMode: true, results }, null, 2));
  const issues = results.filter(r => r.issues);
  console.log(`Completed ${results.length} page/device checks; ${issues.length} require inspection. Results: ${output}`);
  process.exitCode = issues.length ? 1 : 0;
}

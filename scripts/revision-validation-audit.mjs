import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installRevisionFixtures, SAMPLE_USER_ID } from '../tests/fixtures/revision-validation.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:5182';
const output = path.resolve('.release-work.local/revision-validation');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
const sizes = [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 1000 }]
  .filter(size => !process.env.AUDIT_WIDTHS || process.env.AUDIT_WIDTHS.split(',').includes(String(size.width)));

try {
  for (const viewport of sizes) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    await installRevisionFixtures(context);
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    page.setDefaultNavigationTimeout(30000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const ready = async route => {
      await page.goto(base + route, { waitUntil: 'domcontentloaded' });
      await page.locator('.app-route-loader').waitFor({ state: 'hidden' });
      await page.evaluate(() => document.fonts.ready);
    };
    const check = async (name, run) => {
      if (process.env.AUDIT_CASES && !process.env.AUDIT_CASES.split(',').some(value => name.includes(value))) return;
      try {
        await run();
        results.push({ width: viewport.width, name, passed: true });
        console.log(`PASS ${viewport.width} ${name}`);
      } catch (error) {
        const file = `${viewport.width}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
        await page.screenshot({ path: path.join(output, `${file}.png`), fullPage: false });
        await writeFile(path.join(output, `${file}.txt`), await page.locator('body').innerText());
        results.push({ width: viewport.width, name, passed: false, error: error.message });
        console.log(`FAIL ${viewport.width} ${name}: ${error.message}`);
      }
    };
    await check('Age and submitted assessment history', async () => {
      await ready('/dashboard/users');
      await page.getByRole('button', { name: /^View details for/ }).first().click();
      await page.getByText('22 years old', { exact: true }).waitFor();
      assert.equal(await page.getByText('Age Bracket', { exact: true }).count(), 0);
      await page.getByRole('button', { name: /More Details/ }).click();
      const data = await page.evaluate(async id => {
        const { getProgressPageData, getModuleCompletionPercent } = await import('/src/utils/progressService.js');
        const result = await getProgressPageData();
        const user = result.data.users.find(row => row.id === id);
        return {
          age: user.age, progress: user.overallPercent, attempts: user.modules[0].tests.map(test => test.id),
          simulationOnly: getModuleCompletionPercent({ simulation_completed_at: '2026-10-01' }),
          allRequired: getModuleCompletionPercent({ pre_test_completed_at: 'x', learning_material_completed_at: 'x', post_test_completed_at: 'x' }),
          preOnly: getModuleCompletionPercent({ pre_test_completed_at: 'x' }),
        };
      }, SAMPLE_USER_ID);
      assert.equal(data.age, 22);
      assert.equal(data.progress, 100);
      assert.deepEqual(data.attempts.sort(), ['finished-post', 'finished-pre']);
      assert.equal(data.simulationOnly, 0);
      assert.equal(data.allRequired, 100);
      assert.equal(data.preOnly, 33);
      const modal = await page.locator('.progress-modal').boundingBox();
      assert(modal.x >= 0 && modal.x + modal.width <= viewport.width + 1);
      await page.screenshot({ path: path.join(output, `${viewport.width}-user-age.png`) });
      await page.getByRole('button', { name: 'Close user details', exact: true }).click();
      await page.getByRole('button', { name: /^View details for/ }).nth(1).click();
      await page.getByText('Not recorded', { exact: true }).waitFor();
    });
    await check('Barangay overview and no assessment reset', async () => {
      await ready('/dashboard/users?view=participation');
      await page.locator('#bgy-overview-title').waitFor();
      assert.equal(await page.getByRole('button', { name: /reset.*assessment|assessment.*reset/i }).count(), 0);
      const values = await page.evaluate(async id => {
        const { getProgressPageData } = await import('/src/utils/progressService.js');
        const { buildPrePost } = await import('/src/utils/barangayLearning.js');
        const data = await getProgressPageData();
        return buildPrePost(data.data.users.filter(row => row.id === id));
      }, SAMPLE_USER_ID);
      assert.deepEqual(values, { pre: 50, post: 80, gain: 30, learners: 1 });
    });
    await check('Super Admin bulk controls and official protection', async () => {
      await ready('/dashboard/accounts');
      await page.getByRole('button', { name: 'Bulk Manage', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Bulk manage accounts', exact: true });
      await dialog.waitFor();
      assert(await dialog.getByRole('checkbox', { disabled: true }).count() >= 2);
      assert.equal(await dialog.getByRole('button', { name: 'Bulk Edit', exact: true }).isDisabled(), true);
      await dialog.getByRole('checkbox', { disabled: false }).last().check();
      await dialog.getByRole('button', { name: 'Bulk Edit', exact: true }).click();
      await dialog.getByRole('combobox').first().selectOption('FO3');
      await dialog.getByRole('button', { name: /Review/ }).click();
      await dialog.getByText('Are you sure?', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => (window.__revisionCalls || []).filter(call => call.name === 'manage_account').length), 0);
      await dialog.getByRole('button', { name: 'Apply to 1', exact: true }).click();
      await page.waitForFunction(() => window.__revisionCalls.some(call => call.name === 'manage_account'));
      const edit = await page.evaluate(() => window.__revisionCalls.find(call => call.name === 'manage_account'));
      assert.equal(edit.args.p_changes.rank, 'FO3');
    });
    await check('Bulk archive restore confirmation', async () => {
      await ready('/dashboard/archive-trash');
      await page.getByRole('checkbox', { name: 'Select all items on this page', exact: true }).check();
      await page.getByRole('button', { name: 'Restore (2)', exact: true }).click();
      await page.getByRole('heading', { name: 'Restore 2 items?', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => (window.__revisionCalls || []).filter(call => call.name === 'restore_archive_item').length), 0);
      await page.getByRole('button', { name: 'Restore 2', exact: true }).click();
      await page.waitForFunction(() => window.__revisionCalls.filter(call => call.name === 'restore_archive_item').length === 2);
    });
    await check('Backup history and recovery confirmation', async () => {
      await ready('/dashboard/archive-trash');
      await page.getByRole('tab', { name: /Settings/ }).click();
      await page.getByText('Last verified backup', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Restore', exact: true }).click();
      await page.getByRole('heading', { name: /Restore.*backup/i }).waitFor();
      assert.equal(await page.evaluate(() => (window.__revisionCalls || []).filter(call => call.name === 'backup-recovery' && call.body?.action === 'restore').length), 0);
    });
    await check('Bulk permanent deletion requires typed confirmation', async () => {
      await ready('/dashboard/archive-trash');
      await page.getByRole('checkbox', { name: 'Select all items on this page', exact: true }).check();
      await page.getByRole('button', { name: 'Delete (2)', exact: true }).click();
      const confirm = page.getByRole('button', { name: 'Delete 2 forever', exact: true });
      assert.equal(await confirm.isDisabled(), true);
      await page.getByRole('textbox', { name: /Reason/ }).fill('Sample audit only');
      await page.getByRole('textbox', { name: /Type DELETE to continue/ }).fill('DELETE');
      await confirm.click();
      await page.waitForFunction(() => window.__revisionCalls.filter(call => call.name === 'archive-maintenance').length === 2);
    });
    await check('About Us translation drafts and save confirmation', async () => {
      await ready('/dashboard/about-us');
      await page.getByRole('button', { name: 'Translate tab', exact: true }).click();
      await page.getByRole('menuitem', { name: /English.*Filipino/ }).click();
      await page.waitForFunction(() => [...document.querySelectorAll('input')].some(el => el.value === 'Salin: Learn fire safety'));
      assert.equal(await page.evaluate(() => (window.__revisionCalls || []).filter(call => call.kind === 'update').length), 0);
      await page.getByRole('button', { name: 'Save All', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Save Tab', exact: true }).click();
      await page.getByRole('heading', { name: 'Save Tab Changes?', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => (window.__revisionCalls || []).filter(call => call.kind === 'update').length), 0);
    });
    await check('Public trends render only three nonblank graphs', async () => {
      await ready('/');
      await page.locator('#trends').scrollIntoViewIfNeeded();
      const charts = page.locator('#trends canvas');
      await charts.first().waitFor();
      assert.equal(await charts.count(), 3);
      const rendered = await charts.evaluateAll(elements => elements.map(canvas => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        return { width: canvas.width, height: canvas.height, nonblank: pixels.some((value, i) => i % 4 === 3 && value > 0) };
      }));
      assert(rendered.every(canvas => canvas.width > 0 && canvas.height > 0 && canvas.nonblank));
      assert.equal(await page.locator('#trends').getByText(/@example\.test/).count(), 0);
      await page.locator('#trends').screenshot({ path: path.join(output, `${viewport.width}-public-trends.png`) });
    });
    await check('CSV import validation grouping minimize and cancel', async () => {
      await ready('/dashboard/accounts');
      await page.getByRole('button', { name: 'Import Personnel', exact: true }).click();
      const dialog = page.locator('.pim-modal');
      await dialog.getByRole('button', { name: 'Download CSV Template', exact: true }).waitFor();
      await dialog.locator('input[type="file"]').setInputFiles({
        name: 'sample-personnel.csv', mimeType: 'text/csv',
        buffer: Buffer.from('First Name,Last Name,Email,Role,Rank Designation,Contact Number\nMaria,Audit,maria.audit@gmail.com,personnel,FO1,09123456780\nJuan,Test,invalid,personnel,FO2,09123456781'),
      });
      await dialog.getByRole('textbox', { name: 'email, row 3', exact: true }).fill('juan.audit@gmail.com');
      const groups = await dialog.locator('.pim-group-title').allTextContents();
      assert(groups[0].startsWith('FO2'));
      assert(groups[1].startsWith('FO1'));
      await dialog.getByRole('button', { name: 'Continue with 2 valid', exact: true }).click();
      await dialog.getByRole('button', { name: 'Confirm & Create', exact: true }).click();
      await page.getByRole('button', { name: 'Minimize', exact: true }).click();
      const widget = page.getByRole('complementary', { name: 'Personnel import progress', exact: true });
      await widget.waitFor();
      await widget.getByRole('button', { name: 'Expand', exact: true }).click();
      await page.getByRole('button', { name: 'Cancel Import', exact: true }).click();
      await page.getByRole('button', { name: 'Yes, cancel import', exact: true }).click();
      await page.getByRole('heading', { name: 'Import Cancelled', exact: true }).waitFor();
    });
    await check('Analytics has no duplicate assessment history', async () => {
      await ready('/dashboard/analytics');
      await page.getByRole('heading', { name: /Analytics/ }).first().waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Assessment History', exact: true }).count(), 0);
    });
    await check('Page runtime errors', async () => assert.deepEqual(errors, []));
    await context.close();
  }
  if (!process.env.AUDIT_CASES) {
    for (const scenario of ['ordinary-admin', 'age-service-unavailable']) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
      await installRevisionFixtures(context, scenario === 'ordinary-admin'
        ? { superAdmin: false, actorPermissions: ['view_accounts', 'view_audit_logs'] }
        : { ageError: true });
      const page = await context.newPage();
      try {
        if (scenario === 'ordinary-admin') {
          await page.goto(base + '/dashboard/users');
          await page.waitForURL('**/dashboard');
          await page.goto(base + '/dashboard/accounts');
          await page.getByRole('button', { name: 'Add Personnel', exact: true }).waitFor();
          assert.equal(await page.getByRole('button', { name: 'Bulk Manage', exact: true }).count(), 0);
          await page.goto(base + '/dashboard/archive-trash');
          await page.getByRole('checkbox', { name: 'Select all items on this page', exact: true }).check();
          assert.equal(await page.getByRole('toolbar', { name: 'Actions for selected items' }).getByRole('button', { name: /^Delete/ }).isDisabled(), true);
          await page.getByRole('tab', { name: /Settings/ }).click();
          await page.getByText('Only a Super Admin can create, download, or restore backups.', { exact: true }).waitFor();
        } else {
          await page.goto(base + '/dashboard/users');
          await page.getByRole('button', { name: /^View details for/ }).first().click();
          await page.getByText('Temporarily unavailable', { exact: true }).waitFor();
          await page.getByText('alexandria.marie.delacruz.montenegro@example.test', { exact: true }).last().waitFor();
        }
        results.push({ name: scenario, passed: true });
        console.log(`PASS ${scenario}`);
      } catch (error) {
        results.push({ name: scenario, passed: false, error: error.message });
        console.log(`FAIL ${scenario}: ${error.message}`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
}
assert(results.every(result => result.passed), 'Revision audit has failures. See results.json.');

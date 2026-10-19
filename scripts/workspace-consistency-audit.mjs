import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installRevisionFixtures } from '../tests/fixtures/revision-validation.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:5182';
const output = path.resolve('.release-work.local/workspace-consistency');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
const sizes = [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 1000 }]
  .filter(size => !process.env.AUDIT_WIDTHS || process.env.AUDIT_WIDTHS.split(',').includes(String(size.width)));

try {
  for (const viewport of sizes) {
    const context = await browser.newContext({ viewport, reducedMotion: process.env.AUDIT_MOTION || 'reduce', isMobile: viewport.width === 390, hasTouch: viewport.width === 390 });
    await installRevisionFixtures(context, { extraAdmin: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(8000);
    const ready = async route => {
      await page.goto(base + route, { waitUntil: 'domcontentloaded' });
      await page.locator('.app-route-loader').waitFor({ state: 'hidden' });
      await page.evaluate(() => document.fonts.ready);
    };
    const shot = name => page.screenshot({ path: path.join(output, `${viewport.width}-${name}.png`) });
    const withinViewport = async locator => {
      const box = await locator.boundingBox();
      assert(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, JSON.stringify(box));
      return box;
    };
    const check = async (name, run) => {
      if (process.env.AUDIT_CASES && !name.includes(process.env.AUDIT_CASES)) return;
      try {
        await run();
        results.push({ width: viewport.width, name, passed: true });
        console.log(`PASS ${viewport.width} ${name}`);
      } catch (error) {
        results.push({ width: viewport.width, name, passed: false, error: error.message });
        await shot(`failure-${name.replace(/[^a-z0-9]+/gi, '-')}`);
        await writeFile(path.join(output, `${viewport.width}-error.txt`), await page.locator('body').innerText());
        console.log(`FAIL ${viewport.width} ${name}: ${error.message}`);
      }
    };

    await check('Compact import and keyboard close', async () => {
      await ready('/dashboard/accounts');
      await page.getByRole('button', { name: 'Import Personnel', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Import Personnel', exact: true });
      await dialog.waitFor();
      const box = await withinViewport(dialog);
      assert(box.width <= 641);
      assert(box.height < viewport.height - 16);
      if (viewport.width === 1440) assert(box.height < 620);
      await shot('import');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
    });

    await check('Admin demotion confirms before changing account', async () => {
      await ready('/dashboard/accounts');
      await page.getByRole('button', { name: 'Open actions for Ordinary Admin', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Demote to Personnel', exact: true }).click();
      const dialog = page.getByRole('alertdialog', { name: 'Demote to Personnel?', exact: true });
      await withinViewport(dialog);
      assert.equal(await page.evaluate(() => (window.__revisionCalls || []).filter(call => call.name === 'manage_account').length), 0);
      await shot('demotion');
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.getByRole('button', { name: 'Open actions for Ordinary Admin', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Demote to Personnel', exact: true }).click();
      await page.getByRole('button', { name: 'Demote', exact: true }).click();
      await page.locator('.account-directory-group-personnel').getByText('Ordinary Admin', { exact: true }).waitFor();
      const call = await page.evaluate(() => window.__revisionCalls.find(call => call.name === 'manage_account'));
      assert.equal(call.args.p_target_admin_id, '00000000-0000-4000-8000-000000000903');
      assert.deepEqual(call.args.p_changes, { role: 'personnel' });
      await page.getByRole('button', { name: 'Open actions for Official Protected Account', exact: true }).click();
      assert.equal(await page.getByRole('menuitem', { name: 'Demote to Personnel', exact: true }).count(), 0);
      await page.keyboard.press('Escape');
    });

    await check('Bulk Manage supports Admin to Personnel', async () => {
      await ready('/dashboard/accounts');
      await page.getByRole('button', { name: 'Bulk Manage', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Bulk manage accounts', exact: true });
      await dialog.locator('.bm-row').filter({ hasText: 'Ordinary Admin' }).getByRole('checkbox').check();
      await dialog.getByRole('button', { name: 'Bulk Edit', exact: true }).click();
      await dialog.getByRole('combobox').nth(1).selectOption('personnel');
      await dialog.getByRole('button', { name: /Review/ }).click();
      await dialog.getByText('Role: Admin to Personnel', { exact: true }).waitFor();
      await withinViewport(dialog);
      await dialog.getByRole('button', { name: 'Apply to 1', exact: true }).click();
      await page.waitForFunction(() => window.__revisionCalls?.some(call => call.name === 'manage_account' && call.args.p_changes.role === 'personnel'));
    });

    await check('Reason optional and DELETE still required', async () => {
      await ready('/dashboard/archive-trash');
      await page.getByRole('checkbox', { name: 'Select all items on this page', exact: true }).check();
      await page.getByRole('button', { name: 'Delete (2)', exact: true }).click();
      const dialog = page.getByRole('alertdialog', { name: 'Delete 2 items forever?', exact: true });
      const reason = dialog.getByRole('textbox', { name: 'Reason (optional)', exact: true });
      assert.equal(await reason.getAttribute('required'), null);
      const confirm = dialog.getByRole('button', { name: 'Delete 2 forever', exact: true });
      assert.equal(await confirm.isDisabled(), true);
      await dialog.getByRole('textbox', { name: /Type DELETE/ }).fill('DELETE');
      assert.equal(await confirm.isDisabled(), false);
      await withinViewport(dialog);
      await shot('delete');
      await confirm.click();
      await page.waitForFunction(() => window.__revisionCalls?.filter(call => call.name === 'archive-maintenance').length === 2);
      assert.equal(await page.evaluate(() => window.__revisionCalls.filter(call => call.name === 'archive-maintenance').every(call => call.body.reason === '')), true);
    });

    await check('Shared translation menu and compact save confirmation', async () => {
      await ready('/dashboard/about-us');
      for (const label of ['Translate all', 'Translate tab']) {
        await page.getByRole('button', { name: label, exact: true }).click();
        const menu = page.getByRole('menu', { name: label, exact: true });
        await withinViewport(menu);
        assert.deepEqual(await menu.getByRole('menuitem').allTextContents(), ['English to Filipino', 'Filipino to English']);
        await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'menuitem');
        await page.keyboard.press('ArrowDown');
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Filipino to English');
        await page.keyboard.press('Escape');
        await menu.waitFor({ state: 'hidden' });
      }
      await page.getByRole('button', { name: 'Translate tab', exact: true }).click();
      await page.getByRole('menuitem', { name: 'English to Filipino', exact: true }).click();
      await page.waitForFunction(() => [...document.querySelectorAll('input')].some(el => el.value === 'Salin: Learn fire safety'));
      await page.getByRole('button', { name: 'Save Tab', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Save Tab Changes?', exact: true });
      const box = await withinViewport(dialog);
      assert(box.width <= 401);
      await shot('save');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await page.evaluate(() => (window.__revisionCalls || []).filter(call => call.kind === 'update').length), 0);
    });

    await check('AI shortcut collapses persists and still opens', async () => {
      await ready('/dashboard/analytics');
      await page.getByRole('button', { name: 'Collapse recommendations shortcut', exact: true }).click();
      const launcher = page.getByRole('button', { name: 'Open AI recommendations', exact: true });
      assert.equal(await launcher.innerText(), '');
      await withinViewport(launcher);
      assert.equal(await page.evaluate(() => localStorage.getItem('ignis-recommendations-collapsed')), 'true');
      await launcher.click();
      const panel = page.getByRole('dialog', { name: 'Module Recommendations', exact: true });
      await withinViewport(panel);
      await shot('recommendations');
      await page.keyboard.press('Escape');
      await panel.waitFor({ state: 'hidden' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      assert.equal(await page.getByRole('button', { name: 'Collapse recommendations shortcut', exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Open AI recommendations', exact: true }).waitFor();
    });

    await check('Storage uses understandable labels', async () => {
      await ready('/dashboard/archive-trash');
      await page.getByRole('button', { name: /Show charts/ }).click();
      const chart = page.locator('figure').filter({ has: page.getByRole('heading', { name: 'Storage usage', exact: true }) });
      await chart.locator('summary').click();
      await chart.getByRole('cell', { name: 'System backups', exact: true }).waitFor();
      await chart.getByRole('cell', { name: 'Profile photos', exact: true }).waitFor();
      assert.equal(await chart.getByText('system-backups', { exact: true }).count(), 0);
      await chart.scrollIntoViewIfNeeded();
      await shot('storage');
    });

    await check('Consistent role headers and no help cursor', async () => {
      const titles = [];
      for (const route of ['/dashboard/accounts', '/dashboard/users', '/personnel/operations']) {
        await ready(route);
        const title = page.locator('.page-header .page-title');
        await title.waitFor();
        titles.push(await title.evaluate(el => getComputedStyle(el).fontSize));
        assert.equal(await page.evaluate(() => [...document.querySelectorAll('.hint, .at-tip-anchor, .pim-tip-anchor')].some(el => getComputedStyle(el).cursor === 'help')), false);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        if (route.startsWith('/personnel')) await shot('personnel');
      }
      assert.equal(new Set(titles).size, 1, JSON.stringify(titles));
    });
    await check('Learning translation tab stays scoped to selected page', async () => {
      await ready('/dashboard/learning-materials');
      await page.evaluate(async () => {
        const { default: React } = await import('/node_modules/.vite/deps/react.js');
        const { default: { createRoot } } = await import('/node_modules/.vite/deps/react-dom_client.js');
        const { default: ModuleEditor } = await import('/src/components/ModuleEditor.jsx');
        document.getElementById('root').style.display = 'none';
        const mount = document.createElement('main');
        mount.style.padding = '16px';
        document.body.append(mount);
        const initial = {
          module_no: 1, title: 'Sample module', title_tl: '', subtitle: '', subtitle_tl: '', blockCount: 2,
          pages: [1, 2].map(number => ({ id: `page-${number}`, page_no: number, title_en: `Sample page ${number}`, title_tl: '',
            blocks: [{ id: `block-${number}`, block_no: 1, block_key: `sample-${number}`, block_type: 'text', text_en: `Instruction ${number}`, text_tl: '', metadata: {} }],
          })),
        };
        function EditorFixture() {
          const [editedModule, setEditedModule] = React.useState(initial);
          const [currentPages, setPages] = React.useState({ 1: 0 });
          const [learningTexts, setLearningTexts] = React.useState([]);
          const [fireGuides, setFireGuides] = React.useState([]);
          const [fireClassDetails, setFireClassDetails] = React.useState([]);
          window.__moduleDraft = editedModule;
          return React.createElement(ModuleEditor, { moduleEntry: editedModule, editedModule, setEditedModule,
            currentPages, handlePageChange: (moduleNo, index) => setPages({ [moduleNo]: index }),
            learningTexts, setLearningTexts, fireGuides, setFireGuides, fireClassDetails, setFireClassDetails,
            handleSaveModule: () => {}, saving: false,
          });
        }
        window.__editorFixtureRoot = createRoot(mount);
        window.__editorFixtureRoot.render(React.createElement(EditorFixture));
      });
      await page.getByRole('button', { name: 'Translate tab', exact: true }).click();
      await page.getByRole('menuitem', { name: 'English to Filipino', exact: true }).click();
      await page.waitForFunction(() => window.__moduleDraft.pages[0].title_tl === 'Salin: Sample page 1');
      assert.equal(await page.evaluate(() => window.__moduleDraft.pages[1].title_tl), '');
      await page.getByRole('button', { name: 'Translate all', exact: true }).click();
      await page.getByRole('menuitem', { name: 'English to Filipino', exact: true }).click();
      await page.waitForFunction(() => window.__moduleDraft.pages[1].title_tl === 'Salin: Sample page 2');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await shot('learning-editor');
      await page.evaluate(() => window.__editorFixtureRoot.unmount());
    });
    await check('No page runtime errors', async () => assert.deepEqual(errors, []));
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await installRevisionFixtures(context, { superAdmin: false, extraAdmin: true });
  const page = await context.newPage();
  await page.goto(base + '/dashboard/accounts');
  await page.getByRole('button', { name: 'Open actions for Ordinary Admin', exact: true }).click();
  assert.equal(await page.getByRole('menuitem', { name: 'Demote to Personnel', exact: true }).count(), 0);
  results.push({ name: 'Ordinary Admin has no demotion control', passed: true });
  await context.close();
} finally {
  await browser.close();
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
}
assert(results.every(result => result.passed), 'Workspace audit has failures.');

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fixtureTables, installResponsiveFixtures, supabaseModule } from '../tests/fixtures/responsive-layout.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:5176';
const output = path.resolve('.release-work.local/content-editing');
const sizes = [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1366, height: 768 }];
const photo = { id: 'saved-photo', url: '/src/assets/firestation.webp', path: 'saved/station.webp', alt: 'Saved station photo', fileName: '', size: 0, uploadedAt: '' };
const landingContent = { hero: { title: 'Saved main banner', photos: [photo] }, media: { aboutPhoto: photo }, faq: {
  english: { title: 'Frequently asked questions', faqs: [{ question: 'Saved question?', answer: ['First saved answer', 'Second saved answer'] }] }
} };

Object.assign(fixtureTables, {
  landing_content: [{ id: 'default', content: landingContent }],
  learning_material_admin_view: Array.from({ length: 5 }, (_, index) => ({
    module_no: index + 1, module_title_en: `Learning module ${index + 1}`, module_title_tl: 'Aralin',
    module_subtitle_en: 'Existing learning text', module_subtitle_tl: 'Teksto', hero_asset: 'fixed-image.png',
    page_no: 1, page_key: `module-${index + 1}-page-1`, page_title_en: 'Existing page', page_title_tl: 'Pahina',
    block_no: index ? 41 : 1, block_id: `block-${index + 1}`, block_key: `module-${index + 1}-block`,
    block_type: index ? 'text' : 'expandable_lesson', text_en: 'Existing instructions', text_tl: 'Mga tagubilin',
    metadata: index ? {} : { parts: [{ type: 'video', url: 'fixed-video.mp4', organization: 'BFP', title: 'Existing media caption' }] }, is_active: true
  })),
  learning_material_modules: Array.from({ length: 5 }, (_, index) => ({ module_no: index + 1 })),
  learning_material_pages: Array.from({ length: 5 }, (_, index) => ({ module_no: index + 1, page_no: 1 })),
  learning_material_blocks: Array.from({ length: 5 }, (_, index) => ({ id: `block-${index + 1}` })),
  learning_material_media_assets: [{ id: 'asset-1', module_no: 1, page_no: 1, asset_path: 'fixed-video.mp4' }],
  about_us_partner_info: [{ section_key: 'bfp_dasmarinas', heading_en: 'Saved station heading', heading_tl: 'Himpilan', fire_marshal_name: 'Existing Fire Marshal' }],
  about_us_emergency_info: [{ section_key: 'emergency_contacts', heading_en: 'Emergency contacts' }],
  about_us_directory_info: [{ section_key: 'cavite_directory', heading_en: 'Cavite directory' }],
  about_us_contact_points: [{ contact_key: 'saved-phone', contact_type: 'mobile', display_value: '09123456789', dial_value: '09123456789', is_active: true }],
  about_us_partner_contact_links: [{ section_key: 'bfp_dasmarinas', contact_key: 'saved-phone', contact: { contact_type: 'mobile', display_value: '09123456789', dial_value: '09123456789', is_active: true } }],
  about_us_emergency_numbers: [{ id: 'emergency-1', section_key: 'emergency_contacts', label_en: 'Station hotline', label_tl: 'Hotline', contact_key: 'saved-phone', icon_key: 'phone_iphone', is_active: true,
    contact: { contact_type: 'mobile', display_value: '09123456789', dial_value: '09123456789', is_active: true } }],
  about_us_directory_groups: [{ group_key: 'district-1', section_key: 'cavite_directory', title_en: 'Existing district', title_tl: 'Distrito', display_order: 1, is_active: true }],
  about_us_directory_entries: [{ entry_key: 'station-1', group_key: 'district-1', name_en: 'Existing station', name_tl: 'Himpilan', email: 'station@example.test', display_order: 1, is_active: true }],
  about_us_directory_phones: [{ id: 'phone-1', entry_key: 'station-1', display_value: '09123456789', dial_value: '09123456789', display_order: 1, is_active: true }],
  about_us_sections: [{ section_key: 'bfp_dasmarinas', title_en: 'Existing section', title_tl: 'Seksyon', subtitle_en: 'Existing subtitle', icon_key: 'shield', display_order: 1, is_active: true }],
});

// All writes stay in this intercepted test module, never the real database.
function contentFixtures() {
  return supabaseModule()
    .replace('update() { this.rows = []; return this; }', `update(payload) {
      this.payload = payload;
      (window.__contentWrites ||= []).push({ table: this.table, action: 'update', payload });
      this.rows = this.rows.map(row => ({ ...row, ...payload })); return this;
    }`)
    .replace('upsert() { this.rows = []; return this; }', `upsert(payload) {
      this.payload = payload;
      (window.__contentWrites ||= []).push({ table: this.table, action: 'upsert', payload });
      this.rows = [payload]; return this;
    }`)
    .replace('then(resolve, reject) { return Promise.resolve', `then(resolve, reject) {
      if (this.payload && this.table === window.__failTable) return Promise.resolve({ data: null, error: { message: 'Test save failure' } }).then(resolve, reject);
      return Promise.resolve`);
}

async function ready(page, route) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.app-route-loader').waitFor({ state: 'hidden' });
  await page.evaluate(() => document.fonts.ready);
}

async function fixedControls(page, selector) {
  const root = page.locator(selector);
  assert.equal(await root.locator('input[type=file]').count(), 0, 'Media upload is still present');
  const names = await root.locator('button').allTextContents();
  assert(!names.some(name => /^(add|delete|replace|move up|move down|reset)\b/i.test(name.trim())), `Unexpected structural controls: ${names.join(', ')}`);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'Page scrolls sideways');
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
await mkdir(output, { recursive: true });
let checks = 0;
try {
  for (const viewport of sizes) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    await installResponsiveFixtures(context);
    await context.route('**/src/utils/supabaseClient.js*', route => route.fulfill({ contentType: 'application/javascript', body: contentFixtures() }));
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await ready(page, '/dashboard/learning-materials');
    await page.locator('.module-card').first().click();
    for (let moduleNo = 1; moduleNo <= 5; moduleNo++) {
      if (moduleNo > 1) await page.locator('#learning-materials-module-select').selectOption(String(moduleNo));
      await page.locator('.module-editor-shell').waitFor();
      await fixedControls(page, '.module-editor-shell');
      assert.equal(await page.getByText('Media Assets', { exact: true }).count(), 0);
      assert.equal(await page.locator('input.url').count(), 0);
      checks++;
    }
    await page.locator('#learning-materials-module-select').selectOption('1');
    await page.locator('.module-editor-field input').first().fill('Updated module title');
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    const moduleDialog = page.getByRole('alertdialog', { name: 'Save Changes?' });
    await moduleDialog.waitFor();
    await moduleDialog.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await page.getByText('Changes have been saved successfully.', { exact: true }).waitFor();
    const moduleWrites = await page.evaluate(() => window.__contentWrites.filter(write => write.table.startsWith('learning_material')));
    assert(!moduleWrites.some(write => write.table === 'learning_material_media_assets'));
    assert.equal(moduleWrites.find(write => write.table === 'learning_material_blocks').payload.metadata.parts[0].url, 'fixed-video.mp4');
    checks++;

    await ready(page, '/dashboard/about-us');
    await page.locator('#bfp-dasmarinas input').first().waitFor();
    await page.locator('.aboutus-directory-group-row .aboutus-directory-toggle').first().click();
    await page.locator('.aboutus-directory-entry .aboutus-directory-toggle').first().click();
    await fixedControls(page, '.aboutus-main');
    await page.getByRole('button', { name: 'Actions for Existing district', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Edit district/group', exact: true }).click();
    assert.equal(await page.locator('#cavite-directory input[type=checkbox]').count(), 0);
    await page.locator('.aboutus-directory-group .aboutus-edit-row input').first().fill('Updated existing district');
    await page.locator('#cavite-directory').getByRole('button', { name: 'Save', exact: true }).click();
    const aboutDialog = page.getByRole('alertdialog', { name: 'Save Changes?' });
    await aboutDialog.waitFor();
    await aboutDialog.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await aboutDialog.waitFor({ state: 'hidden' });
    const aboutWrites = await page.evaluate(() => window.__contentWrites.filter(write => write.table.startsWith('about_us')));
    assert(aboutWrites.some(write => write.table === 'about_us_directory_groups' && write.payload.title_en === 'Updated existing district'));
    assert(aboutWrites.every(write => Object.keys(write.payload).every(key => /_en$|_tl$|display_value|dial_value/.test(key))));
    checks++;

    await ready(page, '/dashboard/chart');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('.org-input').first().waitFor();
    await fixedControls(page, '.chart-main');
    await page.getByLabel('Full name', { exact: true }).first().fill('Updated existing officer');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('heading', { name: 'Confirm Organizational Chart Changes', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await page.locator('.org-result-modal').waitFor();
    assert.match(await page.locator('.org-result-modal').innerText(), /Name updated successfully\./, JSON.stringify(await page.evaluate(() => window.__contentWrites)));
    checks++;

    await ready(page, '/dashboard/landing-page-editor');
    await page.getByRole('button', { name: 'Edit Mode', exact: true }).click();
    await fixedControls(page, '.landing-visual-editor');
    assert.equal(await page.locator('.landing-admin-section-tools').count(), 0);
    await page.locator('[data-landing-edit-path="hero.title"]').click();
    await page.getByRole('dialog', { name: 'Main page title' }).waitFor();
    await page.getByLabel('Content', { exact: true }).fill('Updated existing banner');
    await page.getByRole('button', { name: 'Apply to draft', exact: true }).click();
    await page.getByRole('button', { name: 'Review and save', exact: true }).click();
    await page.getByRole('button', { name: 'Publish Changes', exact: true }).click();
    await page.getByText('Landing page content saved.', { exact: true }).waitFor();
    const landingWrite = await page.evaluate(() => window.__contentWrites.findLast(write => write.table === 'landing_content'));
    assert.equal(landingWrite.payload.content.hero.title, 'Updated existing banner');
    assert.deepEqual(landingWrite.payload.content.hero.photos, [photo]);
    assert.equal(landingWrite.payload.content.media.aboutPhoto.url, photo.url);
    checks++;

    const answerPath = await page.locator('[data-landing-edit-path$=".question"]').filter({ hasText: 'Saved question?' }).getAttribute('data-landing-edit-path');
    const questionCount = await page.locator('[data-landing-edit-path$=".question"]').count();
    await page.locator(`[data-landing-edit-path="${answerPath}"]`).click();
    await page.getByLabel('Content', { exact: true }).fill('Updated saved question?');
    await page.getByRole('button', { name: 'Apply to draft', exact: true }).click();
    assert.equal(await page.locator(`[data-landing-edit-path="${answerPath}"]`).innerText(), 'Updated saved question?');
    assert.equal(await page.locator('[data-landing-edit-path$=".question"]').count(), questionCount);
    await page.locator(`[data-landing-edit-path="${answerPath.replace(/question$/, 'answer')}"]`).click();
    assert.equal(await page.locator('.landing-inline-edit-modal textarea').count(), 2);
    await page.getByLabel('Item 1', { exact: true }).fill('Updated existing answer');
    await page.getByRole('button', { name: 'Apply to draft', exact: true }).click();
    await page.evaluate(() => { window.__failTable = 'landing_content'; });
    await page.getByRole('button', { name: 'Review and save', exact: true }).click();
    await page.getByRole('button', { name: 'Publish Changes', exact: true }).click();
    await page.getByText(/Failed to sync to database/).waitFor();
    assert(await page.getByRole('button', { name: 'Review and save', exact: true }).isEnabled());
    await page.getByRole('button', { name: 'Back to Content Management', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'Leave Landing Page Editor?' }).waitFor();
    await page.screenshot({ path: path.join(output, `unsaved-${viewport.width}.png`) });
    checks++;
    assert.deepEqual(errors, [], 'Runtime errors in content editors');
    await context.close();
    console.log(`PASS content editors at ${viewport.width}x${viewport.height}`);
  }
  console.log(`Passed ${checks} content-editor checks.`);
} finally {
  await browser.close();
}

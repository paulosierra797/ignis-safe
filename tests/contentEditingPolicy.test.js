import assert from 'node:assert/strict';
import test from 'node:test';
import { projectChartText, projectLandingText, projectLearningText } from '../src/utils/contentEditingPolicy.js';

test('learning content permits bilingual text but preserves all media and identifiers', () => {
  const original = { title: 'Module 1', hero_asset: 'hero.png', module_no: 1, pages: [{
    page_no: 1, blocks: [{ id: 'block-1', text_en: 'Read this', metadata: {
      title_en: 'Viewer', model_path: 'original.glb', video_url: 'original.mp4', icon_key: 'fire',
      parts: [{ type: 'image', url: 'original.png', text_tl: 'Lumang teksto' }]
    } }]
  }] };
  const edited = structuredClone(original);
  edited.title = 'Updated module';
  edited.hero_asset = 'replacement.png';
  edited.module_no = 9;
  edited.pages[0].blocks[0].id = 'different-id';
  edited.pages[0].blocks[0].text_en = 'Updated instructions';
  Object.assign(edited.pages[0].blocks[0].metadata, {
    title_en: 'Updated viewer', model_path: 'replacement.glb', video_url: 'replacement.mp4', icon_key: 'new'
  });
  edited.pages[0].blocks[0].metadata.parts[0] = { type: 'video', url: 'replacement.png', text_tl: 'Bagong teksto' };
  const result = projectLearningText(original, edited);
  assert.equal(result.title, 'Updated module');
  assert.equal(result.hero_asset, original.hero_asset);
  assert.equal(result.module_no, 1);
  const block = result.pages[0].blocks[0];
  assert.equal(block.id, 'block-1');
  assert.equal(block.text_en, 'Updated instructions');
  assert.equal(block.metadata.title_en, 'Updated viewer');
  assert.equal(block.metadata.model_path, 'original.glb');
  assert.equal(block.metadata.video_url, 'original.mp4');
  assert.equal(block.metadata.icon_key, 'fire');
  assert.deepEqual(block.metadata.parts[0], { type: 'image', url: 'original.png', text_tl: 'Bagong teksto' });
  assert.equal(original.title, 'Module 1');
});

test('learning pages, blocks and guide entries cannot be added, removed or reordered', () => {
  const original = { pages: [{ page_no: 1, title_en: 'First' }, { page_no: 2, title_en: 'Second' }], examples_en: ['A', 'B'] };
  const result = projectLearningText(original, { pages: [{ page_no: 2, title_en: 'Edited' }], examples_en: ['Changed', 'Second', 'New entry'], extra_en: 'New field' });
  assert.deepEqual(result.pages, [{ page_no: 1, title_en: 'Edited' }, { page_no: 2, title_en: 'Second' }]);
  assert.deepEqual(result.examples_en, ['Changed', 'Second']);
  assert.equal(result.extra_en, undefined);
});

test('landing edits preserve images, section order, visibility and download links', () => {
  const original = {
    hero: { title: 'Welcome', photos: [{ id: 'photo', url: 'original.jpg', alt: 'Station' }] },
    media: { aboutPhoto: { url: 'about.jpg', path: 'about' }, contactPhoto: null },
    layout: { sections: ['hero', 'about'], hidden: ['about'] },
    mobileRelease: { version: 'Version 01', downloadUrl: 'app.apk', qrValue: 'app.apk', sha256: 'hash' },
    copy: { english: { home: 'Home' } }
  };
  const result = projectLandingText(original, {
    hero: { title: 'New welcome', photos: [] }, media: { aboutPhoto: null, contactPhoto: { url: 'replacement.jpg' } },
    layout: { sections: ['faq'], hidden: [] }, mobileRelease: { version: 'Version 02', downloadUrl: 'wrong.apk', qrValue: 'wrong.apk', sha256: 'wrong' },
    copy: { english: { home: 'Start', newSection: 'New' } }
  });
  assert.equal(result.hero.title, 'New welcome');
  assert.deepEqual(result.hero.photos, original.hero.photos);
  assert.deepEqual(result.media, original.media);
  assert.deepEqual(result.layout, original.layout);
  assert.deepEqual(result.mobileRelease, { ...original.mobileRelease, version: 'Version 02' });
  assert.deepEqual(result.copy.english, { home: 'Start' });
});

test('FAQ questions and existing answer bullets remain fixed in number', () => {
  const original = { faq: { english: { faqs: [{ question: 'Question', answer: ['One', 'Two'] }, { question: 'Next', answer: 'Paragraph' }] } } };
  const result = projectLandingText(original, { faq: { english: { faqs: [{ question: 'Updated', answer: ['Changed'] }] } } });
  assert.equal(result.faq.english.faqs.length, 2);
  assert.deepEqual(result.faq.english.faqs[0], { question: 'Updated', answer: ['Changed', 'Two'] });
  assert.deepEqual(result.faq.english.faqs[1], original.faq.english.faqs[1]);
});

test('paragraph text can contain newlines without creating new content entries', () => {
  const original = { faq: { english: { faqs: [{ question: 'Question', answer: 'Original' }] } } };
  const result = projectLandingText(original, { faq: { english: { faqs: [{ answer: 'First paragraph\nSecond paragraph' }] } } });
  assert.equal(result.faq.english.faqs[0].answer, 'First paragraph\nSecond paragraph');
});

test('org chart allows name, rank and position text only', () => {
  const original = { top: { id: 'top', name: 'Old', rank: 'FO1', title: 'Officer', avatar_url: 'face.jpg' }, departments: [{ id: 'section', title: 'Section', units: [{ id: 'unit', name: 'Existing', rank: '', title: 'Member', avatar_url: '' }] }] };
  const edited = structuredClone(original);
  Object.assign(edited.top, { id: 'new', name: 'Updated', rank: 'FO2', title: 'Lead', avatar_url: 'new.jpg' });
  edited.departments[0].units = [];
  edited.departments.push({ id: 'new-section', title: 'New', units: [] });
  const result = projectChartText(original, edited);
  assert.deepEqual(result.top, { id: 'top', name: 'Updated', rank: 'FO2', title: 'Lead', avatar_url: 'face.jpg' });
  assert.deepEqual(result.departments, original.departments);
});

test('nullable existing text can be filled or cleared without enabling new fields', () => {
  assert.deepEqual(projectLearningText({ note_en: null, image_url: null }, { note_en: 'New note', image_url: 'new.png', new_en: 'New' }), { note_en: 'New note', image_url: null });
  assert.deepEqual(projectLandingText({ hero: { title: 'Old' } }, { hero: { title: '' } }), { hero: { title: '' } });
});

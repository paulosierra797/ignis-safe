import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTranslationResults,
  collectTranslationPairs,
  countExistingTranslationTargets,
} from './translationUtils.js';

test('collects nested English fields only when the Filipino target is blank', () => {
  const value = {
    id: 'module-1',
    title: 'Fire safety',
    title_tl: '',
    media_url: 'https://example.test/video',
    source_url_en: 'https://example.test/source',
    source_url_tl: '',
    nested: { description_en: 'Stay low', description_tl: 'Manatiling mababa' },
    blocks: [{ block_key: 'a', text_en: 'Exit safely', text_tl: null }],
  };
  const pairs = collectTranslationPairs(value, 'en', 'fil');
  assert.deepEqual(pairs.map((pair) => pair.text), ['Fire safety', 'Exit safely']);
  assert.equal(countExistingTranslationTargets(value, 'en', 'fil'), 1);
});

test('supports reverse translation and paired arrays without changing order', () => {
  const value = {
    lines_en: ['', 'Approved English'],
    lines_tl: ['Unang linya', 'Ikalawang linya'],
  };
  const pairs = collectTranslationPairs(value, 'fil', 'en');
  assert.deepEqual(pairs.map((pair) => pair.text), ['Unang linya']);
  const result = applyTranslationResults(value, pairs, ['First line']);
  assert.deepEqual(result.value.lines_en, ['First line', 'Approved English']);
  assert.deepEqual(result.value.lines_tl, value.lines_tl);
});

test('preserves assessment identifiers, answer mapping, scoring and existing targets', () => {
  const question = {
    id: 'question-7', question_no: 7, score: 5,
    prompt: 'Choose the safe exit.', prompt_tl: '',
    options: [
      { id: 'option-a', option_key: 'A', display_order: 1, is_correct: true, option_text: 'Front door', option_text_tl: '' },
      { id: 'option-b', option_key: 'B', display_order: 2, is_correct: false, option_text: 'Elevator', option_text_tl: 'Elevator' },
    ],
  };
  const pairs = collectTranslationPairs(question, 'en', 'fil');
  const { value } = applyTranslationResults(question, pairs, ['Piliin ang ligtas na labasan.', 'Pinto sa harap']);
  assert.equal(value.options[0].is_correct, true);
  assert.equal(value.options[0].id, 'option-a');
  assert.equal(value.options[0].option_key, 'A');
  assert.equal(value.options[0].display_order, 1);
  assert.equal(value.score, 5);
  assert.equal(value.options[1].option_text_tl, 'Elevator');
});

test('ignores stale results when the source changes while translation is pending', () => {
  const original = { prompt: 'Original question', prompt_tl: '' };
  const pairs = collectTranslationPairs(original, 'en', 'fil');
  const editedWhilePending = { ...original, prompt: 'Updated question' };
  const result = applyTranslationResults(editedWhilePending, pairs, ['Isinaling tanong']);

  assert.equal(result.appliedCount, 0);
  assert.equal(result.value.prompt, 'Updated question');
  assert.equal(result.value.prompt_tl, '');
});

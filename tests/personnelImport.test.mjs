import test from 'node:test';
import assert from 'node:assert/strict';
import { IMPORT_COLUMNS, MAX_IMPORT_ROWS, normalizeImportRow, parsePersonnelCsv, personnelCsvTemplate, validateImportRows } from '../src/utils/personnelImport.js';

const header = IMPORT_COLUMNS.map(({ label }) => label).join(',');
const valid = { row_id: 'one', first_name: 'Maria', last_name: 'Reyes', email: 'maria@gmail.com', role: 'personnel', rank: 'FO1', contact_number: '09123456789' };

test('template has the exact six columns and supports Excel UTF-8 BOM', () => {
  assert.equal(personnelCsvTemplate(), `\uFEFF${header}\r\n`);
  assert.throws(() => parsePersonnelCsv(personnelCsvTemplate()), /no personnel records/);
});

test('CSV preserves phone leading zero, assigns stable IDs and reports source rows', () => {
  const rows = parsePersonnelCsv(`\uFEFF${header}\r\n Maria , Reyes ,MARIA@gmail.com,Personnel,fo1,09123456789\r\n`);
  assert.equal(rows.length, 1);
  assert.match(rows[0].row_id, /^[\da-f-]{36}$/);
  assert.equal(rows[0].source_row, 2);
  assert.equal(rows[0].contact_number, '09123456789');
  assert.equal(validateImportRows(rows)[0].status, 'Valid');
  assert.equal(normalizeImportRow(rows[0]).email, 'maria@gmail.com');
});

test('quoted commas, escaped quotes and newlines do not shift columns', () => {
  const [row] = parsePersonnelCsv(`${header}\nMaria,Reyes,maria@gmail.com,personnel,"OTHER: Training, \"\"Team\"\"",09123456789\n`);
  assert.equal(row.rank, 'OTHER: Training, "Team"');
  const [newline] = parsePersonnelCsv(`${header}\n"Maria\nAnn",Reyes,maria@gmail.com,personnel,FO1,09123456789`);
  assert.equal(newline.first_name, 'Maria\nAnn');
  assert.equal(validateImportRows([newline])[0].status, 'Needs Correction');
});

test('malformed quotes and incompatible headers are rejected', () => {
  for (const csv of [`${header}\n"Maria,Reyes`, `${header}\n"Maria"oops,Reyes`, `${header}\nMa"ria,Reyes`]) {
    assert.throws(() => parsePersonnelCsv(csv), /quoted|quoting/);
  }
  assert.throws(() => parsePersonnelCsv('Email,Name\na,b'), /columns/);
});

test('empty and malformed rows remain visible with blocking correction errors', () => {
  const rows = parsePersonnelCsv(`${header}\n\nMaria,Reyes,maria@gmail.com,personnel,FO1,09123456789,extra\n`);
  assert.equal(rows.length, 2);
  assert.deepEqual(validateImportRows(rows).map(({ status }) => status), ['Needs Correction', 'Needs Correction']);
  assert.ok(rows.every((row) => row.parse_error));
});

test('all duplicates are blocked case-insensitively and clear after edit/exclusion', () => {
  const rows = [valid, { ...valid, row_id: 'two', email: ' MARIA@GMAIL.COM ' }];
  assert.deepEqual(validateImportRows(rows).map(({ status }) => status), ['Duplicate', 'Duplicate']);
  assert.deepEqual(validateImportRows([valid, { ...rows[1], email: 'other@gmail.com' }]).map(({ status }) => status), ['Valid', 'Valid']);
  assert.equal(validateImportRows([valid])[0].status, 'Valid');
});

test('required fields, supported values, existing Gmail and mobile rules are enforced', () => {
  for (const field of IMPORT_COLUMNS) {
    assert.equal(validateImportRows([{ ...valid, [field.key]: '' }])[0].status, 'Needs Correction', field.key);
  }
  for (const patch of [{ role: 'intel unit' }, { email: 'test@example.com' }, { email: 'x,y@gmail.com' },
    { contact_number: '+639123456789' }, { contact_number: '09123' }, { rank: 'UNKNOWN' },
    { rank: 'OTHER:' }, { rank: 'OTHER: Bad\nRank' }, { first_name: 'Maria1' }]) {
    assert.equal(validateImportRows([{ ...valid, ...patch }])[0].status, 'Needs Correction', JSON.stringify(patch));
  }
  assert.equal(validateImportRows([{ ...valid, role: 'admin', rank: 'other: Officer', last_name: "O'Neil" }])[0].status, 'Valid');
});

test('bounded import rejects oversize files and more than 200 records', () => {
  assert.throws(() => parsePersonnelCsv('x'.repeat(1024 * 1024 + 1)), /1 MB/);
  const row = 'Maria,Reyes,maria@gmail.com,personnel,FO1,09123456789';
  assert.equal(parsePersonnelCsv(`${header}\n${Array(MAX_IMPORT_ROWS).fill(row).join('\n')}`).length, MAX_IMPORT_ROWS);
  assert.throws(() => parsePersonnelCsv(`${header}\n${Array(MAX_IMPORT_ROWS + 1).fill(row).join('\n')}`), /200/);
});

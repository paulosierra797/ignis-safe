export const IMPORT_COLUMNS = [
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'email', label: 'Email Address' },
  { key: 'role', label: 'Role' },
  { key: 'rank', label: 'Rank' },
  { key: 'contact_number', label: 'Contact Number' },
];

export const IMPORT_RANKS = ['FDIR', 'DFDIR', 'SSUPT', 'SUPT', 'CINSP', 'SINSP', 'INSP',
  'SFO4', 'SFO3', 'SFO2', 'SFO1', 'FO3', 'FO2', 'FO1'];
export const MAX_IMPORT_ROWS = 200;
export const MAX_IMPORT_BYTES = 1024 * 1024;

export const normalizeImportRow = (row) => {
  const normalized = { ...row };
  for (const { key } of IMPORT_COLUMNS) normalized[key] = String(row[key] ?? '').trim();
  normalized.email = normalized.email.toLowerCase();
  normalized.role = normalized.role.toLowerCase();
  if (IMPORT_RANKS.includes(normalized.rank.toUpperCase())) {
    normalized.rank = normalized.rank.toUpperCase();
  } else if (/^other\s*:/i.test(normalized.rank)) {
    normalized.rank = `OTHER: ${normalized.rank.replace(/^other\s*:/i, '').trim()}`;
  }
  return normalized;
};

export const validateImportRows = (input) => {
  const rows = input.map(normalizeImportRow);
  const counts = new Map();
  for (const row of rows) {
    if (row.email) counts.set(row.email, (counts.get(row.email) || 0) + 1);
  }
  return rows.map((row) => {
    const errors = [];
    if (row.parse_error) errors.push(row.parse_error);
    for (const { key, label } of IMPORT_COLUMNS) {
      if (!row[key]) errors.push(`${label} is required.`);
    }
    for (const key of ['first_name', 'last_name']) {
      if (row[key] && (row[key].length > 80 || !/^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/.test(row[key]))) {
        errors.push(`${key === 'first_name' ? 'First' : 'Last'} name must use letters, spaces, apostrophes or hyphens (up to 80 characters).`);
      }
    }
    if (row.email && (row.email.length > 254 || !/^[^\s@,;]+@gmail\.com$/i.test(row.email))) {
      errors.push('Enter a valid Gmail address ending in @gmail.com.');
    }
    if (row.contact_number && !/^09\d{9}$/.test(row.contact_number)) {
      errors.push('Contact number must contain 11 digits starting with 09.');
    }
    if (row.role && !['admin', 'personnel'].includes(row.role)) errors.push('Select Admin or Personnel.');
    const customRank = row.rank.startsWith('OTHER: ') ? row.rank.slice(7) : '';
    if (row.rank && !IMPORT_RANKS.includes(row.rank)
      && (!customRank || customRank.length > 80 || [...customRank].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) {
      errors.push('Select a supported rank or enter OTHER: followed by a custom rank (up to 80 characters).');
    }
    const duplicate = row.email && counts.get(row.email) > 1;
    if (duplicate) errors.push('Email appears more than once in this import.');
    return { ...row, status: duplicate ? 'Duplicate' : errors.length ? 'Needs Correction' : 'Valid', errors };
  });
};

export const personnelCsvTemplate = () => `\uFEFF${IMPORT_COLUMNS.map(({ label }) => label).join(',')}\r\n`;

// Bounded RFC 4180-style parser. Quoted commas, doubled quotes and line breaks
// are handled; invalid quoting is rejected rather than silently shifting fields.
export const parsePersonnelCsv = (input) => {
  if (new TextEncoder().encode(input).length > MAX_IMPORT_BYTES) throw new Error('CSV file must be 1 MB or smaller.');
  const text = String(input).replace(/^\uFEFF/, '');
  const records = [];
  let fields = [], field = '', quoted = false, closedQuote = false, line = 1, startLine = 1;
  const pushField = () => { fields.push(field); field = ''; closedQuote = false; };
  const pushRecord = () => {
    pushField(); records.push({ fields, line: startLine }); fields = [];
    if (records.length > MAX_IMPORT_ROWS + 1) throw new Error(`Import up to ${MAX_IMPORT_ROWS} records at a time.`);
  };
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else { quoted = false; closedQuote = true; }
      } else { field += char; if (char === '\n') line += 1; }
    } else if (char === ',') {
      pushField();
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      pushRecord(); line += 1; startLine = line;
    } else if (char === '"' && !field && !closedQuote) {
      quoted = true;
    } else {
      if (closedQuote || char === '"') throw new Error(`Malformed CSV quoting near line ${line}. Use the downloaded template and save as CSV.`);
      field += char;
    }
  }
  if (quoted) throw new Error('CSV contains an unfinished quoted field.');
  if (field || fields.length || closedQuote) pushRecord();
  const header = records.shift();
  if (!header || header.fields.length !== IMPORT_COLUMNS.length
    || header.fields.some((value, index) => value.trim().toLowerCase() !== IMPORT_COLUMNS[index].label.toLowerCase())) {
    throw new Error('CSV columns must match the downloaded template, in the same order.');
  }
  if (!records.length) throw new Error('The CSV contains no personnel records.');
  return records.map(({ fields: values, line: source_row }) => ({
    row_id: crypto.randomUUID(), source_row,
    ...Object.fromEntries(IMPORT_COLUMNS.map(({ key }, index) => [key, values[index] || ''])),
    ...(values.length !== IMPORT_COLUMNS.length ? { parse_error: 'Row must contain exactly six columns. Edit the row to correct it, or exclude it.' } : {}),
  }));
};

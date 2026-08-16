// Named import: the browser bundle's default export is the constructor, but
// jspdf's `node` export condition resolves default to the module namespace.
// `{ jsPDF }` is the constructor under both.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// jspdf-autotable v5 only patches jsPDF.API when a global `window.jsPDF` /
// `window.jspdf` exists (i.e. the UMD build loaded from a <script> tag). Under
// Vite/ESM there is no such global, so `doc.autoTable(...)` is undefined - the
// plugin must be called as `autoTable(doc, options)` instead.

export const EMPTY_ATTENDANCE_EXPORT_MESSAGE = 'No attendance records available to export.';

// IGNIS SAFE / BFP palette (mirrors --ember / --ember-dark in the attendance CSS).
const EMBER = [214, 69, 61];
const EMBER_DARK = [177, 47, 40];
const INK = [33, 37, 41];
const MUTED = [108, 117, 125];
const RULE = [222, 226, 230];
const ZEBRA = [250, 245, 244];
const PASS = [21, 115, 71];
const FAIL = [176, 42, 42];
const PARTIAL = [176, 108, 20];

const PAGE_MARGIN = 36;
const HEADER_HEIGHT = 132;
const FOOTER_HEIGHT = 30;

export const formatDistance = (distanceMeters) => {
  // Number(null) / Number('') are 0, which would render a missing distance as "0 m".
  if (distanceMeters === null || distanceMeters === undefined || distanceMeters === '') {
    return 'Not recorded';
  }

  const distance = Number(distanceMeters);
  if (!Number.isFinite(distance)) return 'Not recorded';
  if (distance >= 1000) return `${(distance / 1000).toFixed(2)} km`;
  return `${Math.round(distance)} m`;
};

export const getVerificationLabel = (status) => {
  if (status === 'passed') return 'Passed';
  if (status === 'failed') return 'Failed';
  if (status === 'partial') return 'Partial';
  return 'Not recorded';
};

export const getCheckLabel = (value) => {
  if (value === true) return 'Passed';
  if (value === false) return 'Failed';
  return 'Not recorded';
};

export const getAttendanceStatusLabel = (record) => {
  if (record.timeIn && record.timeOut) return 'Completed';
  if (record.timeIn) return 'Time In recorded';
  return 'Not recorded';
};

const truncate = (value, maxLength) => {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
};

// The on-screen "Details" column is a button that opens the verification modal,
// so the PDF carries the same information as readable text instead.
const buildDetailsSummary = (record) => {
  const lines = [
    `Status: ${getAttendanceStatusLabel(record)}`,
    `Face ID: ${getCheckLabel(record.faceVerificationPassed)}  |  Location: ${getCheckLabel(record.locationVerificationPassed)}`,
    `Shift: ${record.shiftId || 'DEFAULT'}  |  Distance: ${formatDistance(record.distanceFromStationMeters)}`
  ];

  const site = record.location?.address || record.stationName;
  if (site) lines.push(`Site: ${truncate(site, 130)}`);

  return lines.join('\n');
};

const formatDateFilterLabel = (dateFilter) => {
  if (!dateFilter) return 'All dates';
  const date = dateFilter instanceof Date ? dateFilter : new Date(dateFilter);
  if (Number.isNaN(date.getTime())) return 'All dates';
  return date.toLocaleDateString();
};

const setColor = (doc, method, [r, g, b]) => doc[method](r, g, b);

const drawLetterhead = (doc, { logos, title }) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;

  if (logos?.bfp?.dataUrl) {
    const size = 48;
    doc.addImage(logos.bfp.dataUrl, 'PNG', PAGE_MARGIN, 26, size, size);
  }

  if (logos?.ignis?.dataUrl) {
    const width = 132;
    const ratio = logos.ignis.height && logos.ignis.width
      ? logos.ignis.height / logos.ignis.width
      : 61 / 252;
    const height = width * ratio;
    doc.addImage(logos.ignis.dataUrl, 'PNG', pageWidth - PAGE_MARGIN - width, 26 + (48 - height) / 2, width, height);
  }

  let y = 38;
  setColor(doc, 'setTextColor', INK);
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  doc.text('Republic of the Philippines', centerX, y, { align: 'center' });

  y += 12;
  doc.text('Department of the Interior and Local Government', centerX, y, { align: 'center' });

  y += 13;
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.text('BUREAU OF FIRE PROTECTION', centerX, y, { align: 'center' });

  y += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setColor(doc, 'setTextColor', EMBER_DARK);
  doc.text('IGNIS SAFE - Fire Safety, Preparedness, Simulation', centerX, y, { align: 'center' });

  y += 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  setColor(doc, 'setTextColor', INK);
  doc.text(title, centerX, y, { align: 'center' });

  y += 8;
  setColor(doc, 'setDrawColor', EMBER);
  doc.setLineWidth(1.4);
  doc.line(PAGE_MARGIN, y, pageWidth - PAGE_MARGIN, y);

  return y;
};

const drawFilterSummary = (doc, startY, { personnelSearch, dateFilter, recordCount, generatedAt }) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const leftX = PAGE_MARGIN;
  const rightX = pageWidth - PAGE_MARGIN;
  const labelWidth = 82;

  const rows = [
    [
      { label: 'Search Personnel:', value: personnelSearch?.trim() ? personnelSearch.trim() : 'All personnel' },
      { label: 'Generated:', value: generatedAt.toLocaleString() }
    ],
    [
      { label: 'Date Filter:', value: formatDateFilterLabel(dateFilter) },
      { label: 'Total Records:', value: String(recordCount) }
    ]
  ];

  let y = startY + 14;
  doc.setFontSize(8.5);

  rows.forEach(([left, right]) => {
    doc.setFont('helvetica', 'bold');
    setColor(doc, 'setTextColor', MUTED);
    doc.text(left.label, leftX, y);

    doc.setFont('helvetica', 'normal');
    setColor(doc, 'setTextColor', INK);
    doc.text(truncate(left.value, 70), leftX + labelWidth, y);

    // Right column is laid out from the right edge inwards so the label still
    // reads before its value.
    const rightValue = truncate(right.value, 46);
    doc.text(rightValue, rightX, y, { align: 'right' });
    const rightValueWidth = doc.getTextWidth(rightValue);

    doc.setFont('helvetica', 'bold');
    setColor(doc, 'setTextColor', MUTED);
    doc.text(right.label, rightX - rightValueWidth - 5, y, { align: 'right' });

    y += 12;
  });

  return y;
};

const drawFooters = (doc) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalPages = doc.internal.getNumberOfPages();
  const y = pageHeight - 22;

  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);

    setColor(doc, 'setDrawColor', RULE);
    doc.setLineWidth(0.6);
    doc.line(PAGE_MARGIN, y - 10, pageWidth - PAGE_MARGIN, y - 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setColor(doc, 'setTextColor', MUTED);
    doc.text('IGNIS SAFE | Bureau of Fire Protection - Attendance Management', PAGE_MARGIN, y);
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - PAGE_MARGIN, y, { align: 'right' });
  }
};

/**
 * Builds the attendance report document. Pure/synchronous so it can be exercised
 * outside the browser; the caller supplies already-decoded logos.
 * Returns null when there is nothing to export.
 */
export const buildAttendancePdf = ({
  records = [],
  personnelSearch = '',
  dateFilter = null,
  generatedAt = new Date(),
  logos = null,
  title = 'ATTENDANCE MANAGEMENT REPORT'
} = {}) => {
  if (!Array.isArray(records) || records.length === 0) return null;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  const body = records.map((record, index) => [
    String(index + 1),
    record.name || 'Not recorded',
    record.rank || 'Not recorded',
    record.date || 'Not recorded',
    record.timeIn || '--',
    record.timeOut || '--',
    getVerificationLabel(record.verificationStatus),
    buildDetailsSummary(record)
  ]);

  autoTable(doc, {
    head: [['No.', 'Name', 'Rank', 'Date', 'Time In', 'Time Out', 'Verification', 'Details']],
    body,
    startY: HEADER_HEIGHT,
    margin: { top: HEADER_HEIGHT, right: PAGE_MARGIN, bottom: FOOTER_HEIGHT, left: PAGE_MARGIN },
    theme: 'grid',
    tableLineColor: RULE,
    tableLineWidth: 0.6,
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: { top: 5, right: 6, bottom: 5, left: 6 },
      lineColor: RULE,
      lineWidth: 0.6,
      textColor: INK,
      overflow: 'linebreak',
      valign: 'middle'
    },
    headStyles: {
      fillColor: EMBER,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center',
      valign: 'middle',
      lineColor: EMBER,
      lineWidth: 0.6
    },
    alternateRowStyles: { fillColor: ZEBRA },
    columnStyles: {
      0: { cellWidth: 30, halign: 'center' },
      1: { cellWidth: 108 },
      2: { cellWidth: 104 },
      3: { cellWidth: 66, halign: 'center' },
      4: { cellWidth: 52, halign: 'center' },
      5: { cellWidth: 55, halign: 'center' },
      6: { cellWidth: 66, halign: 'center', fontStyle: 'bold' },
      7: { cellWidth: 'auto', fontSize: 7.5, valign: 'top' }
    },
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 6) return;

      const status = records[data.row.index]?.verificationStatus;
      if (status === 'passed') data.cell.styles.textColor = PASS;
      else if (status === 'failed') data.cell.styles.textColor = FAIL;
      else if (status === 'partial') data.cell.styles.textColor = PARTIAL;
      else data.cell.styles.textColor = MUTED;
    },
    didDrawPage: () => {
      const ruleY = drawLetterhead(doc, { logos, title });
      drawFilterSummary(doc, ruleY, {
        personnelSearch,
        dateFilter,
        recordCount: records.length,
        generatedAt
      });
    }
  });

  drawFooters(doc);

  return doc;
};

export const buildAttendancePdfFileName = (generatedAt = new Date()) => {
  const year = generatedAt.getFullYear();
  const month = String(generatedAt.getMonth() + 1).padStart(2, '0');
  const day = String(generatedAt.getDate()).padStart(2, '0');
  return `attendance_report_${year}-${month}-${day}.pdf`;
};

const readBlobAsDataUrl = (blob, url) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error(`Failed to decode ${url}`));
  reader.onloadend = () => resolve(reader.result);
  reader.readAsDataURL(blob);
});

const decodeImage = (dataUrl) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Failed to decode report logo.'));
  image.src = dataUrl;
});

// Source seals are ~580px square; embedding them raw would add ~500 KB of
// base64 per report, so they are resampled down to print size first.
const loadImageAsset = async (url, maxDimension = 160) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}`);

  const originalDataUrl = await readBlobAsDataUrl(await response.blob(), url);
  const image = await decodeImage(originalDataUrl);
  const width = image.naturalWidth || 0;
  const height = image.naturalHeight || 0;

  const scale = Math.min(1, maxDimension / Math.max(width, height, 1));
  if (scale >= 1 || !width || !height) {
    return { dataUrl: originalDataUrl, width, height };
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return { dataUrl: canvas.toDataURL('image/png'), width, height };
};

// Logos are optional decoration - the report is still generated without them.
const loadReportLogos = async () => {
  try {
    const [bfpModule, ignisModule] = await Promise.all([
      import('../assets/bfp_logo.png'),
      import('../assets/Logo1.png')
    ]);

    const [bfp, ignis] = await Promise.all([
      loadImageAsset(bfpModule.default),
      loadImageAsset(ignisModule.default)
    ]);

    return { bfp, ignis };
  } catch (error) {
    console.warn('Attendance PDF: could not load report logos.', error);
    return null;
  }
};

/**
 * Browser entry point: builds and downloads the attendance report.
 * Returns { success, message, fileName, recordCount }.
 */
export const exportAttendancePdf = async ({ records = [], personnelSearch = '', dateFilter = null } = {}) => {
  if (!Array.isArray(records) || records.length === 0) {
    return { success: false, message: EMPTY_ATTENDANCE_EXPORT_MESSAGE, recordCount: 0 };
  }

  const generatedAt = new Date();
  const logos = await loadReportLogos();

  const doc = buildAttendancePdf({ records, personnelSearch, dateFilter, generatedAt, logos });
  if (!doc) {
    return { success: false, message: EMPTY_ATTENDANCE_EXPORT_MESSAGE, recordCount: 0 };
  }

  const fileName = buildAttendancePdfFileName(generatedAt);
  doc.save(fileName);

  return { success: true, message: '', fileName, recordCount: records.length };
};

// One-time image optimization for perf/lighthouse-optimization.
// Re-encodes in place (same filename + format) so no import/CSS-url changes are
// needed. sharp is a temporary devDependency, removed afterwards.
//
//   npm i -D sharp && node scripts/optimize-images.mjs && npm un sharp

import fs from 'node:fs';
import sharp from 'sharp';

const A = 'src/assets';
const kb = (n) => (n / 1024).toFixed(1) + 'KB';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Windows AV / indexers briefly lock a freshly written file — retry the write.
async function writeWithRetry(dest, buf) {
  for (let i = 0; i < 8; i += 1) {
    try {
      fs.writeFileSync(dest + '.tmp', buf);
      fs.renameSync(dest + '.tmp', dest);
      return;
    } catch (e) {
      if (i === 7) throw e;
      await sleep(400);
    }
  }
}

// [file, transform]. Transform returns a sharp pipeline.
const jobs = [
  // Sidebar logo: always rendered in a square 40-48px box. Squash to a square
  // canvas with fit:'fill' so it matches today's rendered pixels exactly while
  // giving Lighthouse a 1:1 intrinsic ratio (fixes image-aspect-ratio).
  ['inLOGO.png', (img) => img.resize(96, 96, { fit: 'fill' }).png({ compressionLevel: 9, palette: true })],
  // Hero / contact photo (LCP element on Landing). Keep dimensions, re-encode.
  ['firestation.jpg', (img) => img.jpeg({ quality: 76, mozjpeg: true })],
  // About-section personnel photo.
  ['bfp_pic.jpg', (img) => img.jpeg({ quality: 78, mozjpeg: true })],
  // Login / confirm-signup fixed background (rendered "cover").
  ['BG.png', (img) => img.resize(1280, null, { withoutEnlargement: true }).png({ compressionLevel: 9, palette: true, quality: 82 })],
  // Seals / brand marks - keep dimensions (also fetched by InvestigationReport
  // for PDF letterhead), just quantize.
  ['bfp_logo.png', (img) => img.png({ compressionLevel: 9, palette: true, quality: 85 })],
  ['bfp_dasma.png', (img) => img.png({ compressionLevel: 9, palette: true, quality: 85 })],
];

for (const [file, fn] of jobs) {
  const src = `${A}/${file}`;
  if (!fs.existsSync(src)) { console.log('skip (missing):', file); continue; }
  const before = fs.statSync(src).size;
  const buf = await fn(sharp(src)).toBuffer();
  if (buf.length < before) {
    await writeWithRetry(src, buf);
    console.log(`${file.padEnd(20)} ${kb(before)} -> ${kb(buf.length)}`);
  } else {
    console.log(`${file.padEnd(20)} kept (${kb(before)}; re-encode was ${kb(buf.length)})`);
  }
}

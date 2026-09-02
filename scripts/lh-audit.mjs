// One-time Lighthouse measurement harness for the perf/lighthouse-optimization
// work. NOT shipped — removed with its devDependencies once the work is done.
//
// Usage:
//   node scripts/lh-audit.mjs --profile <chrome-user-data-dir> --runs 3 \
//        --out docs/superpowers/lighthouse/raw --label baseline \
//        --url "Landing Page=/" --url "Personnel - Profile=/personnel/profile"
//
// Reuses an existing (already logged-in) Chrome profile directory so gated
// routes audit under a real session. Storage reset is disabled so the Supabase
// session in localStorage survives each run.

import fs from 'node:fs';
import path from 'node:path';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

const args = process.argv.slice(2);
const opts = { runs: 3, profile: null, out: 'docs/superpowers/lighthouse/raw', label: 'run', base: 'http://localhost:4173', urls: [] };
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--runs') opts.runs = Number(args[++i]);
  else if (a === '--profile') opts.profile = args[++i];
  else if (a === '--out') opts.out = args[++i];
  else if (a === '--label') opts.label = args[++i];
  else if (a === '--base') opts.base = args[++i];
  else if (a === '--url') {
    const raw = args[++i];
    const eq = raw.indexOf('=');
    opts.urls.push({ name: raw.slice(0, eq), path: raw.slice(eq + 1) });
  }
}

if (!opts.urls.length) {
  console.error('No --url "Name=/path" pairs given.');
  process.exit(1);
}

fs.mkdirSync(opts.out, { recursive: true });

const chromeFlags = [
  '--headless=new',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=Translate,OptimizationHints',
];

const lhFlags = {
  logLevel: 'error',
  output: ['json'],
  onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  // Keep the logged-in Supabase session that lives in localStorage.
  disableStorageReset: true,
};

// Lighthouse default config already emulates a mid-tier mobile device with
// 4x CPU throttling and simulated slow 4G — the standard "mobile preset".
const lhConfig = { extends: 'lighthouse:default', settings: { formFactor: 'mobile', throttlingMethod: 'simulate' } };

const num = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : null);

function pick(lhr) {
  const cat = lhr.categories;
  const a = lhr.audits;
  return {
    performance: num((cat.performance?.score ?? 0) * 100),
    accessibility: num((cat.accessibility?.score ?? 0) * 100),
    'best-practices': num((cat['best-practices']?.score ?? 0) * 100),
    seo: num((cat.seo?.score ?? 0) * 100),
    LCP_ms: num(a['largest-contentful-paint']?.numericValue),
    TBT_ms: num(a['total-blocking-time']?.numericValue),
    CLS: num(a['cumulative-layout-shift']?.numericValue),
    FCP_ms: num(a['first-contentful-paint']?.numericValue),
    SI_ms: num(a['speed-index']?.numericValue),
  };
}

const results = [];

for (const target of opts.urls) {
  const url = opts.base + target.path;
  const runs = [];
  for (let r = 1; r <= opts.runs; r += 1) {
    const chrome = await launch({
      chromeFlags,
      userDataDir: opts.profile || undefined,
      ignoreDefaultFlags: false,
    });
    try {
      const runnerResult = await lighthouse(url, { ...lhFlags, port: chrome.port }, lhConfig);
      const metrics = pick(runnerResult.lhr);
      runs.push(metrics);
      const safe = target.name.replace(/[^a-z0-9]+/gi, '_');
      fs.writeFileSync(
        path.join(opts.out, `${opts.label}__${safe}__run${r}.json`),
        runnerResult.report[0],
      );
      console.log(`[${target.name}] run ${r}:`, JSON.stringify(metrics));
    } finally {
      await chrome.kill();
    }
  }
  const keys = ['performance', 'accessibility', 'best-practices', 'seo', 'LCP_ms', 'TBT_ms', 'CLS', 'FCP_ms', 'SI_ms'];
  const mean = {};
  for (const k of keys) {
    const vals = runs.map((x) => x[k]).filter((v) => typeof v === 'number');
    mean[k] = vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100 : null;
  }
  results.push({ name: target.name, path: target.path, runs, mean });
}

fs.writeFileSync(
  path.join(opts.out, `${opts.label}__summary.json`),
  JSON.stringify(results, null, 2),
);
console.log('\n=== SUMMARY ===');
for (const res of results) {
  console.log(`\n${res.name} (${res.path})`);
  res.runs.forEach((run, i) => console.log(`  Run ${i + 1}: ${JSON.stringify(run)}`));
  console.log(`  MEAN : ${JSON.stringify(res.mean)}`);
}

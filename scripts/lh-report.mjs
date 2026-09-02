// Build a compact scoreboard + failing-audit digest from lh-audit summary/report
// JSON. One-time dev tooling for perf/lighthouse-optimization.
//
//   node scripts/lh-report.mjs <label>        e.g. baseline
//
// Reads docs/superpowers/lighthouse/raw/<label>-*__summary.json and the matching
// per-run report JSON; writes docs/superpowers/lighthouse/<label>-scoreboard.md.

import fs from 'node:fs';
import path from 'node:path';

const label = process.argv[2] || 'baseline';
const RAW = 'docs/superpowers/lighthouse/raw';
const groups = ['public', 'personnel', 'admin'];

const rows = [];
for (const g of groups) {
  const p = path.join(RAW, `${label}-${g}__summary.json`);
  if (!fs.existsSync(p)) continue;
  for (const m of JSON.parse(fs.readFileSync(p, 'utf8'))) {
    rows.push({ group: g, ...m });
  }
}

const fmt = (v) => (v == null ? '-' : typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : v);

let md = `# Lighthouse ${label} scoreboard (Desktop preset, 3 runs, mean)\n\n`;
md += 'Mean = (run1+run2+run3)/3, computed per metric.\n\n';
md += '| Module | Route | Perf | A11y | BP | SEO | LCP ms | TBT ms | CLS |\n';
md += '|---|---|---|---|---|---|---|---|---|\n';
for (const r of rows) {
  const m = r.mean;
  md += `| ${r.name} | \`${r.path}\` | ${fmt(m.performance)} | ${fmt(m.accessibility)} | ${fmt(m['best-practices'])} | ${fmt(m.seo)} | ${fmt(m.LCP_ms)} | ${fmt(m.TBT_ms)} | ${fmt(m.CLS)} |\n`;
}

md += '\n## All runs\n\n';
for (const r of rows) {
  md += `### ${r.name} (\`${r.path}\`)\n\n`;
  md += '| Run | Perf | A11y | BP | SEO | LCP | TBT | CLS | FCP | SI |\n|---|---|---|---|---|---|---|---|---|---|\n';
  r.runs.forEach((x, i) => {
    md += `| ${i + 1} | ${fmt(x.performance)} | ${fmt(x.accessibility)} | ${fmt(x['best-practices'])} | ${fmt(x.seo)} | ${fmt(x.LCP_ms)} | ${fmt(x.TBT_ms)} | ${fmt(x.CLS)} | ${fmt(x.FCP_ms)} | ${fmt(x.SI_ms)} |\n`;
  });
  const m = r.mean;
  md += `| **mean** | **${fmt(m.performance)}** | **${fmt(m.accessibility)}** | **${fmt(m['best-practices'])}** | **${fmt(m.seo)}** | **${fmt(m.LCP_ms)}** | **${fmt(m.TBT_ms)}** | **${fmt(m.CLS)}** | ${fmt(m.FCP_ms)} | ${fmt(m.SI_ms)} |\n\n`;
}

md += '\n## Failing / notable audits (run 1 report)\n\n';
for (const r of rows) {
  const safe = r.name.replace(/[^a-z0-9]+/gi, '_');
  const rep = path.join(RAW, `${label}-${r.group}__${safe}__run1.json`);
  if (!fs.existsSync(rep)) continue;
  const lhr = JSON.parse(fs.readFileSync(rep, 'utf8'));
  const fails = [];
  for (const [id, a] of Object.entries(lhr.audits)) {
    if (a.scoreDisplayMode === 'binary' || a.scoreDisplayMode === 'numeric') {
      if (a.score !== null && a.score < 0.9) {
        let extra = '';
        const items = a.details?.items;
        if (Array.isArray(items) && items.length) {
          extra = ' :: ' + items.slice(0, 4).map((it) => it.node?.selector || it.url || it.source?.url || JSON.stringify(it).slice(0, 80)).join(' ; ');
        }
        fails.push(`- **${id}** (${a.score}) ${a.title}${extra}`);
      }
    }
  }
  md += `### ${r.name}\n${fails.length ? fails.join('\n') : '_none below 0.9_'}\n\n`;
}

const out = path.join('docs/superpowers/lighthouse', `${label}-scoreboard.md`);
fs.writeFileSync(out, md);
console.log('wrote', out, `(${rows.length} modules)`);

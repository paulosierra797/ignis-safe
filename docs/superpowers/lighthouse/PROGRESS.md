# Lighthouse optimization — working state

Branch: `perf/lighthouse-optimization` (off `main`).
Spec: `docs/superpowers/specs/2026-09-03-lighthouse-optimization-design.md`.
Baseline scoreboard + failing-audit digest: `docs/superpowers/lighthouse/baseline-scoreboard.md`.

## Measurement (LOCKED — user directive)

- **Desktop Lighthouse preset only.** Production build. Same machine.
- `npm run build && npm run preview -- --port 4173` (server currently up on 4173).
- Harness: `node scripts/lh-audit.mjs --profile <dir> --runs 3 --label <lbl> --url "Name=/path" ...`
  then `node scripts/lh-report.mjs <lbl>` -> `docs/superpowers/lighthouse/<lbl>-scoreboard.md`.
  Convenience: `bash scripts/lh-run-baseline.sh <label>` runs all 20 routes.
- **3 runs per module; keep every run; report mean=(r1+r2+r3)/3 per metric. No medians.**
- Chrome profile copies (already logged in; localStorage session, `disableStorageReset:true`):
  - personnel -> `C:/Users/Asus/AppData/Local/Temp/claude/lh-prof-personnel-1`
  - admin     -> `C:/Users/Asus/AppData/Local/Temp/claude/lh-prof-admin-1`
  - If admin audits redirect to `/login` (12 h trust), re-login MCP browser as admin
    (OTP from user) and re-copy the profile with robocopy.
- **Discipline:** while an lh-audit run is active, do not drive the MCP browser or run
  heavy Bash — ambient CPU load skews the numbers.
- Dev-only deps in node_modules, kept OUT of package.json (restore after each use):
  `lighthouse`, `puppeteer-core`, `sharp`. Remove all at the very end.

## Accounts (user's labels were swapped)

- `fatimaklyesierra081005@gmail.com` / `BFPDasma_123` -> PERSONNEL (FO2 PERSONNEL ACCOUNT TEST)
- `sierrarpv@gmail.com` / `BFPDasma_123` -> ADMIN (Administrative admin)

## OPEN QUESTION FOR USER

Production canonical domain? `public/robots.txt` currently guesses
`https://ignis-safe.vercel.app`. Needed for the Sitemap line, `<link rel=canonical>`,
and `sitemap.xml`. Confirm the real domain before finalising SEO.

## Baseline means (Desktop preset) — targets: P/A/BP >=90, SEO >=90 public, LCP<=2500, TBT<=200, CLS<=0.10

| Module | Perf | A11y | BP | SEO | CLS | worst issues |
|---|---|---|---|---|---|---|
| Landing `/` | 88 | 96 | 100 | 83 | 0.14 | CLS, SEO, color-contrast(process-column-number) |
| Org Chart `/organizational-chart` | 96 | 100 | 100 | 83 | 0.01 | SEO |
| Terms `/terms` | 97 | 100 | 100 | 82 | 0 | SEO |
| Privacy `/privacy` | 97 | 100 | 100 | 82 | 0 | SEO |
| Send Message `/send-message` | 98 | 95 | 100 | 83 | 0 | SEO, color-contrast |
| Attendance Login `/attendance-login` | 99 | 100 | 100 | 83 | 0 | SEO |
| Personnel Announcements `/personnel/announcements` | 94 | 95 | 96 | 83 | 0 | BP(logo), aria-allowed-role, contrast(page-user-role), LCP |
| Personnel Shift Schedule `/personnel/operations` | 91 | 96 | 96 | 83 | 0.16 | CLS, label-content-name-mismatch, contrast, BP(logo) |
| Personnel Profile `/personnel/profile` | 99 | 90 | 96 | 83 | 0 | heading-order, label, contrast, BP(logo), valid-source-maps |
| Personnel Attendance `/attendance-personnel` | 99 | 96 | 96 | 83 | 0 | contrast, BP(logo), aria-allowed-role |
| Personnel Reports `/reports` | 99 | 96 | 96 | 83 | 0 | contrast, BP(logo) |
| Personnel Audit Logs `/personnel/history` | 99 | 92 | 96 | 83 | 0 | label(filter-select), contrast(status-badge), BP(logo) |
| Admin Org Chart `/dashboard/chart` | 100 | 95 | 96 | 83 | 0.01 | contrast(page-user-role), BP(logo) |
| Admin Assessment Qs `/dashboard/assessment-questions` | 97 | 92 | 96 | 83 | 0.01 | select-name, contrast, BP(logo) |
| Admin Messages `/dashboard/visitor-messages` | 98 | 96 | 96 | 83 | 0 | contrast(multi), BP(logo), speed-index |
| Admin About Us `/dashboard/about-us` | 77 | 96 | 96 | 83 | 0.48 | **CLS 0.48**, **Perf**, contrast(aboutus-hint), BP(logo) |
| Admin Personnel Mgmt `/dashboard/accounts` | 100 | 97 | 96 | 83 | 0 | label-content-name-mismatch(shift-summary-day), contrast(tabs), BP(logo) |
| Admin Users `/dashboard/users` | 99 | 89 | 96 | 83 | 0.04 | **A11y**, select-name x2, contrast(progress-view-btn), BP(logo) |
| Admin Attendance `/attendance-admin` | 100 | 94 | 96 | 83 | 0 | contrast(export-csv-btn), BP(logo) |
| Admin Dashboard `/dashboard` | 99 | 95 | 94 | 83 | 0 | heading-order, label-content-name-mismatch(metric-card), contrast, BP(logo) |

## DONE (committed)

- Spec + harness + scoreboard tooling.
- `a396407` images re-encoded in place (inLOGO->96x96 square fixes image-aspect-ratio;
  firestation 374->151KB, BG 1013->218KB, bfp_logo 365->94, bfp_dasma 167->42, bfp_pic 180->98).
- `e3bb7f3` Sidebar `<img>` width/height/decoding; nudge `<aside role=status>` -> `<div>`
  (fixes `aria-allowed-role`); `index.html` meta description + theme-color; `public/robots.txt`.

Not yet re-measured — do after the rest of Phase 1.

## TODO — Phase 1 shared (do next)

1. **Fonts** — self-host via `@fontsource/poppins` (user said "use @fontsource/poppins
   althroughout"). Steps: `npm i @fontsource/poppins` (this ONE is a real dependency,
   allowed); import weights 400/500/600/700/800/900 in `src/main.jsx` (or index.css);
   remove the 2 `preconnect` + the `fonts.googleapis.com` `<link>` from `index.html`;
   add a metrics-matched fallback `@font-face` (size-adjust) in `index.css` so swap
   doesn't shift. Rebuild; verify no visual change.
2. **PageHeader shared a11y** (`src/components/PageHeader.jsx` + `PageHeader.css`):
   - `span.page-user-role` fails `color-contrast` on EVERY authenticated route — darken
     the role text colour in `PageHeader.css` (near-identical, pre-approved).
   - `div.page-user` has onClick but is a div — make it a real `<button>` (keyboard +
     accessible name); keep look identical. Decorative `▼` -> wrap `aria-hidden`.
   - avatar `<img>` -> add width/height + better `alt`.
3. **Global CSS** (`src/index.css`): add `:focus-visible` outline if missing;
   consider `content-visibility:auto` + `contain-intrinsic-size` for offscreen landing
   sections (test CLS impact).
4. **SEO hook** — `src/hooks/useDocumentMeta.js` (new): sets per-page `<title>`,
   `<meta name=description>`, `<link rel=canonical>`. Apply on public routes only:
   `/`, `/organizational-chart`, `/terms`, `/privacy`, `/send-message`, `/attendance-login`.
   Also set `<meta name=robots content=noindex>` when on a non-public route.
   Add `public/sitemap.xml` (public URLs only) once domain confirmed.

## TODO — Phase 2 per-module (worst first), retest 3x after each

- **Admin About Us `/dashboard/about-us`** — CLS 0.48 + Perf 77. Culprit: `#emergency-contacts`
  section (and everything below) shifts because content above loads/reflows late.
  Read `AboutUsContent.jsx` (1281 lines) + `AboutUsContent.css`. Likely a banner image
  or progressively-rendered subsections with no reserved height. Reserve space /
  add img dimensions / skeletons. Investigate Perf (heavy render, maybe editor components
  mounting eagerly).
- **Personnel Shift Schedule `/personnel/operations`** — CLS 0.16. Culprit: shift
  calendar + react-datepicker + leave history rendering in. Reserve the calendar grid
  height and datepicker area. Also `label-content-name-mismatch` on
  `.shift-calendar-day-card` buttons (aria-label text must contain the visible text).
- **Landing `/`** — CLS 0.14. `cls-culprits` = `.process-column-number` / process grid;
  also font swap. Fonts fix (Phase 1.1) + reserve process section. `color-contrast` on
  `.process-column-number` (darken). LCP 0.84 — hero `firestation.jpg` already shrunk;
  re-check.
- **Admin Users `/dashboard/users`** (Progress.jsx) — A11y 89: `select-name` x2 (add
  `aria-label`/`<label>` to `.progress-filter select`), `color-contrast` on
  `.progress-view-btn`.
- **Personnel Profile** — `heading-order` (h3 in `.profile-card-header` after h1, no h2 —
  change to h2 or restructure), `label` (unlabelled input in `.form-field-full`),
  contrast (`.my-request-status`, `.my-request-dates span`).
- **Personnel Audit Logs / Admin Assessment Qs / Admin Dashboard / Admin Personnel Mgmt**
  — label/select-name/heading-order/label-content-name-mismatch per digest.
- **Contrast** recurring targets (darken, near-identical): `.status-badge`, `.shift-tag`,
  `.aboutus-hint`, `.report-upload-hint`, `.qr-eyebrow`, accounts tab `span`,
  `.see-more-btn`, `.visitor-conversation-*` timestamps, `.export-csv-btn`.

## Verify after every fix

`npm run build` (green — note: 1 PRE-EXISTING lint error in AnnouncementAcknowledgement.jsx
`Date.now()` purity, NOT ours, ignore), 3-run Lighthouse, functional smoke via MCP browser,
compare Supabase request list unchanged. Commit per fix.

## Final deliverable

Concise summary only (user asked): modules fixed, final scores, remaining issues.
Full 3-run table only if something misses target. Then remove lighthouse/puppeteer-core/sharp
from node_modules, delete `scripts/lh-*.mjs` + `scripts/optimize-images.mjs` + raw reports?
(keep scoreboards + spec). Confirm with user before deleting harness.

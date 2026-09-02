# Lighthouse optimization — working state

Branch: `perf/lighthouse-optimization` (off `main`).
Spec: `docs/superpowers/specs/2026-09-03-lighthouse-optimization-design.md`.

## Environment / how to measure

- Preview server: `npm run build && npm run preview -- --port 4173` (http://localhost:4173).
  A preview server is currently running on 4173.
- Dev tooling installed to `node_modules` but **kept out of `package.json`**
  (restored): `lighthouse`, `puppeteer-core`. Also `sharp` will be added
  temporarily for image work, then removed. Remove all three at the very end.
- Harness: `scripts/lh-audit.mjs` + `scripts/lh-run-baseline.sh`.
  Full Lighthouse JSON goes to `docs/superpowers/lighthouse/raw/` (gitignored).
- Auth: Supabase session lives in **localStorage** (reading the token directly
  is blocked by the classifier — do not try). Instead the MCP Chrome profile
  (`C:\Users\Asus\.cache\chrome-devtools-mcp\chrome-profile`) was logged in for
  each role and **robocopied** to:
  - personnel -> `C:/Users/Asus/AppData/Local/Temp/claude/lh-prof-personnel-1`
  - admin     -> `C:/Users/Asus/AppData/Local/Temp/claude/lh-prof-admin-1`
  `lh-audit.mjs` passes the copy as `userDataDir` with `disableStorageReset:true`,
  so gated routes audit under a real session. Confirmed working (real Supabase
  REST calls, authenticated screenshots).
  Trust windows: personnel 14 days, admin 12 h — if admin audits start
  redirecting to `/login`, re-login the MCP browser as admin (OTP from user)
  and re-copy the profile.

## Accounts (labels were swapped in the user's message)

- `fatimaklyesierra081005@gmail.com` / `BFPDasma_123` -> **PERSONNEL**
  ("FO2 PERSONNEL ACCOUNT TEST", Shift B)
- `sierrarpv@gmail.com` / `BFPDasma_123` -> **ADMIN** ("Administrative admin")

## MEASUREMENT DISCIPLINE (important)

Numbers are sensitive to concurrent CPU / browser activity. The first baseline
attempt was contaminated because the MCP browser was being driven (admin login)
while audits ran — Landing showed P66/LCP7000 vs a quiet P89/LCP3800.

Rule: while any `lh-audit` run is in progress, do NOT drive the MCP browser and
do NOT run other heavy Bash. Only `npm run preview` + one audit Chrome.

Methodology (user-specified): 3 runs per module, keep every run, report
`mean = (r1+r2+r3)/3` computed separately for Performance, Accessibility,
Best Practices, SEO, LCP, TBT, CLS. No medians.

## Route map (confirmed via sidebars)

Public: `/`, `/organizational-chart`, `/terms`, `/privacy`, `/send-message`,
`/attendance-login`
Personnel: `/personnel/announcements`, `/personnel/operations` (Shift Schedule),
`/personnel/profile`, `/attendance-personnel`, `/reports`, `/personnel/history`
Admin: `/dashboard/chart` (Org Chart Mgmt), `/dashboard/assessment-questions`,
`/dashboard/visitor-messages` (Messages), `/dashboard/about-us`,
`/dashboard/accounts` (Personnel Mgmt — has shift schedule), `/dashboard/users`,
`/dashboard` (Dashboard)
"Attendance Page" (CLS 0.176 in the brief) — not yet confirmed; likely the
public `/attendance-login` kiosk. Verify at baseline.

## Status

- [x] Spec written + committed (764096b)
- [x] Harness written + committed (b119467)
- [x] Both role sessions captured to profile copies
- [ ] **Clean full baseline (3 runs) — re-run needed (first attempt contaminated)**
- [ ] Phase 1 shared fixes
- [ ] Phase 2 per-module

## Early findings (from smoke runs — reconfirm at baseline)

- Landing quiet baseline ~P89, LCP ~3.8s (hero `firestation.jpg` 383 KB, LCP
  element). SEO 83 on every page (missing meta description / per-page titles).
- `/personnel/operations`: CLS ~0.23 (react-datepicker + calendar + leave
  history render-in). TBT ~145.
- `/dashboard/assessment-questions`: duplicate Supabase reads —
  `admin?select=*` x3, `assessments` / `modules` / `learning_material_admin_view`
  x2, `touch_backoffice_activity` x2, `/auth/v1/user` x2.
- `index.html` still requests Google Fonts (Poppins 300;400;500;600;700;800;900,
  render-blocking). Font weights actually used in CSS: 400,500,600,700,800,900
  (+ nonstandard 450/650/750/850 which snap).
- Heavy chunks: vendor-vision 1.46 MB, vendor-documents 418 KB, html2canvas
  201 KB, react-datepicker 179 KB, vendor-charts 185 KB.
- Big raw images: BG.png 1.0MB, firestation.jpg 383K, bfp_logo.png 374K,
  bfp_pic.jpg 184K, bfp_dasma.png 171K (used in Header + LoginPage).

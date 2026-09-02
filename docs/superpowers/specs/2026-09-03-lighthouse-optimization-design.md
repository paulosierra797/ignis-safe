# IGNIS SAFE — Lighthouse Optimization Design

Date: 2026-09-03
Branch: `perf/lighthouse-optimization`

## Goal

Raise Lighthouse scores without changing the visible design, functionality,
Supabase queries/RPC/RLS, authentication, routing, permissions, or user flow.

Targets (per module, unless noted):

| Metric | Target |
| --- | --- |
| Performance | >= 90 |
| Accessibility | >= 90 |
| Best Practices | >= 90 |
| SEO (public pages only) | >= 90 |
| LCP | <= 2.5 s |
| TBT | <= 200 ms |
| CLS | <= 0.10 |

## Priority modules (worst Performance first)

| Module | Route (confirm at baseline) | Baseline Perf |
| --- | --- | --- |
| Personnel - Announcements | `/personnel/announcements` | 81.33 |
| Attendance Page | `/attendance-*` | 83.00 |
| Admin Organization Chart Management | `/dashboard/chart` | 83.33 |
| Personnel - Shift Schedule | `/personnel/operations` | 84.67 |
| Admin Assessment Questions Management | `/dashboard/assessment-questions` | 85.33 |
| Personnel - Profile | `/personnel/profile` | 85.67 |
| Admin Messages Management | `/dashboard/visitor-messages` | 88.33 |
| Admin About Us Content Management | `/dashboard/about-us` | 88.33 |
| Landing Page | `/` | 88.67 |
| Personnel - Attendance | `/attendance-personnel` | 89.33 |
| Admin Personnel and Shift Schedule Management | `/dashboard/users` | 89.33 |

CLS focus: Attendance 0.176, Assessment Questions 0.122, About Us 0.104.
Accessibility focus: Attendance 87.
SEO focus: public pages scoring 82-83.

## Measurement methodology

- Audit the **production build**: `npm run build && npm run preview`
  (http://localhost:4173). Never the dev server.
- Chrome via the Chrome DevTools MCP. Log in once per session with the provided
  admin and personnel test accounts; reuse the session for gated routes.
- Lighthouse mobile preset, all four categories.
- **Run Lighthouse 3 times per module.** Record every Run 1 / Run 2 / Run 3
  value. Do **not** use the median. Report:

  `Overall Mean = (Run 1 + Run 2 + Run 3) / 3`

  computed separately for Performance, Accessibility, Best Practices, SEO, LCP,
  TBT, and CLS.
- All numbers recorded in `docs/superpowers/lighthouse/scoreboard.md`
  (baseline and post-fix, per module, all three runs + mean).
- Baseline every priority module and every public page before any code change.

## Constraints / do-not-touch

- No visible design change (spacing, layout, colors - except contrast fixes
  below).
- No functionality, routing, redirect, permission, or user-flow change.
- No change to Supabase queries, RPC calls, RLS, or what data is fetched.
- No change to authentication.
- Contrast fixes: allowed **only** when required for a WCAG/Lighthouse
  accessibility failure and the result is visually near-identical.
- New dependencies: only with a clear measurable benefit; keep `package.json`
  changes minimal.
- Images: manually optimized and committed. No `vite-imagetools`, no online
  image services. `sharp` used only as a one-time local dev tool
  (`npm i -D sharp`, optimize, `npm un sharp`) or global install.
- Fonts: remove the render-blocking Google Fonts request; self-host Poppins via
  `@fontsource/poppins` (user-directed 2026-09-03), importing only the weights
  actually used.

## Approach - shared-first, measurement-driven, phased

### Phase 0 - Baseline

Capture 3-run baselines for all 11 modules + public pages. Record failing audits
per module. Confirm routes.

### Phase 1 - Global / shared fixes (applied once)

1. **Images**
   - Re-encode + resize heavy assets with `sharp`:
     `BG.png` (1.0 MB), `firestation.jpg` (383 KB, hero/LCP), `bfp_logo.png`
     (374 KB), `bfp_pic.jpg` (184 KB), `bfp_dasma.png` (171 KB, header logo),
     plus any others found during baseline.
   - Target modern format (WebP) at display size; keep a fallback only where a
     consumer needs it. Preserve visual output.
   - Add intrinsic `width`/`height` or CSS `aspect-ratio` + `loading` /
     `decoding` to every `<img>` in shared components and priority modules.

2. **Fonts**
   - Remove the `<link rel="stylesheet">` to `fonts.googleapis.com` and the two
     `preconnect`s from `index.html`.
   - Self-host Poppins via `@fontsource/poppins` for the weights in use: 400,
     500, 600, 700, 800, 900 (non-standard 450/650/750/850 in CSS snap to the
     nearest loaded weight, matching current behaviour with
     `font-synthesis: none`).
   - `@font-face` with `font-display: swap` + a fallback `@font-face`
     (`size-adjust` / `ascent-override` / `descent-override`) for a metrics-
     matched system fallback so text swap does not shift layout.
   - `<link rel="preload" as="font">` for the 2-3 most critical weights.

3. **`index.html` / document head**
   - Add `<meta name="description">`, `<meta name="theme-color">`. Keep title.

4. **Shared components**
   - `PageHeader`: avatar `<img>` -> add `width`/`height` + descriptive `alt`;
     `div.page-user` (onClick, no keyboard) -> real `<button>` with accessible
     name; decorative down-arrow -> `aria-hidden`.
   - `App` route-loader + skeleton/loader components -> reserve final footprint
     (min-height) to prevent swap-in shift.
   - `Sidebar`: `nav` landmark, `aria-current`, `aria-label` on icon-only
     controls, `:focus-visible`.

5. **Context re-renders**
   - Memoize provider `value` objects in `UserContext`, `LayoutContext`,
     `LandingContentContext` (and any other context recreating an object each
     render).

6. **Global CSS**
   - `content-visibility: auto` + `contain-intrinsic-size` for offscreen landing
     sections.
   - Global `:focus-visible` style if missing.

Re-measure all modules after Phase 1 (3 runs each).

### Phase 2 - Per-module loop (worst-first)

For each module: baseline (from Phase 1 re-measure) -> read top failing audits ->
apply targeted fixes -> re-measure 3x -> commit.

Fix categories:

- Heavy libraries load on demand only:
  - `chart.js` + `react-chartjs-2` (185 KB) -> mount chart when visible.
  - `jspdf` + `jspdf-autotable` + `html2canvas` (~620 KB) -> dynamic `import()`
    inside the export click handler only.
  - `react-datepicker` (179 KB) -> lazy.
- Modals / nudge-history / AI-recommendation dialogs -> lazy + interaction-gated.
- Heavy tables -> paginate or virtualize; skeleton rows at real row height.
- Supabase: parallelize independent queries, use existing `requestDedupe.js`,
  remove redundant refetches - **without changing what is fetched**.
- Remove unused JS/CSS per module.
- Unnecessary re-renders: `React.memo` / `useMemo` / `useCallback` / stable keys
  where a profile shows wasted renders.

### CLS strategy

- Every `<img>`: intrinsic dimensions or `aspect-ratio`.
- QR code: fixed-size container.
- Camera / scan area: reserved box.
- Status banners / toasts: fixed-position overlays (no reflow).
- Tables / lists: container `min-height` + skeletons matching loaded row height.
- Font swap: fallback metric override (Phase 1.2).

### Accessibility strategy

- Axe pass on shared components first.
- Attendance page (87) first, then each module: input labels, alt text, AA
  contrast, keyboard nav, visible focus, heading order (single `h1`,
  sequential), landmarks, accessible names on icon buttons.

### SEO strategy - public pages only

Public routes: `/`, `/organizational-chart`, `/terms`, `/privacy`,
`/send-message`, `/attendance-login`.

- `useDocumentMeta` hook: per-page `<title>`, `<meta name="description">`,
  `<link rel="canonical">`.
- `public/robots.txt`: allow public paths; disallow `/dashboard`, `/dashboard/*`,
  `/personnel`, `/personnel/*`, `/reports`, `/attendance-admin`,
  `/attendance-personnel`.
- `public/sitemap.xml`: public URLs only.
- Runtime `<meta name="robots" content="noindex">` on protected routes
  (defense-in-depth; does not make private pages indexable).
- Heading / crawlable-link / `lang` checks on public pages.

## Verification / no-regression (after every fix)

- 3 Lighthouse runs, all values + mean recorded.
- `npm run build` and `npm run lint` green.
- Functional smoke of each touched module via the MCP browser (load + one key
  interaction: open modal, apply filter, run export).
- Confirm no change to Supabase network calls (compare request list before/after
  for the module).
- Commit per fix on `perf/lighthouse-optimization` with a focused message.

## Deliverables

- `docs/superpowers/lighthouse/scoreboard.md` - all runs + means, before/after.
- Focused commits per fix.
- This design doc.

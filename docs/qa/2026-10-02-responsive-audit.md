# Responsive Audit - October 2, 2026

## Verification Target

This report records local verification completed before deployment.
Preview: http://127.0.0.1:5176/

The audit used Chrome through Playwright with simulated viewport sizes and
touch input. It did not use physical phones or tablets, and it is not a Safari
certification. Test-only account and content fixtures were intercepted in the
browser; no real accounts, messages, attendance records, or published content
were changed.

## Coverage

| Viewport | CSS Pixels | Input |
| --- | --- | --- |
| Small phone | 320 x 568 | Touch |
| Android-sized phone | 360 x 800 | Touch |
| iPhone-sized phone | 390 x 844 | Touch |
| Large phone | 430 x 932 | Touch |
| Phone landscape | 844 x 390 | Touch |
| iPad-sized portrait | 768 x 1024 | Touch |
| iPad Air-sized portrait | 820 x 1180 | Touch |
| iPad-sized landscape | 1024 x 768 | Touch |
| iPad Air-sized landscape | 1180 x 820 | Touch |
| Laptop | 1366 x 768 | Mouse |
| Desktop | 1920 x 1080 | Mouse |

Thirty routes were checked at all eleven sizes, for 330 page/viewport checks:

- Public: landing page, staff login, signup confirmation, visitor messaging,
  terms, privacy, and organizational chart.
- Administration: dashboard, profile, analytics, personnel/accounts, mobile
  users, assessment questions, About Us content, learning materials, chart,
  reports, audit logs, announcements, landing editor, and visitor messages.
- Attendance: admin view, personnel view, QR scanner, and confirmation view.
- Personnel: operations, profile, history, announcements, and reports.

The page checks cover horizontal page overflow, off-screen controls, clipped
headings/labels/buttons, visible dialogs, rendering errors, and scrolling to
the top, middle, and bottom. Intentional horizontal table scrolling and
intentional ellipsis are not treated as page overflow.

Interaction checks cover seven representative sizes, including portrait and
landscape phones/tablets:

- Public menus, English/Tagalog selection, and loaded language flags.
- Closing the public navigation and admin sidebar after viewport rotation,
  without leaving page scrolling locked.
- Announcement dialogs from two scroll positions, keyboard opening, Escape,
  focus restoration, and the normal-motion expansion animation.
- Independent FAQ expansion.
- Admin/personnel account menus and the device security dialog.
- Personnel calendar day details.
- Landing editor text/image dialogs; no changes were saved.
- Outside-city user filtering, record action menus, and profile details.
- Visitor conversation layout and deletion confirmation; deletion was canceled.
- Footer content remaining clear of the default floating message button.
- Enlarged text on the landing page, login, visitor messaging, dashboard,
  mobile users, personnel operations, and attendance confirmation.

Enlarged-text tests set the root font size to 200%. They are not browser zoom,
OS font scaling, or a complete accessibility audit. English and Tagalog are
checked on the public landing and messaging pages. The final calendar checks
also assert that weekday labels and date/status headings fit their cells.

## Fixes

| Area | Correction |
| --- | --- |
| Public navigation | Closed menus no longer create sideways page overflow or expose hidden choices to keyboard navigation. |
| Touch dropdowns | Menu collapse waits until the tap completes, preventing a moving target from losing the tap. |
| Rotation | Public navigation and admin drawers close when switching to desktop widths, restoring scrolling. |
| Enlarged public text | Hero actions, translated menu labels, contact labels, and footer links wrap inside their available space. |
| Footer | Extra bottom clearance keeps the floating message button away from final links and copyright text. |
| Admin profile | Form columns shrink correctly and stack before tablet landscape becomes too narrow. |
| Analytics | Chart titles and date selectors wrap rather than squeezing the titles. |
| Reports/audit logs | Filter controls reflow earlier on tablet widths. |
| Mobile users | The filter block stops sticking over the user list on narrower/shorter screens; Clear Filters can wrap. |
| Visitor messaging | Onboarding columns stack on tablets, including enlarged-text layouts. |
| Personnel calendar | Calendar height follows the number of weeks; phones use compact date/status cells and single-letter weekdays, with full details in the existing day dialog. Cell height grows for enlarged text. |
| Personnel file field | The hidden upload input no longer extends beyond the page. |
| Login | Entrance animations respect reduced-motion preferences. |

Attendance verification steps, authentication rules, database permissions,
published content, and APK download configuration were not changed. No proposed
Attendance mockup redesign was applied.

## Results

- Full layout matrix: 330 passed, 0 flagged.
- Interaction/enlarged-text suite: 151 passed, 0 failed.
- Initial screenshot-capture matrix: 28 passed, 0 flagged.
- Supplemental scrolled screenshot matrix: 9 passed, 0 flagged.
- Final public-page regression after footer clearance: 11 passed, 0 flagged.
- Final personnel-calendar layout regression: 11 passed, 0 flagged.
- Final calendar interaction/enlarged-text regression: 14 passed, 0 failed.
- Existing automated unit tests: 19 passed, 0 failed.
- Production build: passed.
- Lint: 0 errors; one existing unused eslint-disable warning in attendanceService.js.
- Build warning: the existing large vision-library chunk remains above 500 kB.

An initially blank lower area in an analytics full-page screenshot was a
capture limitation: that route scrolls the body rather than the window.
Scrolled viewport screenshots confirmed that its chart sections are visible
and reachable. The audit now records the actual scroll owner and captures
top/middle/bottom viewport images when screenshots are requested.

## Reproducing

Use the local Vite development server, not a deployed production build. The
test fixtures replace development module responses in the audit browser only.
Playwright must be available, and Chrome must be installed.

On this laptop, the bundled Playwright path can be used without installing
another dependency:

```powershell
$env:PLAYWRIGHT_MODULE='C:\Users\Andrei\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node scripts/responsive-audit.mjs
node scripts/responsive-interactions.mjs
```

Optional environment settings:

- `AUDIT_BASE_URL`: another local Vite URL; default is http://127.0.0.1:5176.
- `AUDIT_DEVICES`: comma-separated preset names from the scripts.
- `AUDIT_ROUTES`: comma-separated route paths for the layout audit.
- `AUDIT_CASES`: comma-separated test-name fragments for interactions.
- `AUDIT_SCREENSHOTS=all`: top/middle/bottom screenshots for each layout check.
- `AUDIT_OUTPUT`: a separate results directory for filtered reruns.

Generated results and screenshots are ignored local artifacts:

```text
.release-work.local/responsive-audit/results.json
.release-work.local/responsive-interactions-final/results.json
.release-work.local/responsive-visual-review/
.release-work.local/responsive-scroll-review/
.release-work.local/responsive-public-final/
.release-work.local/responsive-calendar-layout-final/
.release-work.local/responsive-calendar-final/
```

## Remaining Real-Device Checks

- Physical iPhone/iPad Safari, Android Chrome, and other supported browsers.
- Mobile keyboard opening, dynamic browser address bars, and safe-area insets.
- Actual OS text scaling and browser zoom.
- Camera permissions, live Face ID verification, GPS/geofencing, and QR scanning.
- Live data variations, server-side permissions, save operations, and network failures.
- Production deployment behavior and physical-device APK download/installation.

The passing layout checks do not certify these separate workflows or every
possible future content value.

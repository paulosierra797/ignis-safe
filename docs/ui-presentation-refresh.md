# UI Presentation Refresh

## Current Status

The non-login refresh has been reverted at the user's request. Only the login
and recovery styling, larger BFP logo, and login branding animation remain.
Workspace headers, dashboard/analytics surfaces, personnel sections, announcement
and editor sections, public contact rows, and public hero motion were restored
to their previous presentation. GSAP remains a dependency for the login animation.
The sections below document the original refresh and its original validation.

## Scope

- Preserves the pending larger BFP login logo work.
- Removes the extra frame around login and recovery forms; reduces tablet whitespace.
- Uses joined summary rows in Dashboard and Analytics.
- Removes decorative outer frames from personnel operations, personnel directory,
  announcement sections, and landing-content editor sections.
- Uses a quiet shared workspace header and flat public contact rows.
- Adds brief GSAP entrances to login branding, workspace titles, and public hero copy.
- No service, database, permission, route, or submission logic changes.

## Motion

Dependencies: `gsap` and `@gsap/react`.
Official guidance: https://github.com/greensock/gsap-skills
Installed local skills: `gsap-core`, `gsap-react`, `gsap-performance`.
The hook scopes and cleans up its animations, honors reduced motion, and animates
only transforms and opacity. No scroll hijacking or looping decoration was added.

## Reversibility

The new visual overrides are in `src/components/Presentation.css`, imported once
by `src/App.jsx`. Motion is isolated in `src/hooks/useEntranceMotion.js`, used by
LoginPage, PageHeader, and HeroSection. Remove these specific additions to undo
the presentation refresh while retaining the earlier login logo changes. Avoid
reverting the whole LoginPage files because they also contain that prior work.

## Validation

- Production build and ESLint passed.
- Actual login checked at 320x640, 390x844, 768x1024, 1024x600, 1366x768, 1440x900.
- No intersecting logo/title or back-button/panel bounds; no horizontal overflow.
- Short phones retain vertical scrolling so controls remain reachable.
- Reduced motion, password visibility toggle, and recovery navigation checked.
- Public landing checked at 390px and 1440px widths.
- Dashboard summary styling checked using isolated sample markup at both widths.
- No browser page errors in those checks.
- Authenticated admin/personnel screens have not been exercised end-to-end in a
  signed-in session. Review them before publishing. No credentials or records
  were changed by these checks.

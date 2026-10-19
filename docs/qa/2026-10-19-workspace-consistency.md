# Workspace Consistency Update

## Changes

- Permanent deletion reasons are optional for both individual and bulk actions. Typed `DELETE`, Super Admin authorization, backup/retention checks, and the 500-character reason limit remain.
- Super Admins can demote an ordinary Admin to Personnel through the account actions menu and Bulk Manage. The account ID, rank, status, and related records remain; Admin permissions are cleared and the role change is audit-logged. Self-demotion and official-account changes remain blocked. Other Super Admins must first have their Super Admin privileges revoked.
- The AI Recommendations shortcut can collapse into an accessible icon button. The preference survives navigation and reloads; recommendations remain accessible without a visible Hide label.
- The import upload dialog is content-sized at up to 640px, rather than nearly full-screen. Review retains a wider, scrollable table. CSV validation, grouping, progress, minimize, and cancellation remain intact.
- About Us, assessment questions, and learning materials share the same direction menu. About Us has Translate all / Translate tab; learning materials have whole-module and selected-page actions; individual questions retain a contextual Translate question action.
- Storage chart/table labels describe the contents, such as System backups, Profile photos, and Report attachments. Actual storage bucket identifiers are unchanged.
- Shared headers, filters, repeated cards, close/archive/action buttons, notifications, save/leave prompts, and archive confirmations are more compact. Touch controls retain larger targets. Help tooltips remain available without the question-mark cursor.
- A small-phone Admin Profile action-row overflow found during validation was corrected.
- GSAP motion remains brief and scoped; reduced-motion preferences are respected. No new decorative particles, gradients, or animation dependencies were introduced.

## Verification

- 49 automated tests passed, including executable Edge Function tests for blank/provided/overlong reasons and unauthorized callers.
- 35 existing revision-browser checks passed.
- 31 workspace interaction checks passed at 390, 820, and 1440px, including demotion cancellation/confirmation, bulk demotion, optional reasons, translation keyboard navigation, AI shortcut persistence, readable storage labels, and selected-page translation scope.
- The desktop interaction suite also passed with normal motion enabled.
- 90 page/device layout checks passed: 30 routes at 320px phone, 820px tablet, and 1366px laptop widths. Checks include document overflow, clipped controls, dialog bounds, scrolling, and runtime errors. These are Chromium simulations with sample data, not physical-device certification.
- The production build and scoped lint passed. The existing large-bundle build warning remains.
- Live database rollback-only tests confirmed demotion, cleared permissions, retained rank/status, an audit entry, self/official-account protection, and denial of anonymous/demoted callers. Temporary records and test audit entries were rolled back.
- Security advisors were checked; existing project advisories remain outside this UI task.

## Release State

The database migration `20261019072535_admin_demotion_to_personnel.sql` is applied. The `archive-maintenance` Edge Function is deployed with optional reasons and its existing authentication checks. Website changes are local, not committed, pushed, or deployed. No real accounts were demoted and no real archived items were deleted during testing.

Local preview: http://127.0.0.1:5182/

## Design References

The supplied screenshots and existing IGNIS SAFE styles remain the main references. External references were used for restrained interaction patterns, not to introduce a different visual theme:

- [GSAP React guidance](https://gsap.com/resources/React/)
- [GSAP Showcase](https://gsap.com/showcase/)
- [Refero interface references](https://refero.design/how-it-works)
- [AI UX Playground Inspirations](https://www.aiuxplayground.com/inspirations)

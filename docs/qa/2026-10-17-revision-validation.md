# Revision Validation

Date: October 17, 2026

## Scope

Checked the supplied revision checklist against the current website, using source inspection, automated tests, isolated browser fixtures, and read-only live-service checks. Browser fixtures simulate accounts and responses; their passing results do not establish that every production operation succeeds. No real accounts were imported, promoted, deleted, or restored during validation.

## Results

| Revision | Result and limits |
| --- | --- |
| Super Admin and permissions | Protected-account and permission paths reviewed; ordinary-account restrictions and Super Admin access checked in isolated browser tests. Fixed Super Admin access when its ordinary permission list is empty. |
| Barangay assessments | Grouping, progress, pre/post summaries, and absence of assessment-reset controls passed browser checks. |
| User details | Details, long-text wrapping, progress/history, and prepared age display passed at phone, tablet, and desktop widths. Fixed unfinished attempts appearing as completed assessment results. |
| Public community trends | Three nonblank graphs rendered. Live public aggregate endpoint responded without individual profile fields in the checked payload. |
| Archive and Trash | Bulk restore and typed-confirmation deletion passed simulated browser checks. Live policies use 30-day recovery and scheduled maintenance is installed. Automatic purge is enabled only for selected categories, not every category. See the remaining risk below. |
| Auto-translation | Translation integration reviewed. About Us draft translation and save confirmation passed simulated tests. Deployed function rejects anonymous requests. Actual signed-in Azure translation was not exercised. |
| Barangay trend history | Users monitoring views checked; no duplicate Assessment History heading appeared in Analytics. |
| Backup and recovery | Private backup storage, monthly schedule, and a completed verified backup exist. Recovery confirmation passed simulated tests. No live restore was performed; recovery round-trip remains unverified. Two prior backup records failed after timing out. |
| Bulk personnel import | CSV validation/correction, rank grouping, confirmation, progress controls, minimize/expand, and cancel passed simulated tests. Live backend import routes exist and reject unauthenticated requests. Actual account creation and invitation delivery were not exercised. |
| Bulk account management | Selection, protected-account exclusions, rank editing, and confirmation passed simulated tests. No production account changes were made. |
| Official-account protection | Installed protected-account registry and server guards reviewed; protected rows cannot be selected for the tested bulk actions. |
| Module progress | Required pre-assessment, learning materials, and post-assessment yield 100%; simulation remains optional in the tested website calculation. |
| Translation improvements | Shared translation/save implementation reviewed; About Us per-tab confirmation and Save All availability checked. Assessment and learning-material translation require a signed-in live provider check for full end-to-end validation. |
| Bulk Archive and Trash | Restore/delete selection and confirmations passed. Bulk Edit is not implemented and was not added; this checklist wording does not match the current screen. |

## Remaining Risk

The mobile-user directory does not currently filter `profiles.is_active`. Moving a mobile user to Trash sets that flag to false, but refreshing the directory can reload the profile and include it in summaries. This is a code-path finding, not a reproduced production-user incident: no inactive mobile profiles or current mobile-user Trash records existed during the read-only check. No extra archive behavior was changed in this validation task.

## Age Preparation

- Website user details now display age when supplied, otherwise `Not recorded`.
- A lookup failure displays `Temporarily unavailable` without breaking the directory.
- The additive age database migration is applied. Frontend changes are local and uncommitted.
- The mobile app was not changed.
- Future mobile registration should save `birth_date` as an ISO `YYYY-MM-DD` string in Supabase Auth user metadata. The website calculates full years using the current Manila date; birth dates are not returned to the browser.
- If only an integer `age` is supplied in metadata, it is displayed as the reported age. It does not automatically increase with birthdays; birth date is preferred.
- Missing, invalid, future, or implausible values remain unknown rather than becoming zero.
- Only active authorized administrators can retrieve ages. Anonymous access is denied.

## Verification

- 40 automated tests passed.
- 35 isolated browser checks passed, including widths of 390, 820, and 1440 pixels, ordinary-admin restrictions, and age-service failure handling.
- 12 database age-calculation cases passed; function access restrictions were checked.
- Scoped lint, production build, and patch whitespace checks passed. The build retains its existing large-chunk warning.
- No frontend commit, push, or deployment was performed for this task.

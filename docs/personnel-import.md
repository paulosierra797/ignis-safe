# Personnel Directory bulk import

The admin-only **Import Personnel** action sits beside **Add Personnel**. It uses the existing FastAPI administrative service and invitation redirect/password setup flow. Single-account creation is unchanged.

## File contract

CSV only, up to 200 records and 1 MB per import. The downloaded UTF-8 template contains these six columns in order:

`First Name,Last Name,Email Address,Role,Rank,Contact Number`

All fields are required. The import follows the existing Add Personnel Gmail-only policy and 11-digit Philippine mobile format (`09xxxxxxxxx`). Save contact cells as text in Excel before exporting CSV so leading zeros remain intact. Supported roles are `admin` and `personnel`. Backend permissions match the existing `/api/admin/users/create` endpoint.

Ranks: `FDIR, DFDIR, SSUPT, SUPT, CINSP, SINSP, INSP, SFO4, SFO3, SFO2, SFO1, FO3, FO2, FO1`. Use `OTHER: Duty Officer` for the existing custom-rank option; only `Duty Officer` is stored. Names accept letters, spaces, apostrophes and hyphens. Empty or malformed rows require correction or exclusion.

Upload and validation create no Auth accounts, profiles, reservations, or invitations. The preview checks duplicate emails locally and checks Auth, website personnel, mobile profiles and import reservations through the protected backend. Changes and exclusions revalidate the remaining rows. Confirmation is required before any creation request.

## Deployment

1. Apply `supabase/migrations/20261005154933_personnel_bulk_import_tracking.sql` to the application's Supabase project using the existing migration process.
2. Deploy the updated `analytics_api` service. `app/main.py` registers the new router automatically. Existing backend service credentials, CORS origins and invitation redirect settings are reused.
3. Deploy the frontend build. `VITE_ANALYTICS_API_URL` must point to that API.
4. Use a controlled test email to verify the authenticated preview, invitation delivery and password activation in the deployed environment. Existing SMTP and Supabase redirect allow-list configuration must already support Add Personnel.

The new tracking table has RLS enabled and no browser grants or policies. Only the service role can call its lookup/claim/completion functions or access tracking records. Existing account policies remain unchanged. Auth ownership markers are stored in server-controlled `app_metadata`; user-editable metadata is never used to authorize retries.

## Partial failures and retries

Creation uses one bounded request per valid row. Each row retains its UUID across edits and retries. A persistent email reservation and three-minute lease coordinate repeated/concurrent requests. Completed rows are never submitted again. Auth failures, profile failures and invitation failures each return fixed, safe reasons; successful email dispatch means the invitation service accepted the email, not proof of inbox delivery.

The account is created without a password and remains `Pending Activation`. Its Auth-triggered profile and website personnel record are saved before the activation invitation is sent. Failed rows keep their owned account so retries can resume profile saving or email processing without recreating Auth users. Email and role are locked once Auth exists. The backend repeats validation and ownership checks regardless of the preview state. Completed imports write exactly one `Account Created` history entry per row.

If a request loses its response, retry the same row to recover progress. An in-flight record may ask the admin to wait a few minutes for the lease to expire. Keep the preview open while reviewing failed rows: closing or replacing it discards the current row IDs, and reservations for incomplete imports remain protected in the backend. Do not delete Auth accounts or remove ownership markers to force a retry.

## Verification

```sh
node --test tests/personnelImport.test.mjs
python -B -m unittest discover -s analytics_api/tests -p 'test_personnel_import.py' -v
npx eslint src/components/Accounts.jsx src/components/PersonnelImportModal.jsx src/utils/personnelImport.js src/utils/personnelImportService.js
npm run build
```

The Python tests use an offline database/Auth fake and never send invitations. Browser QA should use isolated mock endpoints for correction, exclusions, confirmation, partial results and retry behavior. Production delivery/activation needs a separately controlled authenticated check after deployment.

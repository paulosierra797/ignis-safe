# Azure Translator setup

IGNIS SAFE uses the Supabase `translate-content` Edge Function as the only
caller of Azure Translator Text API v3.0. The browser never receives the Azure
subscription key.

## Azure resource

1. Create a single-service **Translator** resource in Azure and select the
   **F0** pricing tier. Do not configure a paid fallback or automatic tier
   upgrade.
2. Copy the key and, for a regional resource, its region from **Keys and
   Endpoint** in the Azure portal.
3. Keep Azure cost/usage alerts enabled. The application also enforces a UTC
   monthly ceiling, but Azure remains the source of truth for subscription
   usage and pricing tier.

## Supabase secrets

Set these values as Supabase Edge Function secrets. Never prefix them with
`VITE_` and never put a real key in `.env`, `.env.example`, or frontend code.

```powershell
npx supabase secrets set `
  AZURE_TRANSLATOR_KEY="<azure-translator-key>" `
  AZURE_TRANSLATOR_REGION="<azure-region>" `
  AZURE_TRANSLATOR_MONTHLY_CHAR_LIMIT="2000000" `
  AZURE_TRANSLATOR_REQUESTS_PER_MINUTE="10" `
  --project-ref mvgpeiejwstrxjmfslke
```

`AZURE_TRANSLATOR_REGION` may be omitted only for a global Translator
resource. `AZURE_TRANSLATOR_ENDPOINT` may also be set when Azure requires a
custom/VNet endpoint; provide the full Translator v3 base path before
`/translate`. The application clamps the configured monthly limit to at most
2,000,000 characters.

## Deploy

Apply the migration before deploying the function because the function uses
the metering and rate-limit RPCs introduced by that migration.

```powershell
npx supabase db push --project-ref mvgpeiejwstrxjmfslke
npx supabase functions deploy translate-content `
  --project-ref mvgpeiejwstrxjmfslke
```

The repository's `supabase/config.toml` also sets `verify_jwt = true` for the
function. The function independently validates the JWT and confirms the caller
is an active administrator.

## Acceptance checks

Using an active administrator session, verify both directions in each admin
section:

- Learning Materials: translate missing fields in one of Modules 1–5, review
  the draft, save through the existing confirmation, and reload.
- Assessment Questions: translate a question, explanation, and choices A–D;
  confirm the same correct option remains selected before and after reload.
- About Us Content: translate paired text fields, review, confirm save, and
  reload.
- Enter text into an already populated target field and confirm Translate does
  not replace it.
- Temporarily remove/disable the provider secret and confirm manual editing and
  saving still work while the UI shows a safe availability message.
- Confirm `translation_usage_monthly` and `translation_usage_events` increase
  without storing the translated text itself.

Generated translations are drafts only. They are placed in local editor state
and are not written to Supabase until the administrator uses the section's
existing Save/confirmation flow.

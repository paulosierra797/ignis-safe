# Analytics API (FastAPI + scikit-learn)

This service computes knowledge analytics on the server using Supabase data and scikit-learn.

## Why this setup

- Free to develop locally.
- Supports multi-device admin access because analytics is centralized in one API.
- Frontend can call this API and still keep a fallback path.

## 1) Configure environment

Copy `.env.example` to `.env` and fill in values.

Required:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:
- `FRONTEND_ORIGINS` comma-separated allowed origins.
- `INVITE_REDIRECT_URL` for personnel activation links. Defaults to the first frontend origin plus `/confirm-signup?mode=invite`.

Add the deployed invitation URL to the Supabase Auth redirect allow list. Configure custom SMTP in Supabase before production so invitations can be delivered reliably to personnel Gmail accounts.

All administrative endpoints require the signed-in admin's Supabase access token. The frontend sends this automatically; no browser-visible shared API key is used.

## 2) Install and run

From `analytics_api`:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 3) Endpoints

- `GET /health`
- `GET /api/knowledge-analytics/filter-options`
- `POST /api/knowledge-analytics/dashboard-stats`
- `POST /api/knowledge-analytics/charts`
- `POST /api/knowledge-analytics/dashboard` (bundle response)

Request body for POST endpoints:

```json
{
  "timeframe": "All-time",
  "people": "All",
  "topic": "All",
  "activityTrendsView": "Month"
}
```

## 4) Free deployment options

- Local machine with Cloudflare Tunnel (free): most control.
- Free-tier Python hosts for MVP: easiest but with cold starts.

For production, move to a low-cost VPS for reliability.

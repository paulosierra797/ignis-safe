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
- `ANALYTICS_API_KEY` to require requests to include `x-analytics-api-key`.
- `FRONTEND_ORIGINS` comma-separated allowed origins.

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

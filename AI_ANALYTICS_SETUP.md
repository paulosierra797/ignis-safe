# AI Knowledge Analytics Setup (Free-First)

This guide adds a Python analytics API with scikit-learn and connects it to your existing React app.

## What you now have

- New backend service in `analytics_api` using FastAPI + scikit-learn.
- Frontend integration in `src/utils/knowledgeAnalyticsService.js`.
- Automatic fallback to existing local analytics logic if API is unavailable.

## 1) Configure frontend env

In your root `.env.local`:

```env
VITE_ANALYTICS_API_URL=http://localhost:8000
VITE_ANALYTICS_API_KEY=your-optional-shared-secret
```

If you do not want API key auth for now, leave `VITE_ANALYTICS_API_KEY` empty and do not set `ANALYTICS_API_KEY` in backend.

## 2) Configure backend env

Copy `analytics_api/.env.example` to `analytics_api/.env` and set:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANALYTICS_API_KEY=your-optional-shared-secret
FRONTEND_ORIGINS=http://localhost:5173
```

Use the Supabase Service Role key only on backend. Never put it in frontend env.

## 3) Run backend (free local)

From `analytics_api`:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 4) Run frontend

From project root:

```bash
npm run dev
```

## 5) Verify quickly

- Open frontend Analytics page.
- Confirm backend health at `http://localhost:8000/health`.
- Stop backend and refresh Analytics page: it should still work via local fallback.

## Multi-device admin access

To support admins on different devices, deploy only the backend API (plus your existing frontend hosting) and point `VITE_ANALYTICS_API_URL` to the deployed API URL.

Free-first deployment options:
- Self-host on one always-on machine with Cloudflare Tunnel.
- Use free-tier Python hosting for MVP (cold starts expected).

## Security baseline

- Keep `SUPABASE_SERVICE_ROLE_KEY` only in backend env.
- Restrict CORS with `FRONTEND_ORIGINS`.
- Use `ANALYTICS_API_KEY` and matching `VITE_ANALYTICS_API_KEY`.

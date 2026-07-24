import os

from dotenv import load_dotenv
from fastapi import Header, HTTPException
from supabase import create_client


load_dotenv()

SUPABASE_URL = str(os.getenv("SUPABASE_URL") or "").strip()
SUPABASE_SERVICE_KEY = str(os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
ANALYTICS_API_KEY = str(os.getenv("ANALYTICS_API_KEY") or "").strip()

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def require_api_key(x_analytics_api_key: str = Header(None)):
    if ANALYTICS_API_KEY and x_analytics_api_key != ANALYTICS_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return True

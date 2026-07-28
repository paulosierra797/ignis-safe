import os

from dotenv import load_dotenv
from fastapi import Header, HTTPException
from supabase import create_client


load_dotenv()

SUPABASE_URL = str(os.getenv("SUPABASE_URL") or "").strip()
SUPABASE_SERVICE_KEY = str(os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def require_admin(authorization: str = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="A signed-in administrator is required.")

    access_token = authorization.split(" ", 1)[1].strip()
    if not access_token:
        raise HTTPException(status_code=401, detail="A signed-in administrator is required.")

    try:
        auth_response = supabase.auth.get_user(access_token)
        auth_user = getattr(auth_response, "user", None)
        auth_user_id = str(getattr(auth_user, "id", "") or "").strip()
    except Exception as error:
        raise HTTPException(status_code=401, detail="The administrator session is invalid or expired.") from error

    if not auth_user_id:
        raise HTTPException(status_code=401, detail="The administrator session is invalid or expired.")

    account_response = (
        supabase.table("admin")
        .select("admin_id,email,first_name,last_name,role,status")
        .eq("admin_id", auth_user_id)
        .limit(1)
        .execute()
    )
    accounts = account_response.data or []
    account = accounts[0] if accounts else None
    role = str((account or {}).get("role") or "").strip().lower()
    status = str((account or {}).get("status") or "").strip().lower()

    if role != "admin" or status != "active":
        raise HTTPException(status_code=403, detail="Administrator access is required.")

    return account

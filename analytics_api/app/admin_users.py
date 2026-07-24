import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .dependencies import require_api_key, supabase


router = APIRouter()


class CreateUserRequest(BaseModel):
    email: str
    first_name: str
    last_name: str
    role: Optional[str] = None
    rank: Optional[str] = None
    contact_number: Optional[str] = None
    permissions: Optional[List[str]] = None


@router.post("/api/admin/users/create", dependencies=[Depends(require_api_key)])
def create_user(request: CreateUserRequest) -> Dict[str, Any]:
    email = str(request.email or "").strip().lower()
    first_name = str(request.first_name or "").strip()
    last_name = str(request.last_name or "").strip()
    role = str(request.role or "personnel").strip() or "personnel"
    rank = str(request.rank or "").strip()
    contact_number = str(request.contact_number or "").strip() or None
    permissions = request.permissions or []

    if not email:
        raise HTTPException(status_code=400, detail="email is required")
    if not first_name or not last_name:
        raise HTTPException(status_code=400, detail="first_name and last_name are required")

    auth_user_id: Optional[str] = None
    redirect_url = str(os.getenv("INVITE_REDIRECT_URL") or "").strip()
    if not redirect_url:
        frontend_origin = str(os.getenv("FRONTEND_ORIGINS") or "http://localhost:5173").split(",")[0].strip()
        redirect_url = f"{frontend_origin.rstrip('/')}/confirm-signup?mode=invite"

    try:
        auth_response = supabase.auth.admin.invite_user_by_email(
            email,
            {
                "redirect_to": redirect_url,
                "data": {
                    "first_name": first_name,
                    "last_name": last_name,
                    "role": role,
                    "rank": rank,
                    "contact_number": contact_number,
                    "activation_required": True,
                },
            }
        )
        auth_user = getattr(auth_response, "user", None)
        auth_user_id = getattr(auth_user, "id", None) if auth_user else None

        if not auth_user_id:
            raise HTTPException(status_code=500, detail="Auth user was not created.")

        admin_payload = {
            "admin_id": auth_user_id,
            "email": email,
            "first_name": first_name,
            "last_name": last_name,
            "role": role,
            "rank": rank,
            "contact_number": contact_number,
            "status": "Pending Activation",
            "permissions": permissions,
        }

        admin_response = supabase.table("admin").insert([admin_payload]).execute()
        created_admin = (admin_response.data or [None])[0]
        if not created_admin:
            raise HTTPException(status_code=500, detail="Admin profile was not created.")

        return {
            "data": {
                "auth": {
                    "user": {
                        "id": auth_user_id,
                        "email": email,
                    }
                },
                "user": created_admin,
            },
            "error": None,
        }
    except HTTPException:
        if auth_user_id:
            try:
                supabase.auth.admin.delete_user(auth_user_id)
            except Exception:
                pass
        raise
    except Exception as error:
        if auth_user_id:
            try:
                supabase.auth.admin.delete_user(auth_user_id)
            except Exception:
                pass
        raise HTTPException(status_code=400, detail=f"Failed to invite user: {error}")

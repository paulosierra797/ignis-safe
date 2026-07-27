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


def get_admin_by_email(email: str) -> Optional[Dict[str, Any]]:
    response = (
        supabase.table("admin")
        .select("*")
        .eq("email", email)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def build_create_response(
    admin_record: Dict[str, Any],
    auth_user_id: str,
    email: str,
    reused_existing: bool = False,
) -> Dict[str, Any]:
    return {
        "data": {
            "auth": {
                "user": {
                    "id": auth_user_id,
                    "email": email,
                }
            },
            "user": admin_record,
            "reused_existing": reused_existing,
        },
        "error": None,
    }


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

    existing_admin = get_admin_by_email(email)
    if existing_admin:
        raise HTTPException(
            status_code=409,
            detail="An account with this email address is already registered.",
        )

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

        return build_create_response(created_admin, auth_user_id, email)
    except HTTPException:
        existing_admin = get_admin_by_email(email)
        if existing_admin:
            existing_admin_id = str(existing_admin.get("admin_id") or auth_user_id or "")
            return build_create_response(
                existing_admin,
                existing_admin_id,
                email,
                reused_existing=True,
            )

        if auth_user_id:
            try:
                supabase.auth.admin.delete_user(auth_user_id)
            except Exception:
                pass
        raise
    except Exception as error:
        existing_admin = get_admin_by_email(email)
        if existing_admin:
            existing_admin_id = str(existing_admin.get("admin_id") or auth_user_id or "")
            return build_create_response(
                existing_admin,
                existing_admin_id,
                email,
                reused_existing=True,
            )

        if auth_user_id:
            try:
                supabase.auth.admin.delete_user(auth_user_id)
            except Exception:
                pass
        raise HTTPException(status_code=400, detail=f"Failed to invite user: {error}")

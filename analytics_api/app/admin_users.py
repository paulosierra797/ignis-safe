import os
import re
import time
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from .dependencies import SUPABASE_SERVICE_KEY, SUPABASE_URL, require_admin, supabase


router = APIRouter()

# supabase-py's auth admin client hardcodes a short (~5s) httpx read timeout,
# which is shorter than Supabase's own invite-email dispatch time (observed
# ~5.3-5.4s), so `invite_user_by_email` intermittently raises "The read
# operation timed out" even though the invite is created successfully on
# Supabase's side. Calling the REST endpoint directly lets us use a timeout
# with real headroom, plus retry on transient failures. Supabase's invite
# endpoint is idempotent for an unconfirmed user (a repeat call resends the
# same invite for the same auth user instead of creating a duplicate), so
# retrying here cannot create duplicate accounts.
INVITE_HTTP_TIMEOUT = httpx.Timeout(30.0, connect=10.0)
INVITE_MAX_ATTEMPTS = 3
INVITE_RETRY_DELAY_SECONDS = 1.5


def _invite_user_by_email(email: str, redirect_url: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
    last_error: Optional[Exception] = None
    for attempt in range(1, INVITE_MAX_ATTEMPTS + 1):
        try:
            response = httpx.post(
                f"{SUPABASE_URL}/auth/v1/invite",
                params={"redirect_to": redirect_url},
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Content-Type": "application/json",
                },
                json={"email": email, "data": metadata},
                timeout=INVITE_HTTP_TIMEOUT,
            )
        except httpx.TimeoutException as error:
            last_error = error
            if attempt < INVITE_MAX_ATTEMPTS:
                time.sleep(INVITE_RETRY_DELAY_SECONDS * attempt)
                continue
            raise RuntimeError(
                "The invitation service took too long to respond. Please try again."
            ) from error

        if response.status_code >= 500 and attempt < INVITE_MAX_ATTEMPTS:
            last_error = httpx.HTTPStatusError(
                "Supabase auth service error", request=response.request, response=response
            )
            time.sleep(INVITE_RETRY_DELAY_SECONDS * attempt)
            continue

        if response.status_code >= 400:
            try:
                body = response.json()
                detail = body.get("msg") or body.get("message") or body.get("error_description") or response.text
            except ValueError:
                detail = response.text
            raise RuntimeError("The invitation service rejected the request.")

        return response.json()

    raise RuntimeError(str(last_error) if last_error else "Failed to invite user.")


class CreateUserRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    role: Optional[str] = Field(default=None, max_length=16)
    rank: Optional[str] = Field(default=None, max_length=80)
    contact_number: Optional[str] = Field(default=None, max_length=32)
    permissions: Optional[List[str]] = Field(default=None, max_length=32)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if len(normalized) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", normalized):
            raise ValueError("Enter a valid email address.")
        return normalized

    @field_validator("first_name", "last_name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        normalized = value.strip()
        if not re.fullmatch(r"[^\W\d_]+(?:[ '\-][^\W\d_]+)*", normalized, flags=re.UNICODE):
            raise ValueError("Names may contain letters, spaces, apostrophes, and hyphens only.")
        return normalized

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        normalized = value.strip().lower()
        if normalized not in {"admin", "personnel"}:
            raise ValueError("role must be admin or personnel")
        return normalized

    @field_validator("rank", "contact_number")
    @classmethod
    def normalize_optional_text(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value else None


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


def build_invite_redirect_url(role: str) -> str:
    configured_url = str(os.getenv("INVITE_REDIRECT_URL") or "").strip()
    if not configured_url:
        configured_url = (
            str(os.getenv("FRONTEND_ORIGINS") or "http://localhost:5173")
            .split(",")[0]
            .strip()
        )

    parsed_url = urlsplit(configured_url)
    query = dict(parse_qsl(parsed_url.query, keep_blank_values=True))
    query.update({
        "mode": "invite",
        "portal": "admin" if role.lower() == "admin" else "personnel",
    })

    return urlunsplit((
        parsed_url.scheme,
        parsed_url.netloc,
        "/confirm-signup",
        urlencode(query),
        "",
    ))


@router.post("/api/admin/users/create", dependencies=[Depends(require_admin)])
def create_user(request: CreateUserRequest) -> Dict[str, Any]:
    email = str(request.email or "").strip().lower()
    first_name = str(request.first_name or "").strip()
    last_name = str(request.last_name or "").strip()
    role = str(request.role or "personnel").strip().lower() or "personnel"
    rank = str(request.rank or "").strip()
    contact_number = str(request.contact_number or "").strip() or None
    permissions = (
        [
            "view_dashboard",
            "view_charts",
            "view_attendance",
            "view_accounts",
            "manage_users",
            "view_analytics",
            "view_progress",
            "view_audit_logs",
            "view_reports",
            "manage_reports",
        ]
        if role == "admin"
        else ["create_reports"]
    )

    if not email:
        raise HTTPException(status_code=400, detail="email is required")
    if not first_name or not last_name:
        raise HTTPException(status_code=400, detail="first_name and last_name are required")
    if role not in {"admin", "personnel"}:
        raise HTTPException(status_code=400, detail="role must be admin or personnel")

    existing_admin = get_admin_by_email(email)
    if existing_admin:
        raise HTTPException(
            status_code=409,
            detail="An account with this email address is already registered.",
        )

    auth_user_id: Optional[str] = None
    redirect_url = build_invite_redirect_url(role)

    try:
        invited_user = _invite_user_by_email(
            email,
            redirect_url,
            {
                "first_name": first_name,
                "last_name": last_name,
                "role": role,
                "rank": rank,
                "contact_number": contact_number,
                "activation_required": True,
            },
        )
        auth_user_id = invited_user.get("id")

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
        if auth_user_id:
            try:
                supabase.auth.admin.delete_user(auth_user_id)
            except Exception:
                pass
        raise
    except Exception as error:
        existing_admin = get_admin_by_email(email)
        if existing_admin:
            raise HTTPException(
                status_code=409,
                detail="An account with this email address is already registered.",
            )

        if auth_user_id:
            try:
                supabase.auth.admin.delete_user(auth_user_id)
            except Exception:
                pass
        raise HTTPException(
            status_code=400,
            detail="The invitation could not be completed. Please verify the account details and try again.",
        ) from error

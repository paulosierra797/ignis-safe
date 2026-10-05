"""Admin-only imports. Stable row IDs resume progress instead of recreating users."""
import logging
import re
from collections import Counter
from typing import List
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .admin_users import _invite_user_by_email, build_invite_redirect_url
from .dependencies import require_admin, supabase

router = APIRouter()
logger = logging.getLogger("ignis_safe.personnel_import")
RANKS = {"FDIR", "DFDIR", "SSUPT", "SUPT", "CINSP", "SINSP", "INSP", "SFO4",
         "SFO3", "SFO2", "SFO1", "FO3", "FO2", "FO1"}
ADMIN_PERMISSIONS = ["view_dashboard", "view_charts", "view_attendance", "view_accounts",
                     "manage_users", "view_analytics", "view_progress", "view_audit_logs",
                     "view_reports", "manage_reports"]


class ImportRecord(BaseModel):
    row_id: UUID
    first_name: str = Field(default="", max_length=1024)
    last_name: str = Field(default="", max_length=1024)
    email: str = Field(default="", max_length=1024)
    role: str = Field(default="", max_length=1024)
    rank: str = Field(default="", max_length=1024)
    contact_number: str = Field(default="", max_length=1024)


class ImportRequest(BaseModel):
    records: List[ImportRecord] = Field(min_length=1, max_length=200)


def normalize(record):
    data = {key: value.strip() if isinstance(value, str) else value
            for key, value in record.model_dump().items()}
    data["row_id"] = str(record.row_id)
    data["email"] = data["email"].lower()
    data["role"] = data["role"].lower()
    if data["rank"].upper() in RANKS:
        data["rank"] = data["rank"].upper()
    elif re.match(r"^other\s*:", data["rank"], re.I):
        data["rank"] = "OTHER: " + re.sub(r"^other\s*:", "", data["rank"], flags=re.I).strip()
    return data


def field_errors(data):
    errors = []
    for key, label in [("first_name", "First Name"), ("last_name", "Last Name"),
                       ("email", "Email Address"), ("role", "Role"),
                       ("rank", "Rank"), ("contact_number", "Contact Number")]:
        if not data[key]:
            errors.append(f"{label} is required.")
    for key in ("first_name", "last_name"):
        if data[key] and (len(data[key]) > 80 or not re.fullmatch(r"[A-Za-z]+(?:[ '\-][A-Za-z]+)*", data[key])):
            errors.append(f"{'First' if key == 'first_name' else 'Last'} name must use letters, spaces, apostrophes or hyphens (up to 80 characters).")
    if data["email"] and (len(data["email"]) > 254 or not re.fullmatch(r"[^\s@,;]+@gmail\.com", data["email"], re.I)):
        errors.append("Enter a valid Gmail address ending in @gmail.com.")
    if data["role"] and data["role"] not in {"admin", "personnel"}:
        errors.append("Select Admin or Personnel.")
    if data["contact_number"] and not re.fullmatch(r"09\d{9}", data["contact_number"], re.ASCII):
        errors.append("Contact number must contain 11 digits starting with 09.")
    rank = data["rank"]
    custom = rank[7:] if rank.startswith("OTHER: ") else ""
    if rank and rank not in RANKS and (not custom or len(custom) > 80 or re.search(r"[\x00-\x1f\x7f]", custom)):
        errors.append("Select a supported rank or enter OTHER: followed by a custom rank (up to 80 characters).")
    return errors


def progress(row_id):
    rows = supabase.table("personnel_import_records").select("*").eq("row_id", row_id).limit(1).execute().data or []
    return rows[0] if rows else None


def email_lookup(email):
    return supabase.rpc("personnel_import_email_lookup", {"p_email": email}).execute().data or {}


def existence_error(data, actor_id, lookup, saved):
    owned = bool(saved and saved["actor_id"] == actor_id and saved["row_id"] == data["row_id"])
    own_auth = owned and lookup.get("import_row_id") == data["row_id"]
    auth_id = lookup.get("auth_user_id")
    if owned and saved.get("auth_user_id") and saved["email"] != data["email"]:
        return "Email cannot be changed after this import has created the account."
    if saved and not owned:
        return "This import record belongs to another administrator."
    if saved and saved["state"] == "created":
        return "Email already exists."
    if own_auth and lookup.get("import_role") != data["role"]:
        return "Role cannot be changed after account creation."
    if lookup.get("reserved_row_id") and (lookup["reserved_row_id"] != data["row_id"] or lookup["reserved_actor_id"] != actor_id):
        return "Email is reserved by another import."
    if auth_id and not own_auth:
        return "Email already exists."
    if lookup.get("admin_id") and (not own_auth or lookup["admin_id"] != auth_id):
        return "Email already exists."
    if lookup.get("profile_id") and (not own_auth or lookup["profile_id"] != auth_id):
        return "Email already exists."
    return None


def validate_records(records, actor_id):
    normalized = [normalize(record) for record in records]
    emails = Counter(row["email"] for row in normalized if row["email"])
    row_ids = Counter(row["row_id"] for row in normalized)
    candidates = [row for row in normalized if not field_errors(row) and emails.get(row["email"], 0) == 1 and row_ids[row["row_id"]] == 1]
    saved_by_id = {}
    for start in range(0, len(candidates), 50):
        batch = candidates[start:start + 50]
        for saved in supabase.table("personnel_import_records").select("*").in_("row_id", [row["row_id"] for row in batch]).execute().data or []:
            saved_by_id[saved["row_id"]] = saved
    lookups = {}
    if candidates:
        lookups = supabase.rpc("personnel_import_email_lookup_batch", {"p_emails": [row["email"] for row in candidates]}).execute().data or {}
    results = []
    for data in normalized:
        errors = field_errors(data)
        status = "Needs Correction" if errors else "Valid"
        auth_created = False
        if emails.get(data["email"], 0) > 1 or row_ids[data["row_id"]] > 1:
            errors.append("Email or record appears more than once in this import.")
            status = "Duplicate"
        elif not errors:
            saved = saved_by_id.get(data["row_id"])
            lookup = lookups.get(data["email"], {})
            auth_created = bool(saved and saved["actor_id"] == actor_id and
                                (saved.get("auth_user_id") or lookup.get("import_row_id") == data["row_id"]))
            error = existence_error(data, actor_id, lookup, saved)
            if error:
                errors.append(error)
                status = "Already Exists"
        results.append({"row_id": data["row_id"], "status": status, "errors": errors,
                        "auth_created": auth_created})
    return results


@router.post("/api/admin/personnel-import/validate")
def validate_import(request: ImportRequest, actor=Depends(require_admin)):
    # Read-only: no reservations, profiles, Auth users or invitations are created.
    try:
        return {"data": {"results": validate_records(request.records, str(actor["admin_id"]))}, "error": None}
    except Exception:
        logger.exception("Personnel import validation failed")
        raise HTTPException(503, "Records could not be checked. Please try again.")


def result(data, status, reason, auth_id=None, stage="auth"):
    return {"row_id": data["row_id"], "status": status, "reason": reason,
            "auth_created": bool(auth_id), "stage": stage}


def process_record(record, actor_id):
    data = normalize(record)
    errors = field_errors(data)
    if errors:
        return result(data, "skipped", "Invalid personnel data. " + " ".join(errors))
    saved = progress(data["row_id"])
    if saved and saved["actor_id"] == actor_id and saved["state"] == "created":
        return result(data, "created", "Account was already created by this import; it was not processed again.", saved.get("auth_user_id"), "complete")
    lookup = email_lookup(data["email"])
    blocked = existence_error(data, actor_id, lookup, saved)
    if blocked:
        return result(data, "skipped", blocked, saved.get("auth_user_id") if saved and saved["actor_id"] == actor_id else None)
    token = str(uuid4())
    claim = supabase.rpc("claim_personnel_import", {"p_row_id": data["row_id"], "p_actor_id": actor_id,
                          "p_email": data["email"], "p_token": token}).execute().data
    auth_id = claim.get("auth_user_id")
    if claim["claim"] == "created":
        return result(data, "created", "Account was already created by this import; it was not processed again.", auth_id, "complete")
    if claim["claim"] == "processing":
        return result(data, "processing", "This record is still processing. Wait a few minutes, then retry to check its saved progress.")
    if claim["claim"] != "claimed":
        return result(data, "skipped", "Email cannot be changed after account creation." if claim["claim"] == "email_locked" else "Email is reserved by another import.", auth_id)
    stage = "auth"

    def finish(state):
        return supabase.rpc("finish_personnel_import", {"p_row_id": data["row_id"], "p_token": token,
                            "p_state": state, "p_stage": stage, "p_auth_id": auth_id}).execute().data

    try:
        # Repeat lookup under the persistent reservation; never attach someone else's Auth user.
        lookup = email_lookup(data["email"])
        auth_id = lookup.get("auth_user_id")
        if auth_id and lookup.get("import_row_id") != data["row_id"]:
            auth_id = None
            finish("failed")
            return result(data, "skipped", "Email already exists.")
        rank = data["rank"][7:] if data["rank"].startswith("OTHER: ") else data["rank"]
        metadata = {key: data[key] for key in ("first_name", "last_name", "role", "contact_number")}
        metadata.update({"rank": rank, "activation_required": True})
        if not auth_id:
            # No generated or stored password: the invitation is the password setup flow.
            created = supabase.auth.admin.create_user({"email": data["email"], "email_confirm": False,
                          "user_metadata": metadata, "app_metadata": {"personnel_import_row_id": data["row_id"], "personnel_import_role": data["role"]}})
            auth_id = str(created.user.id)
        else:
            # Invite resends retain the existing Auth metadata; synchronize corrected names.
            corrected_metadata = {key: value for key, value in metadata.items() if key != "activation_required"}
            supabase.auth.admin.update_user_by_id(auth_id, {"user_metadata": corrected_metadata})
        supabase.table("personnel_import_records").update({"auth_user_id": auth_id, "stage": "profile"}).eq("row_id", data["row_id"]).eq("lease_token", token).execute()
        stage = "profile"
        existing = supabase.table("admin").select("admin_id,role,status").eq("admin_id", auth_id).limit(1).execute().data or []
        # A retry can correct personnel details but cannot change an already persisted role.
        if existing and existing[0]["role"] != data["role"]:
            finish("failed")
            return result(data, "failed", "Role cannot be changed after account creation.", auth_id, stage)
        payload = {"admin_id": auth_id, "email": data["email"], "first_name": data["first_name"],
                   "last_name": data["last_name"], "role": data["role"], "rank": rank,
                   "contact_number": data["contact_number"]}
        if not existing:
            payload["status"] = "Pending Activation"
            payload["permissions"] = ADMIN_PERMISSIONS if data["role"] == "admin" else ["create_reports"]
        admin = supabase.table("admin").upsert(payload, on_conflict="admin_id").execute().data
        if not admin:
            raise RuntimeError("Profile write returned no record")
        # Keep the Auth-triggered mobile profile's names/email consistent too.
        profiles = supabase.table("profiles").upsert({"id": auth_id, "first_name": data["first_name"], "last_name": data["last_name"],
                                           "email": data["email"]}, on_conflict="id").execute().data
        if not profiles:
            raise RuntimeError("Linked profile write returned no record")
        stage = "email"
        if not lookup.get("email_confirmed"):
            invited = _invite_user_by_email(data["email"], build_invite_redirect_url(data["role"]), metadata)
            if str(invited.get("id")) != auth_id:
                raise RuntimeError("Invitation identity mismatch")
        stage = "complete"
        if not finish("created"):
            return result(data, "failed", "Account creation finished, but the result could not be confirmed. Retry to check its saved progress.", auth_id, stage)
        return result(data, "created", "Account already activated; no new invitation was needed." if lookup.get("email_confirmed")
                      else "Account created. Activation email accepted for delivery.", auth_id, stage)
    except Exception:
        logger.exception("Personnel import row failed at stage %s", stage)
        # If Auth timed out after committing, the server-only app marker recovers ownership on retry.
        try:
            recovered = email_lookup(data["email"])
            if recovered.get("import_row_id") == data["row_id"]:
                auth_id = recovered.get("auth_user_id")
            finish("failed")
        except Exception:
            logger.exception("Could not save import failure progress")
        reason = {"auth": "Auth account creation failed. Retry to check saved progress safely.",
                  "profile": "Profile record creation failed. Correct the details and retry this record.",
                  "email": "Activation email failed. Retry this record to send the invitation again.",
                  "complete": "Account creation finished, but the result could not be confirmed. Retry to check its saved progress."}[stage]
        return result(data, "failed", reason, auth_id, stage)


@router.post("/api/admin/personnel-import/create")
def create_import(request: ImportRequest, actor=Depends(require_admin)):
    # One bounded request per row keeps partial results visible and avoids bulk HTTP timeouts.
    if len(request.records) != 1:
        raise HTTPException(400, "Create one validated import record per request.")
    try:
        return {"data": {"results": [process_record(request.records[0], str(actor["admin_id"]))]}, "error": None}
    except Exception:
        logger.exception("Personnel import processing unavailable")
        raise HTTPException(503, "The result could not be confirmed. Retry to check saved progress safely.")

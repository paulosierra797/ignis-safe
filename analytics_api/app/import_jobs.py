"""Server-managed bulk personnel import jobs.

A job is created from the rows the admin confirmed, then processed by a background
thread in small batches. The browser only polls for progress, so closing the modal
or navigating elsewhere never interrupts the import. Cancelling stops rows that have
not started; accounts already created are never touched.

Jobs live in this process's memory (like the single-create endpoint they wrap, they
need no new tables). They are kept for an hour after finishing.
"""

import logging
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError

from .admin_users import CreateUserRequest, create_account
from .dependencies import require_admin, supabase


logger = logging.getLogger(__name__)
router = APIRouter()

MAX_ROWS = 200
# Controlled batches: a few invites in parallel, then a short pause, so Supabase
# Auth's email rate limit is respected.
BATCH_SIZE = 5
BATCH_WORKERS = 3
BATCH_PAUSE_SECONDS = 1.0
FINISHED_JOB_TTL_SECONDS = 3600

RATE_LIMIT_MESSAGE = "Not attempted: the email rate limit was reached. Retry this record later."

_jobs: Dict[str, Dict[str, Any]] = {}
_lock = threading.Lock()


class ImportRow(BaseModel):
    client_id: str = Field(min_length=1, max_length=64)
    email: str = Field(max_length=254)
    first_name: str = Field(max_length=80)
    last_name: str = Field(max_length=80)
    role: Optional[str] = Field(default=None, max_length=16)
    rank: Optional[str] = Field(default=None, max_length=80)
    contact_number: Optional[str] = Field(default=None, max_length=32)


class ImportJobRequest(BaseModel):
    file_name: Optional[str] = Field(default=None, max_length=255)
    rows: List[ImportRow] = Field(min_length=1, max_length=MAX_ROWS)


def _view(job: Dict[str, Any]) -> Dict[str, Any]:
    """Public snapshot. Counts are derived from the items so they can never drift."""
    items = job["items"]

    def count(state: str) -> int:
        return sum(1 for item in items if item["state"] == state)

    created, failed, cancelled = count("created"), count("failed"), count("cancelled")
    return {
        "id": job["id"],
        "status": job["status"],
        "file_name": job["file_name"],
        "total": len(items),
        "created": created,
        "failed": failed,
        "cancelled": cancelled,
        "processed": created + failed,
        "cancel_requested": job["cancel_requested"],
        "rate_limited": job["rate_limited"],
        "started_at": job["started_at"],
        "finished_at": job["finished_at"],
        "items": [
            {key: item[key] for key in ("id", "email", "first_name", "last_name", "state", "error")}
            for item in items
        ],
    }


def _prune() -> None:
    cutoff = time.time() - FINISHED_JOB_TTL_SECONDS
    for job_id in [
        job_id for job_id, job in _jobs.items()
        if job["finished_at"] is not None and job["finished_at"] < cutoff
    ]:
        del _jobs[job_id]


def _get_owned_job(job_id: str, caller: Dict[str, Any]) -> Dict[str, Any]:
    job = _jobs.get(job_id)
    if not job or job["actor_id"] != caller.get("admin_id"):
        raise HTTPException(status_code=404, detail="This import is no longer available.")
    return job


def _process_item(job: Dict[str, Any], item: Dict[str, Any], caller: Dict[str, Any]) -> None:
    with _lock:
        if item["state"] != "queued":
            return
        if job["cancel_requested"]:
            item["state"] = "cancelled"
            return
        if job["rate_limited"]:
            item["state"], item["error"] = "failed", RATE_LIMIT_MESSAGE
            return
        item["state"] = "processing"

    state, error = "created", ""
    try:
        create_account(item["request"], caller)
    except HTTPException as http_error:
        state, error = "failed", str(http_error.detail)
        if http_error.status_code == 429:
            job["rate_limited"] = True
    except Exception:  # keep the batch going; the row stays retryable
        logger.exception("Bulk import row failed")
        state, error = "failed", "The account could not be created."

    with _lock:
        item["state"], item["error"] = state, error


def _write_audit_log(job: Dict[str, Any], caller: Dict[str, Any]) -> None:
    with _lock:
        view = _view(job)
    created_emails = [item["email"] for item in view["items"] if item["state"] == "created"]
    failures = [
        {"email": item["email"], "reason": item["error"]}
        for item in view["items"] if item["state"] == "failed"
    ]
    actor_name = (
        " ".join(filter(None, [caller.get("first_name"), caller.get("last_name")])).strip()
        or caller.get("email")
        or "Admin User"
    )
    cancelled_note = f", {view['cancelled']} cancelled" if view["cancelled"] else ""
    try:
        supabase.table("admin_activity_logs").insert({
            "admin_id": caller.get("admin_id"),
            "actor_name": actor_name,
            "action": "Bulk Account Import",
            "action_type": "registration",
            "status": "SUCCESS" if created_emails else "FAILED",
            "details": (
                f"Bulk imported personnel from CSV: {view['created']} created, "
                f"{view['failed']} failed{cancelled_note} out of {view['total']}."
            ),
            "metadata": {
                "source": "csv_import",
                "job_id": job["id"],
                "file_name": job["file_name"],
                "attempted": view["created"] + view["failed"],
                "total": view["total"],
                "created_count": view["created"],
                "failed_count": view["failed"],
                "cancelled_count": view["cancelled"],
                "was_cancelled": view["status"] == "cancelled",
                "created_emails": created_emails,
                "failures": failures,
            },
        }).execute()
    except Exception:
        logger.exception("Unable to write bulk import audit log")


def _run_job(job: Dict[str, Any], caller: Dict[str, Any]) -> None:
    try:
        items = job["items"]
        with ThreadPoolExecutor(max_workers=BATCH_WORKERS) as pool:
            for start in range(0, len(items), BATCH_SIZE):
                batch = items[start:start + BATCH_SIZE]
                list(pool.map(lambda item: _process_item(job, item, caller), batch))
                if start + BATCH_SIZE < len(items) and not job["cancel_requested"]:
                    time.sleep(BATCH_PAUSE_SECONDS)
    except Exception:
        logger.exception("Bulk import job crashed")
    finally:
        with _lock:
            # Anything still waiting (crash or cancel) is released as not created.
            for item in job["items"]:
                if item["state"] in ("queued", "processing"):
                    if job["cancel_requested"]:
                        item["state"] = "cancelled"
                    else:
                        item["state"] = "failed"
                        item["error"] = "The import was interrupted. Retry this record."
            cancelled = any(item["state"] == "cancelled" for item in job["items"])
            job["status"] = "cancelled" if cancelled else "completed"
            job["finished_at"] = time.time()
        _write_audit_log(job, caller)


@router.post("/api/admin/users/import-jobs", status_code=202)
def start_import_job(
    payload: ImportJobRequest,
    caller: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    actor_id = caller.get("admin_id")
    items: List[Dict[str, Any]] = []
    seen: set = set()

    for row in payload.rows:
        item = {
            "id": row.client_id,
            "email": row.email.strip().lower(),
            "first_name": row.first_name.strip(),
            "last_name": row.last_name.strip(),
            "state": "queued",
            "error": "",
            "request": None,
        }
        # Same validation as the single-create endpoint; invalid rows fail up front.
        try:
            request = CreateUserRequest(**row.model_dump(exclude={"client_id"}))
            if request.role == "super_admin" and caller.get("is_super_admin") is not True:
                raise ValueError("Only a Super Admin can create a Super Admin account.")
            if request.email in seen:
                raise ValueError("Duplicate email in this import.")
            seen.add(request.email)
            item["request"] = request
        except ValidationError as error:
            item["state"] = "failed"
            item["error"] = error.errors()[0]["msg"].removeprefix("Value error, ")
        except ValueError as error:
            item["state"] = "failed"
            item["error"] = str(error)
        items.append(item)

    job = {
        "id": uuid.uuid4().hex,
        "actor_id": actor_id,
        "status": "running",
        "file_name": payload.file_name,
        "cancel_requested": False,
        "rate_limited": False,
        "started_at": time.time(),
        "finished_at": None,
        "items": items,
    }

    # Checked and registered under one lock, so a double click cannot start two jobs.
    with _lock:
        _prune()
        running = next(
            (existing for existing in _jobs.values()
             if existing["actor_id"] == actor_id and existing["finished_at"] is None),
            None,
        )
        if running:
            raise HTTPException(status_code=409, detail="An import is already in progress.")
        _jobs[job["id"]] = job

    threading.Thread(target=_run_job, args=(job, caller), daemon=True, name=f"import-{job['id'][:8]}").start()
    with _lock:
        return {"data": _view(job)}


@router.get("/api/admin/users/import-jobs/active")
def get_active_import_job(caller: Dict[str, Any] = Depends(require_admin)) -> Dict[str, Any]:
    """The caller's most recent job, so progress can be resumed after navigating away."""
    with _lock:
        mine = [job for job in _jobs.values() if job["actor_id"] == caller.get("admin_id")]
        latest = max(mine, key=lambda job: job["started_at"], default=None)
        return {"data": _view(latest) if latest else None}


@router.get("/api/admin/users/import-jobs/{job_id}")
def get_import_job(job_id: str, caller: Dict[str, Any] = Depends(require_admin)) -> Dict[str, Any]:
    with _lock:
        return {"data": _view(_get_owned_job(job_id, caller))}


@router.post("/api/admin/users/import-jobs/{job_id}/cancel")
def cancel_import_job(job_id: str, caller: Dict[str, Any] = Depends(require_admin)) -> Dict[str, Any]:
    with _lock:
        job = _get_owned_job(job_id, caller)
        if job["finished_at"] is None:
            job["cancel_requested"] = True
            job["status"] = "cancelling"
        return {"data": _view(job)}

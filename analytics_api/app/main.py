import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import numpy as np
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sklearn.cluster import KMeans
from sklearn.linear_model import LinearRegression

from supabase import create_client
from .admin_users import router as admin_router

app = FastAPI()

app.include_router(admin_router)
load_dotenv()


def to_number(value: Any, fallback: float = 0.0) -> float:
    try:
        parsed = float(value)
        if np.isfinite(parsed):
            return parsed
        return fallback
    except Exception:
        return fallback


def round_value(value: float, decimals: int = 2) -> float:
    return round((value + np.finfo(float).eps), decimals)


def format_duration(seconds: float) -> str:
    safe_seconds = max(0, int(seconds))
    minutes = safe_seconds // 60
    remaining_seconds = safe_seconds % 60
    return f"{minutes}m {remaining_seconds:02d}s"


MAX_SESSION_DURATION_SECONDS = int(os.getenv("MAX_SESSION_DURATION_SECONDS", "7200"))
MAX_APP_SESSION_DURATION_SECONDS = int(os.getenv("MAX_APP_SESSION_DURATION_SECONDS", "86400"))


def extract_valid_session_durations(attempts: List[Dict[str, Any]]) -> List[int]:
    durations: List[int] = []

    for attempt in attempts:
        started_at = parse_iso_date(attempt.get("started_at"))
        submitted_at = parse_iso_date(attempt.get("submitted_at"))
        if not started_at or not submitted_at:
            continue

        diff_seconds = int((submitted_at - started_at).total_seconds())
        if diff_seconds <= 0:
            continue

        # Guard against abandoned browser tabs that would inflate average session length.
        if diff_seconds > MAX_SESSION_DURATION_SECONDS:
            continue

        durations.append(diff_seconds)

    return durations


def normalize_type(value: Optional[str]) -> str:
    return str(value or "").lower().replace("-", "_").replace(" ", "_").strip()


def is_pre_test(value: Optional[str]) -> bool:
    normalized = normalize_type(value)
    return normalized in {"pre_test", "pretest"} or "pre" in normalized


def is_post_test(value: Optional[str]) -> bool:
    normalized = normalize_type(value)
    return normalized in {"post_test", "posttest"} or "post" in normalized or "final" in normalized


def parse_iso_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized)
    except Exception:
        return None


def get_timeframe_start_date(timeframe: str) -> Optional[datetime]:
    now = datetime.utcnow()
    if timeframe == "Last 7 days":
        return now - timedelta(days=7)
    if timeframe == "Last 30 days":
        return now - timedelta(days=30)
    return None


def get_attempt_timestamp(attempt: Dict[str, Any]) -> Optional[str]:
    return (
        attempt.get("submitted_at")
        or attempt.get("started_at")
        or attempt.get("created_at")
    )


def includes_by_timeframe(iso_date: Optional[str], start_date: Optional[datetime]) -> bool:
    if start_date is None:
        return True
    parsed = parse_iso_date(iso_date)
    if not parsed:
        return False
    return parsed >= start_date


def includes_by_people(status: Optional[str], people_filter: str) -> bool:
    normalized_status = str(status or "").lower().strip()
    if people_filter == "Active":
        return normalized_status == "active"
    if people_filter == "Inactive":
        return normalized_status != "active"
    return True


def includes_by_topic(module_data: Optional[Dict[str, Any]], topic_filter: str) -> bool:
    if not topic_filter or topic_filter == "All":
        return True

    selected = str(topic_filter).lower().strip()
    module_id = str((module_data or {}).get("id") or "").lower()
    module_title = str((module_data or {}).get("title") or "").lower().strip()
    return selected in {module_id, module_title}


def calculate_normalized_gain(pre_test_score: float, post_test_score: float) -> float:
    pre = to_number(pre_test_score, 0)
    post = to_number(post_test_score, 0)
    if pre >= 100:
        return 0.0
    return round_value((post - pre) / (100 - pre), 4)


def classify_knowledge_risk(normalized_gain: float, completion_rate: float, simulation_score: float) -> str:
    gain = to_number(normalized_gain, 0)
    completion = to_number(completion_rate, 0)
    simulation = to_number(simulation_score, 0)

    if gain < 0.2 or completion < 60 or simulation < 55:
        return "high"
    if gain < 0.4 or completion < 80 or simulation < 70:
        return "moderate"
    return "low"


def format_module_label(module_no: Any) -> str:
    value = str(module_no or "").strip()
    return f"Module {value}" if value else "Module -"


class Filters(BaseModel):
    timeframe: str = "All-time"
    people: str = "All"
    topic: str = "All"
    activityTrendsView: str = "Month"
    userOverviewRange: str = "Month"


class DeleteUserRequest(BaseModel):
    admin_id: str


app = FastAPI(title="Ignis Safe Analytics API", version="1.0.0")

frontend_origins = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
print("FRONTEND_ORIGINS =", frontend_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

supabase_url = os.getenv("SUPABASE_URL")
supabase_service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
analytics_api_key = os.getenv("ANALYTICS_API_KEY", "").strip()

if not supabase_url or not supabase_service_role_key:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(supabase_url, supabase_service_role_key)


def require_api_key(x_analytics_api_key: Optional[str] = Header(default=None)) -> None:
    if not analytics_api_key:
        return
    if x_analytics_api_key != analytics_api_key:
        raise HTTPException(status_code=401, detail="Invalid analytics API key")


def fetch_all_rows(table: str, columns: str, page_size: int = 1000):
    print(f"Fetching table: {table}", flush=True)

    all_rows = []
    start = 0

    while True:
        try:
            print(f"START {table} {start}", flush=True)

            response = (
                supabase.table(table)
                .select(columns)
                .range(start, start + page_size - 1)
                .execute()
            )

            print(f"SUCCESS {table} {start}", flush=True)

        except Exception as e:
            print(f"FAILED {table}: {repr(e)}", flush=True)
            raise

        rows = response.data or []

        print(f"{table}: received {len(rows)} rows", flush=True)

        all_rows.extend(rows)

        if len(rows) < page_size:
            break

        start += page_size

    print(f"Finished {table}", flush=True)

    return all_rows

def fetch_all_rows_from_any_table(table_candidates: List[str], columns: str) -> List[Dict[str, Any]]:
    last_error: Optional[Exception] = None

    for table in table_candidates:
        try:
            return fetch_all_rows(table, columns)
        except Exception as error:
            last_error = error

    if last_error:
        raise last_error

    return []


def is_missing_table_error(error: Exception) -> bool:
    message = str(error).lower()
    return "pgrst205" in message or "42p01" in message or "does not exist" in message


def normalize_simulation_session_row(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "admin_id": row.get("admin_id") or row.get("user_id") or row.get("profile_id"),
        "module_id": row.get("module_id"),
        "completion_rate": row.get("completion_rate"),
        "simulation_score": row.get("simulation_score") or row.get("score"),
        "duration_seconds": row.get("duration_seconds") or row.get("duration") or row.get("seconds"),
        "error_count": row.get("error_count") or row.get("errors") or 0,
        "hint_count": row.get("hint_count") or row.get("hints") or 0,
        "completed_at": row.get("completed_at") or row.get("submitted_at") or row.get("created_at"),
    }


def normalize_app_session_row(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "session_id": row.get("session_id") or row.get("id"),
        "admin_id": row.get("admin_id") or row.get("user_id"),
        "started_at": row.get("started_at") or row.get("created_at"),
        "ended_at": row.get("ended_at") or row.get("closed_at"),
        "duration_seconds": row.get("duration_seconds"),
        "closure_reason": row.get("closure_reason") or row.get("reason"),
        "metadata": row.get("metadata") or {},
    }


def load_analytics_base_data() -> Dict[str, Any]:
    print("Loading profiles...", flush=True)
    profiles = fetch_all_rows("profiles", "id")

    print("Loading admin...", flush=True)
    profile_ids = [row.get("id") for row in profiles if row.get("id")]

    admin_rows: List[Dict[str, Any]] = []
    if profile_ids:
        admin_rows = (
            supabase.table("admin")
            .select("admin_id,status")
            .in_("admin_id", profile_ids)
            .execute()
            .data
            or []
        )

    admin_map = {row.get("admin_id"): row for row in admin_rows}
    users = [
        {
            "admin_id": profile_id,
            "status": (admin_map.get(profile_id) or {}).get("status") or "Active",
        }
        for profile_id in profile_ids
    ]

    print("Loading attempts...", flush=True)
    attempts = fetch_all_rows(
        "assessment_attempts",
        "id,user_id,assessment_id,started_at,submitted_at,created_at,status,score",
    )

    print("Loading answers...", flush=True)
    answers = fetch_all_rows(
        "assessment_attempt_answers",
        "attempt_id,created_at,selected_option_id,answer_text",
    )

    print("Loading assessments...", flush=True)
    assessments = fetch_all_rows(
        "assessments",
        "id,module_id,type,title",
    )

    print("Loading modules...", flush=True)
    modules = fetch_all_rows(
        "modules",
        "id,module_no,title",
    )

    print("Loading module_progress...", flush=True)
    module_progress = fetch_all_rows(
        "module_progress",
        "user_id,module_id,pre_test_completed_at,simulation_completed_at,post_test_completed_at",
    )

    print("Loading simulation_sessions...", flush=True)
    simulation_sessions = fetch_all_rows_from_any_table(
        ["simulation_attempts", "training_simulation_sessions"],
        "*",
    )

    print("Loading app_sessions...", flush=True)
    try:
        app_sessions = fetch_all_rows_from_any_table(
            ["app_sessions"],
            "*",
        )
    except Exception as error:
        if not is_missing_table_error(error):
            raise
        app_sessions = []

    print("Finished loading.", flush=True)

    return {
        "users": users,
        "attempts": attempts,
        "answers": answers,
        "assessments": assessments,
        "modules": modules,
        "module_progress": module_progress,
        "simulation_sessions": [
            normalize_simulation_session_row(row)
            for row in simulation_sessions
        ],
        "app_sessions": [
            normalize_app_session_row(row)
            for row in app_sessions
        ],
    }


def extract_valid_app_session_durations(app_sessions: List[Dict[str, Any]]) -> List[int]:
    durations: List[int] = []

    for session in app_sessions:
        stored_duration = int(to_number(session.get("duration_seconds"), 0))
        if 0 < stored_duration <= MAX_APP_SESSION_DURATION_SECONDS:
            durations.append(stored_duration)
            continue

        started_at = parse_iso_date(session.get("started_at"))
        ended_at = parse_iso_date(session.get("ended_at"))
        if not started_at or not ended_at:
            continue

        diff_seconds = int((ended_at - started_at).total_seconds())
        if diff_seconds <= 0 or diff_seconds > MAX_APP_SESSION_DURATION_SECONDS:
            continue

        durations.append(diff_seconds)

    return durations


def build_overview_rows(data: Dict[str, Any], filters: Filters) -> List[Dict[str, Any]]:
    start_date = get_timeframe_start_date(filters.timeframe)
    grouped: Dict[str, Dict[str, Any]] = {}

    user_by_id = {row.get("admin_id"): row for row in data["users"]}
    assessments_by_id = {row.get("id"): row for row in data["assessments"]}
    modules_by_id = {row.get("id"): row for row in data["modules"]}

    for attempt in data["attempts"]:
        assessment = assessments_by_id.get(attempt.get("assessment_id"))
        if not assessment:
            continue

        module_data = modules_by_id.get(assessment.get("module_id"))
        user_status = (user_by_id.get(attempt.get("user_id")) or {}).get("status")
        attempt_timestamp = get_attempt_timestamp(attempt)

        if not includes_by_people(user_status, filters.people):
            continue
        if not includes_by_topic(module_data, filters.topic):
            continue
        if not includes_by_timeframe(attempt_timestamp, start_date):
            continue

        key = f"{attempt.get('user_id')}-{assessment.get('module_id')}"
        if key not in grouped:
            grouped[key] = {
                "adminId": attempt.get("user_id"),
                "moduleId": assessment.get("module_id"),
                "moduleName": (module_data or {}).get("title") or assessment.get("title") or "Unknown Module",
                "preAttempt": None,
                "postAttempt": None,
                "durationSecondsList": [],
                "latestActivityAt": None,
            }

        item = grouped[key]
        attempt_time = parse_iso_date(attempt_timestamp)
        attempt_time_ts = attempt_time.timestamp() if attempt_time else 0

        if is_pre_test(assessment.get("type")):
            previous_pre = parse_iso_date(get_attempt_timestamp(item["preAttempt"])) if item["preAttempt"] else None
            previous_pre_ts = previous_pre.timestamp() if previous_pre else 0
            if item["preAttempt"] is None or attempt_time_ts > previous_pre_ts:
                item["preAttempt"] = attempt

        if is_post_test(assessment.get("type")):
            previous_post = parse_iso_date(get_attempt_timestamp(item["postAttempt"])) if item["postAttempt"] else None
            previous_post_ts = previous_post.timestamp() if previous_post else 0
            if item["postAttempt"] is None or attempt_time_ts > previous_post_ts:
                item["postAttempt"] = attempt

        started_at = parse_iso_date(attempt.get("started_at"))
        submitted_at = parse_iso_date(attempt.get("submitted_at"))
        if started_at and submitted_at:
            diff_seconds = max(0, int((submitted_at - started_at).total_seconds()))
            if 0 < diff_seconds <= MAX_SESSION_DURATION_SECONDS:
                item["durationSecondsList"].append(diff_seconds)

        previous_latest = parse_iso_date(item["latestActivityAt"]) if item["latestActivityAt"] else None
        previous_latest_ts = previous_latest.timestamp() if previous_latest else 0
        if attempt_time_ts > previous_latest_ts:
            item["latestActivityAt"] = attempt_timestamp

    # incorporate simulation sessions (latest per admin/module) into grouping
    simulations = data.get("simulation_sessions") or []
    latest_sim_by_key: Dict[str, Dict[str, Any]] = {}
    for sim in simulations:
        admin_id = sim.get("admin_id")
        module_id = sim.get("module_id")
        if not admin_id or not module_id:
            continue

        module_data = modules_by_id.get(module_id)
        user_status = (user_by_id.get(admin_id) or {}).get("status")
        completed_at = sim.get("completed_at") or sim.get("created_at")

        if not includes_by_people(user_status, filters.people):
            continue
        if not includes_by_topic(module_data, filters.topic):
            continue
        if not includes_by_timeframe(completed_at, start_date):
            continue

        key = f"{admin_id}-{module_id}"
        prev = latest_sim_by_key.get(key)
        prev_ts = parse_iso_date(prev.get("completed_at")).timestamp() if prev and prev.get("completed_at") else 0
        this_ts = parse_iso_date(completed_at).timestamp() if completed_at else 0
        if key not in latest_sim_by_key or this_ts > prev_ts:
            latest_sim_by_key[key] = sim

    rows = []
    for row in grouped.values():
        pre_test_score = to_number((row["preAttempt"] or {}).get("score"), 0)
        post_test_score = to_number((row["postAttempt"] or {}).get("score"), 0)

        # compute latest pre/post attempt durations (if available)
        pre_duration = 0
        post_duration = 0
        if row.get("preAttempt"):
            started = parse_iso_date(row["preAttempt"].get("started_at"))
            submitted = parse_iso_date(row["preAttempt"].get("submitted_at"))
            if started and submitted:
                diff = int((submitted - started).total_seconds())
                if 0 < diff <= MAX_SESSION_DURATION_SECONDS:
                    pre_duration = diff

        if row.get("postAttempt"):
            started = parse_iso_date(row["postAttempt"].get("started_at"))
            submitted = parse_iso_date(row["postAttempt"].get("submitted_at"))
            if started and submitted:
                diff = int((submitted - started).total_seconds())
                if 0 < diff <= MAX_SESSION_DURATION_SECONDS:
                    post_duration = diff

        # simulation duration (from simulation_sessions latest record)
        sim = latest_sim_by_key.get(f"{row['adminId']}-{row['moduleId']}")
        sim_duration = 0
        simulation_score = 0
        completion_rate = 0
        if sim:
            try:
                sim_d = to_number(sim.get("duration_seconds"), 0)
                if 0 < sim_d <= MAX_SESSION_DURATION_SECONDS:
                    sim_duration = int(sim_d)
            except Exception:
                sim_duration = 0

            simulation_score = to_number(sim.get("simulation_score"), 0)
            completion_rate = to_number(sim.get("completion_rate"), 0)

        total_session_seconds = pre_duration + sim_duration + post_duration

        normalized_gain = calculate_normalized_gain(pre_test_score, post_test_score) if row["preAttempt"] and row["postAttempt"] else 0
        rows.append(
            {
                "adminId": row["adminId"],
                "moduleId": row["moduleId"],
                "moduleName": row["moduleName"],
                "preTestScore": pre_test_score,
                "postTestScore": post_test_score,
                "completionRate": completion_rate,
                "simulationScore": simulation_score,
                "durationSeconds": total_session_seconds,
                "preDurationSeconds": pre_duration,
                "postDurationSeconds": post_duration,
                "simulationDurationSeconds": sim_duration,
                "normalizedGain": normalized_gain,
                "rawGain": round_value(post_test_score - pre_test_score, 2),
                "riskLevel": classify_knowledge_risk(normalized_gain, completion_rate, simulation_score),
                "latestActivityAt": row["latestActivityAt"],
            }
        )

    return rows


def build_activity_trends(filtered_attempts: List[Dict[str, Any]], view: str = "Month") -> Dict[str, List[Any]]:
    now = datetime.utcnow()

    if view == "Week":
        labels: List[str] = []
        started = [0] * 7
        submitted = [0] * 7
        day_keys: List[str] = []

        for index in range(7):
            day = (now - timedelta(days=(6 - index))).replace(hour=0, minute=0, second=0, microsecond=0)
            labels.append(day.strftime("%a"))
            day_keys.append(day.strftime("%Y-%m-%d"))

        key_to_index = {key: idx for idx, key in enumerate(day_keys)}

        for attempt in filtered_attempts:
            started_at = parse_iso_date(attempt.get("started_at"))
            if started_at:
                key = started_at.strftime("%Y-%m-%d")
                idx = key_to_index.get(key)
                if idx is not None:
                    started[idx] += 1

            submitted_at = parse_iso_date(attempt.get("submitted_at"))
            if submitted_at:
                key = submitted_at.strftime("%Y-%m-%d")
                idx = key_to_index.get(key)
                if idx is not None:
                    submitted[idx] += 1

        return {"labels": labels, "started": started, "submitted": submitted}

    if view == "Year":
        labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        started = [0] * 12
        submitted = [0] * 12

        for attempt in filtered_attempts:
            started_at = parse_iso_date(attempt.get("started_at"))
            if started_at:
                started[started_at.month - 1] += 1

            submitted_at = parse_iso_date(attempt.get("submitted_at"))
            if submitted_at:
                submitted[submitted_at.month - 1] += 1

        return {"labels": labels, "started": started, "submitted": submitted}

    year = now.year
    month = now.month
    next_month = datetime(year + (1 if month == 12 else 0), 1 if month == 12 else month + 1, 1)
    days_in_month = (next_month - datetime(year, month, 1)).days

    labels = [str(index + 1) for index in range(days_in_month)]
    started = [0] * days_in_month
    submitted = [0] * days_in_month

    for attempt in filtered_attempts:
        started_at = parse_iso_date(attempt.get("started_at"))
        if started_at and started_at.year == year and started_at.month == month:
            started[started_at.day - 1] += 1

        submitted_at = parse_iso_date(attempt.get("submitted_at"))
        if submitted_at and submitted_at.year == year and submitted_at.month == month:
            submitted[submitted_at.day - 1] += 1

    return {"labels": labels, "started": started, "submitted": submitted}


def build_filter_options(modules: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    topics = sorted({str((row or {}).get("title") or "").strip() for row in modules if str((row or {}).get("title") or "").strip()})
    return {"topics": ["All", *topics]}


def calculate_ai_knowledge_gain_percent(overview_rows: List[Dict[str, Any]]) -> float:
    # Use linear regression to estimate post-test performance from learner behavior.
    # This provides a model-based knowledge gain score instead of a direct formula only.
    candidate_rows = [
        row
        for row in overview_rows
        if row.get("preTestScore") is not None and row.get("postTestScore") is not None
    ]

    if not candidate_rows:
        return 0.0

    if len(candidate_rows) < 4:
        starting = float(np.mean([to_number(row.get("preTestScore"), 0) for row in candidate_rows]))
        current = float(np.mean([to_number(row.get("postTestScore"), 0) for row in candidate_rows]))
        if starting >= 100:
            return 0.0
        return round_value(((current - starting) / (100 - starting)) * 100, 2)

    X = np.array(
        [
            [
                to_number(row.get("preTestScore"), 0),
                min(120.0, max(0.0, to_number(row.get("durationSeconds"), 0) / 60.0)),
                1.0 if to_number(row.get("postTestScore"), 0) > 0 else 0.0,
            ]
            for row in candidate_rows
        ]
    )
    y = np.array([to_number(row.get("postTestScore"), 0) for row in candidate_rows])

    try:
        reg = LinearRegression()
        reg.fit(X, y)

        predicted_post_scores = np.clip(reg.predict(X), 0, 100)
        starting_knowledge = float(np.mean(X[:, 0]))
        predicted_current_knowledge = float(np.mean(predicted_post_scores))

        if starting_knowledge >= 100:
            return 0.0

        return round_value(
            ((predicted_current_knowledge - starting_knowledge) / (100 - starting_knowledge)) * 100,
            2,
        )
    except Exception:
        starting = float(np.mean(X[:, 0]))
        current = float(np.mean(y))
        if starting >= 100:
            return 0.0
        return round_value(((current - starting) / (100 - starting)) * 100, 2)


def build_dashboard_stats(data: Dict[str, Any], filters: Filters) -> Dict[str, Any]:
    start_date = get_timeframe_start_date(filters.timeframe)
    people_filter = filters.people
    topic_filter = filters.topic

    users = data["users"]
    attempts = data["attempts"]
    answers = data["answers"]
    assessments = data["assessments"]
    modules = data["modules"]
    app_sessions = data.get("app_sessions") or []

    user_by_id = {row.get("admin_id"): row for row in users}
    assessments_by_id = {row.get("id"): row for row in assessments}
    modules_by_id = {row.get("id"): row for row in modules}

    has_activity_filters = bool(start_date) or (topic_filter and topic_filter != "All")

    filtered_attempts = []
    for attempt in attempts:
        assessment = assessments_by_id.get(attempt.get("assessment_id"))
        if not assessment:
            continue

        module_data = modules_by_id.get(assessment.get("module_id"))
        user_status = (user_by_id.get(attempt.get("user_id")) or {}).get("status", "Unknown")
        attempt_timestamp = get_attempt_timestamp(attempt)

        if not includes_by_people(user_status, people_filter):
            continue
        if not includes_by_topic(module_data, topic_filter):
            continue
        if not includes_by_timeframe(attempt_timestamp, start_date):
            continue

        filtered_attempts.append(attempt)

    filtered_attempt_ids = {attempt.get("id") for attempt in filtered_attempts}
    filtered_user_ids = {attempt.get("user_id") for attempt in filtered_attempts}

    users_by_people = [row for row in users if includes_by_people(row.get("status"), people_filter)]
    users_scope = [row for row in users_by_people if row.get("admin_id") in filtered_user_ids] if has_activity_filters else users_by_people

    total_users = len(users_scope)
    active_users = len([user for user in users_scope if str(user.get("status") or "").lower() == "active"])

    questions_answered = 0
    for answer in answers:
        if answer.get("attempt_id") not in filtered_attempt_ids:
            continue
        if not includes_by_timeframe(answer.get("created_at"), start_date):
            continue
        if answer.get("selected_option_id") or str(answer.get("answer_text") or "").strip():
            questions_answered += 1

    overview_rows = build_overview_rows(data, filters)

    filtered_app_sessions = []
    for session in app_sessions:
        user_status = (user_by_id.get(session.get("admin_id")) or {}).get("status", "Unknown")
        session_timestamp = session.get("ended_at") or session.get("started_at")

        if not includes_by_people(user_status, people_filter):
            continue
        if not includes_by_timeframe(session_timestamp, start_date):
            continue

        filtered_app_sessions.append(session)

    app_session_totals = extract_valid_app_session_durations(filtered_app_sessions)
    legacy_session_totals = app_session_totals if app_session_totals else [to_number(row.get("durationSeconds"), 0) for row in overview_rows if to_number(row.get("durationSeconds"), 0) > 0]
    avg_duration_seconds = (sum(legacy_session_totals) / len(legacy_session_totals)) if legacy_session_totals else 0

    starting_knowledge = (
        round_value(sum(row["preTestScore"] for row in overview_rows) / len(overview_rows), 2)
        if overview_rows
        else 0
    )
    current_knowledge = (
        round_value(sum(row["postTestScore"] for row in overview_rows) / len(overview_rows), 2)
        if overview_rows
        else 0
    )

    knowledge_gain_percent = calculate_ai_knowledge_gain_percent(overview_rows)

    return {
        "activeUsers": active_users,
        "totalUsers": total_users,
        "questionsAnswered": questions_answered,
        "avgSessionLength": format_duration(avg_duration_seconds),
        "startingKnowledge": starting_knowledge,
        "currentKnowledge": current_knowledge,
        "knowledgeGainPercent": knowledge_gain_percent,
    }


def build_charts(data: Dict[str, Any], filters: Filters) -> Dict[str, Any]:
    start_date = get_timeframe_start_date(filters.timeframe)

    users = data["users"]
    attempts = data["attempts"]
    assessments = data["assessments"]
    modules = data["modules"]
    module_progress = data["module_progress"]

    user_by_id = {row.get("admin_id"): row for row in users}
    assessments_by_id = {row.get("id"): row for row in assessments}
    modules_by_id = {row.get("id"): row for row in modules}

    filtered_attempts: List[Dict[str, Any]] = []
    for attempt in attempts:
        assessment = assessments_by_id.get(attempt.get("assessment_id"))
        if not assessment:
            continue

        module_data = modules_by_id.get(assessment.get("module_id"))
        timestamp = get_attempt_timestamp(attempt)
        user_status = (user_by_id.get(attempt.get("user_id")) or {}).get("status", "Unknown")

        if not includes_by_people(user_status, filters.people):
            continue
        if not includes_by_topic(module_data, filters.topic):
            continue
        if not includes_by_timeframe(timestamp, start_date):
            continue

        filtered_attempts.append(attempt)

    if filters.userOverviewRange == "Year":
        current_year = datetime.utcnow().year
        month_buckets = [
            {
                "key": f"{current_year}-{month:02d}",
                "label": datetime(current_year, month, 1).strftime("%b"),
            }
            for month in range(1, 13)
        ]
        active_users_by_month = {bucket["key"]: set() for bucket in month_buckets}

        for attempt in filtered_attempts:
            timestamp = parse_iso_date(get_attempt_timestamp(attempt))
            if not timestamp or timestamp.year != current_year:
                continue
            month_key = timestamp.strftime("%Y-%m")
            if month_key in active_users_by_month:
                active_users_by_month[month_key].add(attempt.get("user_id"))

        user_overview = {
            "labels": [bucket["label"] for bucket in month_buckets],
            "values": [len(active_users_by_month[bucket["key"]]) for bucket in month_buckets],
        }
    else:
        day_count = 7 if filters.userOverviewRange == "Week" else 30
        day_buckets = [
            (datetime.utcnow() - timedelta(days=(day_count - 1 - idx))).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            for idx in range(day_count)
        ]
        active_users_by_day = {day.strftime("%Y-%m-%d"): set() for day in day_buckets}

        for attempt in filtered_attempts:
            timestamp = parse_iso_date(get_attempt_timestamp(attempt))
            if not timestamp:
                continue
            day_key = timestamp.strftime("%Y-%m-%d")
            if day_key in active_users_by_day:
                active_users_by_day[day_key].add(attempt.get("user_id"))

        user_overview = {
            "labels": [day.strftime("%b %d") for day in day_buckets],
            "values": [len(active_users_by_day[day.strftime("%Y-%m-%d")]) for day in day_buckets],
        }

    activity_trends = build_activity_trends(filtered_attempts, filters.activityTrendsView)

    learning_accumulator: Dict[str, Dict[str, Any]] = {}
    for attempt in filtered_attempts:
        assessment = assessments_by_id.get(attempt.get("assessment_id"))
        module_data = modules_by_id.get((assessment or {}).get("module_id")) if assessment else None
        if not assessment or not module_data:
            continue

        module_id = str(module_data.get("id"))
        if module_id not in learning_accumulator:
            learning_accumulator[module_id] = {
                "moduleNo": module_data.get("module_no") or "-",
                "preTotal": 0.0,
                "preCount": 0,
                "postTotal": 0.0,
                "postCount": 0,
                "attempts": 0,
            }

        row = learning_accumulator[module_id]
        score = to_number(attempt.get("score"), 0)

        if is_pre_test(assessment.get("type")):
            row["preTotal"] += score
            row["preCount"] += 1

        if is_post_test(assessment.get("type")):
            row["postTotal"] += score
            row["postCount"] += 1

        row["attempts"] += 1

    sorted_learning = sorted(
        learning_accumulator.values(),
        key=lambda x: to_number(x["moduleNo"], float("inf")),
    )
    learning_by_module = {
        "labels": [format_module_label(row["moduleNo"]) for row in sorted_learning],
        "preTest": [round_value(row["preTotal"] / row["preCount"], 2) if row["preCount"] else 0 for row in sorted_learning],
        "postTest": [round_value(row["postTotal"] / row["postCount"], 2) if row["postCount"] else 0 for row in sorted_learning],
    }

    modules_for_completion = sorted(
        [module for module in modules if includes_by_topic(module, filters.topic)],
        key=lambda row: (to_number(row.get("module_no"), 1e9), str(row.get("title") or "")),
    )

    filtered_module_progress = [
        row for row in module_progress if includes_by_topic(modules_by_id.get(row.get("module_id")), filters.topic)
    ]

    completion_accumulator = {
        row.get("id"): {"completionSum": 0.0, "simulationDone": 0, "count": 0}
        for row in modules_for_completion
    }

    for row in filtered_module_progress:
        bucket = completion_accumulator.get(row.get("module_id"))
        if not bucket:
            continue

        steps_done = sum(
            [
                bool(row.get("pre_test_completed_at")),
                bool(row.get("simulation_completed_at")),
                bool(row.get("post_test_completed_at")),
            ]
        )
        bucket["completionSum"] += round_value((steps_done / 3) * 100, 2)
        bucket["count"] += 1

    completion_by_module = {
        "labels": [format_module_label(row.get("module_no")) for row in modules_for_completion],
        "completionRate": [
            round_value(completion_accumulator.get(row.get("id"), {}).get("completionSum", 0) / completion_accumulator.get(row.get("id"), {}).get("count", 1), 2)
            if completion_accumulator.get(row.get("id"), {}).get("count", 0)
            else 0
            for row in modules_for_completion
        ],
        "simulationCompletion": [
            round_value((completion_accumulator.get(row.get("id"), {}).get("simulationDone", 0) / completion_accumulator.get(row.get("id"), {}).get("count", 1)) * 100, 2)
            if completion_accumulator.get(row.get("id"), {}).get("count", 0)
            else 0
            for row in modules_for_completion
        ],
    }

    modules_for_attempts = sorted(
        [module for module in modules if includes_by_topic(module, filters.topic)],
        key=lambda row: (to_number(row.get("module_no"), 1e9), str(row.get("title") or "")),
    )

    attempts_accumulator = {row.get("id"): 0 for row in modules_for_attempts}
    for attempt in filtered_attempts:
        assessment = assessments_by_id.get(attempt.get("assessment_id"))
        module_id = (assessment or {}).get("module_id")
        if module_id in attempts_accumulator:
            attempts_accumulator[module_id] += 1

    attempts_by_module = {
        "labels": [format_module_label(row.get("module_no")) for row in modules_for_attempts],
        "attempts": [attempts_accumulator.get(row.get("id"), 0) for row in modules_for_attempts],
    }

    overview_rows = build_overview_rows(data, filters)

    trend_accumulator: Dict[str, Dict[str, float]] = {}
    for row in overview_rows:
        activity_at = parse_iso_date(row.get("latestActivityAt"))
        if not activity_at:
            continue

        if start_date and activity_at < start_date:
            continue

        bucket_key = activity_at.strftime("%Y-%m-%d")
        if bucket_key not in trend_accumulator:
            trend_accumulator[bucket_key] = {"gain_sum": 0.0, "count": 0}

        trend_accumulator[bucket_key]["gain_sum"] += to_number(row.get("normalizedGain"), 0) * 100
        trend_accumulator[bucket_key]["count"] += 1

    sorted_trend_keys = sorted(trend_accumulator.keys())
    knowledge_gain_trend = {
        "labels": [datetime.strptime(key, "%Y-%m-%d").strftime("%b %d") for key in sorted_trend_keys],
        "values": [
            round_value(trend_accumulator[key]["gain_sum"] / trend_accumulator[key]["count"], 2)
            if trend_accumulator[key]["count"] > 0
            else 0
            for key in sorted_trend_keys
        ],
    }

    risk_distribution = {
        "labels": ["High", "Moderate", "Low"],
        "values": [0, 0, 0],
    }

    if len(overview_rows) >= 6:
        features = np.array(
            [
                [
                    to_number(row.get("normalizedGain"), 0),
                    to_number(row.get("preTestScore"), 0) / 100,
                    to_number(row.get("postTestScore"), 0) / 100,
                ]
                for row in overview_rows
            ]
        )

        try:
            kmeans = KMeans(n_clusters=3, n_init=10, random_state=42)
            labels = kmeans.fit_predict(features)
            centers = kmeans.cluster_centers_

            ranked = sorted(
                [(idx, center[0]) for idx, center in enumerate(centers)],
                key=lambda item: item[1],
            )
            label_map = {
                ranked[0][0]: "High",
                ranked[1][0]: "Moderate",
                ranked[2][0]: "Low",
            }

            counts = {"High": 0, "Moderate": 0, "Low": 0}
            for cluster_label in labels:
                counts[label_map[int(cluster_label)]] += 1

            risk_distribution["values"] = [counts["High"], counts["Moderate"], counts["Low"]]
        except Exception:
            pass

    if sum(risk_distribution["values"]) == 0 and overview_rows:
        fallback_counts = {"High": 0, "Moderate": 0, "Low": 0}
        for row in overview_rows:
            level = classify_knowledge_risk(
                to_number(row.get("normalizedGain"), 0),
                to_number(row.get("completionRate"), 100),
                to_number(row.get("simulationScore"), 100),
            )
            if level == "high":
                fallback_counts["High"] += 1
            elif level == "moderate":
                fallback_counts["Moderate"] += 1
            else:
                fallback_counts["Low"] += 1

        risk_distribution["values"] = [
            fallback_counts["High"],
            fallback_counts["Moderate"],
            fallback_counts["Low"],
        ]

    return {
        "userOverview": user_overview,
        "activityTrends": activity_trends,
        "learningByModule": learning_by_module,
        "completionByModule": completion_by_module,
        "attemptsByModule": attempts_by_module,
        "knowledgeGainTrend": knowledge_gain_trend,
        "riskDistribution": risk_distribution,
    }


def build_ai_insights(data: Dict[str, Any], filters: Filters) -> Dict[str, Any]:
    overview_rows = build_overview_rows(data, filters)

    # Linear regression estimate for expected post-test score based on cohort averages.
    train_rows = [row for row in overview_rows if row["preTestScore"] > 0 or row["postTestScore"] > 0]

    model_estimate: Dict[str, Any] = {
        "predictedPostTestScore": None,
        "sampleSize": 0,
    }

    if len(train_rows) >= 4:
        X = np.array(
            [
                [
                    row["preTestScore"],
                    min(100, max(0, row["durationSeconds"] / 60)),
                    100 if row["postTestScore"] > 0 else 0,
                ]
                for row in train_rows
            ]
        )
        y = np.array([row["postTestScore"] for row in train_rows])

        reg = LinearRegression()
        reg.fit(X, y)

        avg_pre = float(np.mean([row["preTestScore"] for row in train_rows]))
        avg_minutes = float(np.mean([row["durationSeconds"] / 60 for row in train_rows]))
        predicted = float(reg.predict(np.array([[avg_pre, avg_minutes, 100]]))[0])

        model_estimate = {
            "predictedPostTestScore": round_value(max(0, min(100, predicted)), 2),
            "sampleSize": len(train_rows),
        }

    risk_clusters: Dict[str, Any] = {
        "enabled": False,
        "high": 0,
        "moderate": 0,
        "low": 0,
    }

    if len(overview_rows) >= 6:
        features = np.array(
            [
                [
                    row["normalizedGain"],
                    to_number(row["preTestScore"], 0) / 100,
                    to_number(row["postTestScore"], 0) / 100,
                ]
                for row in overview_rows
            ]
        )

        try:
            kmeans = KMeans(n_clusters=3, n_init=10, random_state=42)
            labels = kmeans.fit_predict(features)
            centers = kmeans.cluster_centers_

            # Rank clusters by normalized gain center to map low/mid/high cohorts.
            ranked = sorted(
                [(idx, center[0]) for idx, center in enumerate(centers)],
                key=lambda item: item[1],
            )
            label_map = {
                ranked[0][0]: "high",       # lowest gain => highest risk
                ranked[1][0]: "moderate",
                ranked[2][0]: "low",
            }

            counts = {"high": 0, "moderate": 0, "low": 0}
            for label in labels:
                counts[label_map[int(label)]] += 1

            risk_clusters = {
                "enabled": True,
                "high": counts["high"],
                "moderate": counts["moderate"],
                "low": counts["low"],
            }
        except Exception:
            pass

    return {
        "regression": model_estimate,
        "riskClusters": risk_clusters,
    }


def build_module_recommendations(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Analyze module performance and generate AI-driven recommendations."""
    assessments_by_id = {row.get("id"): row for row in data["assessments"]}
    modules_by_id = {row.get("id"): row for row in data["modules"]}
    
    module_stats: Dict[str, Dict[str, Any]] = {}
    
    # Aggregate scores by module
    for attempt in data["attempts"]:
        assessment = assessments_by_id.get(attempt.get("assessment_id"))
        if not assessment:
            continue
            
        module_id = assessment.get("module_id")
        module_data = modules_by_id.get(module_id)
        if not module_data:
            continue
            
        if module_id not in module_stats:
            module_stats[module_id] = {
                "module_id": module_id,
                "module_name": module_data.get("title", "Unknown Module"),
                "scores": [],
                "attempts_count": 0,
                "completion_count": 0,
            }
        
        score = to_number(attempt.get("score"), 0)
        module_stats[module_id]["scores"].append(score)
        module_stats[module_id]["attempts_count"] += 1
        if score >= 70:
            module_stats[module_id]["completion_count"] += 1
    
    # Calculate averages and generate recommendations
    recommendations: List[Dict[str, Any]] = []
    
    for module_id, stats in sorted(module_stats.items(), key=lambda x: x[1]["module_name"]):
        if not stats["scores"]:
            continue
            
        avg_score = round_value(float(np.mean(stats["scores"])), 2)
        pass_rate = round_value((stats["completion_count"] / stats["attempts_count"] * 100) if stats["attempts_count"] > 0 else 0, 2)
        
        # Classify performance level
        if avg_score >= 80:
            level = "excellent"
            color = "green"
            emoji = "✅"
        elif avg_score >= 65:
            level = "good"
            color = "blue"
            emoji = "👍"
        elif avg_score >= 50:
            level = "moderate"
            color = "orange"
            emoji = "⚠️"
        else:
            level = "low"
            color = "red"
            emoji = "🚨"
        
        # Generate AI recommendations based on performance
        recommendations_text = []
        
        if avg_score >= 80:
            recommendations_text.append("✓ Module is performing well — consider using as a template for other modules")
            if pass_rate < 100:
                recommendations_text.append(f"• {100 - pass_rate}% of learners need support — review edge cases")
        elif avg_score >= 65:
            recommendations_text.append("• Add more interactive examples to reinforce concepts")
            recommendations_text.append("• Consider adding practice questions between sections")
            if pass_rate < 80:
                recommendations_text.append("• Extend practice time for struggling learners")
        elif avg_score >= 50:
            recommendations_text.append("🔴 Content may be too advanced — simplify explanations")
            recommendations_text.append("• Break module into smaller, focused segments")
            recommendations_text.append("• Add prerequisite knowledge review section")
            recommendations_text.append("• Increase simulation/practice opportunities")
        else:
            recommendations_text.append("🔴 URGENT: Module requires significant revision")
            recommendations_text.append("• Completely rewrite confusing sections")
            recommendations_text.append("• Add detailed visual aids and step-by-step walkthroughs")
            recommendations_text.append("• Create guided simulation with hints")
            recommendations_text.append("• Consider splitting into multiple modules")
        
        recommendations.append({
            "moduleId": module_id,
            "moduleName": stats["module_name"],
            "averageScore": avg_score,
            "passRate": pass_rate,
            "attemptCount": stats["attempts_count"],
            "level": level,
            "color": color,
            "emoji": emoji,
            "recommendations": recommendations_text,
        })
    
    # Sort by average score (low first) so urgent items appear on top
    recommendations.sort(key=lambda x: x["averageScore"])
    
    return recommendations


@app.get("/health")
def health_check() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/api/admin/users/delete", dependencies=[Depends(require_api_key)])
def delete_user(request: DeleteUserRequest) -> Dict[str, Any]:
    admin_id = str(request.admin_id or "").strip()
    if not admin_id:
        raise HTTPException(status_code=400, detail="admin_id is required")

    auth_deleted = False
    auth_error_message: Optional[str] = None

    try:
      supabase.auth.admin.delete_user(admin_id)
      auth_deleted = True
    except Exception as error:
      auth_error_message = str(error)
      lowered_message = auth_error_message.lower()
      if "not found" not in lowered_message and "does not exist" not in lowered_message:
          raise HTTPException(status_code=400, detail=f"Failed to delete auth user: {auth_error_message}")

    admin_response = supabase.table("admin").delete().eq("admin_id", admin_id).execute()
    deleted_count = len(admin_response.data or [])
    if deleted_count == 0:
        raise HTTPException(status_code=404, detail="No admin row was deleted.")

    return {
        "data": {
            "admin_id": admin_id,
            "deletedCount": deleted_count,
            "authDeleted": auth_deleted,
            "authError": auth_error_message,
        },
        "error": None,
    }


from .admin_users import router as admin_users_router


app.include_router(admin_users_router)


@app.get("/api/knowledge-analytics/filter-options")
def get_filter_options():
    modules = fetch_all_rows(
        "modules",
        "id,module_no,title",
    )

    return {
        "data": build_filter_options(modules),
        "error": None,
    }


@app.post("/api/knowledge-analytics/dashboard-stats", dependencies=[Depends(require_api_key)])
def get_dashboard_stats(filters: Filters) -> Dict[str, Any]:
    data = load_analytics_base_data()
    return {"data": build_dashboard_stats(data, filters), "error": None}


@app.post("/api/knowledge-analytics/charts", dependencies=[Depends(require_api_key)])
def get_charts(filters: Filters) -> Dict[str, Any]:
    data = load_analytics_base_data()
    return {"data": build_charts(data, filters), "error": None}


@app.post("/api/knowledge-analytics/dashboard", dependencies=[Depends(require_api_key)])
def get_dashboard_bundle(filters: Filters) -> Dict[str, Any]:
    data = load_analytics_base_data()
    return {
        "data": {
            "stats": build_dashboard_stats(data, filters),
            "charts": build_charts(data, filters),
            "filterOptions": build_filter_options(data["modules"]),
            "aiInsights": build_ai_insights(data, filters),
        },
        "error": None,
    }


@app.get("/api/knowledge-analytics/module-recommendations", dependencies=[Depends(require_api_key)])
def get_module_recommendations() -> Dict[str, Any]:
    data = {
        "attempts": fetch_all_rows(
            "assessment_attempts",
            "id,user_id,assessment_id,started_at,submitted_at,created_at,status,score",
        ),
        "assessments": fetch_all_rows(
            "assessments",
            "id,module_id,type,title",
        ),
        "modules": fetch_all_rows(
            "modules",
            "id,module_no,title",
        ),
    }

    return {
        "data": build_module_recommendations(data),
        "error": None,
    }

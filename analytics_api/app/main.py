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
from supabase import Client, create_client

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


class Filters(BaseModel):
    timeframe: str = "All-time"
    people: str = "All"
    topic: str = "All"
    activityTrendsView: str = "Month"


app = FastAPI(title="Ignis Safe Analytics API", version="1.0.0")

frontend_origins = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

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

supabase: Client = create_client(supabase_url, supabase_service_role_key)


def require_api_key(x_analytics_api_key: Optional[str] = Header(default=None)) -> None:
    if not analytics_api_key:
        return
    if x_analytics_api_key != analytics_api_key:
        raise HTTPException(status_code=401, detail="Invalid analytics API key")


def fetch_all_rows(table: str, columns: str, page_size: int = 1000) -> List[Dict[str, Any]]:
    all_rows: List[Dict[str, Any]] = []
    start = 0

    while True:
        end = start + page_size - 1
        response = supabase.table(table).select(columns).range(start, end).execute()
        rows = response.data or []
        all_rows.extend(rows)

        if len(rows) < page_size:
            break

        start += page_size

    return all_rows


def load_analytics_base_data() -> Dict[str, Any]:
    profiles = fetch_all_rows("profiles", "id")
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

    attempts = fetch_all_rows(
        "assessment_attempts",
        "id,user_id,assessment_id,started_at,submitted_at,created_at,status,score",
    )
    answers = fetch_all_rows(
        "assessment_attempt_answers",
        "attempt_id,created_at,selected_option_id,answer_text",
    )
    assessments = fetch_all_rows("assessments", "id,module_id,type,title")
    modules = fetch_all_rows("modules", "id,module_no,title")
    module_progress = fetch_all_rows(
        "module_progress",
        "user_id,module_id,pre_test_completed_at,simulation_completed_at,post_test_completed_at",
    )

    return {
        "users": users,
        "attempts": attempts,
        "answers": answers,
        "assessments": assessments,
        "modules": modules,
        "module_progress": module_progress,
    }


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
            item["durationSecondsList"].append(diff_seconds)

        previous_latest = parse_iso_date(item["latestActivityAt"]) if item["latestActivityAt"] else None
        previous_latest_ts = previous_latest.timestamp() if previous_latest else 0
        if attempt_time_ts > previous_latest_ts:
            item["latestActivityAt"] = attempt_timestamp

    rows = []
    for row in grouped.values():
        pre_test_score = to_number((row["preAttempt"] or {}).get("score"), 0)
        post_test_score = to_number((row["postAttempt"] or {}).get("score"), 0)
        durations = row["durationSecondsList"]
        duration_seconds = (sum(durations) / len(durations)) if durations else 0

        normalized_gain = calculate_normalized_gain(pre_test_score, post_test_score) if row["preAttempt"] and row["postAttempt"] else 0
        rows.append(
            {
                "adminId": row["adminId"],
                "moduleId": row["moduleId"],
                "moduleName": row["moduleName"],
                "preTestScore": pre_test_score,
                "postTestScore": post_test_score,
                "completionRate": 0,
                "simulationScore": 0,
                "durationSeconds": duration_seconds,
                "normalizedGain": normalized_gain,
                "rawGain": round_value(post_test_score - pre_test_score, 2),
                "riskLevel": classify_knowledge_risk(normalized_gain, 100, 100),
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


def build_dashboard_stats(data: Dict[str, Any], filters: Filters) -> Dict[str, Any]:
    start_date = get_timeframe_start_date(filters.timeframe)
    people_filter = filters.people
    topic_filter = filters.topic

    users = data["users"]
    attempts = data["attempts"]
    answers = data["answers"]
    assessments = data["assessments"]
    modules = data["modules"]

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

    avg_duration_seconds = (
        sum(row["durationSeconds"] for row in overview_rows) / len(overview_rows)
        if overview_rows
        else 0
    )

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

    knowledge_gain_percent = 0
    if starting_knowledge < 100:
        knowledge_gain_percent = round_value(((current_knowledge - starting_knowledge) / (100 - starting_knowledge)) * 100, 2)

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

    day_count = 7 if filters.timeframe == "Last 7 days" else 30
    day_buckets = [
        (datetime.utcnow() - timedelta(days=(day_count - 1 - idx))).replace(hour=0, minute=0, second=0, microsecond=0)
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
                "name": module_data.get("title") or "Unknown",
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

    sorted_learning = sorted(learning_accumulator.values(), key=lambda x: x["name"])
    learning_by_module = {
        "labels": [row["name"] for row in sorted_learning],
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
        bucket["simulationDone"] += int(bool(row.get("simulation_completed_at")))
        bucket["count"] += 1

    completion_by_module = {
        "labels": [row.get("title") for row in modules_for_completion],
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
        "labels": [row.get("title") for row in modules_for_attempts],
        "attempts": [attempts_accumulator.get(row.get("id"), 0) for row in modules_for_attempts],
    }

    return {
        "userOverview": user_overview,
        "activityTrends": activity_trends,
        "learningByModule": learning_by_module,
        "completionByModule": completion_by_module,
        "attemptsByModule": attempts_by_module,
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


@app.get("/health")
def health_check() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/api/knowledge-analytics/filter-options", dependencies=[Depends(require_api_key)])
def get_filter_options() -> Dict[str, Any]:
    data = load_analytics_base_data()
    return {"data": build_filter_options(data["modules"]), "error": None}


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

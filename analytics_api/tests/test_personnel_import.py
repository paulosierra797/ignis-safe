"""Offline regression tests: no real users or emails are created."""
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
with patch.dict(os.environ, {"SUPABASE_URL": "https://offline-test.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "offline-test-key"}), patch("supabase.create_client", return_value=SimpleNamespace()):
    from app import dependencies, personnel_import as imports
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

ACTOR = str(uuid4())


class Query:
    def __init__(self, db, table):
        self.db, self.name = db, table
        self.filters, self.payload, self.action = [], None, "select"

    def select(self, *_): return self
    def limit(self, *_): return self
    def eq(self, key, value): self.filters.append(lambda row: row.get(key) == value); return self
    def in_(self, key, values): self.filters.append(lambda row: row.get(key) in values); return self
    def update(self, payload): self.action, self.payload = "update", payload; return self
    def upsert(self, payload, **_): self.action, self.payload = "upsert", payload; return self

    def execute(self):
        if self.action != "select" and self.db.fail == self.name:
            raise RuntimeError("Private database error must never reach UI")
        table = self.db.tables[self.name]
        rows = [row for row in table.values() if all(check(row) for check in self.filters)]
        if self.action == "upsert":
            key = self.payload["admin_id" if self.name == "admin" else "id"]
            table.setdefault(key, {}).update(self.payload)
            rows = [table[key]]
        elif self.action == "update":
            for row in rows: row.update(self.payload)
        return SimpleNamespace(data=[dict(row) for row in rows])


class FakeSupabase:
    def __init__(self):
        self.tables = {"admin": {}, "profiles": {}, "personnel_import_records": {}}
        self.users, self.creates, self.emails, self.audits = {}, 0, 0, 0
        self.fail = None
        self.auth = SimpleNamespace(admin=SimpleNamespace(create_user=self.create_user, update_user_by_id=lambda *_: None))

    def table(self, name): return Query(self, name)

    def create_user(self, data):
        if self.fail == "auth": raise RuntimeError("Auth failed")
        self.creates += 1
        user_id = str(uuid4())
        self.users[data["email"]] = {"id": user_id, "app": data["app_metadata"], "confirmed": False}
        self.tables["profiles"][user_id] = {"id": user_id, "email": data["email"]}
        if self.fail == "auth_timeout": raise TimeoutError("Auth committed before connection failed")
        return SimpleNamespace(user=SimpleNamespace(id=user_id))

    def invite(self, email, *_):
        self.emails += 1
        if self.fail == "email": raise RuntimeError("SMTP error with internal diagnostics")
        return {"id": self.users[email]["id"]}

    def lookup(self, email):
        auth = self.users.get(email)
        ledger = next((r for r in self.tables["personnel_import_records"].values() if r["email"] == email), {})
        return {"auth_user_id": auth["id"] if auth else None,
                "import_row_id": auth["app"].get("personnel_import_row_id") if auth else None,
                "import_role": auth["app"].get("personnel_import_role") if auth else None,
                "email_confirmed": auth["confirmed"] if auth else False,
                "admin_id": next((id for id, r in self.tables["admin"].items() if r.get("email") == email), None),
                "profile_id": next((id for id, r in self.tables["profiles"].items() if r.get("email") == email), None),
                "reserved_row_id": ledger.get("row_id"), "reserved_actor_id": ledger.get("actor_id")}

    def rpc(self, name, args):
        def execute():
            if name == "personnel_import_email_lookup": value = self.lookup(args["p_email"])
            elif name == "personnel_import_email_lookup_batch": value = {email: self.lookup(email) for email in args["p_emails"]}
            elif name == "claim_personnel_import":
                records = self.tables["personnel_import_records"]
                row = records.setdefault(args["p_row_id"], {"row_id": args["p_row_id"], "actor_id": args["p_actor_id"], "email": args["p_email"], "state": "failed", "auth_user_id": None})
                if row["state"] == "processing": value = {"claim": "processing"}
                elif row["state"] == "created": value = {"claim": "created", "auth_user_id": row["auth_user_id"]}
                else:
                    row.update({"state": "processing", "lease_token": args["p_token"], "email": args["p_email"]})
                    value = {"claim": "claimed", "auth_user_id": row["auth_user_id"]}
            elif name == "finish_personnel_import":
                row = self.tables["personnel_import_records"][args["p_row_id"]]
                value = row["state"] == "processing" and row["lease_token"] == args["p_token"]
                if value:
                    row.update({"state": args["p_state"], "stage": args["p_stage"], "auth_user_id": args["p_auth_id"] or row["auth_user_id"]})
                    if args["p_state"] == "created": self.audits += 1
            else: raise AssertionError(name)
            return SimpleNamespace(data=value)
        return SimpleNamespace(execute=execute)


class PersonnelImportTests(unittest.TestCase):
    def setUp(self):
        self.db = FakeSupabase()
        self.patches = [patch.object(imports, "supabase", self.db),
                        patch.object(imports, "_invite_user_by_email", self.db.invite),
                        patch.object(imports.logger, "exception")]
        for item in self.patches: item.start()
        self.addCleanup(lambda: [item.stop() for item in reversed(self.patches)])
        self.record = imports.ImportRecord(row_id=uuid4(), first_name=" Maria ", last_name="Reyes",
            email=" MARIA@GMAIL.COM ", role="personnel", rank="fo1", contact_number="09123456789")

    def process(self): return imports.process_record(self.record, ACTOR)

    def test_validation_is_read_only_and_normalizes_supported_values(self):
        rows = imports.validate_records([self.record], ACTOR)
        self.assertEqual(rows[0]["status"], "Valid")
        self.assertEqual(self.db.creates + self.db.emails, 0)
        self.assertFalse(self.db.tables["personnel_import_records"])
        self.assertEqual(imports.normalize(self.record)["email"], "maria@gmail.com")

    def test_duplicates_block_all_rows_and_invalid_values_cannot_create(self):
        other = self.record.model_copy(update={"row_id": uuid4()})
        self.assertEqual([r["status"] for r in imports.validate_records([self.record, other], ACTOR)], ["Duplicate", "Duplicate"])
        for patch_data in [{"role": "intel unit"}, {"email": "maria@example.com"}, {"rank": "BAD"},
                           {"rank": "OTHER:"}, {"first_name": "Maria1"}, {"contact_number": "+639123456789"}]:
            self.record = other.model_copy(update=patch_data)
            self.assertEqual(self.process()["status"], "skipped")
        self.assertEqual(self.db.creates, 0)

    def test_auth_only_and_orphan_profile_accounts_block_fresh_import(self):
        self.db.users["maria@gmail.com"] = {"id": str(uuid4()), "app": {}, "confirmed": False}
        self.assertEqual(imports.validate_records([self.record], ACTOR)[0]["status"], "Already Exists")
        self.assertEqual(self.process()["reason"], "Email already exists.")
        self.db.users.clear()
        self.db.tables["profiles"]["orphan"] = {"id": "orphan", "email": "maria@gmail.com"}
        self.assertEqual(self.process()["status"], "skipped")
        self.assertEqual(self.db.creates, 0)

    def test_success_replay_never_recreates_user_resends_email_or_duplicates_audit(self):
        self.assertEqual(self.process()["status"], "created")
        self.assertEqual(self.process()["status"], "created")
        self.assertEqual((self.db.creates, self.db.emails, self.db.audits), (1, 1, 1))
        account = next(iter(self.db.tables["admin"].values()))
        self.assertEqual(account["status"], "Pending Activation")
        self.assertEqual(account["rank"], "FO1")
        self.assertEqual(account["permissions"], ["create_reports"])

    def test_profile_failure_retries_owned_auth_without_recreating(self):
        self.db.fail = "admin"
        failed = self.process()
        self.assertEqual((failed["status"], failed["stage"], failed["auth_created"]), ("failed", "profile", True))
        self.assertNotIn("Private database", failed["reason"])
        self.db.fail = None
        self.assertEqual(imports.validate_records([self.record], ACTOR)[0]["status"], "Valid")
        self.assertEqual(self.process()["status"], "created")
        self.assertEqual(self.db.creates, 1)

    def test_email_failure_retries_email_and_keeps_profile_permissions(self):
        self.db.fail = "email"
        self.assertEqual(self.process()["stage"], "email")
        account = next(iter(self.db.tables["admin"].values()))
        account["permissions"] = ["custom-existing-permission"]
        self.db.fail = None
        self.assertEqual(self.process()["status"], "created")
        self.assertEqual(account["permissions"], ["custom-existing-permission"])
        self.assertEqual((self.db.creates, self.db.emails), (1, 2))

    def test_auth_timeout_after_commit_recovers_signed_app_marker(self):
        self.db.fail = "auth_timeout"
        self.assertTrue(self.process()["auth_created"])
        self.db.fail = None
        self.assertEqual(self.process()["status"], "created")
        self.assertEqual(self.db.creates, 1)

    def test_retry_cannot_change_owned_email_or_role_or_hijack_another_actor(self):
        self.db.fail = "admin"
        self.process()
        self.db.fail = None
        original = self.record
        for changed in [{"email": "other@gmail.com"}, {"role": "admin"}]:
            self.record = original.model_copy(update=changed)
            self.assertEqual(self.process()["status"], "skipped")
        self.record = original
        self.assertEqual(imports.process_record(self.record, str(uuid4()))["status"], "skipped")
        self.assertEqual(self.db.creates, 1)

    def test_custom_rank_and_admin_permissions_follow_existing_backend(self):
        self.record = self.record.model_copy(update={"role": "admin", "rank": "OTHER: Duty Officer"})
        self.assertEqual(self.process()["status"], "created")
        account = next(iter(self.db.tables["admin"].values()))
        self.assertEqual(account["rank"], "Duty Officer")
        self.assertEqual(account["permissions"], imports.ADMIN_PERMISSIONS)

    def test_endpoints_require_admin_before_validation_or_creation(self):
        app = FastAPI()
        app.include_router(imports.router)
        client = TestClient(app)
        for path in ("validate", "create"):
            response = client.post(f"/api/admin/personnel-import/{path}", json={"records": [self.record.model_dump(mode="json")]})
            self.assertEqual(response.status_code, 401)
        self.assertEqual(self.db.creates, 0)

    def test_require_admin_checks_authentication_role_and_status(self):
        def client_for(role, status):
            query = SimpleNamespace(select=lambda *_: query, eq=lambda *_: query, limit=lambda *_: query,
                                    execute=lambda: SimpleNamespace(data=[{"admin_id": ACTOR, "role": role, "status": status}]))
            return SimpleNamespace(auth=SimpleNamespace(get_user=lambda *_: SimpleNamespace(user=SimpleNamespace(id=ACTOR))), table=lambda *_: query)
        for role, status in [("personnel", "Active"), ("admin", "Suspended"), ("admin", "Pending Activation")]:
            with patch.object(dependencies, "supabase", client_for(role, status)):
                with self.assertRaises(HTTPException) as error: dependencies.require_admin("Bearer offline")
                self.assertEqual(error.exception.status_code, 403)
        with patch.object(dependencies, "supabase", client_for("admin", "Active")):
            self.assertEqual(dependencies.require_admin("Bearer offline")["admin_id"], ACTOR)


if __name__ == "__main__": unittest.main()

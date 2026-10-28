"""Permission matrix (plan B1): every guarded route x every role -> 401 / 403 / allowed."""
import pytest

import auth
import server
from conftest import ROLE_TARGETS

ROLE_KEYS = {"Justice": "HON_JUSTICE", "Clerk": "LAW_CLERK", "Student": "STUDENT",
             "Auditor": "AUDITOR", "Admin": "ADMINISTRATOR"}

TXT = ("note.txt", b"Petitioner v. State. Facts: the accused was arrested under Section 420 IPC.", "text/plain")

# (method, path, any-of permissions, kwargs factory)
ROUTES = [
    ("POST", "/api/draft_judgment", ["DRAFT_FULL"], lambda: {"json": {
        "case_title": "A v. B", "case_number": "X/1", "court": "HC", "facts": "f", "petitioner_arguments": "p",
        "respondent_arguments": "r", "issues": "i", "statutory_provisions": "s"}}),
    ("POST", "/api/draft/generate", ["DRAFT_FULL"], lambda: {"json": {
        "case_title": "A v. B", "case_number": "X/1", "court": "HC", "facts": "f", "petitioner_arguments": "p",
        "respondent_arguments": "r", "issues": "i", "statutory_provisions": "s"}}),
    ("POST", "/api/save_draft", ["DRAFT_FULL"], lambda: {"json": {
        "case_title": "Perm v. Matrix", "case_number": "PERM/1", "court": "HC", "facts": "f", "issues": "i",
        "petitioner_arguments": "p", "respondent_arguments": "r", "statutory_provisions": "s",
        "draft_content_json": {}}}),
    ("POST", "/api/draft/update_status", ["DRAFT_FULL"], lambda: {"json": {"draft_id": 6, "status": "DRAFT"}}),
    ("POST", "/api/ocr/process_brief", ["UPLOAD_PLEADING"], lambda: {"files": {"file": TXT}}),
    ("POST", "/api/upload_pleading", ["UPLOAD_PLEADING"], lambda: {"files": {"file": TXT}}),
    ("GET", "/api/draft/export/docx/6", ["EXPORT_DRAFT", "EXPORT_GAZETTE", "DRAFT_FULL"], lambda: {}),
    ("GET", "/api/draft/export/print/6", ["EXPORT_DRAFT", "EXPORT_GAZETTE", "DRAFT_FULL"], lambda: {}),
    ("GET", "/api/admin/users", ["MANAGE_USERS"], lambda: {}),
    ("POST", "/api/admin/toggle_user", ["MANAGE_USERS"], lambda: {"json": {"email": "nobody@example.com"}}),
    ("GET", "/api/export/audit_csv", ["VIEW_AUDIT", "EXPORT_AUDIT_LOGS"], lambda: {}),
    ("GET", "/api/audit_logs", ["VIEW_AUDIT", "EXPORT_AUDIT_LOGS"], lambda: {}),
    ("GET", "/api/audit/ledger/verify", ["VIEW_AUDIT", "VERIFY_LEDGER"], lambda: {}),
    ("GET", "/api/audit/ledger/blocks", ["VIEW_AUDIT", "VERIFY_LEDGER"], lambda: {}),
    ("POST", "/api/sync/trigger", ["MANAGE_CORPUS"], lambda: {}),
    # v3 security changes: "any signed-in role" is expressed as SEARCH or VIEW_AUDIT (every role has one of them)
    ("GET", "/api/dashboard_metrics", ["SEARCH", "VIEW_AUDIT"], lambda: {}),
    ("GET", "/api/cases/recent", ["SEARCH", "VIEW_AUDIT"], lambda: {}),
    ("POST", "/api/verify_citations", ["VERIFY_CITATION", "SEARCH"], lambda: {"json": {"text": "AIR 1973 SC 1461"}}),
    ("GET", "/api/sync/status", ["MANAGE_CORPUS", "VIEW_AUDIT"], lambda: {}),
    ("GET", "/api/sync/history", ["MANAGE_CORPUS", "VIEW_AUDIT"], lambda: {}),
    ("POST", "/api/ocr/anonymize", ["UPLOAD_PLEADING"], lambda: {"json": {"text": "Call 9876543210"}}),
    ("GET", "/api/judgment/1", ["SEARCH"], lambda: {}),
    ("POST", "/api/search", ["SEARCH"], lambda: {"json": {"query": "bail"}}),
]


@pytest.fixture(autouse=True)
def _no_network_sync(monkeypatch):
    monkeypatch.setattr(server, "run_incremental_sync", lambda batch_size=12: {"success": True, "stubbed": True})
    monkeypatch.setenv("GYANAM_ALLOW_LEGACY_HEADER", "0")


def _perms(role_label):
    return set(auth.ROLES_PERMISSIONS[ROLE_KEYS[role_label]]["permissions"])


def test_role_labels_match_sso_targets():
    assert set(ROLE_KEYS) == set(ROLE_TARGETS)


@pytest.mark.parametrize("method,path,perms,kw", ROUTES, ids=[f"{m} {p}" for m, p, _, _ in ROUTES])
def test_unauthenticated_is_401(client, method, path, perms, kw):
    r = client.request(method, path, **kw())
    assert r.status_code == 401, r.text
    assert r.json().get("code") == "AUTH_REQUIRED"


@pytest.mark.parametrize("method,path,perms,kw", ROUTES, ids=[f"{m} {p}" for m, p, _, _ in ROUTES])
@pytest.mark.parametrize("role", list(ROLE_KEYS))
def test_role_matrix(client, hdr, role, method, path, perms, kw):
    allowed = bool(_perms(role) & set(perms))
    r = client.request(method, path, headers=hdr[role], **kw())
    if allowed:
        assert r.status_code not in (401, 403), f"{role} should reach {path}: {r.status_code} {r.text[:200]}"
    else:
        assert r.status_code == 403, f"{role} must be forbidden on {path}: {r.status_code}"
        assert r.json().get("code") == "FORBIDDEN_PERMISSION"


def test_invalid_token_is_401(client):
    r = client.get("/api/admin/users", headers={"Authorization": "Bearer not-a-token"})
    assert r.status_code == 401
    assert r.json()["code"] == "AUTH_INVALID_TOKEN"


@pytest.mark.parametrize("path", ["/api/drafts", "/api/draft/1", "/api/auth/me", "/api/judgment/1"])
def test_identity_routes_need_a_token(client, path):
    assert client.get(path).status_code == 401


def test_finalize_required_for_approval(client, hdr):
    """Clerk may draft but cannot approve or seal; Justice can walk the whole chain."""
    p = {"case_title": "Fin v. Alize", "case_number": "FIN/1/2025", "court": "HC", "facts": "f", "issues": "i",
         "petitioner_arguments": "p", "respondent_arguments": "r", "statutory_provisions": "s", "draft_content_json": {}}
    did = client.post("/api/save_draft", json=p, headers=hdr["Clerk"]).json()["draft_id"]
    assert client.post("/api/draft/update_status", json={"draft_id": did, "status": "IN_REVIEW"}, headers=hdr["Clerk"]).status_code == 200
    r = client.post("/api/draft/update_status", json={"draft_id": did, "status": "BENCH_APPROVED"}, headers=hdr["Clerk"])
    assert r.status_code == 403 and r.json()["code"] == "FORBIDDEN_PERMISSION"
    assert client.post("/api/draft/update_status", json={"draft_id": did, "status": "BENCH_APPROVED"}, headers=hdr["Justice"]).status_code == 200


# ---------------- legacy header (task 3) ----------------
def test_legacy_header_off_by_default(client, monkeypatch):
    monkeypatch.delenv("GYANAM_ALLOW_LEGACY_HEADER", raising=False)
    assert client.get("/api/drafts", headers={"X-Gyanam-Legacy": "1"}).status_code == 401


def test_legacy_header_honoured_when_allowed(client, monkeypatch):
    monkeypatch.setenv("GYANAM_ALLOW_LEGACY_HEADER", "1")
    r = client.get("/api/drafts", headers={"X-Gyanam-Legacy": "1"})
    assert r.status_code == 200


def test_legacy_header_ignored_when_disabled(client, monkeypatch):
    monkeypatch.setenv("GYANAM_ALLOW_LEGACY_HEADER", "0")
    r = client.get("/api/drafts", headers={"X-Gyanam-Legacy": "1"})
    assert r.status_code == 401
    r = client.get("/api/admin/users", headers={"X-Gyanam-Legacy": "1"})
    assert r.status_code == 401


def test_enforce_auth_off_is_open(client, monkeypatch):
    monkeypatch.setenv("GYANAM_ENFORCE_AUTH", "0")
    assert client.get("/api/drafts").status_code == 200

"""v3 security changes (B3): legacy header, suspension, print-export escaping, CSV export, minimal public endpoints,
role-scoped dashboard, honest sync."""
import csv
import io
import json

import pytest

import database
import server


def _insert_audit(rows):
    conn = database.get_connection()
    conn.executemany(
        "INSERT INTO audit_logs (timestamp, user_name, user_role, action, details, ip_address) VALUES (?,?,?,?,?,?)", rows)
    conn.commit()
    conn.close()


def _csv_rows(resp):
    return list(csv.reader(io.StringIO(resp.content.decode("utf-8-sig"))))


# ---------------- legacy header ----------------
def test_legacy_header_off_by_default(client, monkeypatch):
    monkeypatch.delenv("GYANAM_ALLOW_LEGACY_HEADER", raising=False)
    for path in ("/api/drafts", "/api/admin/users", "/api/dashboard_metrics"):
        r = client.get(path, headers={"X-Gyanam-Legacy": "1"})
        assert r.status_code == 401 and r.json()["code"] == "AUTH_REQUIRED", path


def test_legacy_header_works_only_when_enabled(client, monkeypatch):
    monkeypatch.setenv("GYANAM_ALLOW_LEGACY_HEADER", "1")
    assert client.get("/api/drafts", headers={"X-Gyanam-Legacy": "1"}).status_code == 200


# ---------------- suspension ----------------
def test_suspension_enforced_and_persisted(client, hdr):
    admin, clerk = hdr["Admin"], hdr["Clerk"]
    assert client.get("/api/auth/me", headers=clerk).status_code == 200
    try:
        r = client.post("/api/admin/toggle_user", json={"email": "lawclerk.bench4@nlujodhpur.ac.in"}, headers=admin)
        assert r.status_code == 200 and r.json()["status"] == "SUSPENDED"
        # persisted in the table (a fresh connection sees it, i.e. it is not in-memory state)
        conn = database.get_connection()
        row = conn.execute("SELECT active, changed_by FROM user_status WHERE user_id = 'usr_nluj_002'").fetchone()
        conn.close()
        assert row is not None and row[0] == 0 and row[1]
        # existing token is now rejected on every guarded route
        for path in ("/api/auth/me", "/api/drafts", "/api/dashboard_metrics"):
            r = client.get(path, headers=clerk)
            assert r.status_code == 403 and r.json()["code"] == "ACCOUNT_SUSPENDED", path
        # admin list reads the table
        users = client.get("/api/admin/users", headers=admin).json()["users"]
        assert {u["email"]: u["status"] for u in users}["lawclerk.bench4@nlujodhpur.ac.in"] == "SUSPENDED"
        # others are unaffected
        assert client.get("/api/auth/me", headers=hdr["Student"]).status_code == 200
    finally:
        r = client.post("/api/admin/toggle_user", json={"email": "lawclerk.bench4@nlujodhpur.ac.in"}, headers=admin)
        assert r.status_code == 200
    assert r.json()["status"] == "ACTIVE"
    assert client.get("/api/auth/me", headers=clerk).status_code == 200
    users = client.get("/api/admin/users", headers=admin).json()["users"]
    assert {u["email"]: u["status"] for u in users}["lawclerk.bench4@nlujodhpur.ac.in"] == "ACTIVE"


def test_admin_cannot_suspend_self(client, hdr):
    r = client.post("/api/admin/toggle_user", json={"email": "registrar@nlujodhpur.ac.in"}, headers=hdr["Admin"])
    assert r.status_code == 409 and r.json()["code"] == "CANNOT_SUSPEND_SELF"


# ---------------- print export escaping ----------------
def test_print_export_escapes_everything(client, hdr):
    evil = "<script>alert(1)</script>"
    payload = {
        "case_title": f'{evil} v. <img src=x onerror=alert(2)>', "case_number": '"><svg onload=alert(3)>',
        "court": "<b>High Court</b>", "facts": "f", "issues": "i", "petitioner_arguments": "p",
        "respondent_arguments": "r", "statutory_provisions": "s",
        "draft_content_json": {"sections": [{"number": 1, "title": "<i>Title</i>", "content": f"para {evil}\n\n<iframe src=x>"}]},
    }
    did = client.post("/api/save_draft", json=payload, headers=hdr["Justice"]).json()["draft_id"]
    r = client.get(f"/api/draft/export/print/{did}", headers=hdr["Justice"])
    assert r.status_code == 200
    html = r.text
    for bad in ("<script>alert", "<img src=x", "<svg onload", "<iframe", "<b>High Court", "<i>Title"):
        assert bad not in html, bad
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert "&lt;iframe" in html


# ---------------- audit export ----------------
def test_audit_csv_uncapped_filtered_and_guarded(client, hdr):
    rows = [(f"2031-01-{(i % 28) + 1:02d} 10:00:00", "CSV Bulk", "ZZ_BULK", "ZZ_BULK_ACTION", f"bulk row {i}", "127.0.0.1")
            for i in range(650)]
    rows.append(("2031-02-01 10:00:00", "CSV Bulk", "ZZ_BULK", "ZZ_INJECT", "=HYPERLINK(\"http://x\",\"y\")", "127.0.0.1"))
    rows.append(("2031-02-02 10:00:00", "+cmd", "ZZ_BULK", "ZZ_INJECT", "@SUM(1)", "127.0.0.1"))
    rows.append(("2031-02-03 10:00:00", "CSV Bulk", "ZZ_BULK", "ZZ_INJECT", "-2+3", "127.0.0.1"))
    _insert_audit(rows)
    h = hdr["Auditor"]

    r = client.get("/api/export/audit_csv", params={"action": "ZZ_BULK_ACTION"}, headers=h)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    data = _csv_rows(r)
    assert data[0] == ["Log_ID", "Timestamp", "User_Name", "User_Role", "Action", "Details", "IP_Address"]
    assert len(data) - 1 == 650  # no 500-row cap

    inj = _csv_rows(client.get("/api/export/audit_csv", params={"action": "ZZ_INJECT"}, headers=h))[1:]
    assert len(inj) == 3
    for row in inj:
        assert not row[5].startswith(("=", "+", "-", "@")), row
        assert row[5].startswith("'")
    assert any(row[2] == "'+cmd" for row in inj)

    # filters: role + until + since
    only_jan = _csv_rows(client.get("/api/export/audit_csv", params={"role": "zz_bulk", "until": "2031-01-31"}, headers=h))
    assert len(only_jan) - 1 == 650
    feb = _csv_rows(client.get("/api/export/audit_csv", params={"role": "ZZ_BULK", "since": "2031-02-01"}, headers=h))
    assert len(feb) - 1 == 3

    # BOM only on request
    assert client.get("/api/export/audit_csv", params={"action": "ZZ_INJECT"}, headers=h).content[:3] != b"\xef\xbb\xbf"
    assert client.get("/api/export/audit_csv", params={"action": "ZZ_INJECT", "bom": 1}, headers=h).content[:3] == b"\xef\xbb\xbf"
    assert client.get("/api/export/audit_csv", params={"since": "bad"}, headers=h).status_code == 422


def test_audit_logs_total_offset_until_role(client, hdr):
    _insert_audit([(f"2032-03-{i + 1:02d} 09:00:00", "Pager", "ZZ_PAGE", "ZZ_PAGE_ACTION", f"page {i}", "127.0.0.1") for i in range(12)])
    h = hdr["Auditor"]
    p1 = client.get("/api/audit_logs", params={"role": "zz_page", "limit": 5}, headers=h).json()
    p2 = client.get("/api/audit_logs", params={"role": "ZZ_PAGE", "limit": 5, "offset": 5}, headers=h).json()
    assert p1["total"] == 12 and p1["offset"] == 0 and len(p1["logs"]) == 5
    assert p2["offset"] == 5 and len(p2["logs"]) == 5
    assert not {r["id"] for r in p1["logs"]} & {r["id"] for r in p2["logs"]}
    upto = client.get("/api/audit_logs", params={"role": "ZZ_PAGE", "until": "2032-03-04"}, headers=h).json()
    assert upto["total"] == 4 and all(r["timestamp"][:10] <= "2032-03-04" for r in upto["logs"])
    assert client.get("/api/audit_logs", params={"until": "nope"}, headers=h).status_code == 422
    assert client.get("/api/audit_logs", params={"offset": -1}, headers=h).status_code == 422


def test_ledger_blocks_limit_capped(client, hdr):
    r = client.get("/api/audit/ledger/blocks", params={"limit": 100000}, headers=hdr["Auditor"])
    assert r.status_code == 200 and len(r.json()) <= 500


# ---------------- minimal public endpoints ----------------
def test_status_tokenless_is_minimal(client, hdr):
    d = client.get("/api/status").json()
    assert set(d) == {"status", "version", "time"} and d["status"] == "ONLINE"
    assert set(client.get("/api/status", headers={"Authorization": "Bearer junk"}).json()) == {"status", "version", "time"}
    full = client.get("/api/status", headers=hdr["Student"]).json()
    assert {"total_judgments_indexed", "court_distribution", "status_distribution", "sync_telemetry"} <= set(full)


def test_roles_endpoint_has_no_emails_or_badges(client):
    r = client.get("/api/auth/roles")
    assert r.status_code == 200
    body = r.json()
    text = json.dumps(body)
    assert "@" not in text and "badge" not in text and "permissions" not in text
    assert body["directory"] and {"role", "full_name", "designation", "institution", "scope_role"} == set(body["directory"][0])
    assert all("title" in v for v in body["roles"].values())


# ---------------- role-scoped dashboard ----------------
def test_dashboard_metrics_role_scoping(client, hdr):
    corpus = {"total_judgments", "supreme_court_count", "high_court_count", "top_courts", "status_counts"}
    d = client.get("/api/dashboard_metrics", headers=hdr["Student"]).json()
    assert corpus <= set(d)
    assert not {"searches_performed", "drafts_created", "recent_activity", "active_users", "system_health", "sync_status"} & set(d)
    assert d["total_judgments"] == 300

    c = client.get("/api/dashboard_metrics", headers=hdr["Clerk"]).json()
    assert {"searches_performed", "drafts_created"} <= set(c) and "recent_activity" not in c

    for role in ("Auditor", "Justice", "Admin"):
        a = client.get("/api/dashboard_metrics", headers=hdr[role]).json()
        assert {"searches_performed", "drafts_created", "recent_activity", "system_health"} <= set(a), role
        assert a["recent_activity"] and set(a["recent_activity"][0]) >= {"timestamp", "action"}


def test_recent_cases_limit_capped(client, hdr):
    d = client.get("/api/cases/recent", params={"limit": 500}, headers=hdr["Student"]).json()
    assert d["count"] == len(d["recent_cases"]) == 50
    assert client.get("/api/cases/recent", params={"limit": 0}, headers=hdr["Student"]).json()["count"] == 1


# ---------------- audited reads ----------------
def test_anonymize_and_verify_are_audited(client, hdr):
    assert client.post("/api/ocr/anonymize", json={"text": "Mobile 9876543210"}, headers=hdr["Clerk"]).status_code == 200
    assert client.post("/api/verify_citations", json={"text": "AIR 1973 SC 1461"}, headers=hdr["Student"]).status_code == 200
    logs = client.get("/api/audit_logs", params={"limit": 200}, headers=hdr["Auditor"]).json()["logs"]
    actions = {r["action"] for r in logs}
    assert {"OCR_ANONYMIZE", "VERIFY_CITATIONS"} <= actions
    assert not any("9876543210" in (r["details"] or "") for r in logs)


# ---------------- sync honesty ----------------
def test_sync_status_is_simulated_without_invented_strings(client, hdr):
    d = client.get("/api/sync/status", headers=hdr["Admin"]).json()
    assert d["mode"] == "simulated" and d["sync_state"]["mode"] == "simulated"
    text = json.dumps(d)
    for bad in ("latency", "TLS", "protocol_version", "AUTHENTICATED_HEALTHY", "SCitation-v"):
        assert bad not in text, bad
    hist = client.get("/api/sync/history", headers=hdr["Auditor"]).json()
    assert isinstance(hist, list) and all(r["mode"] == "simulated" for r in hist)


def test_sync_counters_start_from_logs_not_seeded():
    import court_sync_daemon as d
    conn = database.get_connection()
    conn.execute("DELETE FROM sync_logs")
    conn.commit()
    conn.close()
    d._refresh_state_from_logs()
    assert d.SYNC_STATE["total_synced_today"] == 0 and d.SYNC_STATE["last_sync_timestamp"] is None


def test_failed_ingest_is_logged_failed(monkeypatch):
    import court_sync_daemon as d
    import ingest_authentic_cases

    def boom(*a, **k):
        raise RuntimeError("repository unreachable")
    monkeypatch.setattr(ingest_authentic_cases, "ingest_sci_parquet_year", boom)
    out = d.run_incremental_sync(batch_size=5000)
    assert out["status"] == "FAILED" and out["cases_ingested"] == 0 and "unreachable" in out["error"]
    hist = d.get_sync_history()
    assert hist[0]["status"] == "FAILED" and hist[0]["cases_ingested"] == 0
    assert d.SYNC_STATE["status"] == "FAILED"

    monkeypatch.setattr(ingest_authentic_cases, "ingest_sci_parquet_year", lambda *a, **k: 3)
    ok = d.run_incremental_sync(batch_size=5)
    assert ok["status"] == "SUCCESS" and ok["cases_ingested"] == 3 and d.get_sync_history()[0]["status"] == "SUCCESS"
    assert d.SYNC_STATE["total_synced_today"] >= 3 and d.SYNC_STATE["status"] == "IDLE"

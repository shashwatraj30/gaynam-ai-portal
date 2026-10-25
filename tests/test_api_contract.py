"""Search/curation (B9), docs (B3), uploads (B4), OCR source (B6), audit filters, matters, alerts, graph."""
import pytest

import build_fixture as fx


# ---------------- search + B9 ----------------
SEARCH_KEYS = {"is_curated", "source_pdf_url", "year", "citing_cases_count"}


def _search(client, h, **body):
    r = client.post("/api/search", json={"query": "bail theft", **body}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def test_search_unified_path_rows_have_new_keys(client, hdr):
    data = _search(client, hdr["Student"], limit=15)
    assert data["count"] == len(data["results"]) > 0
    for row in data["results"]:
        assert SEARCH_KEYS <= set(row), row.keys()
        assert {"id", "title", "court", "citation", "precedent_status", "district"} <= set(row)
        assert isinstance(row["year"], int)
        if not row["is_curated"]:
            assert row["citing_cases_count"] is None


def test_search_fts_path_rows_have_new_keys(client, hdr):
    data = _search(client, hdr["Student"], court="Gujarat", limit=10)
    assert data["results"]
    for row in data["results"]:
        assert SEARCH_KEYS <= set(row)
        assert "Gujarat" in row["court"]
        assert row["source_pdf_url"].startswith("https://example.test/")
        assert row["citing_cases_count"] is None  # template headnote -> not curated


def test_curated_judgment_keeps_citing_count(client, hdr, ids):
    r = client.get(f"/api/judgment/{ids[fx.CURATED_CASE_ID]}", headers=hdr["Student"])
    assert r.status_code == 200
    j = r.json()
    assert j["is_curated"] is True and j["citing_cases_count"] == 1420
    rows = _search(client, hdr["Student"], query="Karunakar inquiry report natural justice", court="Supreme", limit=10)["results"]
    cur = [x for x in rows if x["case_id"] == fx.CURATED_CASE_ID]
    assert cur and cur[0]["is_curated"] is True and cur[0]["citing_cases_count"] == 1420


def test_template_judgment_not_curated(client, hdr, ids):
    j = client.get(f"/api/judgment/{ids['FIX-0001']}", headers=hdr["Student"]).json()
    assert j["is_curated"] is False and j["citing_cases_count"] is None
    assert client.get("/api/judgment/99999999", headers=hdr["Student"]).status_code == 404


def test_search_overruled_filter(client, hdr):
    rows = _search(client, hdr["Student"], query="Old Rule", precedent_status="OVERRULED")["results"]
    assert rows and all(r["precedent_status"] == "OVERRULED" for r in rows)
    assert all(SEARCH_KEYS <= set(r) for r in rows)


# ---------------- docs (B3) ----------------
@pytest.mark.parametrize("name", ["../backend/server.py", "..%2Fbackend%2Fserver.py", "%2e%2e%2fCLAUDE.md",
                                  "..\\backend\\server.py", "nope.md", "README.txt", "/etc/passwd"])
def test_docs_traversal_is_404(client, name):
    r = client.get(f"/api/docs/read/{name}")
    assert r.status_code == 404


def test_docs_list_and_read_valid(client):
    docs = client.get("/api/docs/list").json()
    assert docs and {"filename", "title", "path"} <= set(docs[0])
    plain = next(d["filename"] for d in docs if d["filename"] != "COMMERCIAL_PROPOSAL_GYANAM_AI.md")
    r = client.get(f"/api/docs/read/{plain}")
    assert r.status_code == 200 and r.json()["filename"] == plain and r.json()["content"]


def test_commercial_proposal_requires_manage_users(client, hdr):
    url = "/api/docs/read/COMMERCIAL_PROPOSAL_GYANAM_AI.md"
    assert client.get(url).status_code == 401
    for role in ("Justice", "Clerk", "Student", "Auditor"):
        assert client.get(url, headers=hdr[role]).status_code == 403, role
    assert client.get(url, headers=hdr["Admin"]).status_code == 200


def test_commercial_proposal_open_in_legacy_mode(client, monkeypatch):
    monkeypatch.setenv("GYANAM_ENFORCE_AUTH", "0")
    assert client.get("/api/docs/read/COMMERCIAL_PROPOSAL_GYANAM_AI.md").status_code == 200


# ---------------- uploads (B4/B6) ----------------
@pytest.mark.parametrize("name", ["evil.exe", "script.py", "page.html", "noext", "x.pdf.sh"])
def test_upload_allowlist_415(client, hdr, name):
    for path in ("/api/upload_pleading", "/api/ocr/process_brief"):
        r = client.post(path, files={"file": (name, b"data", "application/octet-stream")}, headers=hdr["Clerk"])
        assert r.status_code == 415, (path, name, r.status_code)


def test_upload_saved_under_uuid_name(client, hdr):
    import os
    import server
    r = client.post("/api/upload_pleading", files={"file": ("../../evil name.txt", b"Facts: the accused", "text/plain")},
                    headers=hdr["Clerk"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["filename"] == "evil name.txt"
    stored = body["stored_filename"]
    assert stored.endswith(".txt") and stored != body["filename"] and "evil" not in stored
    assert os.path.isfile(os.path.join(server.UPLOAD_DIR, stored))
    assert "parsed" in body


def test_ocr_response_has_source_field(client, hdr):
    r = client.post("/api/ocr/process_brief", files={"file": ("brief.txt", b"Petitioner v. State. Section 420 IPC.", "text/plain")},
                    headers=hdr["Clerk"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] in {"digital_text", "ocr", "vlm", "canned_sample", "fallback"}
    assert body["original_filename"] == "brief.txt" and body["stored_filename"].endswith(".txt")


def test_ocr_failure_is_labelled_fallback(client, hdr, monkeypatch):
    import server

    def boom(*a, **k):
        raise RuntimeError("ocr down")
    monkeypatch.setattr(server, "process_scanned_brief", boom)
    r = client.post("/api/ocr/process_brief", files={"file": ("scan.png", b"\x89PNG....", "image/png")}, headers=hdr["Clerk"])
    assert r.status_code == 200 and r.json()["source"] == "fallback"


# ---------------- audit filters ----------------
def _audit(client, h, **params):
    r = client.get("/api/audit_logs", params=params, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def test_audit_default_shape_is_list_of_50(client, hdr):
    rows = _audit(client, hdr["Auditor"])
    assert isinstance(rows, list) and 0 < len(rows) <= 50
    assert {"id", "timestamp", "user_name", "user_role", "action", "details", "ip_address"} <= set(rows[0])
    ids_ = [r["id"] for r in rows]
    assert ids_ == sorted(ids_, reverse=True)


def test_audit_filters(client, hdr):
    h = hdr["Auditor"]
    rows = _audit(client, h, action="save_draft")
    assert rows and all(r["action"] == "SAVE_DRAFT" for r in rows)
    rows = _audit(client, h, user="fixture")
    assert rows and all("fixture" in r["user_name"].lower() for r in rows)
    rows = _audit(client, h, q="bail 7")
    assert rows and all("bail 7" in r["details"].lower() for r in rows)
    rows = _audit(client, h, since="2026-06-01", limit=1000)
    assert rows and all(r["timestamp"] >= "2026-06-01" for r in rows)
    assert len(_audit(client, h, action="SEARCH_QUERY", limit=3)) == 3
    both = _audit(client, h, action="SEARCH_QUERY", user="Other")
    assert all(r["action"] == "SEARCH_QUERY" and "other" in r["user_name"].lower() for r in both)


def test_audit_limit_bounds(client, hdr):
    h = hdr["Auditor"]
    assert len(_audit(client, h, limit=5)) == 5
    assert len(_audit(client, h, limit=1000)) <= 1000
    assert client.get("/api/audit_logs", params={"limit": 1001}, headers=h).status_code in (200, 422)
    assert client.get("/api/audit_logs", params={"limit": 0}, headers=h).status_code == 422
    assert client.get("/api/audit_logs", params={"since": "yesterday"}, headers=h).status_code == 422
    assert len(_audit(client, h, limit=1000)) <= 1000


def test_audit_records_real_user(client, hdr):
    client.post("/api/search", json={"query": "audit marker zzq"}, headers=hdr["Student"])
    rows = _audit(client, hdr["Auditor"], q="audit marker zzq")
    assert rows and rows[0]["user_name"] == "Ananya Rathore" and rows[0]["user_role"] == "STUDENT"


# ---------------- matters ----------------
def test_matters_list_shape_and_grouping(client, hdr):
    data = client.get("/api/matters", headers=hdr["Justice"]).json()
    assert data["total"] == len(data["matters"]) >= 5
    m0 = data["matters"][0]
    assert {"matter_key", "case_number", "title", "draft_count", "latest_draft_id", "latest_status",
            "status_counts", "last_updated", "next_action", "is_placeholder"} <= set(m0)
    keys = {m["matter_key"]: m for m in data["matters"]}
    raman = [m for m in data["matters"] if "crl" in m["matter_key"] and m["draft_count"] >= 2]
    assert raman, "the two Raman drafts (one with a '(Airport P.S.)' suffix) must group into one matter"
    assert keys


def test_matter_detail_and_404(client, hdr):
    key = next(m["matter_key"] for m in client.get("/api/matters", headers=hdr["Justice"]).json()["matters"] if m["draft_count"] >= 2)
    d = client.get(f"/api/matters/{key}", headers=hdr["Justice"])
    assert d.status_code == 200
    body = d.json()
    assert body["draft_count"] == len(body["drafts"]) >= 2
    assert {"id", "status", "version", "case_number"} <= set(body["drafts"][0])
    assert isinstance(body["events"], list)
    assert client.get("/api/matters/no-such-matter", headers=hdr["Justice"]).status_code == 404


# ---------------- alerts ----------------
def test_alerts_flag_draft_citing_overruled_case(client, hdr, ids):
    data = client.get("/api/alerts", headers=hdr["Justice"]).json()
    assert data["total"] == len(data["alerts"]) >= 1
    a = next(x for x in data["alerts"] if x["draft_id"] == 5)
    assert a["overruled_case"]["id"] == ids[fx.OVERRULED_A[0]]
    assert a["overruled_by"].endswith(fx.OVERRULER_A[2])
    assert a["severity"] == "critical" and set(a["found_in"]) == {"retrieved_precedents", "verified_citations"}
    assert {"id", "matter_key", "case_number", "case_title", "draft_status"} <= set(a)
    assert all(x["draft_id"] != 1 for x in data["alerts"])


# ---------------- graph ----------------
def test_graph_for_overruled_pair(client, hdr, ids):
    g = client.get(f"/api/judgment/{ids[fx.OVERRULED_A[0]]}/graph", headers=hdr["Student"]).json()
    assert g["is_linked"] is True
    assert {"judgment_id", "nodes", "edges", "message"} <= set(g)
    rel = {(e["relation"]) for e in g["edges"]}
    assert "overruled_by" in rel
    titles = {n["title"] for n in g["nodes"]}
    assert fx.OVERRULER_A[1] in titles
    assert any(n["is_center"] for n in g["nodes"])


def test_graph_for_overruler_shows_both_directions(client, hdr, ids):
    g = client.get(f"/api/judgment/{ids[fx.OVERRULER_B[0]]}/graph", headers=hdr["Student"]).json()
    assert g["is_linked"] and any(e["relation"] == "overruled_by" for e in g["edges"])


def test_graph_curated_with_external_node(client, hdr, ids):
    g = client.get(f"/api/judgment/{ids[fx.CURATED_CASE_ID]}/graph", headers=hdr["Student"]).json()
    assert g["is_linked"]
    assert any(not n["in_corpus"] for n in g["nodes"]) and any(n["in_corpus"] and not n["is_center"] for n in g["nodes"])


def test_graph_unlinked_and_missing(client, hdr, ids):
    g = client.get(f"/api/judgment/{ids['FIX-0002']}/graph", headers=hdr["Student"]).json()
    assert g["is_linked"] is False and g["edges"] == [] and g["message"]
    assert client.get("/api/judgment/99999999/graph", headers=hdr["Student"]).status_code == 404


# ---------------- UI read endpoints are guarded (found by the e2e suite) ----------------
@pytest.mark.parametrize("path", ["/api/matters", "/api/matters/x", "/api/alerts", "/api/judgment/1/graph", "/api/drafts", "/api/draft/1"])
def test_ui_reads_require_auth(client, path):
    assert client.get(path).status_code == 401


@pytest.mark.parametrize("path", ["/api/matters", "/api/alerts", "/api/drafts", "/api/draft/1", "/api/drafts/1/versions"])
def test_drafting_reads_forbidden_for_student_and_auditor(client, hdr, path):
    for role in ("Student", "Auditor"):
        assert client.get(path, headers=hdr[role]).status_code == 403, (role, path)


# ---------------- misc ----------------
def test_status_endpoint_and_fixture_size(client):
    d = client.get("/api/status").json()
    assert d["status"] == "ONLINE" and d["total_judgments_indexed"] == 300


def test_fixture_has_two_overruled_pairs(client):
    d = client.get("/api/status").json()
    assert {s["precedent_status"]: s["c"] for s in d["status_distribution"]}["OVERRULED"] == 2


def test_docs_list_hides_commercial_proposal_from_non_admins(client, hdr):
    name = "COMMERCIAL_PROPOSAL_GYANAM_AI.md"
    names = lambda r: {d["filename"] for d in r.json()}
    assert name not in names(client.get("/api/docs/list"))
    for role in ("Justice", "Clerk", "Student", "Auditor"):
        assert name not in names(client.get("/api/docs/list", headers=hdr[role])), role
    assert name in names(client.get("/api/docs/list", headers=hdr["Admin"]))


def test_app_static_files_revalidate(client):
    r = client.get("/app/js/main.js")
    assert r.status_code == 200
    assert r.headers.get("cache-control") == "no-cache"

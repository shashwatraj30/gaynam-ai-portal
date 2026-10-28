"""Documents API (docs/API_V3_CONTRACT.md): lifecycle, permissions, audit, honest failures."""
import pytest

import database

TEXT = """IN THE HIGH COURT OF JUDICATURE FOR RAJASTHAN AT JODHPUR
S.B. CIVIL WRIT PETITION NO. 777 OF 2024

Ram Kumar
... PETITIONER
VERSUS
State of Rajasthan
... RESPONDENT

FACTS:
1. The petitioner was dismissed without the inquiry report. Mobile 9829012345.
2. Reliance is placed on Managing Director, ECIL v. B. Karunakar, (1993) 4 SCC 727 and (2099) 99 SCC 9999.

Whether the dismissal without supplying the inquiry report violates natural justice?

PRAYER:
Quash the order under Article 311(2) of the Constitution of India.
"""


def _audit_rows(action, doc_id):
    conn = database.get_connection()
    try:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM audit_logs WHERE action = ? AND details LIKE ?", (action, f"document {doc_id}%")).fetchall()]
    finally:
        conn.close()


@pytest.fixture(scope="module")
def doc(client, hdr):
    r = client.post("/api/documents", data={"doc_type": "PETITION", "matter_key": "wp-777-2024", "title": "Ram Kumar WP"},
                    files={"file": ("ram kumar.txt", TEXT.encode(), "text/plain")}, headers=hdr["Clerk"])
    assert r.status_code == 201, r.text
    return r.json()


# ---------------- permissions ----------------
@pytest.mark.parametrize("method,path", [
    ("GET", "/api/documents"), ("POST", "/api/documents"), ("GET", "/api/documents/x"),
    ("GET", "/api/documents/x/text"), ("GET", "/api/documents/x/file"), ("PATCH", "/api/documents/x"),
    ("PUT", "/api/documents/x/extraction"), ("POST", "/api/documents/x/confirm"),
    ("POST", "/api/documents/x/archive"), ("POST", "/api/documents/x/research"), ("GET", "/api/documents/x/pins"),
    ("POST", "/api/documents/x/pins"), ("DELETE", "/api/documents/x/pins/1"), ("POST", "/api/documents/x/draft-params")])
def test_no_token_401_and_student_auditor_403(client, hdr, method, path):
    kw = {"json": {}} if method in ("PATCH", "PUT", "POST") and path != "/api/documents" else {}
    if path == "/api/documents" and method == "POST":
        kw = {"data": {"text": "hello world"}}
    assert client.request(method, path, **kw).status_code == 401
    for role in ("Student", "Auditor"):
        r = client.request(method, path, headers=hdr[role], **kw)
        assert r.status_code == 403, (role, path, r.status_code)
        assert r.json().get("code") == "FORBIDDEN_PERMISSION"


# ---------------- upload ----------------
def test_upload_file_shape_and_redaction(client, hdr, doc):
    assert doc["status"] == "READ" and doc["source"] == "digital" and doc["doc_type"] == "PETITION"
    assert doc["original_name"] == "ram kumar.txt" and doc["matter_key"] == "wp-777-2024"
    assert len(doc["sha256"]) == 64 and doc["size"] == len(TEXT.encode())
    assert doc["redactions"] == [{"type": "PHONE", "count": 1}] and doc["redaction_total"] == 1
    ex = doc["extraction"]
    assert ex["version"] == 1 and ex["confirmed"] is False
    f = ex["fields"]
    assert f["petitioner"] == "Ram Kumar" and f["respondent"] == "State of Rajasthan"
    assert f["case_title"] == "Ram Kumar v. State of Rajasthan" and "777" in f["case_number"]
    assert "RAJASTHAN" in f["court"].upper() and f["prayer"].startswith("Quash")
    assert ex["issues"] and ex["issues"][0].startswith("Whether the dismissal")
    assert f["petitioner_arguments"] == "" and f["respondent_arguments"] == ""
    auth = {a["citation"]: a for a in ex["authorities"]}
    assert auth["(1993) 4 SCC 727"]["matched_id"] and auth["(1993) 4 SCC 727"]["status"] == "VERIFIED_ACTIVE"
    bad = auth["(2099) 99 SCC 9999"]
    assert bad["status"] == "HALLUCINATED_OR_UNVERIFIED" and bad["matched_id"] is None
    assert _audit_rows("DOCUMENT_UPLOADED", doc["id"])


def test_full_text_stored_redacted(client, hdr, doc):
    t = client.get(f"/api/documents/{doc['id']}/text", headers=hdr["Clerk"]).json()
    assert t["offset"] == 0 and t["total_chars"] == doc["chars"] > 0
    assert "9829012345" not in t["text"] and "[REDACTED_PHONE_XXXX]" in t["text"]
    page = client.get(f"/api/documents/{doc['id']}/text", params={"offset": 10, "limit": 20}, headers=hdr["Clerk"]).json()
    assert page["text"] == t["text"][10:30] and page["offset"] == 10
    assert client.get(f"/api/documents/{doc['id']}/text", params={"limit": 200001}, headers=hdr["Clerk"]).status_code == 422


def test_long_text_not_truncated(client, hdr):
    body = "FACTS:\n" + "\n".join(f"{i}. Paragraph number {i} of a long pleading." for i in range(1, 400))
    d = client.post("/api/documents", data={"text": body}, headers=hdr["Clerk"]).json()
    assert d["source"] == "pasted" and d["chars"] > 10000


def test_pasted_text_has_no_file(client, hdr):
    d = client.post("/api/documents", data={"text": "FACTS:\nSomething happened.", "title": "Note"}, headers=hdr["Clerk"]).json()
    assert d["source"] == "pasted" and d["original_name"] is None and d["title"] == "Note" and d["doc_type"] == "OTHER"
    assert client.get(f"/api/documents/{d['id']}/file", headers=hdr["Clerk"]).status_code == 404


def test_file_download_original_bytes(client, hdr, doc):
    r = client.get(f"/api/documents/{doc['id']}/file", headers=hdr["Justice"])
    assert r.status_code == 200 and r.content == TEXT.encode()
    assert r.headers["content-type"].startswith("text/plain")
    assert r.headers["content-disposition"].startswith("inline;") and "ram kumar.txt" in r.headers["content-disposition"]
    assert _audit_rows("DOCUMENT_FILE_VIEWED", doc["id"])


def test_upload_validation(client, hdr):
    assert client.post("/api/documents", data={"doc_type": "PETITION"}, headers=hdr["Clerk"]).status_code == 422
    assert client.post("/api/documents", data={"text": "x y z", "doc_type": "NOPE"}, headers=hdr["Clerk"]).status_code == 422
    assert client.post("/api/documents", data={"sample": "bogus"}, headers=hdr["Clerk"]).status_code == 422
    r = client.post("/api/documents", files={"file": ("evil.exe", b"MZ", "application/octet-stream")}, headers=hdr["Clerk"])
    assert r.status_code == 415


def test_failed_read_is_honest(client, hdr):
    # Unreadable image; the filename matches a canned sample but a real upload must never use it.
    r = client.post("/api/documents", files={"file": ("handwritten_fir_sample.jpg", b"not an image at all", "image/jpeg")},
                    headers=hdr["Clerk"])
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["source"] == "failed" and d["chars"] == 0 and d["status"] == "READ"
    ex = d["extraction"]
    assert all(v == "" for v in ex["fields"].values()) and ex["issues"] == [] and ex["authorities"] == []
    t = client.get(f"/api/documents/{d['id']}/text", headers=hdr["Clerk"]).json()
    assert t["text"] == "" and t["total_chars"] == 0
    c = client.post(f"/api/documents/{d['id']}/confirm", json={"version": 1}, headers=hdr["Clerk"])
    assert c.status_code == 422 and c.json()["detail"]["code"] == "EXTRACTION_INCOMPLETE"


@pytest.mark.parametrize("name,needle", [("pleading", "Rajendra Prasad Meena"), ("degraded", "Marwar Granite"),
                                         ("fir_04_17", "Samir Das"), ("fir_06_17", "Biltu Ghosh")])
def test_samples(client, hdr, name, needle):
    d = client.post("/api/documents", data={"sample": name}, headers=hdr["Clerk"]).json()
    assert d["source"] == "sample"
    t = client.get(f"/api/documents/{d['id']}/text", headers=hdr["Clerk"]).json()["text"]
    assert needle in t
    if name == "degraded":
        assert d["redaction_total"] == 3 and "4829" not in t and "ABCPB4829K" not in t
    if name.startswith("fir"):
        assert d["doc_type"] == "FIR" and d["extraction"]["fields"]["case_number"].startswith("FIR No.")
    if name == "pleading":
        assert d["extraction"]["fields"]["petitioner"].startswith("Shri Rajendra")


# ---------------- list / get / patch ----------------
def test_list_filter_paging(client, hdr, doc):
    h = hdr["Clerk"]
    allr = client.get("/api/documents", params={"limit": 100}, headers=h).json()
    assert allr["total"] == len(allr["items"]) >= 5
    ts = [x["created_at"] for x in allr["items"]]
    assert ts == sorted(ts, reverse=True)
    item = next(x for x in allr["items"] if x["id"] == doc["id"])
    assert "facts" not in item["extraction"]["fields"] and item["extraction"]["issues_count"] == 1
    p1 = client.get("/api/documents", params={"limit": 2, "offset": 0}, headers=h).json()
    p2 = client.get("/api/documents", params={"limit": 2, "offset": 2}, headers=h).json()
    assert len(p1["items"]) == 2 and p1["total"] == allr["total"]
    assert {x["id"] for x in p1["items"]}.isdisjoint({x["id"] for x in p2["items"]})
    assert client.get("/api/documents", params={"limit": 101}, headers=h).status_code == 422
    m = client.get("/api/documents", params={"matter_key": "wp-777-2024"}, headers=h).json()
    assert [x["id"] for x in m["items"]] == [doc["id"]]
    firs = client.get("/api/documents", params={"doc_type": "FIR"}, headers=h).json()["items"]
    assert firs and all(x["doc_type"] == "FIR" for x in firs)
    assert client.get("/api/documents", params={"q": "ram kumar"}, headers=h).json()["total"] == 1
    assert client.get("/api/documents", params={"status": "BOGUS"}, headers=h).status_code == 422


def test_get_one_and_404(client, hdr, doc):
    d = client.get(f"/api/documents/{doc['id']}", headers=hdr["Clerk"]).json()
    assert d["id"] == doc["id"] and d["drafts"] == [] and d["pins_count"] == 0
    r = client.get("/api/documents/nope", headers=hdr["Clerk"])
    assert r.status_code == 404 and r.json()["detail"]["code"] == "DOCUMENT_NOT_FOUND"


def test_patch(client, hdr, doc):
    r = client.patch(f"/api/documents/{doc['id']}", json={"title": "Renamed", "doc_type": "APPEAL"}, headers=hdr["Clerk"])
    assert r.status_code == 200 and r.json()["title"] == "Renamed" and r.json()["doc_type"] == "APPEAL"
    assert client.patch(f"/api/documents/{doc['id']}", json={"doc_type": "ZZZ"}, headers=hdr["Clerk"]).status_code == 422
    assert client.patch(f"/api/documents/{doc['id']}", json={"title": "  "}, headers=hdr["Clerk"]).status_code == 422
    rows = _audit_rows("DOCUMENT_UPDATED", doc["id"])
    assert rows and "matter wp-777-2024" in rows[0]["details"]


# ---------------- extraction / confirm ----------------
def test_extraction_version_conflict_and_confirm(client, hdr, doc):
    h, base = hdr["Clerk"], f"/api/documents/{doc['id']}"
    ex = doc["extraction"]
    bad = client.put(f"{base}/extraction", json={"fields": ex["fields"], "issues": ex["issues"], "version": 7}, headers=h)
    assert bad.status_code == 409 and bad.json()["detail"]["code"] == "VERSION_CONFLICT"
    assert bad.json()["detail"]["current_version"] == 1

    fields = dict(ex["fields"], facts="")
    r = client.put(f"{base}/extraction", json={"fields": fields, "issues": ex["issues"], "version": 1}, headers=h)
    assert r.status_code == 200 and r.json()["extraction"]["version"] == 2 and r.json()["extraction"]["confirmed"] is False
    c = client.post(f"{base}/confirm", json={"version": 2}, headers=h)
    assert c.status_code == 422 and c.json()["detail"]["code"] == "EXTRACTION_INCOMPLETE"
    assert "facts" in c.json()["detail"]["missing"]
    assert client.post(f"{base}/confirm", json={"version": 1}, headers=h).status_code == 409
    assert client.post(f"{base}/draft-params", headers=h).json()["detail"]["code"] == "NOT_CONFIRMED"
    assert client.post(f"{base}/research", json={}, headers=h).status_code == 409

    fields["facts"] = "The petitioner was dismissed without the inquiry report."
    r = client.put(f"{base}/extraction", json={"fields": fields, "issues": ["Whether the dismissal is bad?", "  "], "version": 2}, headers=h)
    assert r.json()["extraction"]["version"] == 3 and r.json()["extraction"]["issues"] == ["Whether the dismissal is bad?"]
    c = client.post(f"{base}/confirm", json={"version": 3}, headers=h)
    assert c.status_code == 200
    body = c.json()
    assert body["status"] == "CONFIRMED" and body["extraction"]["confirmed"] is True and body["extraction"]["version"] == 3
    for act in ("DOCUMENT_EXTRACTION_SAVED", "DOCUMENT_CONFIRMED"):
        assert _audit_rows(act, doc["id"])
    # editing a confirmed extraction drops it back to READ; confirm again
    r = client.put(f"{base}/extraction", json={"fields": fields, "issues": ["Whether the dismissal is bad?"], "version": 3}, headers=h)
    assert r.json()["status"] == "READ"
    assert client.post(f"{base}/confirm", json={"version": 4}, headers=h).status_code == 200


def test_research_shape(client, hdr, doc):
    r = client.post(f"/api/documents/{doc['id']}/research", json={"limit_per_issue": 3}, headers=hdr["Clerk"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["issues"]) == 1 and body["issues"][0]["issue"] == "Whether the dismissal is bad?"
    assert body["issues"][0]["query"] and isinstance(body["issues"][0]["results"], list)
    assert len(body["issues"][0]["results"]) <= 3
    assert set(body["statutes"]) == {"query", "results"}
    assert _audit_rows("DOCUMENT_RESEARCHED", doc["id"])


def test_research_needs_search_permission(client, hdr, doc, monkeypatch):
    import auth
    real = auth.check_permission
    monkeypatch.setattr(auth, "check_permission", lambda u, perm: perm != "SEARCH" and real(u, perm))
    r = client.post(f"/api/documents/{doc['id']}/research", json={}, headers=hdr["Clerk"])
    assert r.status_code == 403


# ---------------- pins ----------------
def test_pins_lifecycle_and_draft_params(client, hdr, doc, ids):
    h, base = hdr["Clerk"], f"/api/documents/{doc['id']}"
    assert client.get(f"{base}/pins", headers=h).json() == {"items": []}
    jids = [ids[f"FIX-000{i}"] for i in range(1, 7)]
    r = client.post(f"{base}/pins", json={"judgment_id": jids[0], "issue_ref": "(A)", "note": "key case"}, headers=h)
    assert r.status_code == 200
    item = r.json()["items"][0]
    assert item["judgment_id"] == jids[0] and item["issue_ref"] == "(A)" and item["note"] == "key case"
    assert {"title", "citation", "court", "precedent_status", "added_by", "added_at"} <= set(item)
    assert len(client.post(f"{base}/pins", json={"judgment_id": jids[0], "note": "again"}, headers=h).json()["items"]) == 1
    for j in jids[1:5]:
        assert client.post(f"{base}/pins", json={"judgment_id": j}, headers=h).status_code == 200
    full = client.post(f"{base}/pins", json={"judgment_id": jids[5]}, headers=h)
    assert full.status_code == 409 and full.json()["detail"]["code"] == "PINS_FULL"
    assert client.post(f"{base}/pins", json={"judgment_id": 99999999}, headers=h).status_code == 404

    dp = client.post(f"{base}/draft-params", headers=h)
    assert dp.status_code == 200, dp.text
    body = dp.json()
    p = body["params"]
    assert p["document_id"] == doc["id"] and p["case_title"] == "Ram Kumar v. State of Rajasthan"
    assert p["issues"] == "(A) Whether the dismissal is bad?"
    assert {"case_number", "court", "petitioner", "respondent", "facts", "prayer", "statutory_provisions",
            "petitioner_arguments", "respondent_arguments"} <= set(p)
    assert [a["id"] for a in body["authorities"]] == jids[:5]
    assert {"title", "citation", "court", "status"} <= set(body["authorities"][0])

    after = client.delete(f"{base}/pins/{jids[0]}", headers=h)
    assert after.status_code == 200 and len(after.json()["items"]) == 4
    assert client.delete(f"{base}/pins/{jids[0]}", headers=h).status_code == 404
    assert client.get(f"{base}", headers=h).json()["pins_count"] == 4
    assert _audit_rows("DOCUMENT_PIN_ADDED", doc["id"]) and _audit_rows("DOCUMENT_PIN_REMOVED", doc["id"])


def test_draft_link_listed_on_document(client, hdr, doc, draft_payload):
    r = client.post("/api/save_draft", json=draft_payload, headers=hdr["Clerk"])
    assert r.status_code == 200, r.text
    conn = database.get_connection()
    try:
        conn.execute("UPDATE draft_judgments SET document_id = ? WHERE id = ?", (doc["id"], r.json()["draft_id"]))
        conn.commit()
    finally:
        conn.close()
    d = client.get(f"/api/documents/{doc['id']}", headers=hdr["Clerk"]).json()
    assert [x["id"] for x in d["drafts"]] == [r.json()["draft_id"]]
    assert {"id", "case_title", "status", "version"} == set(d["drafts"][0])


# ---------------- matter payload ----------------
def test_matter_detail_lists_documents_and_events(client, hdr, doc):
    key = "wp-777-2024"
    r = client.get(f"/api/matters/{key}", headers=hdr["Clerk"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert [d["id"] for d in body["documents"]] == [doc["id"]]
    assert {"id", "title", "doc_type", "status", "created_at"} == set(body["documents"][0])
    acts = [e["action"] for e in body["events"]]
    assert "DOCUMENT_UPLOADED" in acts and "DOCUMENT_CONFIRMED" in acts
    assert any(f"matter {key}" in e["details"] for e in body["events"])


# ---------------- archive ----------------
def test_archive_hides_from_list(client, hdr):
    h = hdr["Clerk"]
    d = client.post("/api/documents", data={"text": "FACTS:\nTo be archived.", "title": "Archive me"}, headers=h).json()
    r = client.post(f"/api/documents/{d['id']}/archive", headers=h)
    assert r.status_code == 200 and r.json()["status"] == "ARCHIVED"
    assert d["id"] not in [x["id"] for x in client.get("/api/documents", params={"limit": 100}, headers=h).json()["items"]]
    arch = client.get("/api/documents", params={"status": "ARCHIVED", "limit": 100}, headers=h).json()
    assert d["id"] in [x["id"] for x in arch["items"]]
    assert client.get(f"/api/documents/{d['id']}", headers=h).status_code == 200
    assert client.patch(f"/api/documents/{d['id']}", json={"title": "x"}, headers=h).status_code == 409
    assert _audit_rows("DOCUMENT_ARCHIVED", d["id"])
    # An archived document with no linked drafts can still be permanently deleted (plan: delete feature).
    assert client.delete(f"/api/documents/{d['id']}", headers=h).status_code == 200
    assert client.get(f"/api/documents/{d['id']}", headers=h).status_code == 404

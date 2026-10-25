"""Draft state machine (B7), optimistic versioning (B8) and draft_versions (D4)."""


def _save(client, h, payload, **extra):
    return client.post("/api/save_draft", json={**payload, **extra}, headers=h)


def _status(client, h, did, status):
    return client.post("/api/draft/update_status", json={"draft_id": did, "status": status}, headers=h)


def test_create_returns_version_1(client, hdr, draft_payload):
    r = _save(client, hdr["Clerk"], draft_payload)
    assert r.status_code == 200
    body = r.json()
    assert body["version"] == 1 and body["status"] == "DRAFT" and body["draft_id"] > 0


def test_update_bumps_version_and_matches(client, hdr, draft_payload):
    did = _save(client, hdr["Clerk"], draft_payload).json()["draft_id"]
    r = _save(client, hdr["Clerk"], draft_payload, draft_id=did, version=1)
    assert r.status_code == 200 and r.json()["version"] == 2
    r = _save(client, hdr["Clerk"], draft_payload, draft_id=did, version=2)
    assert r.json()["version"] == 3


def test_stale_version_is_409(client, hdr, draft_payload):
    did = _save(client, hdr["Clerk"], draft_payload).json()["draft_id"]
    _save(client, hdr["Clerk"], draft_payload, draft_id=did, version=1)
    r = _save(client, hdr["Clerk"], draft_payload, draft_id=did, version=1)
    assert r.status_code == 409
    assert r.json()["code"] == "VERSION_CONFLICT" and r.json()["current_version"] == 2


def test_legacy_save_without_version_still_works(client, hdr, draft_payload):
    did = _save(client, hdr["Clerk"], draft_payload).json()["draft_id"]
    assert _save(client, hdr["Clerk"], draft_payload, draft_id=did).status_code == 200


def test_happy_path_and_sealed_is_immutable(client, hdr, draft_payload):
    did = _save(client, hdr["Clerk"], draft_payload).json()["draft_id"]
    assert _status(client, hdr["Clerk"], did, "IN_REVIEW").json()["status"] == "IN_REVIEW"
    assert _status(client, hdr["Justice"], did, "BENCH_APPROVED").status_code == 200
    r = _status(client, hdr["Justice"], did, "FINAL_SEALED")
    assert r.status_code == 200 and r.json()["previous_status"] == "BENCH_APPROVED"
    assert client.get(f"/api/draft/{did}", headers=hdr["Clerk"]).json()["status"] == "FINAL_SEALED"
    r = _save(client, hdr["Clerk"], draft_payload, draft_id=did)
    assert r.status_code == 409 and r.json()["code"] == "DRAFT_SEALED"
    r = _status(client, hdr["Justice"], did, "DRAFT")
    assert r.status_code == 409 and r.json()["code"] == "ILLEGAL_TRANSITION"


def test_illegal_transitions(client, hdr, draft_payload):
    did = _save(client, hdr["Clerk"], draft_payload).json()["draft_id"]
    r = _status(client, hdr["Justice"], did, "FINAL_SEALED")  # DRAFT -> FINAL_SEALED skips review
    assert r.status_code == 409 and r.json()["code"] == "ILLEGAL_TRANSITION"
    assert r.json()["allowed"] == ["IN_REVIEW"]
    assert _status(client, hdr["Justice"], did, "BENCH_APPROVED").status_code == 409


def test_returned_goes_back_to_draft(client, hdr, draft_payload):
    did = _save(client, hdr["Clerk"], draft_payload).json()["draft_id"]
    _status(client, hdr["Clerk"], did, "IN_REVIEW")
    assert _status(client, hdr["Justice"], did, "RETURNED").status_code == 200
    assert _status(client, hdr["Clerk"], did, "DRAFT").status_code == 200


def test_unknown_status_400_and_missing_draft_404(client, hdr):
    assert _status(client, hdr["Clerk"], 1, "BANANA").status_code == 400
    assert _status(client, hdr["Clerk"], 999999, "IN_REVIEW").status_code == 404
    assert client.get("/api/draft/999999", headers=hdr["Clerk"]).status_code == 404


def test_legacy_statuses_mapped_on_read(client, hdr):
    rows = {d["id"]: d["status"] for d in client.get("/api/drafts", headers=hdr["Clerk"]).json()}
    assert rows[2] == "IN_REVIEW"      # UNDER_REVIEW
    assert rows[3] == "FINAL_SEALED"   # SIGNED
    assert rows[4] == "IN_REVIEW"      # CHAMBER_REVIEW
    assert set(rows.values()) <= {"DRAFT", "IN_REVIEW", "BENCH_APPROVED", "FINAL_SEALED", "RETURNED"}


def test_draft_versions_history(client, hdr, draft_payload):
    did = _save(client, hdr["Clerk"], draft_payload).json()["draft_id"]
    _save(client, hdr["Clerk"], draft_payload, draft_id=did, version=1)
    _status(client, hdr["Clerk"], did, "IN_REVIEW")
    r = client.get(f"/api/drafts/{did}/versions", headers=hdr["Clerk"])
    assert r.status_code == 200
    rows = r.json()
    assert [x["version"] for x in rows] == [3, 2, 1]
    assert set(rows[0]) == {"version", "saved_at", "saved_by", "status"}
    assert rows[0]["status"] == "IN_REVIEW" and rows[-1]["status"] == "DRAFT"
    assert client.get("/api/drafts/999999/versions", headers=hdr["Clerk"]).status_code == 404
    assert client.get(f"/api/drafts/{did}/versions").status_code == 401


def test_versions_for_seeded_draft_is_empty_list(client, hdr):
    assert client.get("/api/drafts/1/versions", headers=hdr["Clerk"]).json() == []

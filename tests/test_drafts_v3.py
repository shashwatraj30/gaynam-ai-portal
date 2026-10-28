"""Drafts v3: partial regeneration, no predetermined outcome, pinned authorities, version snapshot/restore, return reason."""
import pytest

import drafts_service as svc
import judgment_engine as je
import server

WIRED = "reason" in getattr(server.UpdateDraftStatusRequest, "model_fields", {})
needs_wiring = pytest.mark.skipif(not WIRED, reason="server.py wiring from docs/wiring/b4.md not applied yet")

CASE = dict(
    case_title="Asha v. State", case_number="CRL.A. 77/2025", court="High Court", facts="The appellant was convicted.",
    petitioner_arguments="Conviction is unsafe.", respondent_arguments="Evidence is sufficient.",
    issues="(A) Whether the conviction is sustainable?", statutory_provisions="Section 304A IPC",
)


def _gen(**kw):
    return je.generate_15_section_judgment(**CASE, api_key=None, **kw)


def _mk(client=None, **extra):
    data = {**CASE, "facts": "f", "draft_content_json": {"sections": {"section_3_introduction": "v1 text"}}, **extra}
    return svc.save_draft(data, {"full_name": "Clerk One"})


# ---------- engine ----------
def test_only_sections_returns_only_those_keys():
    r = _gen(only_sections=[3, 14])
    assert set(r["sections"]) == {"section_3_introduction", "section_14_conclusion_disposition"}
    assert r["engine"]


def test_all_sections_default_is_fifteen():
    assert len(_gen()["sections"]) == 15


def test_no_predetermined_outcome():
    text = "\n".join(_gen()["sections"].values())
    assert je.OUTCOME_PLACEHOLDER in text
    assert "ALLOWED" not in text and "trial must proceed" not in text and "committed for trial" not in text


def test_outcome_is_used_when_given():
    r = _gen(only_sections=[14], outcome="the appeal is DISMISSED")
    assert "the appeal is DISMISSED" in r["sections"]["section_14_conclusion_disposition"]
    assert je.OUTCOME_PLACEHOLDER not in r["sections"]["section_14_conclusion_disposition"]


def test_pinned_authorities_in_section_15():
    r = _gen(authorities=[{"title": "Pinned Case v. Union", "citation": "(2001) 1 SCC 1", "court": "Supreme Court of India", "status": "FOLLOWED"}])
    s15 = r["sections"]["section_15_citations_authorities"]
    assert "Pinned Case v. Union" in s15 and "(2001) 1 SCC 1" in s15


def test_generate_draft_service_partial():
    out = svc.generate_draft({**CASE, "sections": [7], "current": {"section_3_introduction": "x"}})
    assert set(out["sections"]) == {"section_7_issues_framed"} and out["case_number"] == CASE["case_number"]


# ---------- service: versions / restore ----------
def test_version_snapshot_and_missing():
    did = _mk()["draft_id"]
    v = svc.get_version_snapshot(did, 1)
    assert v["version"] == 1 and v["snapshot"]["sections"]["section_3_introduction"] == "v1 text"
    with pytest.raises(svc.DraftError) as e:
        svc.get_version_snapshot(did, 99)
    assert e.value.status == 404


def test_restore_creates_new_version():
    did = _mk()["draft_id"]
    svc.save_draft({**CASE, "draft_id": did, "draft_content_json": {"sections": {"section_3_introduction": "v2 text"}}}, {"full_name": "Clerk One"})
    d = svc.restore_version(did, 1, 2, {"full_name": "Clerk One"})
    assert d["version"] == 3
    assert d["draft_content_json"]["sections"]["section_3_introduction"] == "v1 text"
    assert svc.get_version_snapshot(did, 3)["note"] == "Restored from v1"
    assert svc.get_version_snapshot(did, 2)["snapshot"]["sections"]["section_3_introduction"] == "v2 text"


def test_restore_stale_version_refused():
    did = _mk()["draft_id"]
    with pytest.raises(svc.DraftError) as e:
        svc.restore_version(did, 1, 7, {})
    assert e.value.status == 409 and e.value.content["code"] == "VERSION_CONFLICT"


def test_restore_sealed_refused():
    did = _mk()["draft_id"]
    for st in ("IN_REVIEW", "BENCH_APPROVED", "FINAL_SEALED"):
        svc.update_status_with_reason(did, st, None, None, {"full_name": "J"})
    with pytest.raises(svc.DraftError) as e:
        svc.restore_version(did, 1, None, {})
    assert e.value.status == 409 and e.value.content["code"] == "DRAFT_SEALED"


def test_save_extras_stored():
    r = _mk(document_id="doc-xyz", petitioner="Asha Devi", respondent="State of Raj", prayer="Set aside", outcome="allowed")
    d = svc.get_draft(r["draft_id"])
    assert d["document_id"] == "doc-xyz" and d["petitioner"] == "Asha Devi" and d["respondent"] == "State of Raj"
    assert d["draft_content_json"]["meta"] == {"prayer": "Set aside", "outcome": "allowed"}


# ---------- service: status reason ----------
def test_returned_requires_reason():
    did = _mk()["draft_id"]
    svc.update_status_with_reason(did, "IN_REVIEW", None, None, {})
    for bad in (None, "", "  no "):
        with pytest.raises(svc.DraftError) as e:
            svc.update_status_with_reason(did, "RETURNED", bad, None, {})
        assert e.value.status == 422 and e.value.content["code"] == "REASON_REQUIRED"


def test_last_return_reason_and_stale_status_version():
    did = _mk()["draft_id"]
    assert svc.last_return_reason(did) is None
    svc.update_status_with_reason(did, "IN_REVIEW", None, 1, {})
    with pytest.raises(svc.DraftError) as e:
        svc.update_status_with_reason(did, "RETURNED", "Needs more work", 1, {})
    assert e.value.status == 409 and e.value.content["code"] == "VERSION_CONFLICT"
    out = svc.update_status_with_reason(did, "RETURNED", "Needs more work", 2, {"full_name": "J"})
    assert out["status"] == "RETURNED" and out["previous_status"] == "IN_REVIEW" and out["version"] == 3
    assert svc.last_return_reason(did) == "Needs more work"
    assert svc.get_draft(did)["last_return_reason"] == "Needs more work"
    assert svc.list_versions(did)[0]["note"] == "Needs more work"


# ---------- routes ----------
def test_route_version_view_and_restore(client, hdr):
    did = _mk()["draft_id"]
    r = client.get(f"/api/drafts/{did}/versions/1", headers=hdr["Clerk"])
    assert r.status_code == 200 and r.json()["snapshot"]["sections"]["section_3_introduction"] == "v1 text"
    assert client.get(f"/api/drafts/{did}/versions/9", headers=hdr["Clerk"]).status_code == 404
    r = client.post(f"/api/drafts/{did}/restore/1", json={"version": 5}, headers=hdr["Clerk"])
    assert r.status_code == 409 and r.json()["code"] == "VERSION_CONFLICT"
    r = client.post(f"/api/drafts/{did}/restore/1", json={"version": 1}, headers=hdr["Clerk"])
    assert r.status_code == 200 and r.json()["version"] == 2


def test_route_permissions(client, hdr):
    did = _mk()["draft_id"]
    assert client.get(f"/api/drafts/{did}/versions/1", headers=hdr["Student"]).status_code == 403
    assert client.post(f"/api/drafts/{did}/restore/1", json={}, headers=hdr["Student"]).status_code == 403


@needs_wiring
def test_wired_update_status_reason(client, hdr, draft_payload):
    did = client.post("/api/save_draft", json=draft_payload, headers=hdr["Clerk"]).json()["draft_id"]
    client.post("/api/draft/update_status", json={"draft_id": did, "status": "IN_REVIEW"}, headers=hdr["Clerk"])
    r = client.post("/api/draft/update_status", json={"draft_id": did, "status": "RETURNED"}, headers=hdr["Justice"])
    assert r.status_code == 422 and r.json()["code"] == "REASON_REQUIRED"
    r = client.post("/api/draft/update_status", json={"draft_id": did, "status": "RETURNED", "reason": "Fix the issues"}, headers=hdr["Justice"])
    assert r.status_code == 200
    assert client.get(f"/api/draft/{did}", headers=hdr["Clerk"]).json()["last_return_reason"] == "Fix the issues"


@needs_wiring
def test_wired_draft_judgment_sections(client, hdr):
    r = client.post("/api/draft_judgment", json={**CASE, "sections": [4]}, headers=hdr["Clerk"])
    assert r.status_code == 200 and set(r.json()["sections"]) == {"section_4_brief_facts"}

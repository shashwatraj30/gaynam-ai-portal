"""search_service.run_search, /api/courts and /api/saved_searches."""
import search_service
from search_service import run_search

USER = {"user_id": "usr_test", "email": "t@example.com", "full_name": "T", "role": "HON_JUSTICE"}


def search(**kw):
    body = {"query": "bail", "limit": 20}
    body.update(kw)
    return run_search(body, USER)


def test_response_keys():
    r = search()
    for k in ("query", "count", "results", "total", "offset", "filters_relaxed"):
        assert k in r
    assert r["count"] == len(r["results"]) and r["total"] >= r["count"]
    assert r["filters_relaxed"] is False
    row = r["results"][0]
    for k in ("id", "title", "court", "citation", "bench_label", "district", "source_pdf_url", "is_curated"):
        assert k in row


def test_court_filter_applied():
    r = search(court="Gujarat", limit=100)
    assert r["results"] and r["filters_relaxed"] is False
    assert all("Gujarat" in x["court"] for x in r["results"])


def test_status_followed_on_all_courts_excludes_overruled():
    unfiltered = run_search({"query": "Old Rule Ancient Doctrine", "court": "ALL", "limit": 100, "sort": "relevance"}, USER)
    assert any(x["precedent_status"] == "OVERRULED" for x in unfiltered["results"])
    r = run_search({"query": "Old Rule Ancient Doctrine", "court": "ALL", "precedent_status": "FOLLOWED", "limit": 100}, USER)
    assert r["results"] and r["filters_relaxed"] is False
    assert all(x["precedent_status"] == "FOLLOWED" for x in r["results"])


def test_status_overruled_filter():
    r = run_search({"query": "Old Rule v. State", "precedent_status": "OVERRULED"}, USER)
    assert r["results"] and all(x["precedent_status"] == "OVERRULED" for x in r["results"])


def test_judge_filter():
    r = run_search({"query": "inquiry report natural justice", "judge": "Ramaswamy"}, USER)
    assert r["filters_relaxed"] is False and r["results"]
    assert all("Ramaswamy" in x["judges"] for x in r["results"])


def test_year_filter():
    r = search(year_from=1990, year_to=1995, limit=100)
    assert r["results"] and all(1990 <= x["year"] <= 1995 for x in r["results"])


def test_filters_relaxed_flag_when_no_hits():
    r = search(court="Nonexistent Court of Nowhere")
    assert r["filters_relaxed"] is True and r["results"] and r["total"] > 0
    r2 = search(judge="Nobody Atall")
    assert r2["filters_relaxed"] is True


def test_filtered_match_not_dropped_by_candidate_cut(monkeypatch):
    monkeypatch.setattr(search_service, "CANDIDATE_CAP", 3)
    r = run_search({"query": "bail theft murder", "judge": "Ramaswamy", "court": "ALL", "limit": 5}, USER)
    # ECIL has none of those words in a weak rank position; with the cut at 3 an unfiltered cut would lose it.
    # Either it is found with the filter intact or the search reports relaxation, never a silent wrong filter.
    assert r["filters_relaxed"] or all("Ramaswamy" in x["judges"] for x in r["results"])
    r = run_search({"query": "Old Rule New Rule", "precedent_status": "OVERRULED", "limit": 5}, USER)
    assert r["results"] and all(x["precedent_status"] == "OVERRULED" for x in r["results"])
    assert r["filters_relaxed"] is False


def test_pagination_total_and_offset():
    p1 = search(limit=10, sort="relevance")
    p2 = search(limit=10, offset=10, sort="relevance")
    assert p1["total"] == p2["total"] > 20
    assert p2["offset"] == 10 and p1["count"] == 10 == p2["count"]
    assert not {x["id"] for x in p1["results"]} & {x["id"] for x in p2["results"]}
    b1 = search(limit=10, sort="bench")
    b2 = search(limit=10, offset=10, sort="bench")
    assert not {x["id"] for x in b1["results"]} & {x["id"] for x in b2["results"]}


def test_sort_orders():
    new = search(sort="newest", limit=50)["results"]
    old = search(sort="oldest", limit=50)["results"]
    ny = [x["year"] for x in new]
    oy = [x["year"] for x in old]
    assert ny == sorted(ny, reverse=True) and oy == sorted(oy)
    assert ny[0] >= oy[-1] and oy[0] <= ny[-1]
    rel = search(sort="relevance", limit=50)["results"]
    ranks = [x["rank"] for x in rel]
    assert ranks == sorted(ranks)


def test_bench_sort_default_not_overruled_first_then_priority():
    r = run_search({"query": "Old Rule New Rule Doctrine", "limit": 20}, USER)
    assert r["sort"] == "bench"
    keys = [(x["precedent_status"] != "OVERRULED", x["bench_priority_score"]) for x in r["results"]]
    assert keys == sorted(keys, reverse=True)
    assert r["results"][0].get("is_primary_binding") is True


def test_limit_cap_and_bad_values():
    assert search(limit=1000)["count"] <= 100
    assert search(limit="x")["count"] <= 20
    assert search(sort="bogus")["sort"] == "bench"
    assert search(offset=-5)["offset"] == 0


def test_courts_endpoint(client, hdr):
    assert client.get("/api/courts").status_code == 401
    r = client.get("/api/courts", headers=hdr["Student"])
    assert r.status_code == 200
    items = r.json()["items"]
    assert {"court", "label", "count"} <= set(items[0])
    counts = [i["count"] for i in items]
    assert counts == sorted(counts, reverse=True)
    assert sum(counts) == 300


def test_saved_searches_crud_and_isolation(client, hdr):
    assert client.get("/api/saved_searches").status_code == 401
    assert client.post("/api/saved_searches", json={"name": "n", "query": "q"}).status_code == 401
    r = client.post("/api/saved_searches", headers=hdr["Justice"],
                    json={"name": "Bail Gujarat", "query": "bail", "filters": {"court": "Gujarat"}})
    assert r.status_code == 200, r.text
    item = r.json()
    assert item["filters"] == {"court": "Gujarat"} and item["created_at"].endswith("Z")
    mine = client.get("/api/saved_searches", headers=hdr["Justice"]).json()["items"]
    assert item["id"] in [i["id"] for i in mine]
    other = client.get("/api/saved_searches", headers=hdr["Clerk"]).json()["items"]
    assert item["id"] not in [i["id"] for i in other]
    assert client.delete(f"/api/saved_searches/{item['id']}", headers=hdr["Clerk"]).status_code == 404
    assert client.delete(f"/api/saved_searches/{item['id']}", headers=hdr["Justice"]).json() == {"ok": True}
    assert client.delete(f"/api/saved_searches/{item['id']}", headers=hdr["Justice"]).status_code == 404
    bad = client.post("/api/saved_searches", headers=hdr["Justice"], json={"name": " ", "query": "q"})
    assert bad.status_code == 422


def test_saved_searches_limit_and_audit(client, hdr):
    ids = []
    for i in range(50):
        r = client.post("/api/saved_searches", headers=hdr["Admin"], json={"name": f"s{i}", "query": "q"})
        if r.status_code == 200:
            ids.append(r.json()["id"])
    over = client.post("/api/saved_searches", headers=hdr["Admin"], json={"name": "x", "query": "q"})
    assert over.status_code == 409 and over.json()["detail"]["code"] == "LIMIT_REACHED"
    import database
    conn = database.get_connection()
    row = conn.execute("SELECT details FROM audit_logs WHERE action='SAVED_SEARCH_CREATED' ORDER BY id DESC LIMIT 1").fetchone()
    conn.close()
    assert row and "saved search" in row["details"]
    for i in ids:
        client.delete(f"/api/saved_searches/{i}", headers=hdr["Admin"])


def test_forbidden_without_search_permission(client, hdr):
    # Auditor has no SEARCH permission
    for path in ("/api/courts", "/api/saved_searches", "/api/lineages"):
        r = client.get(path, headers=hdr["Auditor"])
        assert r.status_code == 403, (path, r.text)
    assert client.post("/api/saved_searches", headers=hdr["Auditor"],
                       json={"name": "n", "query": "q"}).status_code == 403

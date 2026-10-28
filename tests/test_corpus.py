"""Lineages, paragraphs, treatments and the source adapters."""
import pytest

import database
from ingest.adapters import NotConfigured, SCitationAdapter, SourceAdapter


def test_lineages_seeded_and_idempotent(client, hdr):
    assert client.get("/api/lineages").status_code == 401
    r = client.get("/api/lineages", headers=hdr["Student"])
    assert r.status_code == 200
    streams = r.json()["streams"]
    assert [s["id"] for s in streams] == ["privacy", "cheque", "natural", "arbitration"]
    assert streams[0]["title"] == "Constitutional liberty and privacy"
    n0 = streams[0]["nodes"][0]
    assert n0["overruled"] is True and n0["year"] == 1976 and n0["holding"] == ""
    assert {"id", "judgment_id", "year", "title", "citation", "holding", "coram", "bench", "impact",
            "overruled"} <= set(n0)
    # fixture holds "(2010) 11 SCC 441" and ECIL "(1993) 4 SCC 727": resolved by citation
    cheque = {n["citation"]: n for n in streams[1]["nodes"]}
    assert cheque["(2010) 11 SCC 441"]["judgment_id"] is not None
    assert cheque["(2019) 4 SCC 197"]["judgment_id"] is None
    again = client.get("/api/lineages", headers=hdr["Justice"]).json()["streams"]
    assert again == streams
    conn = database.get_connection()
    assert conn.execute("SELECT COUNT(*) FROM lineage_streams").fetchone()[0] == 4
    assert conn.execute("SELECT COUNT(*) FROM lineage_nodes").fetchone()[0] == 10
    conn.close()


def test_paragraphs_available_flag(client, hdr, ids):
    jid = ids["FIX-0001"]
    url = f"/api/judgment/{jid}/paragraphs"
    assert client.get(url).status_code == 401
    r = client.get(url, headers=hdr["Student"])
    assert r.status_code == 200 and r.json() == {"items": [], "available": False}
    conn = database.get_connection()
    conn.execute("INSERT INTO judgment_paragraphs (judgment_id, para_no, text, page) VALUES (?,2,'second',5),(?,1,'first',4)",
                 (jid, jid))
    conn.commit()
    conn.close()
    r = client.get(url, headers=hdr["Student"]).json()
    assert r["available"] is True
    assert r["items"] == [{"para_no": 1, "text": "first", "page": 4}, {"para_no": 2, "text": "second", "page": 5}]
    assert client.get("/api/judgment/99999999/paragraphs", headers=hdr["Student"]).status_code == 404


def test_treatments_available_flag(client, hdr, ids):
    a, b = ids["FIX-0002"], ids["FIX-0003"]
    ua, ub = f"/api/judgment/{a}/treatments", f"/api/judgment/{b}/treatments"
    assert client.get(ua).status_code == 401
    assert client.get(ua, headers=hdr["Student"]).json() == {"cited_by": [], "cites": [], "available": False}
    conn = database.get_connection()
    conn.execute("INSERT INTO judgment_treatments (citing_id, cited_id, treatment, para_no, source_ref, created_at) "
                 "VALUES (?,?,?,?,?,?)", (b, a, "FOLLOWED", 7, "ref-1", "2026-01-01T00:00:00Z"))
    conn.commit()
    conn.close()
    ra = client.get(ua, headers=hdr["Student"]).json()
    assert ra["available"] is True and ra["cites"] == []
    assert ra["cited_by"][0]["citing_id"] == b and ra["cited_by"][0]["treatment"] == "FOLLOWED"
    assert ra["cited_by"][0]["para_no"] == 7 and ra["cited_by"][0]["title"]
    rb = client.get(ub, headers=hdr["Student"]).json()
    assert rb["available"] is True and rb["cited_by"] == [] and rb["cites"][0]["cited_id"] == a


def test_scitation_requires_config(monkeypatch):
    monkeypatch.delenv("SCITATION_API_URL", raising=False)
    monkeypatch.delenv("SCITATION_API_KEY", raising=False)
    with pytest.raises(NotConfigured):
        SCitationAdapter()
    monkeypatch.setenv("SCITATION_API_URL", "https://example.test")
    with pytest.raises(NotConfigured):
        SCitationAdapter()
    monkeypatch.setenv("SCITATION_API_KEY", "k")
    a = SCitationAdapter()
    assert isinstance(a, SourceAdapter) and a.name == "scitation"
    with pytest.raises(TypeError):
        SourceAdapter()

"""Lineages, judgment paragraphs and treatments (docs/API_V3_CONTRACT.md)."""
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException

from auth import require
from database import get_connection

router = APIRouter()

# Transcribed from frontend/app/js/pages/lib/lineages.js and i18n/pages/graph.en.js.
# Only the overruled flags are recorded; holding/coram/bench/impact stay empty (not recorded).
SEED = [
    {"id": "privacy", "title": "Constitutional liberty and privacy",
     "subtitle": "From ADM Jabalpur (1976) to Puttaswamy (2017).",
     "nodes": [
         (1976, "ADM Jabalpur v. Shivkant Shukla", "(1976) 2 SCC 521", True),
         (1978, "Maneka Gandhi v. Union of India", "(1978) 1 SCC 248", False),
         (2017, "Justice K.S. Puttaswamy (Retd.) v. Union of India", "(2017) 10 SCC 1", False),
     ]},
    {"id": "cheque", "title": "Cheque bounce and the NI Act",
     "subtitle": "Section 139 presumption: K. J. Bhat to Rangappa.",
     "nodes": [
         (2008, "Krishna Janardhan Bhat v. Dattatraya G. Hegde", "(2008) 4 SCC 54", True),
         (2010, "Rangappa v. Sri Mohan", "(2010) 11 SCC 441", False),
         (2019, "Bir Singh v. Mukesh Kumar", "(2019) 4 SCC 197", False),
     ]},
    {"id": "natural", "title": "Natural justice and inquiry reports",
     "subtitle": "Supply of the inquiry report in service matters.",
     "nodes": [
         (1993, "Managing Director, ECIL v. B. Karunakar", "(1993) 4 SCC 727", False),
         (2022, "Rameshwar Lal Sharma v. State of Rajasthan & Ors.", "2022 (2) RLW (Raj.) 1104", False),
     ]},
    {"id": "arbitration", "title": "Commercial arbitration",
     "subtitle": "Section 34 and the limits of court interference.",
     "nodes": [
         (2015, "Associate Builders v. Delhi Development Authority", "(2015) 3 SCC 49", False),
         (2022, "Delhi Airport Metro Express v. Delhi Metro Rail Corporation", "(2022) 1 SCC 131", False),
     ]},
]


def _judgment_id(conn, citation: str):
    r = conn.execute("SELECT id FROM judgments WHERE citation = ? ORDER BY id LIMIT 1", (citation,)).fetchone()
    return r["id"] if r else None


def seed_lineages(conn) -> None:
    """Idempotent: a stream is seeded only if its id is absent, together with its nodes."""
    for order, s in enumerate(SEED):
        cur = conn.execute("INSERT OR IGNORE INTO lineage_streams (id, title, subtitle, sort_order) VALUES (?,?,?,?)",
                           (s["id"], s["title"], s["subtitle"], order))
        if cur.rowcount == 0:
            continue
        for n, (year, title, citation, overruled) in enumerate(s["nodes"]):
            conn.execute("""INSERT INTO lineage_nodes (stream_id, sort_order, judgment_id, year, title, citation,
                            holding, coram, bench, impact, overruled) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                         (s["id"], n, _judgment_id(conn, citation), year, title, citation, "", "", "", "",
                          1 if overruled else 0))
    conn.commit()


def _require_judgment(conn, judgment_id: int) -> None:
    if not conn.execute("SELECT 1 FROM judgments WHERE id = ?", (judgment_id,)).fetchone():
        raise HTTPException(status_code=404, detail={"code": "JUDGMENT_NOT_FOUND", "message": "Judgment not found."})


@router.get("/api/lineages")
def get_lineages(_user: Dict[str, Any] = Depends(require("SEARCH"))):
    conn = get_connection()
    try:
        seed_lineages(conn)
        streams: List[Dict[str, Any]] = []
        for s in conn.execute("SELECT * FROM lineage_streams ORDER BY sort_order, id").fetchall():
            nodes = []
            for n in conn.execute("SELECT * FROM lineage_nodes WHERE stream_id = ? ORDER BY sort_order, id",
                                  (s["id"],)).fetchall():
                jid = n["judgment_id"]
                if jid is None and n["citation"]:
                    jid = _judgment_id(conn, n["citation"])  # corpus may have been loaded after seeding
                nodes.append({"id": n["id"], "judgment_id": jid, "year": n["year"], "title": n["title"],
                              "citation": n["citation"] or "", "holding": n["holding"] or "",
                              "coram": n["coram"] or "", "bench": n["bench"] or "", "impact": n["impact"] or "",
                              "overruled": bool(n["overruled"])})
            streams.append({"id": s["id"], "title": s["title"], "subtitle": s["subtitle"] or "", "nodes": nodes})
    finally:
        conn.close()
    return {"streams": streams}


@router.get("/api/judgment/{judgment_id}/paragraphs")
def get_paragraphs(judgment_id: int, _user: Dict[str, Any] = Depends(require("SEARCH"))):
    conn = get_connection()
    try:
        _require_judgment(conn, judgment_id)
        rows = conn.execute("SELECT para_no, text, page FROM judgment_paragraphs WHERE judgment_id = ? "
                            "ORDER BY para_no", (judgment_id,)).fetchall()
    finally:
        conn.close()
    items = [{"para_no": r["para_no"], "text": r["text"], "page": r["page"]} for r in rows]
    return {"items": items, "available": bool(items)}


@router.get("/api/judgment/{judgment_id}/treatments")
def get_treatments(judgment_id: int, _user: Dict[str, Any] = Depends(require("SEARCH"))):
    conn = get_connection()
    try:
        _require_judgment(conn, judgment_id)
        cited_by = conn.execute("""SELECT t.citing_id, t.cited_id, j.title, j.citation, t.treatment, t.para_no, t.source_ref
            FROM judgment_treatments t LEFT JOIN judgments j ON j.id = t.citing_id
            WHERE t.cited_id = ? ORDER BY t.id""", (judgment_id,)).fetchall()
        cites = conn.execute("""SELECT t.citing_id, t.cited_id, j.title, j.citation, t.treatment, t.para_no, t.source_ref
            FROM judgment_treatments t LEFT JOIN judgments j ON j.id = t.cited_id
            WHERE t.citing_id = ? ORDER BY t.id""", (judgment_id,)).fetchall()
    finally:
        conn.close()

    def row(r, key):
        d = {"title": r["title"] or "", "citation": r["citation"] or "", "treatment": r["treatment"],
             "para_no": r["para_no"], "source_ref": r["source_ref"] or ""}
        d["citing_id" if key == "citing" else "cited_id"] = r["citing_id" if key == "citing" else "cited_id"]
        if key == "cited":
            d["citing_id"] = r["citing_id"]
        return d

    out_by = [row(r, "citing") for r in cited_by]
    out_cites = [row(r, "cited") for r in cites]
    return {"cited_by": out_by, "cites": out_cites, "available": bool(out_by or out_cites)}

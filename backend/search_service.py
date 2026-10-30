"""Search service behind POST /api/search (docs/API_V3_CONTRACT.md).

Filters (court, judge, status, year range) are applied inside the SQL, before BM25 ranking, so a filtered
match is never dropped by the candidate cut. If the filtered query has no hits the unfiltered results are
returned with ``filters_relaxed: true``; the relaxation is never silent.
The caller (server.py handler) keeps the SEARCH_QUERY audit entry; run_search does not log.
"""
import os
import re
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from database import get_connection
from judgment_engine import calculate_bench_priority, get_bench_label, resolve_case_district

MAX_LIMIT = 100
DEFAULT_LIMIT = 20
CANDIDATE_CAP = 500  # best-ranked filtered matches considered for the bench ordering
SORTS = ("relevance", "bench", "newest", "oldest")

STOP_WORDS = {'of', 'in', 'the', 'and', 'for', 'to', 'a', 'an', 'by', 'on', 'with', 'at', 'from', 'into', 'under'}

# Maps colloquial terms to statutory IPC sections and concepts.
LEGAL_EXPANSIONS = {
    "theft": "theft OR 379 OR 380 OR stolen",
    "murder": "murder OR 302 OR 307 OR homicidal",
    "half murder": "307 OR half murder OR attempt murder",
    "cheating": "cheating OR 420 OR fraud",
    "fraud": "fraud OR 420 OR cheating",
    "bail": "bail OR 438 OR 439 OR anticipatory",
    "dowry": "dowry OR 498A OR 304B",
    "rape": "rape OR 376 OR sexual",
    "corruption": "corruption OR bribe OR prevention corruption",
    "kidnapping": "kidnapping OR 363 OR 364 OR abduction",
    "extortion": "extortion OR 384 OR 385",
    "accident": "accident OR 279 OR 304A OR motor",
    "defamation": "defamation OR 499 OR 500",
}

_COLS = """j.id, j.case_id, j.title, j.court, j.bench, j.judges, j.judgment_date,
           j.year, j.citation, j.equivalent_citations, j.statutes_considered,
           j.subject_category, j.headnote, j.ratio_decidendi, j.precedent_status,
           j.overruled_by, j.citing_cases_count, j.cnr_number, j.docket_number, j.source_pdf_url"""
_YEAR_EXPR = "COALESCE(NULLIF(j.year, 0), CAST(substr(j.judgment_date, 1, 4) AS INTEGER))"
TEMPLATE_PHRASES = ("judicial determination by",)
_NO_FILTER = {"court": "", "judge": "", "status": "", "year_from": None, "year_to": None}


from audit_utils import log_audit  # noqa: E402,F401  (single shared implementation; re-exported)


def build_fts_query(query: str) -> Tuple[str, List[str]]:
    clean_q = "".join(c if c.isalnum() or c.isspace() else " " for c in query).strip()
    words = [w for w in clean_q.split() if len(w) > 1]
    meaningful = [w for w in words if w.lower() not in STOP_WORDS and len(w) > 2]
    if not meaningful:
        meaningful = words[:3] if words else ["justice"]
    q_lower = query.lower().strip()
    if q_lower in LEGAL_EXPANSIONS:
        return LEGAL_EXPANSIONS[q_lower], meaningful
    tokens: List[str] = []
    for term in meaningful[:6]:
        t_low = term.lower()
        parts = LEGAL_EXPANSIONS[t_low].split(" OR ") if t_low in LEGAL_EXPANSIONS else [term]
        for part in parts:
            c_p = re.sub(r"[^a-zA-Z0-9]", "", part).strip()
            if c_p and len(c_p) > 1 and f'"{c_p}"' not in tokens:
                tokens.append(f'"{c_p}"')
    return (" OR ".join(tokens) if tokens else '"justice"'), meaningful


def _to_int(v, default=None):
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def _filter_sql(f: Dict[str, Any]) -> Tuple[str, List[Any]]:
    sql, params = "", []
    if f["court"]:
        sql += " AND j.court LIKE ?"
        params.append(f"%{f['court']}%")
    if f["judge"]:
        sql += " AND j.judges LIKE ?"
        params.append(f"%{f['judge']}%")
    if f["status"]:
        sql += " AND j.precedent_status = ?"
        params.append(f["status"])
    if f["year_from"] is not None:
        sql += f" AND {_YEAR_EXPR} >= ?"
        params.append(f["year_from"])
    if f["year_to"] is not None:
        sql += f" AND {_YEAR_EXPR} <= ?"
        params.append(f["year_to"])
    return sql, params


def _match(conn, fts_query: str, flt: Dict[str, Any], sort: str, offset: int, limit: int):
    """Returns (total, rows). Filters are in the WHERE clause, so ranking only sees filtered matches."""
    fsql, fparams = _filter_sql(flt)
    frm = (" FROM judgments_fts JOIN judgments j ON judgments_fts.rowid = j.id"
           " WHERE judgments_fts MATCH ?" + fsql)
    params = [fts_query] + fparams
    total = conn.execute("SELECT COUNT(*)" + frm, params).fetchone()[0]
    if not total:
        return 0, []
    select = f"SELECT {_COLS}, bm25(judgments_fts) AS rank" + frm
    if sort == "bench":
        rows = conn.execute(select + " ORDER BY rank LIMIT ?", params + [CANDIDATE_CAP]).fetchall()
        return total, [dict(r) for r in rows]
    order = {"relevance": "rank", "newest": f"{_YEAR_EXPR} DESC, j.judgment_date DESC, rank",
             "oldest": f"{_YEAR_EXPR} ASC, j.judgment_date ASC, rank"}[sort]
    rows = conn.execute(select + f" ORDER BY {order} LIMIT ? OFFSET ?", params + [limit, offset]).fetchall()
    return total, [dict(r) for r in rows]


def _like_fallback(conn, clean_q: str, flt: Dict[str, Any], limit: int, offset: int):
    fsql, fparams = _filter_sql(flt)
    where = " WHERE (j.title LIKE ? OR j.full_text LIKE ?)" + fsql
    params = [f"%{clean_q}%", f"%{clean_q}%"] + fparams
    total = conn.execute("SELECT COUNT(*) FROM judgments j" + where, params).fetchone()[0]
    rows = conn.execute(f"SELECT {_COLS} FROM judgments j" + where + " LIMIT ? OFFSET ?",
                        params + [limit, offset]).fetchall()
    return total, [dict(r) for r in rows]


def _seeded_case_ids():
    if not hasattr(_seeded_case_ids, "ids"):
        ids = set()
        try:
            with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "seeder.py"), encoding="utf-8") as f:
                ids = set(re.findall(r'"case_id":\s*"([^"]+)"', f.read()))
        except Exception:
            pass
        _seeded_case_ids.ids = ids
    return _seeded_case_ids.ids


def _enrich(rows: List[Dict[str, Any]]) -> None:
    """Same guarantees as server.enrich_search_rows (year, is_curated, citing_cases_count)."""
    fn = getattr(sys.modules.get("server"), "enrich_search_rows", None)
    if fn is not None:
        fn(rows)
        return
    for r in rows:
        y = r.get("year")
        if not (isinstance(y, int) and y):
            m = re.search(r"(19|20)\d{2}", str(r.get("judgment_date") or ""))
            y = int(m.group(0)) if m else None
        r["year"] = y
        text = " ".join(str(r.get(k) or "") for k in ("headnote", "ratio_decidendi")).lower()
        r["is_curated"] = ((r.get("case_id") or "") in _seeded_case_ids()
                           or (bool(text.strip()) and not any(p in text for p in TEMPLATE_PHRASES)))
        if not r["is_curated"]:
            r["citing_cases_count"] = None


def _annotate(rows: List[Dict[str, Any]]) -> None:
    for r in rows:
        try:
            r["bench_priority_score"] = calculate_bench_priority(r)
            r["bench_label"] = get_bench_label(r)
            r["is_upper_bench"] = r["bench_priority_score"] >= 90
            r["district"] = resolve_case_district(r.get("court"), r.get("bench"), r.get("cnr_number"),
                                                  r.get("headnote", ""))
        except Exception as e:
            print(f"Error annotating search row: {e}")
            r.setdefault("bench_priority_score", 0)


def _bench_key(r):
    rank = r.get("rank")
    return (1 if r.get("precedent_status") != "OVERRULED" else 0,
            r.get("bench_priority_score", 0),
            -float(rank if rank is not None else 0))


def run_search(body: Dict[str, Any], user: Dict[str, Any], request=None) -> Dict[str, Any]:
    body = body or {}
    query = str(body.get("query") or "")
    limit = max(1, min(_to_int(body.get("limit"), DEFAULT_LIMIT), MAX_LIMIT))
    offset = max(0, _to_int(body.get("offset"), 0))
    sort = str(body.get("sort") or "bench").lower()
    if sort not in SORTS:
        sort = "bench"

    court = str(body.get("court") or "").strip()
    status = str(body.get("precedent_status") or "").strip()
    flt = {
        "court": "" if court.upper() == "ALL" else court,
        "judge": str(body.get("judge") or "").strip(),
        "status": "" if status.upper() == "ALL" else status,
        "year_from": _to_int(body.get("year_from")),
        "year_to": _to_int(body.get("year_to")),
    }
    active = any(v not in ("", None) for v in flt.values())

    fts_query, meaningful = build_fts_query(query)
    broad_terms = [re.sub(r"[^a-zA-Z0-9]", "", w) for w in meaningful[:3]]
    broad_query = " OR ".join(f'"{t}"' for t in broad_terms if t)
    clean_q = "".join(c if c.isalnum() or c.isspace() else " " for c in query).strip()

    def attempt(conn, f):
        try:
            total, rows = _match(conn, fts_query, f, sort, offset, limit)
            if not total and broad_query and broad_query != fts_query:
                total, rows = _match(conn, broad_query, f, sort, offset, limit)
            return total, rows
        except Exception as e:
            print(f"FTS search error: {e}. Falling back to LIKE query.")
            return _like_fallback(conn, clean_q, f, limit, offset)

    relaxed = False
    conn = get_connection()
    try:
        total, rows = attempt(conn, flt)
        if not total and active:
            total, rows = attempt(conn, _NO_FILTER)
            relaxed = total > 0
    finally:
        conn.close()

    _enrich(rows)
    _annotate(rows)
    if sort == "bench":
        rows.sort(key=_bench_key, reverse=True)
        rows = rows[offset:offset + limit]
        if rows and offset == 0 and rows[0].get("precedent_status") != "OVERRULED":
            rows[0]["is_primary_binding"] = True

    return {"query": query, "count": len(rows), "total": total, "offset": offset,
            "sort": sort, "filters_relaxed": relaxed, "results": rows}

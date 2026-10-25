"""Read-only endpoints for the redesigned UI (plan section 7.3).

Mounted by server.py via ``app.include_router(router)``. Each route carries its own
permission dependency (found by the e2e suite: they were unauthenticated).
"""
import json
import os
import re
import sys
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from database import get_connection
from auth import require, require_any
from matters import (
    PLACEHOLDER_KEYS,
    canonical_status,
    draft_matter_key,
    group_drafts_by_matter,
    next_action_label,
    normalise_matter_key,
)

router = APIRouter()

LEGACY_AUDIT_USER = "Hon'ble User (NLUJ)"

_CITATION_RE = re.compile(
    r"\(\d{4}\)\s*\d+\s*SCC\s*\d+"
    r"|AIR\s*\d{4}\s*SC\s*\d+"
    r"|\d{4}\s*INSC\s*\d+"
    r"|\d{4}\s*\(\d+\)\s*RLW\s*\(Raj\.?\)\s*\d+",
    re.I,
)
_DRAFT_REF_RE = re.compile(r"\bdraft\s*(?:id\s*)?#?\s*(\d+)\b", re.I)


# ---------------------------------------------------------------- helpers
def _columns(conn, table: str) -> set:
    try:
        return {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
    except Exception:
        return set()


def _load_drafts(conn, with_content: bool = False) -> List[Dict[str, Any]]:
    cols = _columns(conn, "draft_judgments")
    if not cols:
        return []
    want = ["id", "case_title", "case_number", "court", "date_created", "petitioner",
            "respondent", "status", "reviewed_by", "version", "matter_key"]
    if with_content:
        want.append("draft_content_json")
    sel = ", ".join(c if c in cols else f"NULL AS {c}" for c in want)
    rows = conn.execute(f"SELECT {sel} FROM draft_judgments ORDER BY id").fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["matter_key_effective"] = draft_matter_key(d) or "unfiled"
        out.append(d)
    return out


def _summarise_draft(d: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": d["id"],
        "case_title": d["case_title"],
        "case_number": d["case_number"],
        "court": d["court"],
        "status": canonical_status(d["status"]),
        "raw_status": d["status"],
        "reviewed_by": d["reviewed_by"],
        "version": d["version"],
        "date_created": d["date_created"],
    }


def _citation_in(text: Optional[str]) -> Optional[str]:
    m = _CITATION_RE.search(text or "")
    return re.sub(r"\s+", " ", m.group(0)).strip() if m else None


def _norm_cit(c: Optional[str]) -> str:
    return re.sub(r"[\s.]+", "", (c or "")).lower()


def _judgment_brief(row) -> Dict[str, Any]:
    return {
        "id": row["id"], "case_id": row["case_id"], "title": row["title"],
        "citation": row["citation"], "court": row["court"], "year": row["year"],
        "precedent_status": row["precedent_status"], "overruled_by": row["overruled_by"],
    }


_J_COLS = "id, case_id, title, court, year, citation, precedent_status, overruled_by, cases_cited"


def _resolve_reference(conn, text: str) -> Optional[Any]:
    """Find a judgments row for a free-text reference like 'Title (2010) 11 SCC 441'."""
    cit = _citation_in(text)
    if cit:
        row = conn.execute(f"SELECT {_J_COLS} FROM judgments WHERE citation = ? LIMIT 1", (cit,)).fetchone()
        if row:
            return row
    title = (text or "")
    if cit:
        title = title.replace(cit, "")
    title = re.sub(r"\((?:overruled|distinguished|followed)[^)]*\)", "", title, flags=re.I).strip(" ,;-")
    if len(title) >= 8:
        row = conn.execute(f"SELECT {_J_COLS} FROM judgments WHERE title = ? LIMIT 1", (title,)).fetchone()
        if row:
            return row
    return None


# ---------------------------------------------------------------- matters
@router.get("/api/matters", dependencies=[Depends(require_any("DRAFT_FULL", "UPLOAD_PLEADING"))])
def list_matters():
    conn = get_connection()
    try:
        drafts = _load_drafts(conn)
    finally:
        conn.close()
    groups = group_drafts_by_matter(drafts)
    matters = []
    for key, ds in groups.items():
        latest = max(ds, key=lambda d: d["id"])
        statuses: Dict[str, int] = {}
        for d in ds:
            s = canonical_status(d["status"])
            statuses[s] = statuses.get(s, 0) + 1
        matters.append({
            "matter_key": key,
            "case_number": latest["case_number"],
            "title": latest["case_title"],
            "petitioner": latest["petitioner"],
            "respondent": latest["respondent"],
            "court": latest["court"],
            "draft_count": len(ds),
            "latest_draft_id": latest["id"],
            "latest_status": canonical_status(latest["status"]),
            "status_counts": statuses,
            "last_updated": max((d["date_created"] or "") for d in ds) or None,
            "next_action": next_action_label(latest["status"]),
            "is_placeholder": key in PLACEHOLDER_KEYS or key == "unfiled",
        })
    matters.sort(key=lambda m: m["last_updated"] or "", reverse=True)
    return {"matters": matters, "total": len(matters)}


@router.get("/api/matters/{key:path}", dependencies=[Depends(require_any("DRAFT_FULL", "UPLOAD_PLEADING"))])
def get_matter(key: str):
    conn = get_connection()
    try:
        drafts = _load_drafts(conn)
        want = key.strip().casefold()
        want_norm = normalise_matter_key(key) or want
        groups = group_drafts_by_matter(drafts)
        ds = groups.get(key) or groups.get(want) or groups.get(want_norm)
        if not ds:
            raise HTTPException(status_code=404, detail="Matter not found")
        mkey = ds[0]["matter_key_effective"]
        ids = {d["id"] for d in ds}
        events = []
        if _columns(conn, "audit_logs"):
            rows = conn.execute(
                "SELECT id, timestamp, user_name, user_role, action, details, ip_address "
                "FROM audit_logs WHERE LOWER(details) LIKE '%draft%' ORDER BY id"
            ).fetchall()
            for r in rows:
                refs = {int(x) for x in _DRAFT_REF_RE.findall(r["details"] or "")}
                hit = sorted(refs & ids)
                if not hit:
                    continue
                legacy = (r["user_name"] or "") == LEGACY_AUDIT_USER or not r["user_name"]
                events.append({
                    "id": r["id"],
                    "timestamp": r["timestamp"],
                    "action": r["action"],
                    "details": r["details"],
                    "draft_ids": hit,
                    "user": None if legacy else r["user_name"],
                    "user_role": None if legacy else r["user_role"],
                    "user_recorded": not legacy,
                    "user_label": r["user_name"] if not legacy else "user not recorded",
                    "ip_address": None if legacy else r["ip_address"],
                })
    finally:
        conn.close()
    latest = max(ds, key=lambda d: d["id"])
    return {
        "matter_key": mkey,
        "case_number": latest["case_number"],
        "title": latest["case_title"],
        "court": latest["court"],
        "draft_count": len(ds),
        "latest_status": canonical_status(latest["status"]),
        "next_action": next_action_label(latest["status"]),
        "is_placeholder": mkey in PLACEHOLDER_KEYS or mkey == "unfiled",
        "drafts": [_summarise_draft(d) for d in sorted(ds, key=lambda d: d["id"], reverse=True)],
        "events": events,
    }


# ---------------------------------------------------------------- graph
@router.get("/api/judgment/{judgment_id}/graph", dependencies=[Depends(require("SEARCH"))])
def judgment_graph(judgment_id: int):
    conn = get_connection()
    try:
        center = conn.execute(f"SELECT {_J_COLS} FROM judgments WHERE id = ?", (judgment_id,)).fetchone()
        if not center:
            raise HTTPException(status_code=404, detail="Judgment not found")

        nodes: Dict[str, Dict[str, Any]] = {}
        edges: List[Dict[str, Any]] = []
        seen_edges = set()

        def node_for(row) -> str:
            nid = str(row["id"])
            if nid not in nodes:
                nodes[nid] = {
                    "id": nid, "judgment_id": row["id"], "title": row["title"],
                    "citation": row["citation"], "court": row["court"], "year": row["year"],
                    "precedent_status": row["precedent_status"], "in_corpus": True,
                    "is_center": row["id"] == center["id"],
                }
            return nid

        def ext_node(text: str) -> str:
            cit = _citation_in(text)
            nid = "ext:" + (_norm_cit(cit) if cit else re.sub(r"\W+", "-", text.lower()).strip("-")[:80])
            if nid not in nodes:
                title = text.replace(cit, "").strip(" ,;-") if cit else text
                title = re.sub(r"\((?:overruled|distinguished|followed)[^)]*\)", "", title, flags=re.I).strip(" ,;-")
                nodes[nid] = {
                    "id": nid, "judgment_id": None, "title": title or text, "citation": cit,
                    "court": None, "year": None, "precedent_status": None,
                    "in_corpus": False, "is_center": False,
                }
            return nid

        def add_edge(src, dst, rel, label=None):
            k = (src, dst, rel)
            if k in seen_edges or src == dst:
                return
            seen_edges.add(k)
            e = {"source": src, "target": dst, "relation": rel}
            if label:
                e["label"] = label
            edges.append(e)

        cid = node_for(center)

        # outgoing: cases_cited
        try:
            cited = json.loads(center["cases_cited"] or "[]")
        except Exception:
            cited = []
        for text in cited if isinstance(cited, list) else []:
            if not isinstance(text, str):
                continue
            row = _resolve_reference(conn, text)
            tid = node_for(row) if row else ext_node(text)
            flagged = bool(re.search(r"\(overruled", text, re.I)) or (row is not None and row["precedent_status"] == "OVERRULED")
            add_edge(cid, tid, "cites", "overruled" if flagged else None)
            if row is not None and row["precedent_status"] == "OVERRULED" and row["overruled_by"]:
                pass  # overruled_by edge for that node is added in the pass below

        # overruled_by of the centre (it was overruled by X)
        if center["overruled_by"]:
            row = _resolve_reference(conn, center["overruled_by"])
            tid = node_for(row) if row else ext_node(center["overruled_by"])
            add_edge(cid, tid, "overruled_by")

        # incoming: judgments whose overruled_by names this one (centre overruled them)
        cit = center["citation"]
        if cit:
            for r in conn.execute(
                f"SELECT {_J_COLS} FROM judgments WHERE precedent_status = 'OVERRULED' AND overruled_by LIKE ?",
                (f"%{cit}%",),
            ).fetchall():
                add_edge(node_for(r), cid, "overruled_by")
            # incoming: judgments that cite this one
            for r in conn.execute(
                f"SELECT {_J_COLS} FROM judgments WHERE cases_cited LIKE ? AND id != ?",
                (f"%{cit}%", center["id"]),
            ).fetchall():
                add_edge(node_for(r), cid, "cites")

        # overruled_by edges for any resolved overruled neighbour nodes
        for nid, n in list(nodes.items()):
            if n["precedent_status"] == "OVERRULED" and n["judgment_id"] and n["judgment_id"] != center["id"]:
                r = conn.execute(f"SELECT {_J_COLS} FROM judgments WHERE id = ?", (n["judgment_id"],)).fetchone()
                if r and r["overruled_by"]:
                    ref = _resolve_reference(conn, r["overruled_by"])
                    add_edge(nid, node_for(ref) if ref else ext_node(r["overruled_by"]), "overruled_by")

        return {
            "judgment_id": center["id"],
            "nodes": list(nodes.values()),
            "edges": edges,
            "is_linked": len(edges) > 0,
            "message": None if edges else "No citation links recorded yet",
        }
    finally:
        conn.close()


# ---------------------------------------------------------------- alerts
def _refs_from_draft(content: Dict[str, Any]):
    """Yield (source, id, case_id, citation, status_flag) from a draft's JSON."""
    for p in content.get("retrieved_precedents") or []:
        if isinstance(p, dict):
            yield ("retrieved_precedents", p.get("id"), p.get("case_id"), p.get("citation"), False)
    for v in content.get("verified_citations") or []:
        if not isinstance(v, dict):
            continue
        cd = v.get("case_data") if isinstance(v.get("case_data"), dict) else {}
        flagged = "OVERRULED" in str(v.get("status", "")).upper()
        yield ("verified_citations", cd.get("id"), cd.get("case_id"),
               cd.get("citation") or v.get("citation") or v.get("query_citation"), flagged)


@router.get("/api/alerts", dependencies=[Depends(require("DRAFT_FULL"))])
def list_alerts():
    conn = get_connection()
    try:
        overruled = conn.execute(
            f"SELECT {_J_COLS} FROM judgments WHERE precedent_status = 'OVERRULED'"
        ).fetchall()
        drafts = _load_drafts(conn, with_content=True)
    finally:
        conn.close()

    by_id = {o["id"]: o for o in overruled}
    by_case_id = {o["case_id"]: o for o in overruled if o["case_id"]}
    by_cit = {_norm_cit(o["citation"]): o for o in overruled if o["citation"]}

    alerts: List[Dict[str, Any]] = []
    for d in drafts:
        try:
            content = json.loads(d.get("draft_content_json") or "{}")
        except Exception:
            continue
        if not isinstance(content, dict):
            continue
        found: Dict[int, set] = {}
        for src, jid, case_id, cit, _flag in _refs_from_draft(content):
            o = (by_id.get(jid) if isinstance(jid, int) else None) \
                or by_case_id.get(case_id) or by_cit.get(_norm_cit(cit))
            if o is not None:
                found.setdefault(o["id"], set()).add(src)
        for oid, sources in found.items():
            o = by_id[oid]
            relied = "verified_citations" in sources
            alerts.append({
                "id": f"{d['id']}-{oid}",
                "draft_id": d["id"],
                "matter_key": d["matter_key_effective"],
                "case_number": d["case_number"],
                "case_title": d["case_title"],
                "draft_status": canonical_status(d["status"]),
                "overruled_case": {"id": o["id"], "title": o["title"], "citation": o["citation"]},
                "overruled_by": o["overruled_by"],
                "found_in": sorted(sources),
                "severity": "critical" if relied else "warning",
                "date_created": d["date_created"],
            })
    alerts.sort(key=lambda a: (a["severity"] != "critical", -a["draft_id"]))
    return {"alerts": alerts, "total": len(alerts)}

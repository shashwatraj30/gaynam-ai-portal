"""Courts list and saved searches (docs/API_V3_CONTRACT.md). /api/search itself lives in server.py."""
import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from auth import require
from database import get_connection
from audit_utils import log_audit

router = APIRouter()
MAX_SAVED = 50


class SavedSearchBody(BaseModel):
    name: str
    query: str
    filters: Optional[Dict[str, Any]] = None


def _err(status: int, code: str, message: str):
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def _item(r) -> Dict[str, Any]:
    try:
        filters = json.loads(r["filters_json"]) if r["filters_json"] else {}
    except ValueError:
        filters = {}
    return {"id": r["id"], "name": r["name"], "query": r["query"], "filters": filters, "created_at": r["created_at"]}


def _uid(user: Dict[str, Any]) -> str:
    return str(user.get("user_id") or user.get("email") or "")


@router.get("/api/courts")
def list_courts(_user: Dict[str, Any] = Depends(require("SEARCH"))):
    conn = get_connection()
    try:
        rows = conn.execute("SELECT court, COUNT(*) AS c FROM judgments WHERE court IS NOT NULL AND court != '' "
                            "GROUP BY court ORDER BY c DESC, court").fetchall()
    finally:
        conn.close()
    return {"items": [{"court": r["court"], "label": r["court"], "count": r["c"]} for r in rows]}


@router.get("/api/saved_searches")
def list_saved(user: Dict[str, Any] = Depends(require("SEARCH"))):
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM saved_searches WHERE user_id = ? ORDER BY id DESC", (_uid(user),)).fetchall()
    finally:
        conn.close()
    return {"items": [_item(r) for r in rows]}


@router.post("/api/saved_searches")
def create_saved(body: SavedSearchBody, request: Request, user: Dict[str, Any] = Depends(require("SEARCH"))):
    name, query = body.name.strip(), body.query.strip()
    if not name or len(name) > 120:
        raise _err(422, "INVALID_NAME", "Name is required (up to 120 characters).")
    if not query:
        raise _err(422, "INVALID_QUERY", "Query is required.")
    uid = _uid(user)
    conn = get_connection()
    try:
        if conn.execute("SELECT COUNT(*) FROM saved_searches WHERE user_id = ?", (uid,)).fetchone()[0] >= MAX_SAVED:
            raise _err(409, "LIMIT_REACHED", f"At most {MAX_SAVED} saved searches per user.")
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        cur = conn.execute("INSERT INTO saved_searches (user_id, name, query, filters_json, created_at) "
                           "VALUES (?, ?, ?, ?, ?)", (uid, name, query, json.dumps(body.filters or {}), now))
        conn.commit()
        row = conn.execute("SELECT * FROM saved_searches WHERE id = ?", (cur.lastrowid,)).fetchone()
    finally:
        conn.close()
    log_audit("SAVED_SEARCH_CREATED", f"saved search {row['id']} '{name}'", request=request, user=user)
    return _item(row)


@router.delete("/api/saved_searches/{search_id}")
def delete_saved(search_id: int, request: Request, user: Dict[str, Any] = Depends(require("SEARCH"))):
    conn = get_connection()
    try:
        cur = conn.execute("DELETE FROM saved_searches WHERE id = ? AND user_id = ?", (search_id, _uid(user)))
        conn.commit()
        deleted = cur.rowcount
    finally:
        conn.close()
    if not deleted:
        raise _err(404, "SAVED_SEARCH_NOT_FOUND", "Saved search not found.")
    log_audit("SAVED_SEARCH_DELETED", f"saved search {search_id}", request=request, user=user)
    return {"ok": True}

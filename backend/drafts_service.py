"""Draft service (v3): save/generate with document links, version snapshots and restore, status changes with a reason.

Handlers in server.py and draft_routes.py stay thin and call these functions. Failures raise DraftError, which carries
the HTTP status and the JSON body the handler returns (same shapes the existing handlers use).
"""
import json
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from database import get_connection

CANONICAL_STATUSES = ("DRAFT", "IN_REVIEW", "BENCH_APPROVED", "FINAL_SEALED", "RETURNED")
LEGACY_STATUS_MAP = {
    "CHAMBER_REVIEW": "IN_REVIEW", "UNDER_REVIEW": "IN_REVIEW", "REVIEW": "IN_REVIEW",
    "SUBMITTED": "IN_REVIEW", "APPROVED": "BENCH_APPROVED", "SIGNED": "FINAL_SEALED",
    "SEALED": "FINAL_SEALED", "FINALIZED": "FINAL_SEALED", "FINAL": "FINAL_SEALED",
}
ALLOWED_TRANSITIONS = {
    "DRAFT": {"IN_REVIEW"},
    "IN_REVIEW": {"BENCH_APPROVED", "RETURNED"},
    "BENCH_APPROVED": {"FINAL_SEALED", "RETURNED"},
    "RETURNED": {"DRAFT"},
    "FINAL_SEALED": set(),
}
MIN_REASON_CHARS = 5


class DraftError(Exception):
    """Carries the HTTP status and JSON body for the caller to return."""

    def __init__(self, status: int, detail: str, code: Optional[str] = None, **extra: Any):
        super().__init__(detail)
        self.status = status
        self.content: Dict[str, Any] = {"detail": detail}
        if code:
            self.content["code"] = code
        self.content.update(extra)


def normalise_status(value: Optional[str]) -> str:
    v = (value or "DRAFT").strip().upper().replace(" ", "_")
    return LEGACY_STATUS_MAP.get(v, v)


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _actor(user: Optional[Dict[str, Any]], fallback: Optional[str] = None) -> Optional[str]:
    user = user or {}
    return user.get("full_name") or user.get("email") or fallback


def _matter_key(case_number: str) -> str:
    try:
        from matters import normalise_matter_key
        return normalise_matter_key(case_number)
    except Exception:
        return re.sub(r"\s+", " ", (case_number or "").strip().lower())


def _record_version(conn, draft_id: int, version: int, saved_by: Optional[str], status: str,
                    snapshot: Optional[str] = None, note: Optional[str] = None):
    """Append-only history row (D4). Never raises into the save path."""
    try:
        conn.execute(
            "INSERT INTO draft_versions (draft_id, version, saved_at, saved_by, status, snapshot_json, note) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (draft_id, version, _now(), saved_by, status, snapshot, note))
    except Exception as e:
        print(f"draft_versions warning: {e}")


# ----------------- reads -----------------
def last_return_reason(draft_id: int, conn=None) -> Optional[str]:
    """Note of the latest RETURNED version, or None."""
    own = conn is None
    conn = conn or get_connection()
    try:
        row = conn.execute(
            "SELECT note FROM draft_versions WHERE draft_id = ? AND status = 'RETURNED' "
            "ORDER BY version DESC, id DESC LIMIT 1", (draft_id,)).fetchone()
    except Exception:
        row = None
    finally:
        if own:
            conn.close()
    note = row["note"] if row else None
    return note or None


def get_draft(draft_id: int) -> Dict[str, Any]:
    """The draft exactly as GET /api/draft/{id} returns it (plus last_return_reason)."""
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM draft_judgments WHERE id = ?", (draft_id,)).fetchone()
        if not row:
            raise DraftError(404, "Draft judgment not found")
        data = dict(row)
        data["last_return_reason"] = last_return_reason(draft_id, conn)
    finally:
        conn.close()
    data["status"] = normalise_status(data.get("status"))
    if isinstance(data.get("draft_content_json"), str):
        try:
            data["draft_content_json"] = json.loads(data["draft_content_json"])
        except Exception:
            pass
    return data


def list_versions(draft_id: int) -> List[Dict[str, Any]]:
    """Rows for GET /api/drafts/{id}/versions (now with note)."""
    conn = get_connection()
    try:
        if not conn.execute("SELECT 1 FROM draft_judgments WHERE id = ?", (draft_id,)).fetchone():
            raise DraftError(404, "Draft judgment not found")
        rows = conn.execute(
            "SELECT version, saved_at, saved_by, status, note FROM draft_versions WHERE draft_id = ? "
            "ORDER BY version DESC, id DESC", (draft_id,)).fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


def get_version_snapshot(draft_id: int, n: int) -> Dict[str, Any]:
    conn = get_connection()
    try:
        if not conn.execute("SELECT 1 FROM draft_judgments WHERE id = ?", (draft_id,)).fetchone():
            raise DraftError(404, "Draft judgment not found")
        row = conn.execute(
            "SELECT version, saved_at, saved_by, status, note, snapshot_json FROM draft_versions "
            "WHERE draft_id = ? AND version = ? ORDER BY id DESC LIMIT 1", (draft_id, n)).fetchone()
    finally:
        conn.close()
    if not row:
        raise DraftError(404, f"Version {n} not found", "VERSION_NOT_FOUND")
    snapshot = None
    if row["snapshot_json"]:
        try:
            snapshot = json.loads(row["snapshot_json"])
        except Exception:
            snapshot = None
    return {"version": row["version"], "saved_at": row["saved_at"], "saved_by": row["saved_by"],
            "status": normalise_status(row["status"]), "note": row["note"], "snapshot": snapshot}


# ----------------- restore -----------------
def restore_version(draft_id: int, n: int, expected_version: Optional[int], user: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Copy version n's content into a NEW version (history is never rewritten). Returns get_draft()."""
    conn = get_connection()
    try:
        row = conn.execute("SELECT status, COALESCE(version, 1) AS version FROM draft_judgments WHERE id = ?",
                           (draft_id,)).fetchone()
        if not row:
            raise DraftError(404, "Draft judgment not found")
        cur_status = normalise_status(row["status"])
        cur_version = row["version"]
        if cur_status == "FINAL_SEALED":
            raise DraftError(409, "Sealed drafts are immutable.", "DRAFT_SEALED", current_version=cur_version)
        if expected_version is not None and expected_version != cur_version:
            raise DraftError(409, "Draft was modified elsewhere.", "VERSION_CONFLICT", current_version=cur_version)
        src = conn.execute(
            "SELECT snapshot_json FROM draft_versions WHERE draft_id = ? AND version = ? ORDER BY id DESC LIMIT 1",
            (draft_id, n)).fetchone()
        if not src:
            raise DraftError(404, f"Version {n} not found", "VERSION_NOT_FOUND")
        if not src["snapshot_json"]:
            raise DraftError(422, f"Version {n} has no stored content to restore.", "NO_SNAPSHOT")
        who = _actor(user)
        new_version = cur_version + 1
        conn.execute("UPDATE draft_judgments SET draft_content_json = ?, reviewed_by = COALESCE(?, reviewed_by), version = ? WHERE id = ?",
                     (src["snapshot_json"], who, new_version, draft_id))
        _record_version(conn, draft_id, new_version, who, cur_status, src["snapshot_json"], f"Restored from v{n}")
        conn.commit()
    finally:
        conn.close()
    return get_draft(draft_id)


# ----------------- delete -----------------
def delete_draft(draft_id: int, user: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Hard-delete a draft and its version history. Refuses when the draft is FINAL_SEALED
    (finalized/digitally-signed judgments are the official court record and must never be deletable)."""
    conn = get_connection()
    try:
        row = conn.execute("SELECT status FROM draft_judgments WHERE id = ?", (draft_id,)).fetchone()
        if not row:
            raise DraftError(404, "Draft judgment not found")
        cur_status = normalise_status(row["status"])
        if cur_status == "FINAL_SEALED":
            raise DraftError(409, "This judgment has been finalized and digitally signed. "
                             "Finalized judgments are the official court record and cannot be deleted.",
                             "DRAFT_FINALIZED")
        conn.execute("DELETE FROM draft_versions WHERE draft_id = ?", (draft_id,))
        conn.execute("DELETE FROM draft_judgments WHERE id = ?", (draft_id,))
        conn.commit()
    finally:
        conn.close()
    return {"id": draft_id, "deleted": True}


# ----------------- status -----------------
def update_status_with_reason(draft_id: int, status: Optional[str], reason: Optional[str],
                              expected_version: Optional[int], user: Optional[Dict[str, Any]],
                              can_finalize: bool = True, reviewer_fallback: Optional[str] = None) -> Dict[str, Any]:
    """State-machine transition. Same response shape as the original handler. RETURNED needs a reason (>=5 chars)."""
    target = normalise_status(status or "IN_REVIEW")
    if target not in CANONICAL_STATUSES:
        raise DraftError(400, f"Unknown status '{target}'. Allowed: {', '.join(CANONICAL_STATUSES)}")
    reason = (reason or "").strip()
    if target == "RETURNED" and len(reason) < MIN_REASON_CHARS:
        raise DraftError(422, f"A reason of at least {MIN_REASON_CHARS} characters is required to return a draft.",
                         "REASON_REQUIRED")
    conn = get_connection()
    try:
        row = conn.execute("SELECT status, COALESCE(version, 1) AS version FROM draft_judgments WHERE id = ?",
                           (draft_id,)).fetchone()
        if not row:
            raise DraftError(404, "Draft judgment not found")
        current = normalise_status(row["status"])
        if expected_version is not None and expected_version != row["version"]:
            raise DraftError(409, "Draft was modified elsewhere.", "VERSION_CONFLICT", current_version=row["version"])
        if target != current and target not in ALLOWED_TRANSITIONS.get(current, set()):
            raise DraftError(409, f"Illegal transition {current} -> {target}.", "ILLEGAL_TRANSITION",
                             current_status=current, allowed=sorted(ALLOWED_TRANSITIONS.get(current, set())))
        if target in ("BENCH_APPROVED", "FINAL_SEALED") and target != current and not can_finalize:
            raise DraftError(403, "FINALIZE_JUDGMENT permission required to approve or seal.", "FORBIDDEN_PERMISSION")
        reviewer = _actor(user, reviewer_fallback)
        new_version = row["version"] + 1
        conn.execute("UPDATE draft_judgments SET status = ?, reviewed_by = ?, version = ? WHERE id = ?;",
                     (target, reviewer, new_version, draft_id))
        _record_version(conn, draft_id, new_version, reviewer, target, None, reason or None)
        conn.commit()
    finally:
        conn.close()
    return {"success": True, "draft_id": draft_id, "status": target, "new_status": target,
            "previous_status": current, "version": new_version, "reviewer": reviewer, "reason": reason or None}


# ----------------- save -----------------
def _with_meta(content: Any, prayer: Optional[str], outcome: Optional[str]) -> str:
    """Prayer/outcome live inside draft_content_json under "meta" (no schema change)."""
    if not isinstance(content, dict):
        content = {"sections": content}
    if prayer is not None or outcome is not None:
        meta = dict(content.get("meta") or {}) if isinstance(content.get("meta"), dict) else {}
        if prayer is not None:
            meta["prayer"] = prayer
        if outcome is not None:
            meta["outcome"] = outcome
        content = {**content, "meta": meta}
    return json.dumps(content)


def save_draft(data: Dict[str, Any], user: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Create or update a draft. `data` holds the SaveDraftRequest fields (incl. document_id, petitioner, respondent,
    prayer, outcome). Returns {success, draft_id, version, status}; raises DraftError for 409s."""
    case_title = data.get("case_title") or ""
    case_number = data.get("case_number") or ""
    parts = re.split(r'\s+(?:v\.|vs\.?|versus)\s+', case_title.strip(), maxsplit=1, flags=re.IGNORECASE)
    pet_name = (data.get("petitioner") or "").strip() or (
        parts[0].strip() if len(parts) == 2 and parts[0].strip() else (case_title.strip() or "Petitioner"))
    resp_name = (data.get("respondent") or "").strip() or (
        parts[1].strip() if len(parts) == 2 and parts[1].strip() else "State / Respondent")
    mkey = _matter_key(case_number)
    reviewer = _actor(user, data.get("reviewed_by"))
    document_id = (data.get("document_id") or None)
    content_json = _with_meta(data.get("draft_content_json") or {}, data.get("prayer"), data.get("outcome"))
    draft_id = data.get("draft_id")

    conn = get_connection()
    try:
        if draft_id:
            existing = conn.execute("SELECT status, COALESCE(version, 1) AS version, document_id FROM draft_judgments WHERE id = ?",
                                    (draft_id,)).fetchone()
            if existing:
                cur_status = normalise_status(existing["status"])
                cur_version = existing["version"]
                if data.get("version") is not None and data["version"] != cur_version:
                    raise DraftError(409, "Draft was modified elsewhere.", "VERSION_CONFLICT", current_version=cur_version)
                if cur_status == "FINAL_SEALED":
                    raise DraftError(409, "Sealed drafts are immutable.", "DRAFT_SEALED", current_version=cur_version)
                new_version = cur_version + 1
                conn.execute("""
                UPDATE draft_judgments
                SET case_title = ?, case_number = ?, court = ?, petitioner = ?, respondent = ?,
                    facts = ?, issues = ?, petitioner_arguments = ?, respondent_arguments = ?,
                    statutory_provisions = ?, draft_content_json = ?, reviewed_by = ?,
                    matter_key = ?, version = ?, document_id = COALESCE(?, document_id)
                WHERE id = ?;
                """, (
                    case_title, case_number, data.get("court"), pet_name, resp_name,
                    data.get("facts"), data.get("issues"), data.get("petitioner_arguments"),
                    data.get("respondent_arguments"), data.get("statutory_provisions"), content_json,
                    reviewer, mkey, new_version, document_id, draft_id))
                _record_version(conn, draft_id, new_version, reviewer, cur_status, content_json)
                conn.commit()
                return {"success": True, "draft_id": draft_id, "version": new_version, "status": cur_status,
                        "document_id": document_id or existing["document_id"]}

        cur = conn.execute("""
        INSERT INTO draft_judgments (
            case_title, case_number, court, date_created, petitioner, respondent,
            facts, issues, petitioner_arguments, respondent_arguments, statutory_provisions,
            draft_content_json, status, reviewed_by, matter_key, version, document_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?);
        """, (
            case_title, case_number, data.get("court"), datetime.now().strftime("%Y-%m-%d %H:%M"),
            pet_name, resp_name, data.get("facts"), data.get("issues"), data.get("petitioner_arguments"),
            data.get("respondent_arguments"), data.get("statutory_provisions"), content_json,
            "DRAFT", reviewer, mkey, document_id))
        new_id = cur.lastrowid
        _record_version(conn, new_id, 1, reviewer, "DRAFT", content_json)
        conn.commit()
        return {"success": True, "draft_id": new_id, "version": 1, "status": "DRAFT", "document_id": document_id}
    finally:
        conn.close()


# ----------------- generate -----------------
def _document_pins(document_id: str) -> List[Dict[str, Any]]:
    """Authorities pinned to a document (best effort; empty when none or the tables are missing)."""
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT j.id, j.title, j.citation, j.court, j.precedent_status AS status FROM document_pins p "
            "JOIN judgments j ON j.id = p.judgment_id WHERE p.document_id = ? ORDER BY p.id", (document_id,)).fetchall()
        return [dict(r) for r in rows]
    except Exception:
        return []
    finally:
        conn.close()


def generate_draft(data: Dict[str, Any]) -> Dict[str, Any]:
    """Run the judgment engine for a DraftRequest dict. Honours sections / current / outcome / authorities."""
    from judgment_engine import generate_15_section_judgment
    authorities = data.get("authorities")
    if not authorities and data.get("document_id"):
        authorities = _document_pins(data["document_id"])
    result = generate_15_section_judgment(
        case_title=data.get("case_title") or "",
        case_number=data.get("case_number") or "",
        court=data.get("court") or "",
        facts=data.get("facts") or "",
        petitioner_arguments=data.get("petitioner_arguments") or "",
        respondent_arguments=data.get("respondent_arguments") or "",
        issues=data.get("issues") or "",
        statutory_provisions=data.get("statutory_provisions") or "",
        api_key=data.get("gemini_api_key"),
        only_sections=data.get("sections") or None,
        current=data.get("current") or None,
        outcome=data.get("outcome") or None,
        authorities=authorities or None,
    )
    result["case_title"] = data.get("case_title")
    result["case_number"] = data.get("case_number")
    result["court"] = data.get("court")
    result["generation_mode"] = result.get("engine", "Gyanam Neural Judicial Synthesis Engine")
    result["draft_content_json"] = {**result.get("sections", {}), "engine": result.get("engine")}
    if data.get("document_id"):
        result["document_id"] = data["document_id"]
    return result

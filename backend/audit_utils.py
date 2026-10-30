"""Single shared audit logger (Bug 4).

Why this module exists: ``log_audit`` used to be copy-pasted into server.py and search_service.py
(search_service is imported *by* server, so it could not import server back). The copies could
drift and both swallowed ledger failures, leaving audit_logs rows with no cryptographic-ledger
block. This module depends only on auth / audit_dpdp / database -- none of which import server or
search_service -- so every caller can import it without a cycle.

Two stages:
  A. INSERT into audit_logs (the system of record). If this fails the exception propagates.
  B. Append a block to the tamper-evident ledger (audit_dpdp). Failure here is retried with a short
     jittered backoff and, if it still fails, the audit_logs row is left flagged ledger_synced = 0
     so POST /api/admin/audit/resync-ledger can repair it later. It never raises to the caller.

Row lifecycle: the row is inserted with ledger_synced = 0 and flipped to 1 only once the ledger
block exists. A crash between A and B therefore leaves a *pending* row, never a silently
unmirrored "synced" one.
"""
import logging
import random
import time
from datetime import datetime
from typing import Any, Dict, Optional

from auth import get_client_ip, decode_access_token
from audit_dpdp import record_tamper_evident_event
from database import get_connection

logger = logging.getLogger(__name__)

LEDGER_RETRIES = 3


def _resolve_actor(request, user):
    if user is None and request is not None:
        user = getattr(request.state, "user", None)
        if user is None:
            auth = request.headers.get("authorization", "")
            if auth.startswith("Bearer "):
                try:
                    user = decode_access_token(auth.split(" ", 1)[1].strip())
                except Exception:
                    user = None
    return user


def log_audit(action: str, details: str, role: Optional[str] = None,
              request=None, user: Optional[Dict[str, Any]] = None) -> None:
    """Write an audit_logs row, then mirror it into the hash-chain ledger.

    Signature and recorded values are identical to the former server.log_audit (``role`` is the
    third positional parameter, so existing positional call sites keep working).
    Raises only if the audit_logs INSERT itself fails; ledger failures are retried and, if they
    persist, recorded as ledger_synced = 0.
    """
    user = _resolve_actor(request, user)
    if user:
        user_name = user.get("full_name") or user.get("email") or "unknown"
        user_role = role or user.get("role") or "UNKNOWN"
    else:
        user_name = "Hon'ble User (NLUJ)" if request is None else "anonymous"
        user_role = role or "Hon'ble Justice / Judicial User"
    ip = get_client_ip(request)

    conn = get_connection()
    try:
        row_id = conn.execute(
            "INSERT INTO audit_logs (timestamp, user_name, user_role, action, details, ip_address, ledger_synced) "
            "VALUES (?, ?, ?, ?, ?, ?, 0)",
            (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), user_name, user_role, action, details, ip),
        ).lastrowid
        conn.commit()
    finally:
        conn.close()

    _try_ledger_write(row_id, user_name, user_role, action, details, ip)


def _set_synced(row_id: int, value: int) -> bool:
    try:
        conn = get_connection()
        try:
            conn.execute("UPDATE audit_logs SET ledger_synced = ? WHERE id = ?", (value, row_id))
            conn.commit()
        finally:
            conn.close()
        return True
    except Exception:
        logger.exception("Could not set ledger_synced=%s on audit_logs row %s", value, row_id)
        return False


def _try_ledger_write(row_id: int, user_name: str, user_role: str, action: str, details: str,
                      ip: str, retries: int = LEDGER_RETRIES) -> bool:
    """Append the ledger block for audit_logs row ``row_id`` (idempotent on audit_log_id).

    Returns True and sets ledger_synced = 1 on success; after ``retries`` failed attempts logs the
    error, leaves/sets ledger_synced = 0 and returns False. Never raises.
    """
    for attempt in range(retries):
        try:
            record_tamper_evident_event(user_name, user_role, action, details, ip, audit_log_id=row_id)
            _set_synced(row_id, 1)
            return True
        except Exception:
            if attempt == retries - 1:
                logger.exception("Ledger write failed for audit_logs row %s after %s attempts", row_id, retries)
                _set_synced(row_id, 0)
            else:
                time.sleep(0.05 * (attempt + 1) + random.uniform(0, 0.02))
    return False


def resync_pending_ledger() -> Dict[str, int]:
    """Re-attempt the ledger write for every audit_logs row with ledger_synced = 0.

    Idempotent: rows flipped to 1 by a concurrent process are skipped, and
    record_tamper_evident_event itself refuses to append a second block for an audit_log_id that
    already has one. Creates NO new audit_logs rows (the caller logs one summary event).

    Chain-order note (audit_dpdp.py): the ledger is linked strictly by insertion order -- each new
    block's prev_hash is the current_hash of ``ORDER BY id DESC LIMIT 1`` (line ~58) and
    verify_ledger_integrity walks ``ORDER BY id ASC`` (line ~80); timestamps are only hashed
    content, never used for ordering. So appending a block for an old audit row keeps
    verification valid. The block's own timestamp is the time of appending (generated inside
    record_tamper_evident_event); the original audit timestamp stays on the audit_logs row and is
    linked via ledger.audit_log_id.
    """
    conn = get_connection()
    try:
        pending = [dict(r) for r in conn.execute(
            "SELECT id FROM audit_logs WHERE ledger_synced = 0 ORDER BY id ASC").fetchall()]
    finally:
        conn.close()
    resynced = 0
    still = 0
    for p in pending:
        conn = get_connection()
        try:
            row = conn.execute(
                "SELECT id, user_name, user_role, action, details, ip_address, ledger_synced "
                "FROM audit_logs WHERE id = ?", (p["id"],)).fetchone()
        finally:
            conn.close()
        if row is None or row["ledger_synced"] == 1:
            continue  # raced with another process / row gone
        ok = _try_ledger_write(row["id"], row["user_name"], row["user_role"], row["action"],
                               row["details"] or "", row["ip_address"] or "127.0.0.1")
        if ok:
            resynced += 1
        else:
            still += 1
    return {"pending_before": len(pending), "resynced": resynced, "still_pending": still}

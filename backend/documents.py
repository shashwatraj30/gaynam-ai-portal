"""Documents service (docs/API_V3_CONTRACT.md): intake, redacted text, versioned extraction, pins, research.

Routes live in document_routes.py. Only the redacted text is ever stored or returned; the original bytes stay
on disk under uploads/ and are served by the file route. Nothing is invented: unreadable files give
source "failed" with empty text and empty fields.
"""
import hashlib
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database import get_connection

DOC_TYPES = ("FIR", "PLAINT", "WRITTEN_STATEMENT", "PETITION", "COUNTER_AFFIDAVIT", "REJOINDER", "APPEAL",
             "APPLICATION", "EVIDENCE_SUMMARY", "PREVIOUS_ORDER", "SUBMISSIONS", "OTHER")
STATUSES = ("READ", "CONFIRMED", "ARCHIVED")
FIELD_KEYS = ("court", "case_number", "case_title", "petitioner", "respondent", "facts", "prayer",
              "statutory_provisions", "petitioner_arguments", "respondent_arguments")
MAX_PINS = 5
MAX_ISSUES = 30
MAX_FIELD_CHARS = 200000
SAMPLE_NAMES = ("pleading", "degraded", "fir_04_17", "fir_06_17")
SAMPLE_FIR_FILES = {"fir_04_17": "handwritten_fir_sample.jpg", "fir_06_17": "fir_06_puja_ghosh_sample.jpg"}
SAMPLE_TITLES = {
    "pleading": "Sample writ petition (fictional)", "degraded": "Sample degraded scan (fictional)",
    "fir_04_17": "Sample FIR 04/17 (handwritten)", "fir_06_17": "Sample FIR 06/17",
}
SAMPLE_DOC_TYPES = {"pleading": "PETITION", "degraded": "PETITION", "fir_04_17": "FIR", "fir_06_17": "FIR"}

# Fictional demo documents, transcribed from frontend/app/js/pages/lib/intake-samples.js.
SAMPLE_PLEADING = """IN THE HIGH COURT OF JUDICATURE FOR RAJASTHAN AT JODHPUR
S.B. CIVIL WRIT PETITION NO. 4521 OF 2023

BETWEEN:
Shri Rajendra Prasad Meena, S/o Late Shri B.L. Meena,
Resident of 14, Mandore Road, Jodhpur (Raj.)
... PETITIONER

VERSUS

1. State of Rajasthan through Secretary, Secondary Education Department, Jaipur.
2. The Director, Secondary Education, Bikaner.
... RESPONDENTS

WRIT PETITION UNDER ARTICLE 226 OF THE CONSTITUTION OF INDIA

SYNOPSIS AND FACTS:
1. The petitioner was substantively appointed as Senior Teacher (Mathematics) in Government Higher Secondary School, Osian, District Jodhpur.
2. In the year 2021, an inquiry under Rule 16 of the Rajasthan Civil Services (Classification, Control and Appeal) Rules, 1958 was initiated against the petitioner on charges of administrative lapses.
3. The Inquiry Officer concluded the inquiry and submitted an adverse report directly to Respondent No. 2 (Disciplinary Authority).
4. The Disciplinary Authority, without forwarding a copy of the inquiry report to the petitioner and without providing an opportunity to submit a representation against the findings, passed an order dated 14.03.2023 dismissing the petitioner from service.
5. Being aggrieved, the petitioner preferred an appeal which was also dismissed summarily without reasoned order.

GROUNDS:
A. Because non-supply of the Inquiry Officer's report to the delinquent employee before imposing the penalty of dismissal violates the foundational principles of natural justice and Article 311(2) of the Constitution of India.
B. Because the Constitutional Bench of the Hon'ble Supreme Court in Managing Director, ECIL v. B. Karunakar, (1993) 4 SCC 727, has definitively ruled that denial of the inquiry report constitutes prejudice per se.
C. Because Rule 16 of the Rajasthan CCA Rules, 1958 obligates the Disciplinary Authority to adhere strictly to procedural fairness.

PRAYER:
Wherefore, it is most respectfully prayed that this Hon'ble Court may graciously be pleased to:
(i) Issue an appropriate writ, order or direction quashing the impugned dismissal order dated 14.03.2023.
(ii) Direct the respondents to reinstate the petitioner with all consequential service benefits."""

# Scan-like text with irregular spacing and fake personal identifiers, to show cleaning and redaction.
SAMPLE_DEGRADED = """IN  THE   HIGH   COURT  OF   JUDICATURE   FOR   RAJASTHAN   AT   JODHPUR
S.B.  CRIMINAL   MISC.  PETITION   NO.   3942  OF   2024

M/s  Marwar  Granite  Industries  Pvt.  Ltd.   ...  PETITIONER
VERSUS
State  of  Rajasthan  &  Shri  Omprakash  Bishnoi  (Aadhaar  No:  4829  1048  9921,  PAN:  ABCPB4829K,  Mob:  9829012345)   ...  RESPONDENTS

PETITION  u / s  482  Cr . P . C .  FOR  QUASHING  OF  COMPLAINT  u / s  138  N . I .  ACT

FACTS  &  GROUNDS:
1. The  respondent  filed  a  complaint  u/s  138  of  Negotiable  Instruments  Act  alleging  cheque  dishonour  of  Rs.  25,00,000/-.
2. The  petitioner  submits  that  the  cheque  was  handed  over  purely  as  security  for  an  incomplete  quarrying  contract  and  there  existed  no  legally  enforceable  debt.
3. The  learned  Magistrate  failed  to  appreciate  that  the  statutory  presumption  u/s  139  N.I.  Act  stands  rebutted  on  preponderance  of  probabilities.
4. Reliance  is  placed  on  Rangappa  v.  Sri  Mohan  (2010)  11  SCC  441.  The  impugned  summoning  order  violates  settled  precedents."""


class DocError(Exception):
    def __init__(self, status: int, code: str, message: str, **extra: Any):
        super().__init__(message)
        self.status, self.code, self.message, self.extra = status, code, message, extra

    def detail(self) -> Dict[str, Any]:
        return {"code": self.code, "message": self.message, **self.extra}


# ---------------------------------------------------------------- helpers
def _server():
    """The running server module (works when server.py is run as __main__ or imported as 'server')."""
    mod = sys.modules.get("server")
    if mod is not None and hasattr(mod, "save_upload"):
        return mod
    main = sys.modules.get("__main__")
    if main is not None and hasattr(main, "save_upload") and hasattr(main, "log_audit"):
        return main
    import server  # noqa: WPS433  (lazy: server imports this package's router at the end of its own import)
    return server


def audit(action: str, doc: Dict[str, Any], extra: str, request=None, user: Optional[Dict[str, Any]] = None) -> None:
    details = f"document {doc['id']}"
    if extra:
        details += f": {extra}"
    if doc.get("matter_key"):
        details += f" matter {doc['matter_key']}"
    _server().log_audit(action, details, request=request, user=user)


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _actor(user: Optional[Dict[str, Any]]) -> str:
    user = user or {}
    return user.get("full_name") or user.get("email") or "unknown"


def _str(v: Any, cap: int = MAX_FIELD_CHARS) -> str:
    if v is None:
        return ""
    return str(v).strip()[:cap]


def normalise_fields(raw: Any) -> Dict[str, str]:
    raw = raw if isinstance(raw, dict) else {}
    return {k: _str(raw.get(k)) for k in FIELD_KEYS}


def normalise_issues(raw: Any) -> List[str]:
    out: List[str] = []
    for it in raw if isinstance(raw, list) else []:
        s = _str(it, 2000)
        if s:
            out.append(s)
    return out[:MAX_ISSUES]


def _issue_query(issue: str) -> str:
    return re.sub(r"^\s*\(?[A-Za-z0-9]{1,2}[.)]\s+", "", issue or "").strip()


def authorities_for(text: str) -> List[Dict[str, Any]]:
    """Citations found in the text, checked against the corpus (status as citation_verifier reports it)."""
    try:
        from citation_verifier import extract_citations_from_text, verify_citation
    except Exception:
        return []
    out: List[Dict[str, Any]] = []
    for cit in extract_citations_from_text(text or "")[:40]:
        try:
            r = verify_citation(cit)
        except Exception:
            continue
        cd = r.get("case_data") or {}
        out.append({
            "citation": r.get("citation") or cit, "status": r.get("status"),
            "matched_title": cd.get("title"), "matched_id": cd.get("id"),
            "source_pdf_url": _pdf_url_for(cd.get("id")),
        })
    return out


def _pdf_url_for(jid: Optional[int]) -> Optional[str]:
    if not jid:
        return None
    conn = get_connection()
    try:
        row = conn.execute("SELECT source_pdf_url FROM judgments WHERE id = ?", (jid,)).fetchone()
        return row["source_pdf_url"] if row else None
    finally:
        conn.close()


# ---------------------------------------------------------------- row -> dict
def _redactions(row) -> List[Dict[str, Any]]:
    try:
        v = json.loads(row["redactions_json"] or "[]")
        return v if isinstance(v, list) else []
    except Exception:
        return []


def _latest_extraction(conn, doc_id: str):
    return conn.execute("SELECT * FROM document_extractions WHERE document_id = ? ORDER BY version DESC LIMIT 1",
                        (doc_id,)).fetchone()


def _extraction_dict(row) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    try:
        fields = normalise_fields(json.loads(row["fields_json"] or "{}"))
        issues = normalise_issues(json.loads(row["issues_json"] or "[]"))
        auth = json.loads(row["authorities_json"] or "[]")
    except Exception:
        fields, issues, auth = normalise_fields({}), [], []
    return {"version": row["version"], "confirmed": bool(row["confirmed"]), "saved_by": row["saved_by"],
            "saved_at": row["saved_at"], "fields": fields, "issues": issues, "authorities": auth}


def doc_dict(conn, row, detail: bool = False, light: bool = False) -> Dict[str, Any]:
    """Document shape. ``light`` (list rows) drops extraction text: only key identifiers and the issue count."""
    reds = _redactions(row)
    ex = _extraction_dict(_latest_extraction(conn, row["id"]))
    if light and ex:
        f = ex["fields"]
        ex = {"version": ex["version"], "confirmed": ex["confirmed"], "saved_by": ex["saved_by"],
              "saved_at": ex["saved_at"],
              "fields": {k: f[k] for k in ("case_title", "case_number", "court", "petitioner", "respondent")},
              "issues_count": len(ex["issues"])}
    d = {
        "id": row["id"], "title": row["title"], "doc_type": row["doc_type"], "status": row["status"],
        "source": row["source"], "matter_key": row["matter_key"] or "", "original_name": row["original_name"],
        "mime": row["mime"], "size": row["size"], "sha256": row["sha256"], "chars": row["chars"],
        "pages": row["pages"], "redactions": reds,
        "redaction_total": sum(int(r.get("count") or 0) for r in reds),
        "uploaded_by": row["uploaded_by"], "uploaded_role": row["uploaded_role"],
        "created_at": row["created_at"], "updated_at": row["updated_at"],
        "extraction": ex,
        "pins_count": conn.execute("SELECT COUNT(*) FROM document_pins WHERE document_id = ?", (row["id"],)).fetchone()[0],
    }
    if detail:
        d["drafts"] = [
            {"id": r["id"], "case_title": r["case_title"], "status": r["status"], "version": r["version"]}
            for r in conn.execute(
                "SELECT id, case_title, status, COALESCE(version, 1) AS version FROM draft_judgments "
                "WHERE document_id = ? ORDER BY id DESC", (row["id"],)).fetchall()]
    return d


def _get_row(conn, doc_id: str):
    row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    if not row:
        raise DocError(404, "DOCUMENT_NOT_FOUND", "Document not found.")
    return row


def _writable(row) -> None:
    if row["status"] == "ARCHIVED":
        raise DocError(409, "DOCUMENT_ARCHIVED", "Archived documents are read-only.")


def _check_doc_type(v: Any) -> str:
    v = str(v or "OTHER").strip().upper()
    if v not in DOC_TYPES:
        raise DocError(422, "INVALID_DOC_TYPE", f"doc_type must be one of: {', '.join(DOC_TYPES)}.")
    return v


# ---------------------------------------------------------------- intake
def _sample_text(name: str) -> Dict[str, Any]:
    """Return {text, source_bytes, original_name, mime, path} for a sample name."""
    server = _server()
    if name in ("pleading", "degraded"):
        text = SAMPLE_PLEADING if name == "pleading" else SAMPLE_DEGRADED
        return {"kind": "text", "text": text}
    fname = SAMPLE_FIR_FILES[name]
    path = os.path.join(server.FRONTEND_DIR, fname)
    return {"kind": "image", "path": path, "exists": os.path.isfile(path), "original_name": fname}


def create_document(*, user: Dict[str, Any], request, saved: Optional[Dict[str, Any]], text: Optional[str],
                    sample: Optional[str], doc_type: str, title: str, matter_key: str) -> Dict[str, Any]:
    from ocr_engine import clean_ocr_text, anonymize_pii, process_scanned_brief

    doc_type = _check_doc_type(doc_type)
    sample = (sample or "").strip().lower() or None
    if sample and sample not in SAMPLE_NAMES:
        raise DocError(422, "INVALID_SAMPLE", f"sample must be one of: {', '.join(SAMPLE_NAMES)}.")
    if not (saved or sample or (text is not None and text.strip())):
        raise DocError(422, "NO_INPUT", "Provide a file, pasted text or a sample.")

    server = _server()
    stored_name = original_name = None
    mime = "text/plain"
    raw_bytes = b""
    pages = None
    redactions: List[Dict[str, Any]] = []
    full_text = ""
    source = "failed"

    if saved:  # real upload
        original_name, stored_name, raw_bytes = saved["original_name"], saved["stored_name"], saved["bytes"]
        mime = _mime_for(original_name)
        res = process_scanned_brief(saved["path"])
        full_text = res.get("full_text") or ""
        redactions = res.get("redactions") or []
        pages = res.get("pages")
        source = {"digital_text": "digital", "ocr": "ocr", "vlm": "vlm"}.get(res.get("source"), "failed")
    elif sample:
        info = _sample_text(sample)
        if info["kind"] == "text":
            cleaned = clean_ocr_text(info["text"])
            an = anonymize_pii(cleaned)
            full_text, redactions = an["anonymized_text"], an["redactions"]
            raw_bytes = info["text"].encode("utf-8")
        else:
            res = process_scanned_brief(info["path"], sample=True)
            full_text = res.get("full_text") or ""
            redactions = res.get("redactions") or []
            pages = 1
            original_name, mime = info["original_name"], "image/jpeg"
            if info["exists"]:
                with open(info["path"], "rb") as f:
                    raw_bytes = f.read()
                os.makedirs(server.UPLOAD_DIR, exist_ok=True)
                stored_name = f"{uuid.uuid4().hex}.jpg"
                with open(os.path.join(server.UPLOAD_DIR, stored_name), "wb") as f:
                    f.write(raw_bytes)
        source = "sample"
        title = title or SAMPLE_TITLES[sample]
        if doc_type == "OTHER":
            doc_type = SAMPLE_DOC_TYPES[sample]
    else:  # pasted text
        raw_bytes = text.encode("utf-8")
        cleaned = clean_ocr_text(text)
        an = anonymize_pii(cleaned)
        full_text, redactions = an["anonymized_text"], an["redactions"]
        source = "pasted"

    if not full_text.strip():
        full_text, source, redactions = "", "failed", []

    from document_parser import extract_fields
    fields, issues = extract_fields(full_text)
    doc_id = uuid.uuid4().hex
    ts = now_iso()
    actor = _actor(user)
    title = (title or "").strip() or fields["case_title"] or (os.path.splitext(original_name)[0] if original_name else "") \
        or "Untitled document"
    matter_key = (matter_key or "").strip()

    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO documents (id, matter_key, doc_type, title, original_name, stored_name, mime, size, sha256, "
            "source, status, chars, pages, redactions_json, uploaded_by, uploaded_role, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (doc_id, matter_key or None, doc_type, title[:300], original_name, stored_name, mime, len(raw_bytes),
             hashlib.sha256(raw_bytes).hexdigest(), source, "READ", len(full_text), pages, json.dumps(redactions),
             actor, (user or {}).get("role"), ts, ts))
        conn.execute("INSERT INTO document_text (document_id, text_redacted) VALUES (?, ?)", (doc_id, full_text))
        conn.execute(
            "INSERT INTO document_extractions (document_id, version, fields_json, issues_json, authorities_json, "
            "confirmed, saved_by, saved_at) VALUES (?,?,?,?,?,0,?,?)",
            (doc_id, 1, json.dumps(fields), json.dumps(issues), json.dumps(authorities_for(full_text)), actor, ts))
        conn.commit()
        row = _get_row(conn, doc_id)
        out = doc_dict(conn, row)
    finally:
        conn.close()
    audit("DOCUMENT_UPLOADED", out,
          f"{title} [{doc_type}, source {source}, {len(full_text)} chars, "
          f"{out['redaction_total']} redactions]", request=request, user=user)
    return out


def _mime_for(name: str) -> str:
    ext = os.path.splitext(name or "")[1].lower()
    return {".pdf": "application/pdf", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".txt": "text/plain", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".tif": "image/tiff", ".tiff": "image/tiff"}.get(ext, "application/octet-stream")


# ---------------------------------------------------------------- reads
def list_documents(*, matter_key: str = "", doc_type: str = "", status: str = "", q: str = "",
                   limit: int = 25, offset: int = 0) -> Dict[str, Any]:
    limit = max(1, min(int(limit or 25), 100))
    offset = max(0, int(offset or 0))
    where, args = [], []
    status = (status or "").strip().upper()
    if status:
        if status not in STATUSES:
            raise DocError(422, "INVALID_STATUS", f"status must be one of: {', '.join(STATUSES)}.")
        where.append("status = ?")
        args.append(status)
    else:
        where.append("status != 'ARCHIVED'")
    if matter_key.strip():
        where.append("matter_key = ?")
        args.append(matter_key.strip())
    if doc_type.strip():
        where.append("doc_type = ?")
        args.append(_check_doc_type(doc_type))
    if q.strip():
        like = f"%{q.strip()}%"
        where.append("(title LIKE ? OR original_name LIKE ? OR matter_key LIKE ?)")
        args += [like, like, like]
    clause = " WHERE " + " AND ".join(where)
    conn = get_connection()
    try:
        total = conn.execute(f"SELECT COUNT(*) FROM documents{clause}", args).fetchone()[0]
        rows = conn.execute(f"SELECT * FROM documents{clause} ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?",
                            args + [limit, offset]).fetchall()
        return {"items": [doc_dict(conn, r, light=True) for r in rows], "total": total}
    finally:
        conn.close()


def get_document(doc_id: str) -> Dict[str, Any]:
    conn = get_connection()
    try:
        return doc_dict(conn, _get_row(conn, doc_id), detail=True)
    finally:
        conn.close()


def get_text(doc_id: str, offset: int, limit: int) -> Dict[str, Any]:
    conn = get_connection()
    try:
        _get_row(conn, doc_id)
        r = conn.execute("SELECT text_redacted FROM document_text WHERE document_id = ?", (doc_id,)).fetchone()
        text = (r["text_redacted"] if r else "") or ""
        offset = max(0, offset)
        return {"text": text[offset:offset + limit], "offset": offset, "total_chars": len(text)}
    finally:
        conn.close()


def file_info(doc_id: str):
    """(path, mime, original_name, doc dict) of the stored original; 404 when there is none."""
    conn = get_connection()
    try:
        row = _get_row(conn, doc_id)
        d = doc_dict(conn, row)
        stored = row["stored_name"]
    finally:
        conn.close()
    if not stored:
        raise DocError(404, "FILE_NOT_AVAILABLE", "No original file is stored for this document.")
    path = os.path.join(_server().UPLOAD_DIR, os.path.basename(stored))
    if not os.path.isfile(path):
        raise DocError(404, "FILE_NOT_AVAILABLE", "The stored file is missing.")
    return path, row["mime"] or "application/octet-stream", row["original_name"] or stored, d


# ---------------------------------------------------------------- writes
def patch_document(doc_id: str, body: Dict[str, Any], user, request) -> Dict[str, Any]:
    conn = get_connection()
    try:
        row = _get_row(conn, doc_id)
        _writable(row)
        sets, args, changed = [], [], []
        if body.get("title") is not None:
            t = str(body["title"]).strip()
            if not t:
                raise DocError(422, "INVALID_TITLE", "title cannot be empty.")
            sets.append("title = ?"); args.append(t[:300]); changed.append("title")
        if body.get("doc_type") is not None:
            sets.append("doc_type = ?"); args.append(_check_doc_type(body["doc_type"])); changed.append("doc_type")
        if body.get("matter_key") is not None:
            sets.append("matter_key = ?"); args.append(str(body["matter_key"]).strip() or None); changed.append("matter_key")
        if sets:
            sets.append("updated_at = ?"); args.append(now_iso())
            conn.execute(f"UPDATE documents SET {', '.join(sets)} WHERE id = ?", args + [doc_id])
            conn.commit()
        out = doc_dict(conn, _get_row(conn, doc_id), detail=True)
    finally:
        conn.close()
    audit("DOCUMENT_UPDATED", out, f"updated {', '.join(changed) or 'nothing'}", request=request, user=user)
    return out


def _check_version(conn, doc_id: str, version: Any):
    latest = _latest_extraction(conn, doc_id)
    cur = latest["version"] if latest else 0
    try:
        ok = int(version) == cur
    except (TypeError, ValueError):
        ok = False
    if not ok:
        raise DocError(409, "VERSION_CONFLICT", "The extraction was changed elsewhere.", current_version=cur)
    return latest


def save_extraction(doc_id: str, body: Dict[str, Any], user, request) -> Dict[str, Any]:
    fields = normalise_fields(body.get("fields"))
    issues = normalise_issues(body.get("issues"))
    conn = get_connection()
    try:
        row = _get_row(conn, doc_id)
        _writable(row)
        latest = _check_version(conn, doc_id, body.get("version"))
        t = conn.execute("SELECT text_redacted FROM document_text WHERE document_id = ?", (doc_id,)).fetchone()
        scan = "\n".join([(t["text_redacted"] if t else "") or "", fields["facts"], fields["petitioner_arguments"],
                          fields["respondent_arguments"], fields["prayer"]])
        new_v = latest["version"] + 1
        ts = now_iso()
        conn.execute(
            "INSERT INTO document_extractions (document_id, version, fields_json, issues_json, authorities_json, "
            "confirmed, saved_by, saved_at) VALUES (?,?,?,?,?,0,?,?)",
            (doc_id, new_v, json.dumps(fields), json.dumps(issues), json.dumps(authorities_for(scan)), _actor(user), ts))
        conn.execute("UPDATE documents SET status = 'READ', updated_at = ? WHERE id = ?", (ts, doc_id))
        conn.commit()
        out = doc_dict(conn, _get_row(conn, doc_id), detail=True)
    finally:
        conn.close()
    audit("DOCUMENT_EXTRACTION_SAVED", out, f"extraction v{new_v} saved", request=request, user=user)
    return out


def confirm_document(doc_id: str, body: Dict[str, Any], user, request) -> Dict[str, Any]:
    conn = get_connection()
    try:
        row = _get_row(conn, doc_id)
        _writable(row)
        latest = _check_version(conn, doc_id, body.get("version"))
        ex = _extraction_dict(latest)
        missing = [k for k in ("case_title", "facts") if not ex["fields"][k].strip()]
        if not ex["issues"]:
            missing.append("issues")
        if missing:
            raise DocError(422, "EXTRACTION_INCOMPLETE",
                           "Case title, facts and at least one issue are required to confirm.", missing=missing)
        ts = now_iso()
        conn.execute("UPDATE document_extractions SET confirmed = 1 WHERE id = ?", (latest["id"],))
        conn.execute("UPDATE documents SET status = 'CONFIRMED', updated_at = ? WHERE id = ?", (ts, doc_id))
        conn.commit()
        out = doc_dict(conn, _get_row(conn, doc_id), detail=True)
    finally:
        conn.close()
    audit("DOCUMENT_CONFIRMED", out, f"extraction v{latest['version']} confirmed", request=request, user=user)
    return out


def archive_document(doc_id: str, user, request) -> Dict[str, Any]:
    conn = get_connection()
    try:
        _get_row(conn, doc_id)
        conn.execute("UPDATE documents SET status = 'ARCHIVED', updated_at = ? WHERE id = ?", (now_iso(), doc_id))
        conn.commit()
        out = doc_dict(conn, _get_row(conn, doc_id), detail=True)
    finally:
        conn.close()
    audit("DOCUMENT_ARCHIVED", out, "archived", request=request, user=user)
    return out


def delete_document(doc_id: str, user, request) -> Dict[str, Any]:
    conn = get_connection()
    try:
        row = _get_row(conn, doc_id)
        n_drafts = conn.execute("SELECT COUNT(*) FROM draft_judgments WHERE document_id = ?", (doc_id,)).fetchone()[0]
        if n_drafts:
            raise DocError(409, "DOCUMENT_HAS_DRAFTS",
                           "This document has drafts linked to it. Delete those drafts first, or archive this document instead.")
        stored_name = row["stored_name"]
        matter_key = row["matter_key"]
        conn.execute("DELETE FROM document_pins WHERE document_id = ?", (doc_id,))
        conn.execute("DELETE FROM document_extractions WHERE document_id = ?", (doc_id,))
        conn.execute("DELETE FROM document_text WHERE document_id = ?", (doc_id,))
        conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        conn.commit()
    finally:
        conn.close()
    if stored_name:
        try:
            path = os.path.join(_server().UPLOAD_DIR, os.path.basename(stored_name))
            if os.path.isfile(path):
                os.remove(path)
        except Exception:
            pass
    audit("DOCUMENT_DELETED", {"id": doc_id, "matter_key": matter_key}, "permanently deleted", request=request, user=user)
    return {"id": doc_id, "deleted": True}


def _confirmed_extraction(conn, doc_id: str):
    row = _get_row(conn, doc_id)
    ex = _extraction_dict(_latest_extraction(conn, doc_id))
    if row["status"] != "CONFIRMED" or not ex or not ex["confirmed"]:
        raise DocError(409, "NOT_CONFIRMED", "Confirm the extraction first.")
    return row, ex


# ---------------------------------------------------------------- research
def _run_search(body: Dict[str, Any], user, request) -> List[Dict[str, Any]]:
    try:
        import search_service
        run = getattr(search_service, "run_search", None)
    except ImportError:
        run = None
    if run is not None:
        return list(run(body, user, request).get("results") or [])
    from judgment_engine import search_relevant_precedents
    return list(search_relevant_precedents(body["query"], limit=body.get("limit", 5)))


def research(doc_id: str, body: Dict[str, Any], user, request) -> Dict[str, Any]:
    try:
        per = int((body or {}).get("limit_per_issue") or 5)
    except (TypeError, ValueError):
        per = 5
    per = max(1, min(per, 10))
    conn = get_connection()
    try:
        row, ex = _confirmed_extraction(conn, doc_id)
        d = doc_dict(conn, row)
    finally:
        conn.close()

    def one(query: str) -> Dict[str, Any]:
        if not query:
            return {"query": "", "results": []}
        try:
            return {"query": query, "results": _run_search({"query": query, "limit": per, "court": "ALL"}, user, request)}
        except Exception as e:  # one failed lookup must not hide the others
            return {"query": query, "results": [], "error": str(e)[:200]}

    issues = []
    for issue in ex["issues"]:
        r = one(_issue_query(issue))
        issues.append({"issue": issue, "query": r["query"], "results": r["results"],
                       **({"error": r["error"]} if "error" in r else {})})
    statutes = one(ex["fields"]["statutory_provisions"].replace(";", " ").strip())
    audit("DOCUMENT_RESEARCHED", d, f"{len(issues)} issues researched", request=request, user=user)
    return {"issues": issues, "statutes": {"query": statutes["query"], "results": statutes["results"]}}


# ---------------------------------------------------------------- pins
def list_pins(doc_id: str, conn=None) -> Dict[str, Any]:
    own = conn is None
    conn = conn or get_connection()
    try:
        _get_row(conn, doc_id)
        rows = conn.execute(
            "SELECT p.judgment_id, p.issue_ref, p.note, p.added_by, p.added_at, j.title, j.citation, j.court, "
            "j.precedent_status FROM document_pins p LEFT JOIN judgments j ON j.id = p.judgment_id "
            "WHERE p.document_id = ? ORDER BY p.id", (doc_id,)).fetchall()
        return {"items": [{
            "judgment_id": r["judgment_id"], "title": r["title"], "citation": r["citation"], "court": r["court"],
            "precedent_status": r["precedent_status"], "issue_ref": r["issue_ref"] or "", "note": r["note"] or "",
            "added_by": r["added_by"], "added_at": r["added_at"]} for r in rows]}
    finally:
        if own:
            conn.close()


def add_pin(doc_id: str, body: Dict[str, Any], user, request) -> Dict[str, Any]:
    try:
        jid = int(body.get("judgment_id"))
    except (TypeError, ValueError):
        raise DocError(422, "INVALID_JUDGMENT", "judgment_id is required.")
    conn = get_connection()
    try:
        row = _get_row(conn, doc_id)
        _writable(row)
        if not conn.execute("SELECT 1 FROM judgments WHERE id = ?", (jid,)).fetchone():
            raise DocError(404, "JUDGMENT_NOT_FOUND", "Judgment not found.")
        issue_ref, note = _str(body.get("issue_ref"), 500), _str(body.get("note"), 2000)
        if conn.execute("SELECT 1 FROM document_pins WHERE document_id = ? AND judgment_id = ?", (doc_id, jid)).fetchone():
            conn.execute("UPDATE document_pins SET issue_ref = ?, note = ? WHERE document_id = ? AND judgment_id = ?",
                         (issue_ref, note, doc_id, jid))
        else:
            n = conn.execute("SELECT COUNT(*) FROM document_pins WHERE document_id = ?", (doc_id,)).fetchone()[0]
            if n >= MAX_PINS:
                raise DocError(409, "PINS_FULL", f"At most {MAX_PINS} authorities can be pinned.")
            conn.execute("INSERT INTO document_pins (document_id, judgment_id, issue_ref, note, added_by, added_at) "
                         "VALUES (?,?,?,?,?,?)", (doc_id, jid, issue_ref, note, _actor(user), now_iso()))
        conn.commit()
        out = list_pins(doc_id, conn)
        d = doc_dict(conn, row)
    finally:
        conn.close()
    audit("DOCUMENT_PIN_ADDED", d, f"pinned judgment {jid}", request=request, user=user)
    return out


def remove_pin(doc_id: str, judgment_id: int, user, request) -> Dict[str, Any]:
    conn = get_connection()
    try:
        row = _get_row(conn, doc_id)
        _writable(row)
        cur = conn.execute("DELETE FROM document_pins WHERE document_id = ? AND judgment_id = ?", (doc_id, judgment_id))
        if cur.rowcount == 0:
            raise DocError(404, "PIN_NOT_FOUND", "That authority is not pinned.")
        conn.commit()
        out = list_pins(doc_id, conn)
        d = doc_dict(conn, row)
    finally:
        conn.close()
    audit("DOCUMENT_PIN_REMOVED", d, f"unpinned judgment {judgment_id}", request=request, user=user)
    return out


# ---------------------------------------------------------------- studio hand-off
def draft_params(doc_id: str) -> Dict[str, Any]:
    conn = get_connection()
    try:
        row, ex = _confirmed_extraction(conn, doc_id)
        pins = list_pins(doc_id, conn)["items"]
    finally:
        conn.close()
    f = ex["fields"]
    params = {k: f[k] for k in ("case_title", "case_number", "court", "petitioner", "respondent", "facts", "prayer",
                                "statutory_provisions", "petitioner_arguments", "respondent_arguments")}
    params["issues"] = "\n".join(f"({chr(65 + i)}) {_issue_query(q)}" for i, q in enumerate(ex["issues"]))
    params["document_id"] = doc_id
    return {"params": params, "authorities": [
        {"id": p["judgment_id"], "title": p["title"], "citation": p["citation"], "court": p["court"],
         "status": p["precedent_status"]} for p in pins]}

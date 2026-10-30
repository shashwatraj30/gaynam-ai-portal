import os
import sys
import json
import io
import csv
import sqlite3
import re
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

import uuid
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse, FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
import envload  # noqa: E402  (loads <project>/.env into os.environ before anything reads it)
envload.load_env(os.path.join(PROJECT_ROOT, ".env"))
from database import get_connection, DB_PATH, init_db
from citation_verifier import verify_all_text_citations, verify_citation
from judgment_engine import (
    generate_15_section_judgment, search_relevant_precedents,
    calculate_bench_priority, get_bench_label, resolve_case_district
)
from document_parser import parse_pleadings, extract_text_from_file
from auth import (
    create_access_token, decode_access_token, authenticate_user,
    INSTITUTIONAL_DIRECTORY, ROLES_PERMISSIONS, LoginRequest, SSOLoginRequest,
    get_current_user_from_header, require, require_any, get_client_ip, AuthError, auth_error_handler,
    check_permission, is_legacy_request, is_user_suspended
)
from ocr_engine import process_scanned_brief, anonymize_pii, clean_ocr_text
from court_sync_daemon import run_incremental_sync, get_sync_status, get_sync_history
from export_engine import export_judgment_to_docx, render_printable_html
from audit_dpdp import record_tamper_evident_event, verify_ledger_integrity, get_ledger_blocks
from audit_utils import resync_pending_ledger
import drafts_service as drafts_svc
import search_service as search_svc

app = FastAPI(
    title="Gyanam AI — NLU Jodhpur Edition",
    description="AI-Based Legal Judgment Generation & Precedent Research System (Powered by Kelyvo)",
    version="2.5.0"
)

app.add_exception_handler(AuthError, auth_error_handler)

try:
    # init_db() creates the base tables (judgments, draft_judgments, audit_logs, ...) with
    # CREATE TABLE IF NOT EXISTS, then runs the v3 migrations -- safe to call every boot, whether
    # the DB file is the real populated one or a freshly (re)created empty one.
    init_db()
except Exception as _e:
    print(f"Startup migration warning: {_e}")

try:
    from matters import normalise_matter_key as _nmk
except Exception:
    def _nmk(case_number):
        return re.sub(r"\s+", " ", (case_number or "").strip().lower())

def matter_key_for(case_number: str) -> str:
    try:
        return _nmk(case_number)
    except Exception:
        return re.sub(r"\s+", " ", (case_number or "").strip().lower())

UPLOAD_DIR = os.environ.get("GYANAM_UPLOAD_DIR") or os.path.join(PROJECT_ROOT, "uploads")
DOCS_DIR = os.environ.get("GYANAM_DOCS_DIR") or os.path.join(PROJECT_ROOT, "docs")
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")
MAX_UPLOAD_BYTES = 64 * 1024 * 1024
ALLOWED_UPLOAD_EXT = {".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg", ".tif", ".tiff"}

async def save_upload(file: UploadFile) -> Dict[str, Any]:
    """Save an upload as uploads/{uuid}{ext}; enforce extension allowlist and 64MB limit."""
    original = os.path.basename((file.filename or "").replace("\\", "/")) or "upload"
    ext = os.path.splitext(original)[1].lower()
    if ext not in ALLOWED_UPLOAD_EXT:
        raise HTTPException(status_code=415, detail=f"File type '{ext or 'none'}' not allowed. Allowed: {', '.join(sorted(ALLOWED_UPLOAD_EXT))}")
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 64 MB limit.")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    stored = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, stored)
    with open(path, "wb") as f:
        f.write(data)
    return {"path": path, "stored_name": stored, "original_name": original, "size": len(data), "bytes": data}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request Models
class SearchRequest(BaseModel):
    query: str
    court: Optional[str] = "ALL"
    judge: Optional[str] = ""
    precedent_status: Optional[str] = "ALL"
    limit: Optional[int] = 20
    # v3 (docs/API_V3_CONTRACT.md): offset/sort/year filters, applied in search_service.run_search
    offset: Optional[int] = 0
    sort: Optional[str] = "bench"
    year_from: Optional[int] = None
    year_to: Optional[int] = None

class DraftRequest(BaseModel):
    case_title: str
    case_number: str
    court: str
    facts: str
    petitioner_arguments: str
    respondent_arguments: str
    issues: str
    statutory_provisions: str
    gemini_api_key: Optional[str] = None
    # v3 (docs/API_V3_CONTRACT.md)
    sections: Optional[List[int]] = None
    current: Optional[Dict[str, Any]] = None
    outcome: Optional[str] = None
    authorities: Optional[List[Dict[str, Any]]] = None
    document_id: Optional[str] = None
    petitioner: Optional[str] = None
    respondent: Optional[str] = None
    prayer: Optional[str] = None

class SaveDraftRequest(BaseModel):
    draft_id: Optional[int] = None
    case_title: str
    case_number: str
    court: str
    facts: str
    issues: str
    petitioner_arguments: str
    respondent_arguments: str
    statutory_provisions: str
    draft_content_json: Dict[str, Any]
    status: Optional[str] = "DRAFT"
    reviewed_by: Optional[str] = "Hon'ble Judicial User"
    version: Optional[int] = None
    # v3
    document_id: Optional[str] = None
    petitioner: Optional[str] = None
    respondent: Optional[str] = None
    prayer: Optional[str] = None
    outcome: Optional[str] = None

class AnonymizeRequest(BaseModel):
    text: str

# Unified audit logger: the single implementation lives in audit_utils (shared with search_service/search_routes).
from audit_utils import log_audit  # noqa: E402,F401

# ----------------- CURATION FLAG (B9) -----------------
TEMPLATE_PHRASES = ("judicial determination by",)
_SEEDED_IDS = None

def _seeded_case_ids():
    global _SEEDED_IDS
    if _SEEDED_IDS is None:
        ids = set()
        try:
            with open(os.path.join(BACKEND_DIR, "seeder.py"), "r", encoding="utf-8") as f:
                ids = set(re.findall(r'"case_id":\s*"([^"]+)"', f.read()))
        except Exception:
            pass
        _SEEDED_IDS = ids
    return _SEEDED_IDS

def is_curated(row: Dict[str, Any]) -> bool:
    if (row.get("case_id") or "") in _seeded_case_ids():
        return True
    text = " ".join(str(row.get(k) or "") for k in ("headnote", "ratio_decidendi")).lower()
    if not text.strip():
        return False
    return not any(p in text for p in TEMPLATE_PHRASES)

def annotate_curation(row: Dict[str, Any]) -> Dict[str, Any]:
    row["is_curated"] = is_curated(row)
    if not row["is_curated"]:
        row["citing_cases_count"] = None
    return row

def _year_of(row: Dict[str, Any]):
    y = row.get("year")
    if isinstance(y, int) and y:
        return y
    m = re.search(r"(19|20)\d{2}", str(row.get("judgment_date") or ""))
    return int(m.group(0)) if m else None

def enrich_search_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Guarantee is_curated, source_pdf_url, year and citing_cases_count on every search row."""
    need = [r["id"] for r in rows if r.get("id") is not None and
            ("source_pdf_url" not in r or "year" not in r or "citing_cases_count" not in r
             or "headnote" not in r or "ratio_decidendi" not in r)]
    extra = {}
    if need:
        conn = get_connection()
        try:
            for i in range(0, len(need), 500):
                chunk = need[i:i + 500]
                q = ",".join("?" * len(chunk))
                for e in conn.execute(
                    f"SELECT id, source_pdf_url, year, judgment_date, citing_cases_count FROM judgments WHERE id IN ({q})", chunk):
                    extra[e["id"]] = dict(e)
        finally:
            conn.close()
    for r in rows:
        e = extra.get(r.get("id"), {})
        r.setdefault("source_pdf_url", e.get("source_pdf_url"))
        if r.get("year") in (None, ""):
            r["year"] = e.get("year")
        if r.get("judgment_date") in (None, "") and e.get("judgment_date"):
            r["judgment_date"] = e["judgment_date"]
        if "citing_cases_count" not in r:
            r["citing_cases_count"] = e.get("citing_cases_count")
        r["year"] = _year_of(r)
        annotate_curation(r)
    return rows

# ----------------- SYSTEM STATUS & TELEMETRY -----------------
APP_VERSION = "3.0.0"

def _optional_user(request: Request) -> Optional[Dict[str, Any]]:
    """Valid, non-suspended bearer token -> its claims; anything else -> None (never raises)."""
    auth_h = request.headers.get("authorization", "")
    if not auth_h.startswith("Bearer "):
        return None
    try:
        claims = decode_access_token(auth_h.split(" ", 1)[1].strip())
    except Exception:
        return None
    if is_user_suspended(claims.get("user_id") or claims.get("sub")):
        return None
    return claims

@app.get("/api/status")
def get_system_status(request: Request):
    """Tokenless callers (health checks) get only {status, version, time}; signed-in callers get the full payload."""
    base = {"status": "ONLINE", "version": APP_VERSION, "time": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    if _optional_user(request) is None and not is_legacy_request(request):
        return base
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM judgments")
    total_cases = cursor.fetchone()[0]

    cursor.execute("SELECT court, COUNT(*) as c FROM judgments GROUP BY court ORDER BY c DESC")
    courts_dist = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT precedent_status, COUNT(*) as c FROM judgments GROUP BY precedent_status")
    status_dist = [dict(r) for r in cursor.fetchall()]

    conn.close()

    sync_stat = get_sync_status()

    return {
        **base,
        "system_name": "Gyanam AI — NLU Jodhpur Edition (Powered by Kelyvo)",
        "attribution": "Powered by Kelyvo",
        "total_judgments_indexed": total_cases,
        "database_storage_path": os.path.basename(DB_PATH),
        "search_engine": "SQLite FTS5 BM25",
        "court_distribution": courts_dist,
        "status_distribution": status_dist,
        "sync_telemetry": sync_stat,
        "compliance": {
            "air_gap_ready": not bool(os.environ.get("GEMINI_API_KEY")),
            "tamper_evident_ledger": True
        }
    }

@app.get("/api/dashboard_metrics")
def get_dashboard_metrics(request: Request, _user: Dict[str, Any] = Depends(get_current_user_from_header)):
    """Role-scoped: corpus counts for everyone; activity counts and recent audit rows only for roles that may see them."""
    request.state.user = _user
    legacy = getattr(request.state, "legacy_fallback", False)
    can_audit = legacy or check_permission(_user, "VIEW_AUDIT")
    can_activity = can_audit or check_permission(_user, "DRAFT_FULL")
    can_sync = can_audit or check_permission(_user, "MANAGE_CORPUS")
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM judgments")
    total_cases = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM judgments WHERE court LIKE '%Supreme Court%'")
    sc_cases = cursor.fetchone()[0]
    hc_cases = total_cases - sc_cases

    cursor.execute("SELECT court, COUNT(*) as c FROM judgments GROUP BY court ORDER BY c DESC LIMIT 8")
    top_courts = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT precedent_status, COUNT(*) as c FROM judgments GROUP BY precedent_status")
    status_counts = {r['precedent_status']: r['c'] for r in [dict(x) for x in cursor.fetchall()]}

    out: Dict[str, Any] = {
        "total_judgments": total_cases,
        "supreme_court_count": sc_cases,
        "high_court_count": hc_cases,
        "top_courts": top_courts,
        "status_counts": status_counts,
    }

    if can_activity:
        cursor.execute("SELECT COUNT(*) FROM audit_logs WHERE action = 'SEARCH_QUERY'")
        out["searches_performed"] = cursor.fetchone()[0] or 0
        cursor.execute("SELECT COUNT(*) FROM draft_judgments")
        out["drafts_created"] = cursor.fetchone()[0]

    if can_audit:
        cursor.execute("SELECT COUNT(DISTINCT user_name) FROM audit_logs WHERE user_name IS NOT NULL AND user_name != ''")
        out["active_users"] = cursor.fetchone()[0] or 0
        cursor.execute("SELECT COUNT(*) FROM audit_logs WHERE action LIKE '%REDACT%' OR action LIKE '%ANONYMI%'")
        redaction_events = cursor.fetchone()[0] or 0
        try:
            cursor.execute("SELECT COUNT(*) FROM cryptographic_audit_ledger")
            ledger_blocks = cursor.fetchone()[0] or 0
        except sqlite3.Error:
            ledger_blocks = 0
        out["system_health"] = {
            "air_gap_status": "EXTERNAL_AI_ENABLED" if os.environ.get("GEMINI_API_KEY") else "LOCAL_ONLY",
            "dpdp_redactions_total": redaction_events,
            "sha256_ledger_blocks": ledger_blocks,
        }
        cursor.execute("SELECT timestamp, user_name, user_role, action, details FROM audit_logs ORDER BY id DESC LIMIT 8")
        out["recent_activity"] = [dict(r) for r in cursor.fetchall()]

    conn.close()
    if can_sync:
        out["sync_status"] = get_sync_status()
    return out

# ----------------- AUTHENTICATION & RBAC -----------------
@app.post("/api/auth/login")
def login_endpoint(req: LoginRequest, request: Request):
    user = authenticate_user(req.username_or_email)
    token = create_access_token(user)
    log_audit("USER_LOGIN", f"User {user['email']} authenticated with role {user['role']}", user["role"], request=request, user=user)
    return {
        "access_token": token,
        "token_type": "Bearer",
        "user": user
    }

@app.post("/api/auth/sso/nluj")
def sso_nluj_endpoint(req: SSOLoginRequest, request: Request):
    role = req.target_role.upper()
    role_email_map = {
        "HON_JUSTICE": "justice.sharma@rajasthanhc.nic.in",
        "JUDICIAL_USER": "justice.sharma@rajasthanhc.nic.in",
        "LAW_CLERK": "lawclerk.bench4@nlujodhpur.ac.in",
        "RESEARCHER": "lawclerk.bench4@nlujodhpur.ac.in",
        "FACULTY": "faculty.dean@nlujodhpur.ac.in",
        "NLU_SCHOLAR": "scholar.2023@nlujodhpur.ac.in",
        "STUDENT": "scholar.2023@nlujodhpur.ac.in",
        "REGISTRAR_NLUJ": "registrar@nlujodhpur.ac.in",
        "ADMINISTRATOR": "registrar@nlujodhpur.ac.in",
        "AUDITOR": "auditor.compliance@nlujodhpur.ac.in"
    }
    email = role_email_map.get(role, "justice.sharma@rajasthanhc.nic.in")
    user = INSTITUTIONAL_DIRECTORY.get(email)
    token = create_access_token(user)
    log_audit("SSO_LOGIN", f"Institutional SSO issued for {user['full_name']} ({role})", user["role"], request=request, user=user)
    return {
        "access_token": token,
        "token_type": "Bearer",
        "user": user
    }

@app.get("/api/auth/me")
def get_current_user_profile(user: Dict[str, Any] = Depends(get_current_user_from_header)):
    role_info = ROLES_PERMISSIONS.get(user.get("role", "HON_JUSTICE"), {})
    return {
        "user": user,
        "role_details": role_info
    }

@app.get("/api/auth/roles")
def get_available_roles():
    """Public sign-in cards only: no emails, badge ids or permission lists."""
    return {
        "roles": {k: {"title": v.get("title"), "scope_access": v.get("scope_access")} for k, v in ROLES_PERMISSIONS.items()},
        "directory": [{
            "role": u.get("role"),
            "full_name": u.get("full_name"),
            "designation": u.get("designation"),
            "institution": u.get("institution"),
            "scope_role": u.get("scope_role"),
        } for u in INSTITUTIONAL_DIRECTORY.values()],
    }

# ----------------- SEARCH & CITATION VERIFICATION -----------------
@app.post("/api/search")
def search_judgments(req: SearchRequest, request: Request, _user: Dict[str, Any] = Depends(require("SEARCH"))):
    request.state.user = _user
    log_audit("SEARCH_QUERY", f"Query: {req.query} | Court: {req.court} | Status: {req.precedent_status}", request=request)
    return search_svc.run_search(req.model_dump(), _user, request=request)

@app.get("/api/cases/recent")
def get_recent_cases(request: Request, limit: int = 6, _user: Dict[str, Any] = Depends(get_current_user_from_header)):
    """Returns most recently delivered / ingested authentic court cases for live stream."""
    request.state.user = _user
    limit = max(1, min(int(limit), 50))
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, case_id, title, court, bench, judges, judgment_date, citation, cnr_number, docket_number, source_url, source_pdf_url, headnote
    FROM judgments
    ORDER BY id DESC
    LIMIT ?
    """, (limit,))
    rows = [dict(r) for r in cursor.fetchall()]
    for r in rows:
        r["district"] = resolve_case_district(r.get("court"), r.get("bench"), r.get("cnr_number"), r.get("headnote", ""))
    conn.close()
    return {"count": len(rows), "recent_cases": rows}

@app.get("/api/judgment/{judgment_id}")
def get_judgment_details(judgment_id: int, request: Request, _user: Dict[str, Any] = Depends(require("SEARCH"))):
    request.state.user = _user
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM judgments WHERE id = ?", (judgment_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Judgment not found")

    data = dict(row)
    data["district"] = resolve_case_district(data.get("court"), data.get("bench"), data.get("cnr_number"), data.get("full_text", ""))
    annotate_curation(data)
    log_audit("VIEW_JUDGMENT", f"Case ID: {data['case_id']} - {data['title']} - District: {data['district']}", request=request)
    return data

@app.post("/api/verify_citations")
def verify_citations_endpoint(payload: Dict[str, str], request: Request, _user: Dict[str, Any] = Depends(require_any("VERIFY_CITATION", "SEARCH"))):
    text = payload.get("text", "")
    log_audit("VERIFY_CITATIONS", f"Bulk citation check ({len(text)} chars)", request=request)
    return {
        "verifications": verify_all_text_citations(text)
    }

class SingleCitationRequest(BaseModel):
    citation: str

@app.post("/api/verify_single_citation")
def verify_single_citation_endpoint(req: SingleCitationRequest, request: Request, _user: Dict[str, Any] = Depends(get_current_user_from_header)):
    request.state.user = _user
    c_str = req.citation.strip()
    log_audit("VERIFY_CITATION", f"Verification request for: {c_str}", request=request)

    # 1. First run the regex / exact citation verifier
    res = verify_citation(c_str)

    # 2. If not found, run fallback search on DB by title / docket / keyword
    if res.get("status") == "UNVERIFIED_EXTERNAL" or not res.get("case_data"):
        conn = get_connection()
        cursor = conn.cursor()
        clean = "".join([c if c.isalnum() or c.isspace() else " " for c in c_str]).strip()
        cursor.execute("""
        SELECT id, case_id, title, court, bench, judges, judgment_date, citation,
               equivalent_citations, statutes_considered, precedent_status,
               overruled_by, headnote, ratio_decidendi, source_url, source_pdf_url, cnr_number
        FROM judgments
        WHERE citation LIKE ? OR equivalent_citations LIKE ? OR title LIKE ?
        LIMIT 1;
        """, (f"%{c_str}%", f"%{c_str}%", f"%{clean}%"))
        row = cursor.fetchone()
        conn.close()

        if row:
            case_data = dict(row)
            p_status = case_data.get("precedent_status", "FOLLOWED").upper()
            if p_status == "OVERRULED":
                s_flag = "OVERRULED_WARNING"
                b_color = "red"
                msg = f"CRITICAL WARNING: This precedent was OVERRULED by {case_data.get('overruled_by', 'a subsequent Bench')}."
            elif p_status == "DISTINGUISHED":
                s_flag = "DISTINGUISHED"
                b_color = "yellow"
                msg = "Precedent has been distinguished or qualified in subsequent judgments."
            else:
                s_flag = "VERIFIED_ACTIVE"
                b_color = "green"
                msg = "Authoritative, active binding precedent."

            res = {
                "query_citation": c_str,
                "status": s_flag,
                "badge_color": b_color,
                "message": msg,
                "case_data": {
                    "id": case_data["id"],
                    "title": case_data["title"],
                    "court": case_data["court"],
                    "bench": case_data["bench"],
                    "judges": case_data["judges"],
                    "date": case_data["judgment_date"],
                    "citation": case_data["citation"] or case_data["equivalent_citations"] or c_str,
                    "precedent_status": p_status,
                    "overruled_by": case_data["overruled_by"],
                    "ratio": case_data["ratio_decidendi"] or case_data["headnote"],
                    "statutes": case_data["statutes_considered"],
                    "source_url": case_data["source_url"] or "https://escr.sci.gov.in/",
                    "source_pdf_url": case_data["source_pdf_url"],
                    "cnr_number": case_data["cnr_number"],
                    "district": resolve_case_district(case_data.get("court"), case_data.get("bench"), case_data.get("cnr_number"))
                }
            }
    return res

# ----------------- OCR & PLEADING INTAKE -----------------
@app.post("/api/ocr/process_brief")
async def process_brief_ocr(
    file: UploadFile = File(...),
    client_text: Optional[str] = Form(None),
    gemini_api_key: Optional[str] = Form(None),
    request: Request = None,
    _user: Dict[str, Any] = Depends(require("UPLOAD_PLEADING"))
):
    saved = await save_upload(file)
    safe_name = saved["original_name"]
    file_path = saved["path"]
    file_bytes = saved["bytes"]

    try:
        result = process_scanned_brief(file_path, client_extracted_text=client_text, api_key=gemini_api_key)
        if not isinstance(result, dict) or not result.get("success"):
            raise ValueError("Invalid result format from OCR engine")
    except Exception as ocr_err:
        print(f"OCR processing failed: {ocr_err}")
        # Honest failure: nothing was read, so nothing is invented.
        result = {
            "success": False,
            "source": "failed",
            "error": "The file could not be read. Check the file or paste the text instead.",
            "is_image": False,
            "file_format": os.path.splitext(safe_name)[1].lstrip(".").upper() or "UNKNOWN",
            "vlm_transcription_used": False,
            "raw_character_count": 0,
            "cleaned_character_count": 0,
            "is_ocr_enhanced": False,
            "dpdp_redactions_applied": 0,
            "metadata": {k: "" for k in (
                "court", "case_number", "petitioner", "respondent", "case_title", "facts_summary",
                "grounds_of_challenge", "prayer_relief", "statutory_provisions")},
            "sanitized_text_preview": "",
        }

    try:
        fmt = result.get('file_format', 'UNKNOWN')
        vlm_tag = " [Gemini VLM]" if result.get('vlm_transcription_used') else ""
        if not result.get("success"):
            log_audit("OCR_FAILED", f"File: {safe_name} [{fmt}] could not be read", request=request)
        else:
            log_audit("OCR_PROCESSED_BRIEF", f"File: {safe_name} [{fmt}]{vlm_tag} (OCR cleaned: {result.get('cleaned_character_count', 0)} chars, Redactions: {result.get('dpdp_redactions_applied', 0)})", request=request)
    except Exception as audit_err:
        print(f"Audit log warning: {audit_err}")

    if isinstance(result, dict):
        result.setdefault("original_filename", safe_name)
        result.setdefault("stored_filename", saved["stored_name"])
    return JSONResponse(status_code=200, content=result)

@app.post("/api/ocr/anonymize")
def live_anonymize(req: AnonymizeRequest, request: Request, _user: Dict[str, Any] = Depends(require("UPLOAD_PLEADING"))):
    result = anonymize_pii(req.text)
    log_audit("OCR_ANONYMIZE", f"Live anonymisation of {len(req.text or '')} chars", request=request)
    return result

@app.post("/api/upload_pleading")
async def upload_pleading(request: Request, file: UploadFile = File(...), _user: Dict[str, Any] = Depends(require("UPLOAD_PLEADING"))):
    saved = await save_upload(file)
    file_path = saved["path"]
    extracted_text = extract_text_from_file(file_path)
    parsed = parse_pleadings(extracted_text)
    log_audit("UPLOAD_PLEADING", f"File: {saved['original_name']} as {saved['stored_name']} ({len(extracted_text)} chars parsed)", request=request)
    return {
        "filename": saved["original_name"],
        "stored_filename": saved["stored_name"],
        "parsed": parsed
    }

# ----------------- 15-SECTION JUDGMENT ENGINE -----------------
@app.post("/api/draft_judgment")
@app.post("/api/draft/generate")
def draft_judgment_endpoint(req: DraftRequest, request: Request, _user: Dict[str, Any] = Depends(require("DRAFT_FULL"))):
    log_audit("GENERATE_DRAFT_JUDGMENT", f"Case: {req.case_title} ({req.case_number}) - {req.court}", request=request)
    return drafts_svc.generate_draft(req.model_dump())

# ----------------- DRAFT STATE MACHINE (B7) -----------------
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

def normalise_status(value: Optional[str]) -> str:
    v = (value or "DRAFT").strip().upper().replace(" ", "_")
    return LEGACY_STATUS_MAP.get(v, v)

def _record_draft_version(conn, draft_id: int, version: int, saved_by: Optional[str], status: str, snapshot: Optional[str] = None):
    """Append-only history row (D4). Never raises into the save path."""
    try:
        conn.execute(
            "INSERT INTO draft_versions (draft_id, version, saved_at, saved_by, status, snapshot_json) VALUES (?, ?, ?, ?, ?, ?)",
            (draft_id, version, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), saved_by, status, snapshot))
    except Exception as e:
        print(f"draft_versions warning: {e}")

@app.post("/api/save_draft")
def save_draft_endpoint(req: SaveDraftRequest, request: Request, _user: Dict[str, Any] = Depends(require("DRAFT_FULL"))):
    try:
        out = drafts_svc.save_draft(req.model_dump(), _user)
    except drafts_svc.DraftError as e:
        return JSONResponse(status_code=e.status, content=e.content)
    if req.draft_id and out["draft_id"] == req.draft_id:
        log_audit("UPDATE_DRAFT", f"Draft ID {out['draft_id']}: {req.case_title} (v{out['version']})", request=request)
    else:
        log_audit("SAVE_DRAFT", f"Draft ID {out['draft_id']}: {req.case_title}", request=request)
    return out

@app.get("/api/drafts")
def list_drafts(_user: Dict[str, Any] = Depends(require("DRAFT_FULL"))):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, case_title, case_number, court, date_created, status, reviewed_by FROM draft_judgments ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()
    out = [dict(r) for r in rows]
    for d in out:
        d["status"] = normalise_status(d.get("status"))
    return out

@app.get("/api/draft/{draft_id}")
def get_draft_by_id(draft_id: int, _user: Dict[str, Any] = Depends(require("DRAFT_FULL"))):
    try:
        return drafts_svc.get_draft(draft_id)
    except drafts_svc.DraftError as e:
        raise HTTPException(status_code=e.status, detail=e.content["detail"])

@app.get("/api/drafts/{draft_id}/versions")
def get_draft_versions(draft_id: int, _user: Dict[str, Any] = Depends(require("DRAFT_FULL"))):
    try:
        return drafts_svc.list_versions(draft_id)
    except drafts_svc.DraftError as e:
        raise HTTPException(status_code=e.status, detail=e.content["detail"])

# ----------------- JUDICIAL EXPORT & PUBLISHING -----------------
@app.get("/api/draft/export/docx/{draft_id}")
def export_docx_endpoint(draft_id: int, request: Request, _user: Dict[str, Any] = Depends(require_any("EXPORT_DRAFT", "EXPORT_GAZETTE", "DRAFT_FULL"))):
    draft_data = get_draft_by_id(draft_id, _user)
    docx_stream = export_judgment_to_docx(draft_data)
    raw_num = draft_data.get('case_number', f'Draft_{draft_id}')
    clean_num = "".join([c if c.isalnum() or c in ("-", "_") else "_" for c in raw_num])
    clean_num = re.sub(r'_+', '_', clean_num).strip('_') or f"Draft_{draft_id}"
    filename = f"Judicial_Judgment_{clean_num}.docx"
    log_audit("EXPORT_DOCX", f"Downloaded DOCX for Draft #{draft_id}", request=request)
    return StreamingResponse(
        docx_stream,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@app.get("/api/draft/export/print/{draft_id}", response_class=HTMLResponse)
def export_print_html_endpoint(draft_id: int, request: Request, _user: Dict[str, Any] = Depends(require_any("EXPORT_DRAFT", "EXPORT_GAZETTE", "DRAFT_FULL"))):
    draft_data = get_draft_by_id(draft_id, _user)
    html_content = render_printable_html(draft_data)
    log_audit("PRINT_JUDGMENT", f"Opened official printable gazette for Draft #{draft_id}", request=request)
    return HTMLResponse(content=html_content)

class UpdateDraftStatusRequest(BaseModel):
    draft_id: int
    status: Optional[str] = None
    new_status: Optional[str] = None
    reviewer_name: Optional[str] = "Hon'ble Judicial User"
    # v3
    reason: Optional[str] = None
    version: Optional[int] = None

@app.post("/api/draft/update_status")
def update_draft_status_endpoint(req: UpdateDraftStatusRequest, request: Request, _user: Dict[str, Any] = Depends(require("DRAFT_FULL"))):
    can_finalize = getattr(request.state, "legacy_fallback", False) or check_permission(_user, "FINALIZE_JUDGMENT")
    try:
        out = drafts_svc.update_status_with_reason(
            req.draft_id, req.status or req.new_status, req.reason, req.version, _user,
            can_finalize=bool(can_finalize), reviewer_fallback=req.reviewer_name)
    except drafts_svc.DraftError as e:
        return JSONResponse(status_code=e.status, content=e.content)
    extra = f" Reason: {out['reason']}" if out.get("reason") else ""
    log_audit("DRAFT_STATUS_UPDATED", f"Draft #{req.draft_id}: {out['previous_status']} -> {out['status']} by {out['reviewer']}.{extra}", request=request)
    out.pop("reviewer", None)
    return out

def _user_states() -> Dict[str, Dict[str, Any]]:
    conn = get_connection()
    try:
        return {r["user_id"]: dict(r) for r in conn.execute("SELECT user_id, active, changed_by, changed_at FROM user_status")}
    except sqlite3.Error:
        return {}
    finally:
        conn.close()

@app.get("/api/admin/users")
def get_admin_users_endpoint(_user: Dict[str, Any] = Depends(require("MANAGE_USERS"))):
    states = _user_states()
    users_list = []
    for email, u in INSTITUTIONAL_DIRECTORY.items():
        role_perm = ROLES_PERMISSIONS.get(u.get("role", "JUDICIAL_USER"), {})
        st = states.get(u.get("user_id"))
        status_val = "SUSPENDED" if st and not st["active"] else "ACTIVE"
        users_list.append({
            "user_id": u.get("user_id"),
            "username": email,
            "email": email,
            "full_name": u.get("full_name"),
            "designation": u.get("designation"),
            "institution": u.get("institution"),
            "role": u.get("role"),
            "scope_role": u.get("scope_role"),
            "badge_id": u.get("badge_id"),
            "status": status_val,
            "status_changed_at": st["changed_at"] if st else None,
            "status_changed_by": st["changed_by"] if st else None,
            "permissions": role_perm.get("permissions", []),
        })
    return {"users": users_list}

@app.post("/api/admin/toggle_user")
def toggle_user_status_endpoint(payload: Dict[str, Any], request: Request, _user: Dict[str, Any] = Depends(require("MANAGE_USERS"))):
    identifier = str(payload.get("email") or payload.get("username") or payload.get("user_id") or "").strip().lower()
    matched_email = None
    for email_key, u_info in INSTITUTIONAL_DIRECTORY.items():
        if email_key.lower() == identifier or str(u_info.get("user_id", "")).lower() == identifier or str(u_info.get("badge_id", "")).lower() == identifier:
            matched_email = email_key
            break
    if not matched_email:
        raise HTTPException(status_code=404, detail="User not found")
    uid = INSTITUTIONAL_DIRECTORY[matched_email]["user_id"]
    if uid == (_user.get("user_id") or _user.get("sub")):
        raise AuthError(409, "You cannot suspend your own account.", "CANNOT_SUSPEND_SELF")
    conn = get_connection()
    try:
        row = conn.execute("SELECT active FROM user_status WHERE user_id = ?", (uid,)).fetchone()
        was_active = True if row is None else bool(row[0])
        new_active = 0 if was_active else 1
        conn.execute(
            "INSERT INTO user_status (user_id, active, changed_by, changed_at) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(user_id) DO UPDATE SET active = excluded.active, changed_by = excluded.changed_by, changed_at = excluded.changed_at",
            (uid, new_active, _user.get("email") or _user.get("full_name"), datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
        conn.commit()
    finally:
        conn.close()
    new_status = "ACTIVE" if new_active else "SUSPENDED"
    log_audit("ADMIN_TOGGLE_USER", f"User {matched_email} ({uid}) status changed to {new_status}", request=request)
    return {"success": True, "email": matched_email, "new_status": new_status, "status": new_status}

def _audit_filter(action, user, q, since, until, role):
    where, params = [], []
    if action:
        where.append("UPPER(action) = ?")
        params.append(action.strip().upper())
    if user:
        where.append("LOWER(user_name) LIKE ?")
        params.append(f"%{user.strip().lower()}%")
    if q:
        where.append("LOWER(COALESCE(details, '')) LIKE ?")
        params.append(f"%{q.strip().lower()}%")
    if role:
        where.append("UPPER(user_role) = ?")
        params.append(role.strip().upper())
    for label, val, op in (("since", since, ">="), ("until", until, "<=")):
        if val:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", val.strip()):
                raise HTTPException(status_code=422, detail=f"{label} must be YYYY-MM-DD")
            where.append(f"substr(timestamp, 1, 10) {op} ?")
            params.append(val.strip())
    return where, params

def _csv_cell(v) -> str:
    """Neutralise spreadsheet formula injection: cells starting with = + - @ (or tab/CR) get a leading quote."""
    t = "" if v is None else str(v)
    if t and t[0] in ("=", "+", "-", "@", "\t", "\r"):
        t = "'" + t
    return t

@app.get("/api/export/audit_csv")
def export_audit_csv_endpoint(
    action: Optional[str] = Query(None), user: Optional[str] = Query(None), q: Optional[str] = Query(None),
    since: Optional[str] = Query(None), until: Optional[str] = Query(None), role: Optional[str] = Query(None),
    bom: Optional[int] = Query(0),
    _user: Dict[str, Any] = Depends(require_any("VIEW_AUDIT", "EXPORT_AUDIT_LOGS")),
):
    """Streams every matching audit row (no row cap), newest first, in keyset pages."""
    where, params = _audit_filter(action, user, q, since, until, role)

    def rows_iter():
        buf = io.StringIO()
        w = csv.writer(buf, quoting=csv.QUOTE_ALL, lineterminator="\n")
        if bom:
            buf.write("\ufeff")
        w.writerow(["Log_ID", "Timestamp", "User_Name", "User_Role", "Action", "Details", "IP_Address"])
        yield buf.getvalue(); buf.seek(0); buf.truncate()
        last_id = None
        while True:
            cond = list(where); prm = list(params)
            if last_id is not None:
                cond.append("id < ?"); prm.append(last_id)
            sql = "SELECT id, timestamp, user_name, user_role, action, details, ip_address FROM audit_logs"
            if cond:
                sql += " WHERE " + " AND ".join(cond)
            sql += " ORDER BY id DESC LIMIT 1000"
            conn = get_connection()
            try:
                page = conn.execute(sql, prm).fetchall()
            finally:
                conn.close()
            if not page:
                break
            for r in page:
                w.writerow([r[0]] + [_csv_cell(c) for c in r[1:]])
            yield buf.getvalue(); buf.seek(0); buf.truncate()
            last_id = page[-1][0]
            if len(page) < 1000:
                break

    return StreamingResponse(
        rows_iter(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=gyanam_institutional_audit_log.csv"}
    )

# ----------------- REAL-TIME COURT SYNC DAEMON -----------------
@app.get("/api/sync/status")
def sync_status_endpoint(_user: Dict[str, Any] = Depends(get_current_user_from_header)):
    # Read-only freshness indicator shown in the top bar for every signed-in role (not just
    # MANAGE_CORPUS/VIEW_AUDIT); only the mutating /api/sync/trigger stays permission-gated.
    return get_sync_status()

@app.post("/api/sync/trigger")
def sync_trigger_endpoint(request: Request, batch_size: Optional[int] = 12, _user: Dict[str, Any] = Depends(require("MANAGE_CORPUS"))):
    batch_size = max(1, min(int(batch_size or 12), 500))
    log_audit("SYNC_TRIGGERED", f"Initiated sync batch (mode: simulated, batch: {batch_size})", request=request)
    result = run_incremental_sync(batch_size=batch_size)
    return result

@app.get("/api/sync/history")
def sync_history_endpoint(_user: Dict[str, Any] = Depends(require_any("MANAGE_CORPUS", "VIEW_AUDIT"))):
    return get_sync_history()

# ----------------- DPDP ACT & CRYPTOGRAPHIC LEDGER -----------------
@app.get("/api/audit/ledger/verify")
def verify_audit_ledger_endpoint(_user: Dict[str, Any] = Depends(require_any("VIEW_AUDIT", "VERIFY_LEDGER"))):
    return verify_ledger_integrity()

@app.post("/api/admin/audit/resync-ledger")
def resync_audit_ledger_endpoint(request: Request, _user: Dict[str, Any] = Depends(require("MANAGE_USERS"))):
    """Re-attempt the ledger write for every audit_logs row flagged ledger_synced = 0 (idempotent)."""
    summary = resync_pending_ledger()
    # One summary event for the whole run -- never one audit row per resynced row (would recurse).
    log_audit("AUDIT_LEDGER_RESYNC", json.dumps(summary), request=request, user=_user)
    return summary

@app.get("/api/audit/ledger/blocks")
def get_ledger_blocks_endpoint(limit: Optional[int] = 20, _user: Dict[str, Any] = Depends(require_any("VIEW_AUDIT", "VERIFY_LEDGER"))):
    return get_ledger_blocks(limit=max(1, min(int(limit or 20), 500)))

@app.get("/api/audit_logs")
def get_audit_logs(
    action: Optional[str] = Query(None, description="Exact action name, case-insensitive"),
    user: Optional[str] = Query(None, description="Substring of user name"),
    q: Optional[str] = Query(None, description="Substring of details"),
    since: Optional[str] = Query(None, description="YYYY-MM-DD, inclusive"),
    until: Optional[str] = Query(None, description="YYYY-MM-DD, inclusive"),
    role: Optional[str] = Query(None, description="Exact user role, case-insensitive"),
    offset: int = Query(0, ge=0),
    limit: Optional[int] = Query(None, ge=1, description="Max rows (default 50 unfiltered / 200 filtered, max 1000)"),
    _user: Dict[str, Any] = Depends(require_any("VIEW_AUDIT", "EXPORT_AUDIT_LOGS")),
):
    """Audit rows, newest first: {logs, total, offset}. total counts all matches before paging."""
    where, params = _audit_filter(action, user, q, since, until, role)
    # Callers with no filters keep the old 50-row page.
    default_limit = 200 if where else 50
    eff_limit = max(1, min(limit if limit is not None else default_limit, 1000))
    wsql = (" WHERE " + " AND ".join(where)) if where else ""
    conn = get_connection()
    try:
        total = conn.execute("SELECT COUNT(*) FROM audit_logs" + wsql, params).fetchone()[0]
        rows = conn.execute("SELECT * FROM audit_logs" + wsql + " ORDER BY id DESC LIMIT ? OFFSET ?",
                            params + [eff_limit, offset]).fetchall()
    finally:
        conn.close()
    return {"logs": [dict(r) for r in rows], "total": total, "offset": offset}

# ----------------- DOCUMENTATION SERVING -----------------
def _doc_basenames():
    if not os.path.isdir(DOCS_DIR):
        return []
    return sorted(f for f in os.listdir(DOCS_DIR) if f.endswith(".md") and os.path.isfile(os.path.join(DOCS_DIR, f)))

RESTRICTED_DOCS = {"COMMERCIAL_PROPOSAL_GYANAM_AI.md"}

def _can_see_restricted_docs(request: Request) -> bool:
    try:
        user = get_current_user_from_header(request, request.headers.get("authorization"))
    except Exception:
        return False
    return bool(getattr(request.state, "legacy_fallback", False) or check_permission(user, "MANAGE_USERS"))

@app.get("/api/docs/list")
def list_institutional_docs(request: Request):
    show_all = _can_see_restricted_docs(request)
    return [{
        "filename": f,
        "title": f.replace(".md", "").replace("_", " ").title(),
        "path": f,
    } for f in _doc_basenames() if show_all or f not in RESTRICTED_DOCS]

@app.get("/api/docs/read/{filename}")
def read_doc_file(filename: str, request: Request):
    # Only exact basenames that appear in /api/docs/list are served (no traversal).
    if filename not in _doc_basenames():
        raise HTTPException(status_code=404, detail="Document not found")
    if filename in RESTRICTED_DOCS:
        # Commercial documents need MANAGE_USERS whenever auth is enforced.
        user = get_current_user_from_header(request, request.headers.get("authorization"))
        if not getattr(request.state, "legacy_fallback", False) and not check_permission(user, "MANAGE_USERS"):
            raise AuthError(403, "Role lacks permission MANAGE_USERS.", "FORBIDDEN_PERMISSION")
    with open(os.path.join(DOCS_DIR, filename), "r", encoding="utf-8") as f:
        return {"filename": filename, "content": f.read()}

# ----------------- FRONTEND WEB APP -----------------
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

try:
    from ui_routes import router as ui_router
    app.include_router(ui_router)
except ImportError as _imp_err:
    print(f"ui_routes not loaded: {_imp_err}")

# Feature routers (docs/API_V3_CONTRACT.md). Each module owns its routes and permission dependencies.
for _mod_name in ("document_routes", "search_routes", "draft_routes", "corpus_routes"):
    try:
        _mod = __import__(_mod_name)
        app.include_router(_mod.router)
    except ImportError as _imp_err:
        print(f"{_mod_name} not loaded: {_imp_err}")

GYANAM_UI = os.environ.get("GYANAM_UI", "new").strip().lower()
APP_DIR = os.path.join(FRONTEND_DIR, "app")

@app.get("/favicon.ico", include_in_schema=False)
def get_favicon():
    favicon_path = os.path.join(FRONTEND_DIR, "nluj_seal.png")
    if os.path.exists(favicon_path):
        return FileResponse(favicon_path, media_type="image/png")
    raise HTTPException(status_code=404, detail="Favicon not found")

@app.api_route("/legacy", methods=["GET", "HEAD"], response_class=HTMLResponse)
def serve_legacy_ui():
    html_file = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(html_file):
        with open(html_file, "r", encoding="utf-8") as f:
            return f.read()
    raise HTTPException(status_code=404, detail="Legacy UI not found")

@app.api_route("/", methods=["GET", "HEAD"], response_class=HTMLResponse)
def serve_ui():
    if GYANAM_UI == "new":
        new_index = os.path.join(APP_DIR, "index.html")
        if os.path.exists(new_index):
            # The new UI uses document-relative asset URLs (css/, js/, icons.svg), so it must live
            # under /app/. Serving it at "/" left every asset a 404 (found by the e2e suite).
            return RedirectResponse(url="/app/", status_code=307)
    html_file = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(html_file):
        with open(html_file, "r", encoding="utf-8") as f:
            return f.read()
    return "<h1>Gyanam AI Server Running. Frontend is compiling...</h1>"

@app.get("/presentation", response_class=HTMLResponse)
@app.get("/slides", response_class=HTMLResponse)
def serve_presentation():
    pres_file = os.path.join(FRONTEND_DIR, "presentation.html")
    if os.path.exists(pres_file):
        with open(pres_file, "r", encoding="utf-8") as f:
            return f.read()
    raise HTTPException(status_code=404, detail="Presentation not found")

@app.api_route("/pdf", methods=["GET", "HEAD"])
@app.api_route("/dossier", methods=["GET", "HEAD"])
@app.api_route("/dossier.pdf", methods=["GET", "HEAD"])
@app.api_route("/architecture.pdf", methods=["GET", "HEAD"])
def serve_architecture_pdf():
    pdf_path = os.path.join(FRONTEND_DIR, "SYSTEM_ARCHITECTURE_AND_TENDER_DOSSIER_GYANAM_AI.pdf")
    if os.path.exists(pdf_path):
        return FileResponse(
            pdf_path,
            media_type="application/pdf",
            filename="SYSTEM_ARCHITECTURE_AND_TENDER_DOSSIER_GYANAM_AI.pdf"
        )
    raise HTTPException(status_code=404, detail="System Architecture PDF not found")

# /app static mount (registered last so it never shadows API routes)
if os.path.isdir(APP_DIR):
    class _RevalidatingStatic(StaticFiles):
        """Browsers must revalidate (ETag/Last-Modified) on every load so a deploy never serves stale ES modules."""
        async def get_response(self, path, scope):
            resp = await super().get_response(path, scope)
            if resp.status_code in (200, 304):
                resp.headers["Cache-Control"] = "no-cache"
            return resp

    app.mount("/app", _RevalidatingStatic(directory=APP_DIR, html=True), name="app")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8090))
    print(f"Starting Gyanam AI Server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)

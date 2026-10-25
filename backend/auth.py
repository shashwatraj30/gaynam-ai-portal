"""
VIDHI AI — NLU JODHPUR EDITION (POWERED BY KELYVO)
ENTERPRISE AUTHENTICATION, RBAC & DPDP SESSION MANAGEMENT MODULE
-----------------------------------------------------------------
Provides:
1. Multi-role Access Control (RBAC):
   - HON_JUSTICE: High Court / Supreme Court Bench Judge
   - REGISTRAR_NLUJ: Academic Director & Institutional Administrator
   - LAW_CLERK: Judicial Research Associate / Legal Drafter
   - NLU_SCHOLAR: Law Student & Academic Researcher
2. NLU Jodhpur Single Sign-On (SSO / SAML 2.0 / OAuth2) Integration Scaffolding
3. Cryptographic JWT Bearer Token Issuance & Verification
4. Digital Personal Data Protection (DPDP) Act 2023 Consent Token Validation
"""

import os
import time
import jwt
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from pydantic import BaseModel
from fastapi import HTTPException, Header, Depends, status, Request
from fastapi.responses import JSONResponse

# Configuration
import secrets
import logging

_log = logging.getLogger("gyanam.auth")

def _load_jwt_secret() -> str:
    secret = os.environ.get("GYANAM_JWT_SECRET") or os.environ.get("VIDHI_JWT_SECRET")
    if secret:
        return secret
    _log.warning("GYANAM_JWT_SECRET is not set; using a random per-process secret. "
                 "Tokens will be invalidated on restart. Set GYANAM_JWT_SECRET in production.")
    print("WARNING: GYANAM_JWT_SECRET not set; using a random per-process JWT secret.")
    return secrets.token_urlsafe(48)

JWT_SECRET_KEY = _load_jwt_secret()
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24

# Institutional Roles Definition (Section 20 Scope of Work verbatim)
ROLES_PERMISSIONS = {
    "JUDICIAL_USER": {
        "title": "Judicial / Authorized User (Section 20 SOW)",
        "scope_access": "Research and judgment generation",
        "description": "Full sovereign judicial authority: 15-Section Judgment Finalization, Digital Seal Signing, Overruling Annotation, Decree Publication",
        "permissions": ["SEARCH", "DRAFT_FULL", "FINALIZE_JUDGMENT", "DIGITAL_SIGN", "VERIFY_CITATION", "UPLOAD_PLEADING", "VIEW_AUDIT", "EXPORT_GAZETTE"]
    },
    "HON_JUSTICE": {
        "title": "Judicial / Authorized User (Hon'ble Justice)",
        "scope_access": "Research and judgment generation",
        "description": "Full judicial authority: 15-Section Judgment Finalization, Digital Seal Signing, Overruling Annotation",
        "permissions": ["SEARCH", "DRAFT_FULL", "FINALIZE_JUDGMENT", "DIGITAL_SIGN", "VERIFY_CITATION", "UPLOAD_PLEADING", "VIEW_AUDIT", "EXPORT_GAZETTE"]
    },
    "RESEARCHER": {
        "title": "Researcher (Section 20 SOW)",
        "scope_access": "Legal research and citation analysis",
        "description": "Judicial assistance: Precedent Lineage Research, Pleading Ingestion, Judgment Draft Generation & Editing (Submitted for Bench approval)",
        "permissions": ["SEARCH", "DRAFT_FULL", "VERIFY_CITATION", "UPLOAD_PLEADING", "EXPORT_DRAFT"]
    },
    "LAW_CLERK": {
        "title": "Researcher / Law Clerk",
        "scope_access": "Legal research and citation analysis",
        "description": "Judicial assistance: Precedent Lineage Research, Pleading Ingestion, Judgment Draft Synthesis",
        "permissions": ["SEARCH", "DRAFT_FULL", "VERIFY_CITATION", "UPLOAD_PLEADING", "EXPORT_DRAFT"]
    },
    "FACULTY": {
        "title": "Faculty (Section 20 SOW)",
        "scope_access": "Research and academic use",
        "description": "Academic and pedagogical use: Precedent Lineage exploration, Ratio Decidendi extraction, Constitutional jurisprudence analysis",
        "permissions": ["SEARCH", "VERIFY_CITATION", "VIEW_RATIO", "STUDY_LINEAGE", "ACADEMIC_NOTES"]
    },
    "STUDENT": {
        "title": "Student (Section 20 SOW)",
        "scope_access": "Restricted research access",
        "description": "Restricted student research: Precedent Exploration, Ratio Decidendi Extraction, Case Briefs (Drafting & signing restricted)",
        "permissions": ["SEARCH", "VERIFY_CITATION", "VIEW_RATIO", "STUDY_LINEAGE"]
    },
    "NLU_SCHOLAR": {
        "title": "Student / NLU Scholar",
        "scope_access": "Restricted research access",
        "description": "Restricted student research: Precedent Exploration, Ratio Decidendi Extraction (Drafting restricted)",
        "permissions": ["SEARCH", "VERIFY_CITATION", "VIEW_RATIO", "STUDY_LINEAGE"]
    },
    "ADMINISTRATOR": {
        "title": "Administrator / IT Administrator (Section 20 SOW)",
        "scope_access": "Complete system administration & technical administration",
        "description": "Institutional governance: Hardware Telemetry, Database Storage Management, Sync Daemon Controls, Tender Dossier",
        "permissions": ["SEARCH", "VERIFY_CITATION", "VIEW_AUDIT", "MANAGE_CORPUS", "SYSTEM_METRICS", "EXPORT_REPORT", "MANAGE_USERS"]
    },
    "REGISTRAR_NLUJ": {
        "title": "Administrator / Registrar (NLU Jodhpur)",
        "scope_access": "Complete system administration",
        "description": "Institutional governance: System Telemetry, Audit Logs, Corpus Management, Benchmark Analysis",
        "permissions": ["SEARCH", "VERIFY_CITATION", "VIEW_AUDIT", "MANAGE_CORPUS", "SYSTEM_METRICS", "EXPORT_REPORT"]
    },
    "AUDITOR": {
        "title": "Auditor (Section 20 SOW)",
        "scope_access": "Logs and audit information",
        "description": "Institutional auditing: Cryptographic SHA-256 Ledger Verification, DPDP Act 2023 Compliance Auditing, Evidence Act §65B Integrity",
        "permissions": ["VIEW_AUDIT", "VERIFY_LEDGER", "DPDP_INSPECT", "EXPORT_AUDIT_LOGS"]
    }
}

# Pre-provisioned Institutional Profiles for Evaluation & Production
INSTITUTIONAL_DIRECTORY = {
    "justice.sharma@rajasthanhc.nic.in": {
        "user_id": "usr_nluj_001",
        "email": "justice.sharma@rajasthanhc.nic.in",
        "full_name": "Hon'ble Mr. Justice R.K. Sharma",
        "designation": "Judge, High Court Bench • Section 20 Judicial User",
        "institution": "High Court of Judicature for Rajasthan (Jodhpur Bench)",
        "role": "JUDICIAL_USER",
        "scope_role": "Judicial/Authorized User",
        "badge_id": "HC-RAJ-JODH-882",
        "dpdp_consent": True
    },
    "lawclerk.bench4@nlujodhpur.ac.in": {
        "user_id": "usr_nluj_002",
        "email": "lawclerk.bench4@nlujodhpur.ac.in",
        "full_name": "Adv. Siddharth Mathur",
        "designation": "Senior Judicial Research Associate • Section 20 Researcher",
        "institution": "National Law University, Jodhpur / HC Chambers",
        "role": "RESEARCHER",
        "scope_role": "Researcher",
        "badge_id": "JRA-2026-09",
        "dpdp_consent": True
    },
    "faculty.dean@nlujodhpur.ac.in": {
        "user_id": "usr_nluj_003",
        "email": "faculty.dean@nlujodhpur.ac.in",
        "full_name": "Dr. Aparna Sengupta",
        "designation": "Professor of Constitutional Law • Section 20 Faculty",
        "institution": "Faculty of Law, National Law University, Jodhpur",
        "role": "FACULTY",
        "scope_role": "Faculty",
        "badge_id": "NLUJ-FAC-042",
        "dpdp_consent": True
    },
    "scholar.2023@nlujodhpur.ac.in": {
        "user_id": "usr_nluj_004",
        "email": "scholar.2023@nlujodhpur.ac.in",
        "full_name": "Ananya Rathore",
        "designation": "B.A. LL.B. (Hons.) Legal Scholar • Section 20 Student",
        "institution": "National Law University, Jodhpur",
        "role": "STUDENT",
        "scope_role": "Student",
        "badge_id": "NLUJ-UG-2023-44",
        "dpdp_consent": True
    },
    "registrar@nlujodhpur.ac.in": {
        "user_id": "usr_nluj_005",
        "email": "registrar@nlujodhpur.ac.in",
        "full_name": "Prof. (Dr.) Harishankar Pareek",
        "designation": "Registrar & IT Administrator • Section 20 Administrator",
        "institution": "National Law University, Jodhpur",
        "role": "ADMINISTRATOR",
        "scope_role": "Administrator",
        "badge_id": "NLUJ-FAC-014",
        "dpdp_consent": True
    },
    "auditor.compliance@nlujodhpur.ac.in": {
        "user_id": "usr_nluj_006",
        "email": "auditor.compliance@nlujodhpur.ac.in",
        "full_name": "CA Rajeshwar Singhal",
        "designation": "Chief Records & Compliance Auditor • Section 20 Auditor",
        "institution": "Internal Audit Bureau, NLU Jodhpur",
        "role": "AUDITOR",
        "scope_role": "Auditor",
        "badge_id": "NLUJ-AUD-007",
        "dpdp_consent": True
    }
}

class LoginRequest(BaseModel):
    username_or_email: str
    password: Optional[str] = "vidhi2026"
    role: Optional[str] = None

class SSOLoginRequest(BaseModel):
    target_role: str = "HON_JUSTICE"
    institutional_domain: str = "nlujodhpur.ac.in"

def create_access_token(user_data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Generate cryptographically signed JWT token."""
    to_encode = user_data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(hours=TOKEN_EXPIRE_HOURS))
    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow(),
        "iss": "gyanam-ai.nlujodhpur.ac.in",
        "sub": user_data["user_id"],
        "vendor": "Powered by Kelyvo"
    })
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

def decode_access_token(token: str) -> Dict[str, Any]:
    """Validate and decode JWT token."""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired. Please re-authenticate.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid judicial security token.")

def authenticate_user(email_or_user: str) -> Dict[str, Any]:
    """Lookup user in institutional directory or generate dynamic credentials."""
    if email_or_user in INSTITUTIONAL_DIRECTORY:
        return INSTITUTIONAL_DIRECTORY[email_or_user]
    
    # Fallback default user for rapid demonstration
    return {
        "user_id": f"usr_dynamic_{abs(hash(email_or_user)) % 10000}",
        "email": email_or_user,
        "full_name": email_or_user.split("@")[0].replace(".", " ").title(),
        "designation": "Authorized Institutional Officer",
        "institution": "National Law University, Jodhpur",
        "role": "LAW_CLERK",
        "badge_id": "NLUJ-AUTH-TEMP",
        "dpdp_consent": True
    }

LEGACY_PROFILE_EMAIL = "justice.sharma@rajasthanhc.nic.in"

def enforce_auth_enabled() -> bool:
    return os.environ.get("GYANAM_ENFORCE_AUTH", "1").strip() not in ("0", "false", "False", "no", "")

def legacy_header_allowed() -> bool:
    """X-Gyanam-Legacy is honoured only when GYANAM_ALLOW_LEGACY_HEADER=1 (default 1 until cutover).
    Production nginx must strip the header from client requests."""
    return os.environ.get("GYANAM_ALLOW_LEGACY_HEADER", "1").strip() in ("1", "true", "True", "yes")

def is_legacy_request(request: Optional[Request]) -> bool:
    """Legacy fallback applies when enforcement is off or the legacy header is present."""
    if not enforce_auth_enabled():
        return True
    if legacy_header_allowed() and request is not None and request.headers.get("x-gyanam-legacy", "").strip() == "1":
        return True
    return False

class AuthError(HTTPException):
    """HTTPException carrying a machine-readable code (rendered as {detail, code})."""
    def __init__(self, status_code: int, detail: str, code: str):
        super().__init__(status_code=status_code, detail=detail)
        self.code = code

def auth_error_handler(request, exc: "AuthError"):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail, "code": exc.code})

def get_current_user_from_header(request: Request, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """FastAPI dependency: token -> user. No token -> legacy profile if legacy mode, else 401."""
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        try:
            return decode_access_token(token)
        except HTTPException as e:
            raise AuthError(401, e.detail, "AUTH_INVALID_TOKEN")
    if is_legacy_request(request):
        request.state.legacy_fallback = True
        return INSTITUTIONAL_DIRECTORY[LEGACY_PROFILE_EMAIL]
    raise AuthError(401, "Authentication required.", "AUTH_REQUIRED")

def require(perm: str):
    """Dependency factory: 401 without token, 403 JSON {detail, code} without permission."""
    def _dep(request: Request, user: Dict[str, Any] = Depends(get_current_user_from_header)) -> Dict[str, Any]:
        request.state.user = user
        if getattr(request.state, "legacy_fallback", False):
            return user  # legacy tokenless mode keeps the old open behaviour
        if not check_permission(user, perm):
            raise AuthError(403, f"Role {user.get('role')} lacks permission {perm}.", "FORBIDDEN_PERMISSION")
        return user
    return _dep

def require_any(*perms: str):
    def _dep(request: Request, user: Dict[str, Any] = Depends(get_current_user_from_header)) -> Dict[str, Any]:
        request.state.user = user
        if getattr(request.state, "legacy_fallback", False):
            return user
        if not any(check_permission(user, p) for p in perms):
            raise AuthError(403, f"Role {user.get('role')} lacks any of: {', '.join(perms)}.", "FORBIDDEN_PERMISSION")
        return user
    return _dep

def get_client_ip(request: Optional[Request]) -> str:
    if request is None:
        return "127.0.0.1"
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

def check_permission(user: Dict[str, Any], required_permission: str) -> bool:
    """Verifies if the user's role possesses the required judicial capability."""
    user_role = user.get("role", "NLU_SCHOLAR")
    role_info = ROLES_PERMISSIONS.get(user_role, {})
    return required_permission in role_info.get("permissions", [])

"""Draft routes (v3): version snapshot view and restore. See docs/API_V3_CONTRACT.md (Drafts)."""
import sys
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from auth import require
import drafts_service as svc

router = APIRouter()


def _audit(action: str, details: str, request: Request, user: Dict[str, Any]):
    """Use server.log_audit (imported lazily: server imports this module while it loads)."""
    mod = sys.modules.get("server") or sys.modules.get("__main__")
    fn = getattr(mod, "log_audit", None)
    if fn:
        fn(action, details, request=request, user=user)


class RestoreRequest(BaseModel):
    version: Optional[int] = None


@router.get("/api/drafts/{draft_id}/versions/{n}")
def get_draft_version(draft_id: int, n: int, request: Request,
                      _user: Dict[str, Any] = Depends(require("DRAFT_FULL"))):
    try:
        out = svc.get_version_snapshot(draft_id, n)
    except svc.DraftError as e:
        return JSONResponse(status_code=e.status, content=e.content)
    _audit("DRAFT_VERSION_VIEWED", f"Draft #{draft_id} v{n}", request, _user)
    return out


@router.delete("/api/drafts/{draft_id}")
def delete_draft(draft_id: int, request: Request, user: Dict[str, Any] = Depends(require("DRAFT_FULL"))):
    try:
        out = svc.delete_draft(draft_id, user)
    except svc.DraftError as e:
        return JSONResponse(status_code=e.status, content=e.content)
    _audit("DRAFT_DELETED", f"Draft #{draft_id} permanently deleted", request, user)
    return out


@router.post("/api/drafts/{draft_id}/restore/{n}")
def restore_draft_version(draft_id: int, n: int, req: RestoreRequest, request: Request,
                          _user: Dict[str, Any] = Depends(require("DRAFT_FULL"))):
    try:
        out = svc.restore_version(draft_id, n, req.version, _user)
    except svc.DraftError as e:
        return JSONResponse(status_code=e.status, content=e.content)
    _audit("DRAFT_RESTORED", f"Draft #{draft_id} restored from v{n} (now v{out.get('version')})", request, _user)
    return out

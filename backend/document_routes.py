"""Documents routes (docs/API_V3_CONTRACT.md). Service logic lives in documents.py."""
import os
import sys
from typing import Any, Dict, Optional
from urllib.parse import quote

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import documents as svc  # noqa: E402
from auth import require, require_any  # noqa: E402

router = APIRouter()

_access = Depends(require_any("UPLOAD_PLEADING", "DRAFT_FULL"))


def _call(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except svc.DocError as e:
        raise HTTPException(status_code=e.status, detail=e.detail())


@router.post("/api/documents", status_code=201)
async def create_document(
    request: Request,
    file: Optional[UploadFile] = File(None),
    text: Optional[str] = Form(None),
    doc_type: str = Form("OTHER"),
    title: Optional[str] = Form(None),
    matter_key: Optional[str] = Form(None),
    sample: Optional[str] = Form(None),
    user: Dict[str, Any] = Depends(require("UPLOAD_PLEADING")),
):
    saved = None
    if file is not None and file.filename and not sample:
        saved = await svc._server().save_upload(file)  # 415 / 413 as everywhere else
    return await run_in_threadpool(
        _call, svc.create_document, user=user, request=request, saved=saved,
        text=None if (saved or sample) else text, sample=sample, doc_type=doc_type,
        title=title or "", matter_key=matter_key or "")


@router.get("/api/documents", dependencies=[_access])
def list_documents(matter_key: str = "", doc_type: str = "", status: str = "", q: str = "",
                   limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0)):
    return _call(svc.list_documents, matter_key=matter_key, doc_type=doc_type, status=status, q=q,
                 limit=limit, offset=offset)


@router.get("/api/documents/{doc_id}", dependencies=[_access])
def get_document(doc_id: str):
    return _call(svc.get_document, doc_id)


@router.get("/api/documents/{doc_id}/text", dependencies=[_access])
def get_document_text(doc_id: str, offset: int = Query(0, ge=0), limit: int = Query(20000, ge=1, le=200000)):
    return _call(svc.get_text, doc_id, offset, limit)


@router.get("/api/documents/{doc_id}/file")
def get_document_file(doc_id: str, request: Request, user: Dict[str, Any] = Depends(require_any("UPLOAD_PLEADING", "DRAFT_FULL"))):
    path, mime, name, doc = _call(svc.file_info, doc_id)
    svc.audit("DOCUMENT_FILE_VIEWED", doc, f"original file viewed ({name})", request=request, user=user)
    ascii_name = "".join(c if 32 <= ord(c) < 127 and c not in ('"', chr(92)) else "_" for c in name)
    disp = f'inline; filename="{ascii_name}"; filename*=UTF-8\'\'{quote(name)}'
    return FileResponse(path, media_type=mime, headers={"Content-Disposition": disp})


@router.patch("/api/documents/{doc_id}")
def patch_document(doc_id: str, request: Request, body: Dict[str, Any] = Body(...), user: Dict[str, Any] = Depends(require_any("UPLOAD_PLEADING", "DRAFT_FULL"))):
    return _call(svc.patch_document, doc_id, body, user, request)


@router.put("/api/documents/{doc_id}/extraction")
def put_extraction(doc_id: str, request: Request, body: Dict[str, Any] = Body(...), user: Dict[str, Any] = Depends(require_any("UPLOAD_PLEADING", "DRAFT_FULL"))):
    return _call(svc.save_extraction, doc_id, body, user, request)


@router.post("/api/documents/{doc_id}/confirm")
def confirm(doc_id: str, request: Request, body: Dict[str, Any] = Body(...), user: Dict[str, Any] = Depends(require_any("UPLOAD_PLEADING", "DRAFT_FULL"))):
    return _call(svc.confirm_document, doc_id, body, user, request)


@router.post("/api/documents/{doc_id}/archive")
def archive(doc_id: str, request: Request, user: Dict[str, Any] = Depends(require_any("UPLOAD_PLEADING", "DRAFT_FULL"))):
    return _call(svc.archive_document, doc_id, user, request)


@router.delete("/api/documents/{doc_id}")
def delete(doc_id: str, request: Request, user: Dict[str, Any] = Depends(require_any("UPLOAD_PLEADING", "DRAFT_FULL"))):
    return _call(svc.delete_document, doc_id, user, request)


@router.post("/api/documents/{doc_id}/research", dependencies=[Depends(require("SEARCH"))])
def research(doc_id: str, request: Request, body: Dict[str, Any] = Body(default_factory=dict), user: Dict[str, Any] = Depends(require_any("UPLOAD_PLEADING", "DRAFT_FULL"))):
    return _call(svc.research, doc_id, body, user, request)


@router.get("/api/documents/{doc_id}/pins", dependencies=[_access])
def get_pins(doc_id: str):
    return _call(svc.list_pins, doc_id)


@router.post("/api/documents/{doc_id}/pins")
def post_pin(doc_id: str, request: Request, body: Dict[str, Any] = Body(...), user: Dict[str, Any] = Depends(require_any("UPLOAD_PLEADING", "DRAFT_FULL"))):
    return _call(svc.add_pin, doc_id, body, user, request)


@router.delete("/api/documents/{doc_id}/pins/{judgment_id}")
def delete_pin(doc_id: str, judgment_id: int, request: Request, user: Dict[str, Any] = Depends(require_any("UPLOAD_PLEADING", "DRAFT_FULL"))):
    return _call(svc.remove_pin, doc_id, judgment_id, user, request)


@router.post("/api/documents/{doc_id}/draft-params", dependencies=[_access])
def draft_params(doc_id: str):
    return _call(svc.draft_params, doc_id)

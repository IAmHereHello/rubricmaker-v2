import shutil
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from ..database import get_db
from ..models import ScanImport

router = APIRouter(prefix="/scan-imports", tags=["scan-imports"])

# Next to rubricmaker.db (the backend runs from the folder that holds the database).
SCANS_DIR = Path("scans")
MAX_PAGE_BYTES = 8 * 1024 * 1024


class ImportIn(BaseModel):
    summary: str = ""
    done_count: int = 0
    total_count: int = 0
    state: Any


def _row(s: ScanImport, full: bool = False) -> dict:
    out = {
        "id": s.id, "created_at": s.created_at, "summary": s.summary,
        "done_count": s.done_count, "total_count": s.total_count,
    }
    if full:
        out["state"] = s.state
    return out


def _get(db: DBSession, id: int) -> ScanImport:
    s = db.query(ScanImport).filter(ScanImport.id == id).first()
    if not s:
        raise HTTPException(404, "Import niet gevonden")
    return s


def _page_path(id: int, n: int) -> Path:
    return SCANS_DIR / str(id) / f"{n}.jpg"


@router.get("")
def list_imports(db: DBSession = Depends(get_db)):
    return [_row(s) for s in db.query(ScanImport).order_by(ScanImport.id.desc()).all()]


@router.post("")
def create_import(body: ImportIn, db: DBSession = Depends(get_db)):
    s = ScanImport(**body.model_dump())
    db.add(s)
    db.commit()
    return _row(s, True)


@router.get("/{id}")
def get_import(id: int, db: DBSession = Depends(get_db)):
    return _row(_get(db, id), True)


@router.put("/{id}")
def update_import(id: int, body: ImportIn, db: DBSession = Depends(get_db)):
    s = _get(db, id)
    for k, v in body.model_dump().items():
        setattr(s, k, v)
    db.commit()
    return _row(s)


@router.delete("/{id}")
def delete_import(id: int, db: DBSession = Depends(get_db)):
    s = db.query(ScanImport).filter(ScanImport.id == id).first()
    if s:
        db.delete(s)
        db.commit()
    shutil.rmtree(SCANS_DIR / str(id), ignore_errors=True)
    return {"ok": True}


@router.put("/{id}/pages/{n}")
async def put_page(id: int, n: int, request: Request, db: DBSession = Depends(get_db)):
    _get(db, id)
    data = await request.body()
    if not data or len(data) > MAX_PAGE_BYTES or not data.startswith(b"\xff\xd8"):
        raise HTTPException(400, "Geen geldige JPEG")
    path = _page_path(id, n)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return {"ok": True}


@router.get("/{id}/pages/{n}")
def get_page(id: int, n: int):
    path = _page_path(id, n)
    if not path.is_file():
        raise HTTPException(404, "Scan niet gevonden")
    return FileResponse(path, media_type="image/jpeg")

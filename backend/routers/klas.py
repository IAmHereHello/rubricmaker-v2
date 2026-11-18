from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from .. import klas_transfer as kt
from ..database import get_db
from ..sharing import SharingError

router = APIRouter(prefix="/klas", tags=["klas"])


class ExportBody(BaseModel):
    class_name: str
    session_ids: Optional[List[int]] = None


class FileBody(BaseModel):
    file: dict


class ImportBody(BaseModel):
    file: dict
    mode: str                       # "new" | "update" | "merge"
    target: Optional[str] = None    # local class for update/merge
    new_name: Optional[str] = None  # class name for a new class
    accept: Optional[Dict[str, bool]] = None
    renames: Optional[Dict[str, str]] = None


class RenameBody(BaseModel):
    class_name: str
    new_name: str


class ClassBody(BaseModel):
    class_name: str


def _fail(exc):
    raise HTTPException(400, str(exc))


def _plan(db, body: ImportBody):
    if body.mode not in ("new", "update", "merge"):
        raise SharingError("Onbekende manier van importeren.")
    data = kt.read_class_file(body.file)
    return kt.Plan(db, data, body.mode, target=body.target, new_name=body.new_name,
                   accept=body.accept, renames=body.renames)


@router.get("/overview")
def overview(class_name: str, db: DBSession = Depends(get_db)):
    return kt.export_overview(db, class_name)


@router.post("/export")
def export(body: ExportBody, db: DBSession = Depends(get_db)):
    try:
        return kt.class_file(db, body.class_name, body.session_ids)
    except SharingError as exc:
        _fail(exc)


@router.post("/delete")
def delete_after_transfer(body: ClassBody, db: DBSession = Depends(get_db)):
    return {"deleted": kt.delete_class_everything(db, body.class_name)}


@router.post("/inspect")
def inspect(body: FileBody, db: DBSession = Depends(get_db)):
    try:
        return kt.inspect(db, body.file)
    except SharingError as exc:
        _fail(exc)


@router.post("/preview")
def preview(body: ImportBody, db: DBSession = Depends(get_db)):
    try:
        return _plan(db, body).preview()
    except SharingError as exc:
        _fail(exc)


@router.post("/apply")
def apply(body: ImportBody, db: DBSession = Depends(get_db)):
    try:
        return kt.apply(db, _plan(db, body))
    except SharingError as exc:
        db.rollback()
        _fail(exc)


@router.post("/rename")
def rename(body: RenameBody, db: DBSession = Depends(get_db)):
    try:
        return {"class_name": kt.rename_class(db, body.class_name, body.new_name)}
    except SharingError as exc:
        _fail(exc)

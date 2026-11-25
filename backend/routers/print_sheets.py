from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from ..database import get_db
from ..models import PrintSheet, Test

router = APIRouter(prefix="/print-sheets", tags=["print-sheets"])


class SheetIn(BaseModel):
    student_id: Optional[int] = None
    route: Optional[str] = None
    page: int = 1
    pages: int = 1
    layout: Any


class SheetsIn(BaseModel):
    test_id: int
    sheets: List[SheetIn]


def _out(s: PrintSheet) -> dict:
    return {
        "id": s.id, "test_id": s.test_id, "student_id": s.student_id, "route": s.route,
        "page": s.page, "pages": s.pages, "layout": s.layout,
    }


@router.post("")
def create_sheets(body: SheetsIn, db: DBSession = Depends(get_db)):
    if not db.query(Test).filter(Test.id == body.test_id).first():
        raise HTTPException(404, "Toets niet gevonden")
    rows = [PrintSheet(test_id=body.test_id, **s.model_dump()) for s in body.sheets]
    db.add_all(rows)
    db.commit()
    return [r.id for r in rows]


@router.get("")
def get_sheets(ids: str = Query(""), db: DBSession = Depends(get_db)):
    wanted = [int(x) for x in ids.split(",") if x.strip().isdigit()]
    if not wanted:
        return []
    return [_out(s) for s in db.query(PrintSheet).filter(PrintSheet.id.in_(wanted)).all()]


@router.get("/latest")
def latest_sheets(test_id: int, student_id: Optional[int] = None, route: Optional[str] = None,
                  db: DBSession = Depends(get_db)):
    """The most recently printed pages for a leerling, used to read a scan whose QR code
    is unreadable. Falls back to the newest blank print for that route, then to any print
    of the toets. Returns one row per page number (newest first wins)."""
    base = db.query(PrintSheet).filter(PrintSheet.test_id == test_id)
    candidates = []
    if student_id is not None:
        candidates.append(base.filter(PrintSheet.student_id == student_id))
    if route:
        candidates.append(base.filter(PrintSheet.student_id.is_(None), PrintSheet.route == route))
    candidates.append(base.filter(PrintSheet.student_id.is_(None)))
    candidates.append(base)
    for q in candidates:
        newest = q.order_by(PrintSheet.id.desc()).first()
        if not newest:
            continue
        rows = (base.filter(PrintSheet.student_id.is_(None) if newest.student_id is None else PrintSheet.student_id == newest.student_id)
                .filter(PrintSheet.route.is_(None) if newest.route is None else PrintSheet.route == newest.route)
                .order_by(PrintSheet.id.desc()).all())
        by_page = {}
        for r in rows:
            by_page.setdefault(r.page, r)
        return [_out(by_page[p]) for p in sorted(by_page)]
    return []

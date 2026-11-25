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

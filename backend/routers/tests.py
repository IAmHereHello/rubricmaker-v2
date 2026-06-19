from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List

from ..database import get_db
from ..models import Test
from ..schemas import TestCreate, TestOut

router = APIRouter(prefix="/tests", tags=["tests"])


def _serialize_test(t: Test) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "created_at": t.created_at,
        "questions": sorted(
            [
                {
                    "id": q.id,
                    "test_id": q.test_id,
                    "order": q.order,
                    "description": q.description,
                    "answer": q.answer or "",
                    "max_score": q.max_score,
                    "routes": q.routes or [],
                    "domain": q.domain or "",
                    "pyramid_level": q.pyramid_level,
                }
                for q in t.questions
            ],
            key=lambda x: x["order"],
        ),
    }


@router.get("", response_model=List[TestOut])
def list_tests(db: Session = Depends(get_db)):
    return db.query(Test).order_by(Test.created_at.desc()).all()


@router.post("", response_model=TestOut)
def create_test(test: TestCreate, db: Session = Depends(get_db)):
    obj = Test(**test.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/{id}")
def get_test(id: int, db: Session = Depends(get_db)):
    obj = (
        db.query(Test)
        .options(joinedload(Test.questions))
        .filter(Test.id == id)
        .first()
    )
    if not obj:
        raise HTTPException(404, "Toets niet gevonden")
    return _serialize_test(obj)


@router.delete("/{id}")
def delete_test(id: int, db: Session = Depends(get_db)):
    obj = db.query(Test).filter(Test.id == id).first()
    if not obj:
        raise HTTPException(404, "Toets niet gevonden")
    db.delete(obj)
    db.commit()
    return {"ok": True}

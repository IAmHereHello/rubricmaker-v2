from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List

from ..database import get_db
from ..models import Test
from ..schemas import TestCreate, TestUpdate, TestOut
from .. import opdracht_logic

router = APIRouter(prefix="/tests", tags=["tests"])


def _serialize_test(t: Test) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "created_at": t.created_at,
        "grading_method": t.grading_method,
        "grade_config": t.grade_config,
        "share_id": t.share_id,
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
                    "learning_goal": q.learning_goal,
                    "learning_goal_threshold": q.learning_goal_threshold,
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


@router.put("/{id}", response_model=TestOut)
def update_test(id: int, test: TestUpdate, db: Session = Depends(get_db)):
    obj = db.query(Test).filter(Test.id == id).first()
    if not obj:
        raise HTTPException(404, "Toets niet gevonden")
    fields = test.model_fields_set
    if "name" in fields and test.name is not None:
        obj.name = test.name
    if "grading_method" in fields:
        obj.grading_method = test.grading_method
    if "grade_config" in fields:
        obj.grade_config = test.grade_config
    db.commit()
    db.refresh(obj)
    if obj.grading_method == "opdracht":
        opdracht_logic.sync_test(db, obj)
        db.refresh(obj)
    return obj


@router.delete("/{id}")
def delete_test(id: int, db: Session = Depends(get_db)):
    obj = db.query(Test).filter(Test.id == id).first()
    if not obj:
        raise HTTPException(404, "Toets niet gevonden")
    db.delete(obj)
    db.commit()
    return {"ok": True}

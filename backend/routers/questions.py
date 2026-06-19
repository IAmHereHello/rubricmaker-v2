from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models import Question
from ..schemas import QuestionCreate, QuestionUpdate, QuestionOut, QuestionReorder

router = APIRouter(prefix="/questions", tags=["questions"])


@router.get("/domains")
def list_domains(db: Session = Depends(get_db)):
    rows = db.query(Question.domain).filter(Question.domain != "").distinct().all()
    return sorted({r[0] for r in rows if r[0]})


@router.post("", response_model=QuestionOut)
def create_question(question: QuestionCreate, db: Session = Depends(get_db)):
    obj = Question(**question.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/reorder")
def reorder_questions(items: List[QuestionReorder], db: Session = Depends(get_db)):
    for item in items:
        q = db.query(Question).filter(Question.id == item.question_id).first()
        if q:
            q.order = item.order
    db.commit()
    return {"ok": True}


@router.put("/{id}", response_model=QuestionOut)
def update_question(id: int, question: QuestionUpdate, db: Session = Depends(get_db)):
    obj = db.query(Question).filter(Question.id == id).first()
    if not obj:
        raise HTTPException(404, "Vraag niet gevonden")
    for field, value in question.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{id}")
def delete_question(id: int, db: Session = Depends(get_db)):
    obj = db.query(Question).filter(Question.id == id).first()
    if not obj:
        raise HTTPException(404, "Vraag niet gevonden")
    db.delete(obj)
    db.commit()
    return {"ok": True}

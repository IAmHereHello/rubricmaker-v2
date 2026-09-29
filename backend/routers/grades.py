from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models import StudentGrade
from ..schemas import StudentGradeOut, StudentGradeUpsert

router = APIRouter(prefix="/grades", tags=["grades"])


@router.get("/session/{session_id}", response_model=List[StudentGradeOut])
def get_session_grades(session_id: int, db: Session = Depends(get_db)):
    return db.query(StudentGrade).filter(StudentGrade.session_id == session_id).all()


@router.put("/session/{session_id}/student/{student_id}", response_model=StudentGradeOut)
def upsert_student_grade(
    session_id: int,
    student_id: int,
    body: StudentGradeUpsert,
    db: Session = Depends(get_db),
):
    existing = db.query(StudentGrade).filter(
        StudentGrade.session_id == session_id,
        StudentGrade.student_id == student_id,
    ).first()

    if existing:
        existing.grade = body.grade
        existing.is_manual = body.is_manual
        existing.review_done = body.review_done
        existing.stars = body.stars
        db.commit()
        db.refresh(existing)
        return existing

    obj = StudentGrade(
        session_id=session_id,
        student_id=student_id,
        grade=body.grade,
        is_manual=body.is_manual,
        review_done=body.review_done,
        stars=body.stars,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

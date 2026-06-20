from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from typing import List

from ..database import get_db
from ..models import Session as SessionModel, Score, Test as TestModel, Student as StudentModel
from ..schemas import SessionCreate, SessionOut, SessionListOut, SessionOrderUpdate

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("", response_model=List[SessionListOut])
def list_sessions(db: DBSession = Depends(get_db)):
    sessions = db.query(SessionModel).order_by(SessionModel.created_at.desc()).all()
    result = []
    for s in sessions:
        test = db.query(TestModel).filter(TestModel.id == s.test_id).first()
        order = s.student_order or []

        if not order:
            # Q1 not yet started — session exists but no stack built yet
            total = 0
            graded = 0
        else:
            # Compute expected graded scores: for each question, count students
            # in the session whose route is in the question's routes list.
            stud_rows = db.query(StudentModel).filter(StudentModel.id.in_(order)).all()
            route_map = {st.id: st.route for st in stud_rows}
            questions = test.questions if test else []
            total = sum(
                sum(1 for sid in order if route_map.get(sid) in (q.routes or []))
                for q in questions
            )
            graded = db.query(Score).filter(
                Score.session_id == s.id,
                Score.excluded.is_(False),
                Score.points.isnot(None),
            ).count()

        result.append(SessionListOut(
            id=s.id,
            test_id=s.test_id,
            test_name=test.name if test else "Onbekende toets",
            class_name=s.class_name,
            created_at=s.created_at,
            student_order=order,
            graded_count=graded,
            total_count=total,
        ))
    return result


@router.post("", response_model=SessionOut)
def create_session(session: SessionCreate, db: DBSession = Depends(get_db)):
    obj = SessionModel(**session.model_dump(), student_order=[])
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/{id}")
def get_session(id: int, db: DBSession = Depends(get_db)):
    obj = db.query(SessionModel).filter(SessionModel.id == id).first()
    if not obj:
        raise HTTPException(404, "Sessie niet gevonden")

    scores = db.query(Score).filter(Score.session_id == id).all()

    return {
        "id": obj.id,
        "test_id": obj.test_id,
        "class_name": obj.class_name,
        "created_at": obj.created_at,
        "student_order": obj.student_order or [],
        "scores": [
            {
                "id": s.id,
                "session_id": s.session_id,
                "student_id": s.student_id,
                "question_id": s.question_id,
                "points": s.points,
                "excluded": s.excluded,
            }
            for s in scores
        ],
    }


@router.put("/{id}/order", response_model=SessionOut)
def set_student_order(id: int, body: SessionOrderUpdate, db: DBSession = Depends(get_db)):
    obj = db.query(SessionModel).filter(SessionModel.id == id).first()
    if not obj:
        raise HTTPException(404, "Sessie niet gevonden")
    obj.student_order = body.student_order
    db.commit()
    db.refresh(obj)
    return obj

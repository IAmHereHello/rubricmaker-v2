from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models import Score
from ..schemas import ScoreUpsert, ScoreOut

router = APIRouter(prefix="/scores", tags=["scores"])


@router.put("", response_model=ScoreOut)
def upsert_score(score: ScoreUpsert, db: Session = Depends(get_db)):
    existing = (
        db.query(Score)
        .filter(
            Score.session_id == score.session_id,
            Score.student_id == score.student_id,
            Score.question_id == score.question_id,
        )
        .first()
    )

    if existing:
        existing.points = score.points
        existing.excluded = score.excluded
        db.commit()
        db.refresh(existing)
        return existing

    obj = Score(**score.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/session/{session_id}", response_model=List[ScoreOut])
def get_session_scores(session_id: int, db: Session = Depends(get_db)):
    return db.query(Score).filter(Score.session_id == session_id).all()

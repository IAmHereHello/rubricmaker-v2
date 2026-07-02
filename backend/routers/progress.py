from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Student, Score, Question, Session as SessionModel, StudentGrade, StudentYearSnapshot

router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("/student/{student_id}")
def student_progress(student_id: int, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(404, "Student niet gevonden")

    rows = (
        db.query(Score, Question, SessionModel)
        .join(Question, Score.question_id == Question.id)
        .join(SessionModel, Score.session_id == SessionModel.id)
        .filter(Score.student_id == student_id, Score.excluded == False)
        .all()
    )

    domain_pyramid: dict = {}
    sessions_map: dict = {}

    for score, question, session in rows:
        if score.points is None:
            continue

        key = (question.domain or "onbekend", question.pyramid_level)
        cell = domain_pyramid.setdefault(key, {"scored": 0, "max": 0})
        cell["scored"] += score.points
        cell["max"] += question.max_score

        sid = session.id
        sess = sessions_map.setdefault(
            sid,
            {
                "session_id": sid,
                "class_name": session.class_name,
                "created_at": session.created_at.isoformat(),
                "total_scored": 0,
                "total_max": 0,
                "domains": {},
            },
        )
        sess["total_scored"] += score.points
        sess["total_max"] += question.max_score
        dom = question.domain or "onbekend"
        d = sess["domains"].setdefault(dom, {"scored": 0, "max": 0})
        d["scored"] += score.points
        d["max"] += question.max_score

    domain_pyramid_list = [
        {
            "domain": k[0],
            "pyramid_level": k[1],
            "scored": v["scored"],
            "max": v["max"],
            "percentage": round(v["scored"] / v["max"] * 100) if v["max"] else 0,
        }
        for k, v in domain_pyramid.items()
    ]

    grade_rows = db.query(StudentGrade).filter(
        StudentGrade.student_id == student_id,
        StudentGrade.review_done.is_(True),
    ).all()
    grade_map = {g.session_id: g.grade for g in grade_rows}
    for sess in sessions_map.values():
        sess["grade"] = grade_map.get(sess["session_id"])

    snapshots = (
        db.query(StudentYearSnapshot)
        .filter(StudentYearSnapshot.student_id == student_id)
        .order_by(StudentYearSnapshot.school_year)
        .all()
    )
    historical_snapshots = [
        {
            "school_year": s.school_year,
            "domain_pyramid": s.radar_data.get("domain_pyramid", []),
            "grades": s.grades or [],
        }
        for s in snapshots
    ]

    return {
        "student": {
            "id": student.id,
            "name": student.name,
            "class_name": student.class_name,
            "route": student.route,
        },
        "domain_pyramid": domain_pyramid_list,
        "sessions": sorted(sessions_map.values(), key=lambda x: x["created_at"]),
        "historical_snapshots": historical_snapshots,
    }


@router.get("/class/{class_name}/{route}")
def class_progress(class_name: str, route: str, db: Session = Depends(get_db)):
    students = (
        db.query(Student)
        .filter(Student.class_name == class_name, Student.route == route)
        .order_by(Student.name)
        .all()
    )

    if not students:
        return {"students": [], "domain_pyramid_keys": [], "data": []}

    student_ids = [s.id for s in students]

    rows = (
        db.query(Score, Question)
        .join(Question, Score.question_id == Question.id)
        .filter(Score.student_id.in_(student_ids), Score.excluded == False)
        .all()
    )

    matrix: dict = {sid: {} for sid in student_ids}
    key_set: set = set()

    for score, question in rows:
        if score.points is None:
            continue
        key = (question.domain or "onbekend", question.pyramid_level)
        key_set.add(key)
        cell = matrix[score.student_id].setdefault(key, {"scored": 0, "max": 0})
        cell["scored"] += score.points
        cell["max"] += question.max_score

    sorted_keys = sorted(key_set, key=lambda x: (x[0], x[1]))

    data = []
    for student in students:
        row_scores = {}
        for key in sorted_keys:
            cell = matrix[student.id].get(key)
            row_scores[f"{key[0]}|{key[1]}"] = (
                round(cell["scored"] / cell["max"] * 100) if cell and cell["max"] else None
            )
        data.append({"student": {"id": student.id, "name": student.name}, "scores": row_scores})

    return {
        "students": [{"id": s.id, "name": s.name} for s in students],
        "domain_pyramid_keys": [{"domain": k[0], "pyramid_level": k[1]} for k in sorted_keys],
        "data": data,
    }

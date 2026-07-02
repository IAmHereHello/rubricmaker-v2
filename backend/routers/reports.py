from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Student, Score, Question, Session as SessionModel, Test

router = APIRouter(prefix="/reports", tags=["reports"])

DOMAINS = ["Algebra", "Meetkunde", "Rekenen", "Statistiek"]
LEVELS = ["reproductie", "verbinding", "reflectie"]


def _compute_radar(rows):
    """Aggregate (Score, Question) pairs into domain and pyramid-level percentages.
    Skips excluded and ungraded scores. Returns pct=None for axes with no data."""
    domain_totals = {}
    level_totals = {}

    for score, question in rows:
        if score.excluded or score.points is None:
            continue

        domain = question.domain or "onbekend"
        if domain not in domain_totals:
            domain_totals[domain] = {"scored": 0, "max": 0}
        domain_totals[domain]["scored"] += score.points
        domain_totals[domain]["max"] += question.max_score

        level = question.pyramid_level
        if level not in level_totals:
            level_totals[level] = {"scored": 0, "max": 0}
        level_totals[level]["scored"] += score.points
        level_totals[level]["max"] += question.max_score

    domain_scores = []
    for domain in DOMAINS:
        t = domain_totals.get(domain, {"scored": 0, "max": 0})
        domain_scores.append({
            "domain": domain,
            "scored": t["scored"],
            "max": t["max"],
            "pct": round(t["scored"] / t["max"] * 100) if t["max"] else None,
        })

    level_scores = []
    for level in LEVELS:
        t = level_totals.get(level, {"scored": 0, "max": 0})
        level_scores.append({
            "level": level,
            "scored": t["scored"],
            "max": t["max"],
            "pct": round(t["scored"] / t["max"] * 100) if t["max"] else None,
        })

    return domain_scores, level_scores


@router.get("/session/{session_id}")
def session_report(session_id: int, db: Session = Depends(get_db)):
    """Per-session report: question × student score matrix with class averages."""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(404, "Sessie niet gevonden")

    test = db.query(Test).filter(Test.id == session.test_id).first()
    questions = sorted(test.questions, key=lambda q: q.order)

    order = session.student_order or []
    if order:
        by_id = {s.id: s for s in db.query(Student).filter(Student.id.in_(order)).all()}
        students = [by_id[sid] for sid in order if sid in by_id]
    else:
        students = (
            db.query(Student)
            .filter(Student.class_name == session.class_name)
            .order_by(Student.name)
            .all()
        )

    scores = db.query(Score).filter(Score.session_id == session_id).all()

    score_map = {}
    for sc in scores:
        score_map.setdefault(sc.student_id, {})[sc.question_id] = {
            "points": sc.points,
            "excluded": sc.excluded,
            "comment": sc.comment,
        }

    class_avgs = {}
    for q in questions:
        total = 0
        count = 0
        for s in students:
            sc = score_map.get(s.id, {}).get(q.id)
            if sc and not sc["excluded"] and sc["points"] is not None:
                total += sc["points"]
                count += 1
        class_avgs[str(q.id)] = {
            "avg_points": round(total / count, 1) if count else None,
            "max_score": q.max_score,
            "count": count,
        }

    scores_out = {}
    for s in students:
        for q in questions:
            scores_out[f"{s.id}|{q.id}"] = score_map.get(s.id, {}).get(q.id)

    return {
        "session": {
            "id": session.id,
            "class_name": session.class_name,
            "created_at": session.created_at.isoformat(),
            "test_id": session.test_id,
        },
        "test": {
            "id": test.id,
            "name": test.name,
            "grading_method": test.grading_method,
            "grade_config": test.grade_config,
        },
        "questions": [
            {
                "id": q.id,
                "order": q.order,
                "description": q.description,
                "max_score": q.max_score,
                "domain": q.domain,
                "pyramid_level": q.pyramid_level,
                "routes": q.routes or [],
                "learning_goal": q.learning_goal,
                "learning_goal_threshold": q.learning_goal_threshold,
            }
            for q in questions
        ],
        "students": [{"id": s.id, "name": s.name, "route": s.route} for s in students],
        "scores": scores_out,
        "class_averages": class_avgs,
    }


@router.get("/student/{student_id}/timeline")
def student_timeline(student_id: int, db: Session = Depends(get_db)):
    """Progress over time: per-session breakdown by domain and pyramid level."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(404, "Student niet gevonden")

    rows = (
        db.query(Score, Question, SessionModel, Test)
        .join(Question, Score.question_id == Question.id)
        .join(SessionModel, Score.session_id == SessionModel.id)
        .join(Test, SessionModel.test_id == Test.id)
        .filter(Score.student_id == student_id, Score.excluded == False)
        .all()
    )

    sessions_map = {}
    for score, question, session, test in rows:
        if score.points is None:
            continue

        sid = session.id
        if sid not in sessions_map:
            sessions_map[sid] = {
                "session_id": sid,
                "test_name": test.name,
                "class_name": session.class_name,
                "created_at": session.created_at.isoformat(),
                "by_domain": {},
                "by_level": {},
            }

        domain = question.domain or "onbekend"
        d = sessions_map[sid]["by_domain"].setdefault(domain, {"scored": 0, "max": 0})
        d["scored"] += score.points
        d["max"] += question.max_score

        level = question.pyramid_level
        lv = sessions_map[sid]["by_level"].setdefault(level, {"scored": 0, "max": 0})
        lv["scored"] += score.points
        lv["max"] += question.max_score

    result = []
    for sid, sess in sorted(sessions_map.items(), key=lambda x: x[1]["created_at"]):
        result.append({
            "session_id": sess["session_id"],
            "test_name": sess["test_name"],
            "class_name": sess["class_name"],
            "created_at": sess["created_at"],
            "by_domain": {
                domain: {
                    "scored": v["scored"],
                    "max": v["max"],
                    "pct": round(v["scored"] / v["max"] * 100) if v["max"] else None,
                }
                for domain, v in sess["by_domain"].items()
            },
            "by_level": {
                level: {
                    "scored": v["scored"],
                    "max": v["max"],
                    "pct": round(v["scored"] / v["max"] * 100) if v["max"] else None,
                }
                for level, v in sess["by_level"].items()
            },
        })

    return {
        "student": {
            "id": student.id,
            "name": student.name,
            "class_name": student.class_name,
            "route": student.route,
        },
        "sessions": result,
    }


@router.get("/student/{student_id}/radar")
def student_radar(student_id: int, db: Session = Depends(get_db)):
    """Radar chart data for one student across all sessions."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(404, "Student niet gevonden")

    rows = (
        db.query(Score, Question)
        .join(Question, Score.question_id == Question.id)
        .filter(Score.student_id == student_id, Score.excluded == False)
        .all()
    )

    domain_scores, level_scores = _compute_radar(rows)

    return {
        "student": {
            "id": student.id,
            "name": student.name,
            "class_name": student.class_name,
            "route": student.route,
        },
        "domain_scores": domain_scores,
        "level_scores": level_scores,
    }


@router.get("/class/{class_name}/radar")
def class_radar(class_name: str, db: Session = Depends(get_db)):
    """Class radar: per-route aggregated domain and pyramid-level scores."""
    students = (
        db.query(Student)
        .filter(Student.class_name == class_name)
        .order_by(Student.name)
        .all()
    )

    if not students:
        return {"class_name": class_name, "routes": {}}

    by_route = {}
    for s in students:
        by_route.setdefault(s.route, []).append(s)

    result = {}
    for route, route_students in by_route.items():
        student_ids = [s.id for s in route_students]
        rows = (
            db.query(Score, Question)
            .join(Question, Score.question_id == Question.id)
            .filter(Score.student_id.in_(student_ids), Score.excluded == False)
            .all()
        )
        domain_scores, level_scores = _compute_radar(rows)
        result[route] = {
            "domain_scores": domain_scores,
            "level_scores": level_scores,
            "student_count": len(route_students),
        }

    return {"class_name": class_name, "routes": result}

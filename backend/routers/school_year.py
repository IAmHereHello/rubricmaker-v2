from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DBSession
from datetime import datetime
import csv
import io

from ..database import get_db
from ..models import (
    Student, Score, Question,
    Session as SessionModel, StudentGrade,
    StudentYearSnapshot, Test, SessionStudentRoute,
    OpdrachtGroupScore, OpdrachtGroup, OpdrachtEntry, OpdrachtScore, OpdrachtSessionState, StudentNote,
)
from ..schemas import SchoolYearAdvanceRequest
from .. import class_levels
from ..models import ClassLevel

router = APIRouter(prefix="/school-year", tags=["school-year"])


def _outgoing_year(year: int) -> str:
    return f"{year - 1}-{year}"


def _compute_snapshot_data(student_id: int, db: DBSession) -> dict:
    rows = (
        db.query(Score, Question)
        .join(Question, Score.question_id == Question.id)
        .filter(
            Score.student_id == student_id,
            Score.excluded == False,
            Score.points.isnot(None),
        )
        .all()
    )

    heatmap: dict = {}
    domain_totals: dict = {}
    level_totals: dict = {}

    for score, question in rows:
        domain = question.domain or "onbekend"
        level = question.pyramid_level

        cell = heatmap.setdefault(
            f"{domain}|{level}",
            {"domain": domain, "pyramid_level": level, "scored": 0, "max": 0},
        )
        cell["scored"] += score.points
        cell["max"] += question.max_score

        dt = domain_totals.setdefault(domain, {"scored": 0, "max": 0})
        dt["scored"] += score.points
        dt["max"] += question.max_score

        lt = level_totals.setdefault(level, {"scored": 0, "max": 0})
        lt["scored"] += score.points
        lt["max"] += question.max_score

    domain_pyramid = [
        {**c, "percentage": round(c["scored"] / c["max"] * 100) if c["max"] else 0}
        for c in heatmap.values()
    ]
    domain_scores = [
        {"domain": d, "scored": v["scored"], "max": v["max"],
         "pct": round(v["scored"] / v["max"] * 100) if v["max"] else None}
        for d, v in domain_totals.items()
    ]
    level_scores = [
        {"level": lv, "scored": v["scored"], "max": v["max"],
         "pct": round(v["scored"] / v["max"] * 100) if v["max"] else None}
        for lv, v in level_totals.items()
    ]
    return {
        "domain_pyramid": domain_pyramid,
        "domain_scores": domain_scores,
        "level_scores": level_scores,
    }


def _compute_grades_summary(student_id: int, db: DBSession) -> list:
    rows = (
        db.query(StudentGrade, SessionModel, Test)
        .join(SessionModel, StudentGrade.session_id == SessionModel.id)
        .join(Test, SessionModel.test_id == Test.id)
        .filter(
            StudentGrade.student_id == student_id,
            StudentGrade.review_done == True,
        )
        .all()
    )
    return [
        {
            "test_name": test.name,
            "grade": grade.grade,
            "date": session.created_at.isoformat(),
        }
        for grade, session, test in rows
    ]


@router.get("/status")
def school_year_status(db: DBSession = Depends(get_db)):
    now = datetime.now()
    in_window = now.month in (7, 8, 9)
    outgoing = _outgoing_year(now.year)

    if not in_window:
        return {"should_show": False, "outgoing_year": outgoing, "session_count": 0}

    session_count = db.query(SessionModel).count()
    return {
        "should_show": session_count > 0,
        "outgoing_year": outgoing,
        "session_count": session_count,
    }


@router.get("/export-csv")
def export_csv(db: DBSession = Depends(get_db)):
    rows = (
        db.query(Score, Question, SessionModel, Student, Test)
        .join(Question, Score.question_id == Question.id)
        .join(SessionModel, Score.session_id == SessionModel.id)
        .join(Student, Score.student_id == Student.id)
        .join(Test, SessionModel.test_id == Test.id)
        .filter(Score.excluded == False)
        .order_by(SessionModel.created_at, Student.name, Question.order)
        .all()
    )

    # Route per session: a session graded before a route change keeps the old route.
    overrides = {
        (r.session_id, r.student_id): r.route
        for r in db.query(SessionStudentRoute).all()
    }

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "sessie_datum", "klas", "toets", "leerling", "route",
        "vraag_nr", "domein", "niveaulaag", "max_score", "score", "opmerking",
    ])
    for score, question, session, student, test in rows:
        writer.writerow([
            session.created_at.strftime("%Y-%m-%d"),
            session.class_name,
            test.name,
            student.name,
            overrides.get((session.id, student.id), student.route),
            question.order + 1,
            question.domain or "",
            question.pyramid_level,
            question.max_score,
            score.points if score.points is not None else "",
            score.comment or "",
        ])

    output.seek(0)
    now = datetime.now()
    filename = f"rubricgrader_{_outgoing_year(now.year)}_export.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/advance")
def advance_school_year(body: SchoolYearAdvanceRequest, db: DBSession = Depends(get_db)):
    continuing_ids = {t.student_id for t in body.continuing_students}

    # Load continuing student objects before any deletions
    continuing_map = {
        s.id: s
        for s in db.query(Student).filter(Student.id.in_(list(continuing_ids))).all()
    } if continuing_ids else {}

    # Compute + upsert snapshots for continuing students
    for transfer in body.continuing_students:
        sid = transfer.student_id
        radar_data = _compute_snapshot_data(sid, db)
        grades_summary = _compute_grades_summary(sid, db)

        existing = (
            db.query(StudentYearSnapshot)
            .filter(
                StudentYearSnapshot.student_id == sid,
                StudentYearSnapshot.school_year == body.outgoing_year,
            )
            .first()
        )
        if existing:
            existing.radar_data = radar_data
            existing.grades = grades_summary
        else:
            db.add(StudentYearSnapshot(
                student_id=sid,
                school_year=body.outgoing_year,
                radar_data=radar_data,
                grades=grades_summary,
            ))

    # Delete all sessions and their dependent rows
    db.query(Score).delete(synchronize_session=False)
    db.query(StudentGrade).delete(synchronize_session=False)
    db.query(SessionStudentRoute).delete(synchronize_session=False)
    for model in (OpdrachtGroupScore, OpdrachtGroup, OpdrachtEntry, OpdrachtScore, OpdrachtSessionState):
        db.query(model).delete(synchronize_session=False)
    db.query(SessionModel).delete(synchronize_session=False)

    # Delete non-continuing students, with their oudergesprek notes (notes of continuing
    # students are kept: last year's afspraken stay available)
    if continuing_ids:
        db.query(StudentNote).filter(
            StudentNote.student_id.notin_(list(continuing_ids))
        ).delete(synchronize_session=False)
        db.query(Student).filter(
            Student.id.notin_(list(continuing_ids))
        ).delete(synchronize_session=False)
    else:
        db.query(StudentNote).delete(synchronize_session=False)
        db.query(Student).delete(synchronize_session=False)

    # Update class names (and optionally routes) for continuing students
    for transfer in body.continuing_students:
        student = continuing_map.get(transfer.student_id)
        if student:
            student.class_name = transfer.new_class_name
            if transfer.new_route:
                student.route = transfer.new_route

    # Create new students
    for ns in body.new_students:
        name = ns.name.strip()
        if name:
            db.add(Student(name=name, class_name=ns.class_name, route=ns.route))

    # Leerjaar + niveaus of next year's classes (the wizard sends them; older clients don't)
    if body.class_levels is not None:
        db.query(ClassLevel).delete(synchronize_session=False)
        db.flush()
        seen = set()
        for lvl in body.class_levels:
            name = lvl.class_name.strip()
            if name and name not in seen:
                seen.add(name)
                class_levels.set_level(db, name, lvl.leerjaar, lvl.niveaus)

    db.commit()

    return {
        "ok": True,
        "snapshots_created": len(body.continuing_students),
        "new_students_created": len(body.new_students),
    }

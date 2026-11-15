"""Leerlingrapport: one overview per student for the oudergesprek.

Everything here is about the current school year (the sessions in the database). No names
of other students ever leave this module: the comparison is an anonymous average."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import opdracht_logic
from ..database import get_db
from ..models import (
    Student, Score, Question, Session as SessionModel, Test, StudentGrade,
    SessionStudentRoute, OpdrachtEntry, StudentNote,
)

router = APIRouter(prefix="/leerlingrapport", tags=["leerlingrapport"])

DOMAINS = ["Algebra", "Meetkunde", "Rekenen", "Statistiek"]
LEVELS = ["reproductie", "verbinding", "reflectie"]

GOOD_PCT = 75            # and up: "Gaat goed"
ATTENTION_PCT = 55       # below: "Aandachtspunt"
MIN_POINTS = 5           # fewer points behind a score: no statement about it
MIN_TESTS_FOR_TREND = 3
TREND_MARGIN = 5         # percentage points; a smaller difference is "stabiel"
MIN_PEERS = 3            # fewer other students in the route: no average shown


def _pct(scored, max_points):
    return round(scored / max_points * 100) if max_points else None


def compute_trend(percentages):
    """percentages: one per test, oldest first. Compares the last two tests with the ones before."""
    if len(percentages) < MIN_TESTS_FOR_TREND:
        return None
    recent = percentages[-2:]
    earlier = percentages[:-2]
    diff = sum(recent) / len(recent) - sum(earlier) / len(earlier)
    if diff >= TREND_MARGIN:
        return "stijgend"
    if diff <= -TREND_MARGIN:
        return "dalend"
    return "stabiel"


def verdict(scored, max_points):
    """'goed' | 'aandacht' | None (in between, or too few points to say anything)."""
    if max_points < MIN_POINTS:
        return None
    pct = scored / max_points * 100
    if pct >= GOOD_PCT:
        return "goed"
    if pct < ATTENTION_PCT:
        return "aandacht"
    return None


def merge_goals(attempts):
    """attempts: [{name, achieved, test_name, date}], oldest first. The most recent attempt
    of a goal counts; `earlier_failed` marks a goal that was failed before and is achieved now."""
    by_name = {}
    order = []
    for a in attempts:
        key = a["name"].strip().lower()
        if key not in by_name:
            order.append(key)
            by_name[key] = {**a, "earlier_failed": False, "attempts": 1}
        else:
            prev = by_name[key]
            failed_before = prev["earlier_failed"] or not prev["achieved"]
            by_name[key] = {**a, "earlier_failed": failed_before and a["achieved"], "attempts": prev["attempts"] + 1}
    return [by_name[k] for k in order]


def _iso(dt):
    return dt.isoformat() if dt else None


@router.get("/student/{student_id}")
def leerlingrapport(student_id: int, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(404, "Student niet gevonden")

    tests = {t.id: t for t in db.query(Test).all()}
    sessions = {s.id: s for s in db.query(SessionModel).all()}
    overrides = {(r.session_id, r.student_id): r.route for r in db.query(SessionStudentRoute).all()}

    def route_in(session_id, stud):
        return overrides.get((session_id, stud.id), stud.route)

    grade_map = {
        g.session_id: g.grade
        for g in db.query(StudentGrade).filter(
            StudentGrade.student_id == student_id, StudentGrade.review_done.is_(True)
        ).all()
    }

    # ── Toetsen: this student's graded scores ────────────────────────────────
    own_rows = (
        db.query(Score, Question)
        .join(Question, Score.question_id == Question.id)
        .filter(Score.student_id == student_id)
        .all()
    )
    per_session = {}        # session_id -> {scored, max}
    domain_tot = {}
    level_tot = {}
    own_scores = {}         # (session_id, question_id) -> Score
    for score, question in own_rows:
        own_scores[(score.session_id, question.id)] = score
        if score.excluded or score.points is None or score.session_id not in sessions:
            continue
        t = per_session.setdefault(score.session_id, {"scored": 0, "max": 0})
        t["scored"] += score.points
        t["max"] += question.max_score
        if question.domain:
            d = domain_tot.setdefault(question.domain, {"scored": 0, "max": 0})
            d["scored"] += score.points
            d["max"] += question.max_score
        lv = level_tot.setdefault(question.pyramid_level, {"scored": 0, "max": 0})
        lv["scored"] += score.points
        lv["max"] += question.max_score

    results = []
    for sid, tot in per_session.items():
        sess = sessions[sid]
        test = tests.get(sess.test_id)
        results.append({
            "session_id": sid,
            "test_name": test.name if test else "Onbekende toets",
            "date": _iso(sess.created_at),
            "is_opdracht": False,
            "scored": tot["scored"],
            "max": tot["max"],
            "pct": _pct(tot["scored"], tot["max"]),
            "grade": grade_map.get(sid),
            "grading_method": test.grading_method if test else None,
        })

    # ── Anonymous average of the same route in the same class ────────────────
    # Per test the classmates who had the same route as this student in that test.
    classmates = db.query(Student).filter(Student.class_name == student.class_name).all()
    by_id = {s.id: s for s in classmates}
    peer_domain = {}
    peer_level = {}
    if per_session:
        peer_rows = (
            db.query(Score, Question)
            .join(Question, Score.question_id == Question.id)
            .filter(
                Score.session_id.in_(list(per_session)),
                Score.student_id.in_(list(by_id)),
                Score.excluded == False,  # noqa: E712
                Score.points.isnot(None),
            )
            .all()
        )
        for score, question in peer_rows:
            peer = by_id[score.student_id]
            if route_in(score.session_id, peer) != route_in(score.session_id, student):
                continue
            for bucket, key in ((peer_domain, question.domain), (peer_level, question.pyramid_level)):
                if not key:
                    continue
                b = bucket.setdefault(key, {"scored": 0, "max": 0, "others": set()})
                b["scored"] += score.points
                b["max"] += question.max_score
                if peer.id != student.id:
                    b["others"].add(peer.id)

    def axis(keys, own, peers, name_key):
        out = []
        for k in keys:
            o = own.get(k, {"scored": 0, "max": 0})
            p = peers.get(k)
            avg = _pct(p["scored"], p["max"]) if p and len(p["others"]) >= MIN_PEERS else None
            out.append({
                name_key: k,
                "scored": o["scored"],
                "max": o["max"],
                "pct": _pct(o["scored"], o["max"]),
                "route_avg": avg if o["max"] else None,
                "verdict": verdict(o["scored"], o["max"]),
            })
        return out

    domain_scores = axis(DOMAINS, domain_tot, peer_domain, "domain")
    level_scores = axis(LEVELS, level_tot, peer_level, "level")

    # ── Leerdoelen ───────────────────────────────────────────────────────────
    attempts = []
    for sid in sorted(per_session, key=lambda i: (sessions[i].created_at, i)):
        sess = sessions[sid]
        test = tests.get(sess.test_id)
        if not test:
            continue
        route = route_in(sid, student)
        goals = {}
        for q in sorted(test.questions, key=lambda q: q.order):
            if not q.learning_goal or q.learning_goal_threshold is None:
                continue
            if route not in (q.routes or []):
                continue
            sc = own_scores.get((sid, q.id))
            if sc is not None and sc.excluded:
                continue
            passed = sc is not None and sc.points is not None and sc.points >= q.learning_goal_threshold
            goals.setdefault(q.learning_goal, []).append(passed)
        for name, passed_list in goals.items():
            attempts.append({
                "name": name,
                "achieved": all(passed_list),
                "test_name": test.name,
                "date": _iso(sess.created_at),
            })
    goals = merge_goals(attempts)

    # ── Openstaand werk ──────────────────────────────────────────────────────
    open_work = []
    class_sessions = [s for s in sessions.values() if s.class_name == student.class_name]
    entry_session_ids = {
        e.session_id for e in db.query(OpdrachtEntry).filter(OpdrachtEntry.student_id == student_id).all()
    }
    for sess in sorted(sessions.values(), key=lambda s: (s.created_at, s.id)):
        test = tests.get(sess.test_id)
        if not test:
            continue
        dismissed = student_id in (sess.dismissed_inhalers or [])
        if test.grading_method == "opdracht":
            if sess not in class_sessions and sess.id not in entry_session_ids:
                continue
            ctx = opdracht_logic.Context(db, sess)
            summ = opdracht_logic.student_summary(ctx, student)
            if summ["inhaler_parts"]:
                open_work.append({
                    "session_id": sess.id,
                    "test_name": test.name,
                    "date": _iso(sess.created_at),
                    "kind": "opdracht",
                    "parts": summ["inhaler_parts"],
                    "all_parts": len(summ["inhaler_parts"]) == len([p for p in summ["parts"].values() if p["status"] != "nvt"]),
                    "status": "vervallen" if dismissed else "open",
                })
            if summ["max"] > 0:
                results.append({
                    "session_id": sess.id,
                    "test_name": test.name,
                    "date": _iso(sess.created_at),
                    "is_opdracht": True,
                    "scored": summ["points"],
                    "max": summ["max"],
                    # A partly graded opdracht has no meaningful percentage yet
                    "pct": _pct(summ["points"], summ["max"]) if summ["complete"] else None,
                    "grade": grade_map.get(sess.id) if summ["complete"] else None,
                    "grading_method": "opdracht",
                })
            continue

        # Toets: missed when the whole stack is entered and this student was not in it
        if sess not in class_sessions or not sess.stack_closed:
            continue
        if student_id in (sess.student_order or []) or sess.id in per_session:
            continue
        test_routes = {r for q in test.questions for r in (q.routes or [])}
        if route_in(sess.id, student) not in test_routes:
            continue
        open_work.append({
            "session_id": sess.id,
            "test_name": test.name,
            "date": _iso(sess.created_at),
            "kind": "toets",
            "parts": [],
            "all_parts": True,
            "status": "vervallen" if dismissed else "open",
        })

    results.sort(key=lambda r: (r["date"] or "", r["session_id"]))
    trend = compute_trend([r["pct"] for r in results if r["pct"] is not None])

    note = db.query(StudentNote).filter(StudentNote.student_id == student_id).first()

    return {
        "student": {
            "id": student.id,
            "name": student.name,
            "class_name": student.class_name,
            "route": student.route,
        },
        "results": results,
        "trend": trend,
        "open_work": open_work,
        "domain_scores": domain_scores,
        "level_scores": level_scores,
        "goals": goals,
        "notes": {
            "gesprekspunten": note.gesprekspunten if note else "",
            "afspraken": note.afspraken if note else "",
        },
    }


class NotesBody(BaseModel):
    gesprekspunten: str = ""
    afspraken: str = ""


@router.put("/student/{student_id}/notes")
def save_notes(student_id: int, body: NotesBody, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(404, "Student niet gevonden")
    note = db.query(StudentNote).filter(StudentNote.student_id == student_id).first()
    if note is None:
        note = StudentNote(student_id=student_id)
        db.add(note)
    note.gesprekspunten = body.gesprekspunten
    note.afspraken = body.afspraken
    db.commit()
    return {"gesprekspunten": note.gesprekspunten, "afspraken": note.afspraken}

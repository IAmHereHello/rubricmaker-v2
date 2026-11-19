from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession, joinedload

from .. import sharing
from ..database import get_db
from ..models import ComparisonImport, Session as SessionModel, StudentGrade, Test

router = APIRouter(prefix="/sharing", tags=["sharing"])


class FileBody(BaseModel):
    file: dict


class UpdateBody(BaseModel):
    file: dict
    accept: Optional[dict] = None


class ExportItem(BaseModel):
    test_id: int
    labels: List[str]


class ExportBody(BaseModel):
    items: List[ExportItem]


class SettingsBody(BaseModel):
    teacher_name: str


def _test(db, test_id):
    test = db.query(Test).options(joinedload(Test.questions)).filter(Test.id == test_id).first()
    if not test:
        raise HTTPException(404, "Toets niet gevonden")
    return test


def _fail(exc):
    raise HTTPException(400, str(exc))


# ── Settings ───────────────────────────────────────────────────────────────────

@router.get("/settings")
def get_settings(db: DBSession = Depends(get_db)):
    return {"teacher_name": sharing.teacher_name(db)}


@router.put("/settings")
def put_settings(body: SettingsBody, db: DBSession = Depends(get_db)):
    sharing.set_setting(db, "teacher_name", body.teacher_name.strip())
    return {"teacher_name": sharing.teacher_name(db)}


# ── Rubrics ────────────────────────────────────────────────────────────────────

@router.get("/tests/{test_id}/rubric")
def export_rubric(test_id: int, db: DBSession = Depends(get_db)):
    return sharing.rubric_file(db, _test(db, test_id))


@router.post("/rubric/inspect")
def inspect_rubric(body: FileBody, db: DBSession = Depends(get_db)):
    try:
        rubric = sharing.read_rubric_file(body.file)
    except sharing.SharingError as exc:
        _fail(exc)
    existing = sharing.find_family(db, rubric["share_id"])
    out = {"summary": sharing.rubric_summary(rubric)}
    if existing:
        out.update(kind="update", test_id=existing.id, test_name=existing.name)
    else:
        out["kind"] = "new"
    return out


@router.post("/rubric/import")
def import_rubric(body: FileBody, db: DBSession = Depends(get_db)):
    try:
        rubric = sharing.read_rubric_file(body.file)
        test = sharing.import_new(db, rubric)
    except sharing.SharingError as exc:
        _fail(exc)
    return {"test_id": test.id, "name": test.name}


def _update_target(db, rubric):
    test = sharing.find_family(db, rubric["share_id"])
    if not test:
        raise sharing.SharingError("Deze rubric staat nog niet in je Toetsen.")
    return _test(db, test.id)


@router.post("/rubric/update/preview")
def preview_update(body: UpdateBody, db: DBSession = Depends(get_db)):
    try:
        rubric = sharing.read_rubric_file(body.file)
        test = _update_target(db, rubric)
        items = sharing.diff_rubric(db, test, rubric)
        accept = body.accept or sharing.default_accept(items)
        targets = sharing.move_targets(test, rubric, items, accept)
        test_info = {"id": test.id, "name": test.name, "grading_method": test.grading_method}
        effects = sharing.run_update(db, test, rubric, accept, commit=False)
    except sharing.SharingError as exc:
        _fail(exc)
    return {"test": test_info, "items": items, "accept": accept, "move_targets": targets, **effects}


@router.post("/rubric/update/apply")
def apply_update(body: UpdateBody, db: DBSession = Depends(get_db)):
    try:
        rubric = sharing.read_rubric_file(body.file)
        test = _update_target(db, rubric)
        test_id = test.id
        effects = sharing.run_update(db, test, rubric, body.accept, commit=True)
    except sharing.SharingError as exc:
        _fail(exc)
    return {"test_id": test_id, **effects}


# ── Results ────────────────────────────────────────────────────────────────────

@router.get("/tests/{test_id}/results")
def export_results(test_id: int, db: DBSession = Depends(get_db)):
    return sharing.results_file(db, _test(db, test_id))


@router.get("/results/options")
def export_options(db: DBSession = Depends(get_db)):
    return sharing.export_options(db)


@router.post("/results/export")
def export_selected(body: ExportBody, db: DBSession = Depends(get_db)):
    selection = []
    for item in body.items:
        if item.labels:
            selection.append((_test(db, item.test_id), set(item.labels)))
    if not selection:
        raise HTTPException(400, "Kies minstens één toets.")
    return sharing.results_bundle(db, selection)


@router.post("/compare/import")
def import_results(body: FileBody, db: DBSession = Depends(get_db)):
    try:
        return sharing.import_results(db, body.file)
    except sharing.SharingError as exc:
        _fail(exc)


@router.get("/compare")
def list_families(db: DBSession = Depends(get_db)):
    return sharing.families(db)


@router.get("/compare/{share_id}")
def compare(share_id: str, route: Optional[str] = None, db: DBSession = Depends(get_db)):
    try:
        return sharing.compare(db, share_id, route or None)
    except sharing.SharingError as exc:
        raise HTTPException(404, str(exc))


@router.delete("/compare/import/{import_id}")
def delete_import(import_id: int, db: DBSession = Depends(get_db)):
    row = db.query(ComparisonImport).filter(ComparisonImport.id == import_id).first()
    if not row:
        raise HTTPException(404, "Niet gevonden")
    db.delete(row)
    db.commit()
    return {"ok": True}


# ── Te controleren ─────────────────────────────────────────────────────────────

@router.get("/needs-check")
def needs_check(db: DBSession = Depends(get_db)):
    """{session_id: [student_id, ...]} for results marked "te controleren"."""
    out = {}
    for g in db.query(StudentGrade).filter(StudentGrade.needs_check == True).all():  # noqa: E712
        out.setdefault(g.session_id, []).append(g.student_id)
    return out


@router.put("/sessions/{session_id}/students/{student_id}/checked")
def mark_checked(session_id: int, student_id: int, db: DBSession = Depends(get_db)):
    g = db.query(StudentGrade).filter(StudentGrade.session_id == session_id,
                                      StudentGrade.student_id == student_id).first()
    if g:
        g.needs_check = False
        db.commit()
    return {"ok": True}


@router.put("/sessions/{session_id}/checked")
def mark_session_checked(session_id: int, db: DBSession = Depends(get_db)):
    if not db.query(SessionModel).filter(SessionModel.id == session_id).first():
        raise HTTPException(404, "Sessie niet gevonden")
    for g in db.query(StudentGrade).filter(StudentGrade.session_id == session_id).all():
        g.needs_check = False
    db.commit()
    return {"ok": True}

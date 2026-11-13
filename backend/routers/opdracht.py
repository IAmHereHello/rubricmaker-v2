from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from ..database import get_db
from ..models import (
    Session as SessionModel, Student, Test,
    OpdrachtSessionState, OpdrachtGroup, OpdrachtGroupScore, OpdrachtEntry, OpdrachtScore,
)
from .. import opdracht_logic as logic

router = APIRouter(prefix="/opdracht", tags=["opdracht"])


class StateUpdate(BaseModel):
    mode: Optional[str] = None
    group_closed: Optional[bool] = None
    individual_closed: Optional[bool] = None


class GroupBody(BaseModel):
    student_ids: List[int]
    move: bool = False


class EntryBody(BaseModel):
    student_id: int
    part: str
    status: str = "ingeleverd"


class LevelBody(BaseModel):
    criterion_id: str
    group_id: Optional[int] = None
    student_id: Optional[int] = None
    level: Optional[str] = None
    comment: Optional[str] = None
    reset: bool = False


def _session(db, sid):
    s = db.query(SessionModel).filter(SessionModel.id == sid).first()
    if not s:
        raise HTTPException(404, "Sessie niet gevonden")
    test = db.query(Test).filter(Test.id == s.test_id).first()
    if not test or test.grading_method != "opdracht":
        raise HTTPException(400, "Dit is geen Grote opdracht")
    return s


def _out(db, session):
    return logic.payload(logic.Context(db, session))


def _next_order(db, session_id):
    last = (
        db.query(OpdrachtEntry).filter(OpdrachtEntry.session_id == session_id)
        .order_by(OpdrachtEntry.order.desc()).first()
    )
    return (last.order + 1) if last else 0


def _criterion(test, cid):
    for s, c in logic.all_criteria(test):
        if c.get("id") == cid:
            return s, c
    raise HTTPException(400, "Onderdeel niet gevonden")


def _drop_group_overrides(db, session, test, student_id):
    group_ids = {c.get("id") for s, c in logic.all_criteria(test) if logic.part_of(s) == "groep"}
    for sc in db.query(OpdrachtScore).filter(
        OpdrachtScore.session_id == session.id, OpdrachtScore.student_id == student_id
    ).all():
        if sc.criterion_id in group_ids:
            db.delete(sc)


def _has_individual_scores(db, session, test, student_id):
    ind_ids = {c.get("id") for s, c in logic.all_criteria(test) if logic.part_of(s) == "individueel"}
    return any(
        sc.criterion_id in ind_ids and (sc.level or sc.comment)
        for sc in db.query(OpdrachtScore).filter(
            OpdrachtScore.session_id == session.id, OpdrachtScore.student_id == student_id
        ).all()
    )


def _remove_member(db, session, test, entry, mode):
    """Take a student out of their group (their overrides go too)."""
    _drop_group_overrides(db, session, test, entry.student_id)
    db.delete(entry)
    if mode == "samen":
        ind = db.query(OpdrachtEntry).filter(
            OpdrachtEntry.session_id == session.id,
            OpdrachtEntry.student_id == entry.student_id,
            OpdrachtEntry.part == "individueel",
        ).first()
        if ind and not _has_individual_scores(db, session, test, entry.student_id):
            db.delete(ind)


def _delete_empty_groups(db, session):
    db.flush()
    for g in db.query(OpdrachtGroup).filter(OpdrachtGroup.session_id == session.id).all():
        if not db.query(OpdrachtEntry).filter(OpdrachtEntry.group_id == g.id).count():
            db.delete(g)


def _set_members(db, session, group, student_ids, move):
    test = db.query(Test).filter(Test.id == session.test_id).first()
    state = db.query(OpdrachtSessionState).filter(OpdrachtSessionState.session_id == session.id).first()
    mode = state.mode if state else None
    ids = list(dict.fromkeys(student_ids))
    if not ids:
        raise HTTPException(400, "Kies minimaal één leerling")

    existing = {
        e.student_id: e
        for e in db.query(OpdrachtEntry).filter(
            OpdrachtEntry.session_id == session.id, OpdrachtEntry.part == "groep"
        ).all()
    }
    conflicts = [sid for sid in ids if sid in existing and existing[sid].group_id != (group.id if group else None)]
    if conflicts and not move:
        names = {s.id: s.name for s in db.query(Student).filter(Student.id.in_(conflicts)).all()}
        raise HTTPException(409, {"conflicts": [{"student_id": sid, "name": names.get(sid, "")} for sid in conflicts]})

    if group is None:
        last = (
            db.query(OpdrachtGroup).filter(OpdrachtGroup.session_id == session.id)
            .order_by(OpdrachtGroup.order.desc()).first()
        )
        group = OpdrachtGroup(session_id=session.id, order=(last.order + 1) if last else 0)
        db.add(group)
        db.flush()
    else:
        # Members no longer in the list leave the group
        for e in [e for e in existing.values() if e.group_id == group.id and e.student_id not in ids]:
            _remove_member(db, session, test, e, mode)

    order = _next_order(db, session.id)
    for i, sid in enumerate(ids):
        e = existing.get(sid)
        if e is not None and e.group_id != group.id:
            # Moving from another group: their overrides belonged to the old group
            _drop_group_overrides(db, session, test, sid)
            e.group_id = group.id
            e.status = "ingeleverd"
        elif e is None:
            db.add(OpdrachtEntry(session_id=session.id, student_id=sid, part="groep",
                                 status="ingeleverd", group_id=group.id, order=order + i))
        if mode == "samen":
            ind = db.query(OpdrachtEntry).filter(
                OpdrachtEntry.session_id == session.id,
                OpdrachtEntry.student_id == sid,
                OpdrachtEntry.part == "individueel",
            ).first()
            if ind is None:
                db.add(OpdrachtEntry(session_id=session.id, student_id=sid, part="individueel",
                                     status="ingeleverd", order=order + i))
    _delete_empty_groups(db, session)
    db.commit()
    return group


@router.get("/sessions/{sid}")
def get_opdracht_session(sid: int, db: DBSession = Depends(get_db)):
    return _out(db, _session(db, sid))


@router.put("/sessions/{sid}/state")
def set_state(sid: int, body: StateUpdate, db: DBSession = Depends(get_db)):
    session = _session(db, sid)
    state = db.query(OpdrachtSessionState).filter(OpdrachtSessionState.session_id == sid).first()
    if state is None:
        state = OpdrachtSessionState(session_id=sid, group_closed=False, individual_closed=False)
        db.add(state)
    fields = body.model_fields_set
    if "mode" in fields:
        if body.mode not in ("samen", "apart", "individueel", "groep"):
            raise HTTPException(400, "Onbekende nakijkwijze")
        state.mode = body.mode
    if "group_closed" in fields and body.group_closed is not None:
        state.group_closed = body.group_closed
    if "individual_closed" in fields and body.individual_closed is not None:
        state.individual_closed = body.individual_closed
    db.commit()
    return _out(db, session)


@router.post("/sessions/{sid}/groups")
def create_group(sid: int, body: GroupBody, db: DBSession = Depends(get_db)):
    session = _session(db, sid)
    group = _set_members(db, session, None, body.student_ids, body.move)
    return {"group_id": group.id, "data": _out(db, session)}


@router.put("/groups/{gid}")
def update_group(gid: int, body: GroupBody, db: DBSession = Depends(get_db)):
    group = db.query(OpdrachtGroup).filter(OpdrachtGroup.id == gid).first()
    if not group:
        raise HTTPException(404, "Groep niet gevonden")
    session = _session(db, group.session_id)
    group = _set_members(db, session, group, body.student_ids, body.move)
    exists = db.query(OpdrachtGroup).filter(OpdrachtGroup.id == gid).first() is not None
    return {"group_id": gid if exists else None, "data": _out(db, session)}


@router.delete("/groups/{gid}")
def delete_group(gid: int, db: DBSession = Depends(get_db)):
    group = db.query(OpdrachtGroup).filter(OpdrachtGroup.id == gid).first()
    if not group:
        raise HTTPException(404, "Groep niet gevonden")
    session = _session(db, group.session_id)
    test = db.query(Test).filter(Test.id == session.test_id).first()
    state = db.query(OpdrachtSessionState).filter(OpdrachtSessionState.session_id == session.id).first()
    for e in db.query(OpdrachtEntry).filter(OpdrachtEntry.group_id == gid).all():
        _remove_member(db, session, test, e, state.mode if state else None)
    db.delete(group)
    db.commit()
    return _out(db, session)


@router.post("/sessions/{sid}/entries")
def upsert_entry(sid: int, body: EntryBody, db: DBSession = Depends(get_db)):
    session = _session(db, sid)
    if body.part not in logic.PARTS:
        raise HTTPException(400, "Onbekend deel")
    if body.status not in ("ingeleverd", "niet_ingeleverd"):
        raise HTTPException(400, "Onbekende status")
    if not db.query(Student).filter(Student.id == body.student_id).first():
        raise HTTPException(404, "Leerling niet gevonden")
    e = db.query(OpdrachtEntry).filter(
        OpdrachtEntry.session_id == sid, OpdrachtEntry.student_id == body.student_id,
        OpdrachtEntry.part == body.part,
    ).first()
    if e is None:
        if body.part == "groep":
            # A groepsdeel always belongs to a group; a late student gets a group of one
            group = _set_members(db, session, None, [body.student_id], False)
            e = db.query(OpdrachtEntry).filter(
                OpdrachtEntry.session_id == sid, OpdrachtEntry.student_id == body.student_id,
                OpdrachtEntry.part == "groep",
            ).first()
        else:
            e = OpdrachtEntry(session_id=sid, student_id=body.student_id, part=body.part,
                              order=_next_order(db, sid))
            db.add(e)
    e.status = body.status
    db.commit()
    return _out(db, session)


@router.delete("/sessions/{sid}/entries/{student_id}/{part}")
def delete_entry(sid: int, student_id: int, part: str, db: DBSession = Depends(get_db)):
    session = _session(db, sid)
    test = db.query(Test).filter(Test.id == session.test_id).first()
    e = db.query(OpdrachtEntry).filter(
        OpdrachtEntry.session_id == sid, OpdrachtEntry.student_id == student_id, OpdrachtEntry.part == part,
    ).first()
    if e is None:
        return _out(db, session)
    if part == "groep":
        _drop_group_overrides(db, session, test, student_id)
        db.delete(e)
        _delete_empty_groups(db, session)
    else:
        ind_ids = {c.get("id") for s, c in logic.all_criteria(test) if logic.part_of(s) == "individueel"}
        for sc in db.query(OpdrachtScore).filter(
            OpdrachtScore.session_id == sid, OpdrachtScore.student_id == student_id
        ).all():
            if sc.criterion_id in ind_ids:
                db.delete(sc)
        db.delete(e)
    db.commit()
    return _out(db, session)


@router.put("/sessions/{sid}/levels")
def set_level(sid: int, body: LevelBody, db: DBSession = Depends(get_db)):
    session = _session(db, sid)
    test = db.query(Test).filter(Test.id == session.test_id).first()
    section, _ = _criterion(test, body.criterion_id)
    fields = body.model_fields_set
    if "level" in fields and body.level is not None and body.level not in logic.LEVELS:
        raise HTTPException(400, "Onbekend niveau")

    if body.group_id is not None:
        if logic.part_of(section) != "groep":
            raise HTTPException(400, "Dit onderdeel hoort niet bij het groepsdeel")
        group = db.query(OpdrachtGroup).filter(
            OpdrachtGroup.id == body.group_id, OpdrachtGroup.session_id == sid
        ).first()
        if not group:
            raise HTTPException(404, "Groep niet gevonden")
        row = db.query(OpdrachtGroupScore).filter(
            OpdrachtGroupScore.group_id == group.id, OpdrachtGroupScore.criterion_id == body.criterion_id
        ).first()
        if row is None:
            row = OpdrachtGroupScore(group_id=group.id, criterion_id=body.criterion_id)
            db.add(row)
    elif body.student_id is not None:
        row = db.query(OpdrachtScore).filter(
            OpdrachtScore.session_id == sid, OpdrachtScore.student_id == body.student_id,
            OpdrachtScore.criterion_id == body.criterion_id,
        ).first()
        if body.reset:
            if row is not None:
                db.delete(row)
            db.commit()
            return _out(db, session)
        if row is None:
            row = OpdrachtScore(session_id=sid, student_id=body.student_id, criterion_id=body.criterion_id)
            if logic.part_of(section) == "groep":
                # Start an override from the group's level and comment
                entry = db.query(OpdrachtEntry).filter(
                    OpdrachtEntry.session_id == sid, OpdrachtEntry.student_id == body.student_id,
                    OpdrachtEntry.part == "groep",
                ).first()
                gs = None
                if entry and entry.group_id:
                    gs = db.query(OpdrachtGroupScore).filter(
                        OpdrachtGroupScore.group_id == entry.group_id,
                        OpdrachtGroupScore.criterion_id == body.criterion_id,
                    ).first()
                if gs:
                    row.level, row.comment = gs.level, gs.comment
            db.add(row)
    else:
        raise HTTPException(400, "Geef een groep of leerling op")

    if "level" in fields:
        row.level = body.level
    if "comment" in fields:
        row.comment = (body.comment or "").strip() or None
    db.commit()
    return _out(db, session)


@router.get("/tests/{tid}/usage")
def criterion_usage(tid: int, db: DBSession = Depends(get_db)):
    test = db.query(Test).filter(Test.id == tid).first()
    if not test:
        raise HTTPException(404, "Toets niet gevonden")
    return logic.usage(db, test)

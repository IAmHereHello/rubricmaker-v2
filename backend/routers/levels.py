from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from .. import class_levels as cl
from ..database import get_db

router = APIRouter(prefix="/levels", tags=["levels"])


class ClassLevelBody(BaseModel):
    class_name: str
    leerjaar: Optional[int] = None
    niveaus: str = ""


@router.get("/classes")
def class_levels(db: DBSession = Depends(get_db)):
    return cl.all_levels(db)


@router.put("/classes")
def set_class_level(body: ClassLevelBody, db: DBSession = Depends(get_db)):
    row = cl.set_level(db, body.class_name.strip(), body.leerjaar, body.niveaus)
    db.commit()
    return cl.level_dict(row)


@router.get("/suggestions")
def suggestions(db: DBSession = Depends(get_db)):
    return cl.suggestions(db)


@router.post("/fill")
def fill(db: DBSession = Depends(get_db)):
    return {"filled": cl.fill_suggestions(db)}

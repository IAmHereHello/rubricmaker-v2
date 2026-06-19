from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ── Students ──────────────────────────────────────────────────────────────────

class StudentBase(BaseModel):
    name: str
    class_name: str
    route: str  # "oranje" | "geel" | "blauw"

class StudentCreate(StudentBase):
    pass

class StudentUpdate(StudentBase):
    pass

class StudentOut(StudentBase):
    id: int
    model_config = {"from_attributes": True}


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestCreate(BaseModel):
    name: str

class TestUpdate(BaseModel):
    name: str

class TestOut(BaseModel):
    id: int
    name: str
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Questions ─────────────────────────────────────────────────────────────────

class QuestionCreate(BaseModel):
    test_id: int
    order: int = 0
    description: str
    answer: str = ""
    max_score: int
    routes: List[str] = ["oranje", "geel", "blauw"]
    domain: str = ""
    pyramid_level: str  # "reproductie" | "verbinding" | "reflectie"
    learning_goal_threshold: Optional[int] = None

class QuestionUpdate(BaseModel):
    order: Optional[int] = None
    description: Optional[str] = None
    answer: Optional[str] = None
    max_score: Optional[int] = None
    routes: Optional[List[str]] = None
    domain: Optional[str] = None
    pyramid_level: Optional[str] = None
    learning_goal_threshold: Optional[int] = None

class QuestionOut(BaseModel):
    id: int
    test_id: int
    order: int
    description: str
    answer: str
    max_score: int
    routes: List[str]
    domain: str
    pyramid_level: str
    learning_goal_threshold: Optional[int] = None
    model_config = {"from_attributes": True}

class QuestionReorder(BaseModel):
    question_id: int
    order: int


# ── Sessions ──────────────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    test_id: int
    class_name: str

class SessionOut(BaseModel):
    id: int
    test_id: int
    class_name: str
    created_at: datetime
    student_order: List[int]
    model_config = {"from_attributes": True}

class SessionOrderUpdate(BaseModel):
    student_order: List[int]


# ── Scores ────────────────────────────────────────────────────────────────────

class ScoreUpsert(BaseModel):
    session_id: int
    student_id: int
    question_id: int
    points: Optional[int] = None
    excluded: bool = False

class ScoreOut(BaseModel):
    id: int
    session_id: int
    student_id: int
    question_id: int
    points: Optional[int]
    excluded: bool
    model_config = {"from_attributes": True}

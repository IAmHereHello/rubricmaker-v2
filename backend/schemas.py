from pydantic import BaseModel, field_validator
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

class StudentImport(BaseModel):
    class_name: str
    route: str
    names: List[str]


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestCreate(BaseModel):
    name: str

class TestUpdate(BaseModel):
    name: Optional[str] = None
    grading_method: Optional[str] = None
    grade_config: Optional[dict] = None

class TestOut(BaseModel):
    id: int
    name: str
    created_at: datetime
    grading_method: Optional[str] = None
    grade_config: Optional[dict] = None
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
    learning_goal: Optional[str] = None
    learning_goal_threshold: Optional[int] = None

class QuestionUpdate(BaseModel):
    order: Optional[int] = None
    description: Optional[str] = None
    answer: Optional[str] = None
    max_score: Optional[int] = None
    routes: Optional[List[str]] = None
    domain: Optional[str] = None
    pyramid_level: Optional[str] = None
    learning_goal: Optional[str] = None
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
    learning_goal: Optional[str] = None
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
    dismissed_inhalers: List[int] = []
    model_config = {"from_attributes": True}

    @field_validator('student_order', 'dismissed_inhalers', mode='before')
    @classmethod
    def coerce_none_to_list(cls, v):
        return v if v is not None else []

class SessionListOut(BaseModel):
    id: int
    test_id: int
    test_name: str
    class_name: str
    created_at: datetime
    student_order: List[int]
    graded_count: int
    total_count: int
    review_count: int = 0
    student_count: int = 0
    has_grading: bool = False
    dismissed_inhalers: List[int] = []
    applicable_routes: List[str] = []

class SessionOrderUpdate(BaseModel):
    student_order: List[int]

class InhalerDismissBody(BaseModel):
    student_id: int


# ── Scores ────────────────────────────────────────────────────────────────────

class ScoreUpsert(BaseModel):
    session_id: int
    student_id: int
    question_id: int
    points: Optional[int] = None
    excluded: bool = False
    comment: Optional[str] = None

class ScoreOut(BaseModel):
    id: int
    session_id: int
    student_id: int
    question_id: int
    points: Optional[int]
    excluded: bool
    comment: Optional[str] = None
    model_config = {"from_attributes": True}


# ── School year transition ────────────────────────────────────────────────────

class SchoolYearStudentTransfer(BaseModel):
    student_id: int
    new_class_name: str
    new_route: Optional[str] = None

class SchoolYearNewStudent(BaseModel):
    name: str
    class_name: str
    route: str = "geel"

class SchoolYearAdvanceRequest(BaseModel):
    outgoing_year: str                                    # "2024-2025"
    continuing_students: List[SchoolYearStudentTransfer]  # kept students with new class name
    new_students: List[SchoolYearNewStudent]


# ── Student grades ────────────────────────────────────────────────────────────

class StudentGradeUpsert(BaseModel):
    grade: str       # "beheerst" | "expert" | "in_ontwikkeling" | cijfer, e.g. "7.4"
    is_manual: bool = False
    review_done: bool = False
    stars: int = 0

class StudentGradeOut(BaseModel):
    id: int
    session_id: int
    student_id: int
    grade: str
    is_manual: bool
    review_done: bool
    stars: Optional[int] = 0
    model_config = {"from_attributes": True}

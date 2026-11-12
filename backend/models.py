from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    class_name = Column(String, nullable=False)
    route = Column(String, nullable=False)  # "oranje" | "geel" | "blauw"

    scores = relationship("Score", back_populates="student", cascade="all, delete-orphan")
    grades = relationship("StudentGrade", back_populates="student", cascade="all, delete-orphan")
    year_snapshots = relationship("StudentYearSnapshot", back_populates="student", cascade="all, delete-orphan")
    session_routes = relationship("SessionStudentRoute", back_populates="student", cascade="all, delete-orphan")


class Test(Base):
    __tablename__ = "tests"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    grading_method = Column(String, nullable=True)   # "points" | "goals" | "cijfer" | null
    grade_config = Column(JSON, nullable=True)        # points/goals: {oranje:{beheerst:N,expert:N},...}; cijfer: {cijfer:{multiplier:9,offset:1}}

    questions = relationship(
        "Question", back_populates="test", cascade="all, delete-orphan",
        order_by="Question.order"
    )
    sessions = relationship("Session", back_populates="test", cascade="all, delete-orphan")


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("tests.id"), nullable=False)
    order = Column(Integer, nullable=False, default=0)
    description = Column(String, nullable=False)
    answer = Column(String, default="")
    max_score = Column(Integer, nullable=False)
    routes = Column(JSON, default=list)        # ["oranje", "geel", "blauw"]
    domain = Column(String, default="")
    pyramid_level = Column(String, nullable=False)  # "reproductie"|"verbinding"|"reflectie"
    learning_goal = Column(String, nullable=True)             # goal name/label; groups questions under the same goal
    learning_goal_threshold = Column(Integer, nullable=True)  # min points to achieve this learning goal; null = not a goal

    test = relationship("Test", back_populates="questions")
    scores = relationship("Score", back_populates="question", cascade="all, delete-orphan")


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("tests.id"), nullable=False)
    class_name = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    student_order = Column(JSON, default=list)        # list[int] — student IDs in grading order
    dismissed_inhalers = Column(JSON, default=list)   # list[int] — student IDs dismissed from retakes
    grading_mode = Column(String, default="horizontal")  # "horizontal" (per question) | "vertical" (per student)
    stack_closed = Column(Boolean, default=False)     # True once the teacher has entered the whole stack (any grading mode)

    test = relationship("Test", back_populates="sessions")
    scores = relationship("Score", back_populates="session", cascade="all, delete-orphan")
    grades = relationship("StudentGrade", back_populates="session", cascade="all, delete-orphan")
    student_routes = relationship("SessionStudentRoute", back_populates="session", cascade="all, delete-orphan")


class SessionStudentRoute(Base):
    """The route a student had in one session, stored when their route changes later.

    A session without a row for a student uses the student's current route. When a route
    changes, sessions graded earlier get a row with the old route, so they are not
    recalculated with the new one."""
    __tablename__ = "session_student_routes"
    __table_args__ = (UniqueConstraint("session_id", "student_id", name="uq_session_student_route"),)

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    route = Column(String, nullable=False)

    session = relationship("Session", back_populates="student_routes")
    student = relationship("Student", back_populates="session_routes")


class Score(Base):
    __tablename__ = "scores"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    points = Column(Integer, nullable=True)  # null = not yet graded
    excluded = Column(Boolean, default=False)
    comment = Column(String, nullable=True)

    session = relationship("Session", back_populates="scores")
    student = relationship("Student", back_populates="scores")
    question = relationship("Question", back_populates="scores")


class StudentGrade(Base):
    __tablename__ = "student_grades"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    grade = Column(String, nullable=False)   # "beheerst" | "expert" | "in_ontwikkeling" | cijfer as string, e.g. "7.4"
    is_manual = Column(Boolean, default=False)
    review_done = Column(Boolean, default=False)
    stars = Column(Integer, nullable=True, default=0)   # "sterretjes": 0.5 point off each (cijfer grading only)

    session = relationship("Session", back_populates="grades")
    student = relationship("Student", back_populates="grades")


class StudentYearSnapshot(Base):
    __tablename__ = "student_year_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    school_year = Column(String, nullable=False)   # e.g. "2024-2025"
    radar_data = Column(JSON, nullable=False)       # [{domain, pyramid_level, scored, max, percentage}]
    grades = Column(JSON, nullable=True)            # [{test_name, grade, date}]
    created_at = Column(DateTime, server_default=func.now())

    student = relationship("Student", back_populates="year_snapshots")

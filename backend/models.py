from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, JSON
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


class Test(Base):
    __tablename__ = "tests"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    grading_method = Column(String, nullable=True)   # "points" | "goals" | null
    grade_config = Column(JSON, nullable=True)        # {oranje:{beheerst:N,expert:N}, geel:{...}, blauw:{...}}

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

    test = relationship("Test", back_populates="sessions")
    scores = relationship("Score", back_populates="session", cascade="all, delete-orphan")
    grades = relationship("StudentGrade", back_populates="session", cascade="all, delete-orphan")


class Score(Base):
    __tablename__ = "scores"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    points = Column(Integer, nullable=True)  # null = not yet graded
    excluded = Column(Boolean, default=False)

    session = relationship("Session", back_populates="scores")
    student = relationship("Student", back_populates="scores")
    question = relationship("Question", back_populates="scores")


class StudentGrade(Base):
    __tablename__ = "student_grades"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    grade = Column(String, nullable=False)   # "beheerst" | "expert" | "in_ontwikkeling"
    is_manual = Column(Boolean, default=False)
    review_done = Column(Boolean, default=False)

    session = relationship("Session", back_populates="grades")
    student = relationship("Student", back_populates="grades")

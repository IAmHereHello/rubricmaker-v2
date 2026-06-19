from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from ..database import get_db
from ..models import Student
from ..schemas import StudentCreate, StudentUpdate, StudentOut

router = APIRouter(prefix="/students", tags=["students"])


@router.get("", response_model=List[StudentOut])
def list_students(class_name: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Student)
    if class_name:
        q = q.filter(Student.class_name == class_name)
    return q.order_by(Student.class_name, Student.name).all()


@router.post("", response_model=StudentOut)
def create_student(student: StudentCreate, db: Session = Depends(get_db)):
    obj = Student(**student.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{id}", response_model=StudentOut)
def update_student(id: int, student: StudentUpdate, db: Session = Depends(get_db)):
    obj = db.query(Student).filter(Student.id == id).first()
    if not obj:
        raise HTTPException(404, "Student niet gevonden")
    for field, value in student.model_dump().items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{id}")
def delete_student(id: int, db: Session = Depends(get_db)):
    obj = db.query(Student).filter(Student.id == id).first()
    if not obj:
        raise HTTPException(404, "Student niet gevonden")
    db.delete(obj)
    db.commit()
    return {"ok": True}

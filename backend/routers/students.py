from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from ..database import get_db
from ..models import Student
from ..route_history import change_student_route
from ..schemas import StudentCreate, StudentUpdate, StudentOut, StudentImport

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


@router.post("/import")
def import_students(data: StudentImport, db: Session = Depends(get_db)):
    created = 0
    for name in data.names:
        name = name.strip()
        if not name:
            continue
        db.add(Student(name=name, class_name=data.class_name, route=data.route))
        created += 1
    db.commit()
    return {"created": created}


@router.delete("/class/{class_name}")
def delete_class(class_name: str, db: Session = Depends(get_db)):
    students = db.query(Student).filter(Student.class_name == class_name).all()
    count = len(students)
    for s in students:
        db.delete(s)
    db.commit()
    return {"deleted": count}


@router.put("/{id}", response_model=StudentOut)
def update_student(id: int, student: StudentUpdate, db: Session = Depends(get_db)):
    obj = db.query(Student).filter(Student.id == id).first()
    if not obj:
        raise HTTPException(404, "Student niet gevonden")
    data = student.model_dump()
    new_route = data.pop("route")
    for field, value in data.items():
        setattr(obj, field, value)
    if new_route != obj.route:
        # Tests the student was already graded on keep the old route.
        change_student_route(db, obj, new_route)
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

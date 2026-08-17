from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from ..database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=schemas.Token)
def register(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = models.User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        phone=payload.phone or "",
        address=payload.address or "",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # auto-create empty restaurant profile for restaurant-role users
    if user.role == models.UserRole.restaurant:
        rest = models.Restaurant(
            owner_id=user.id,
            name=f"{user.name}'s Restaurant",
            description="",
            address=user.address,
        )
        db.add(rest)
        db.commit()

    token = create_access_token({"sub": str(user.id)})
    return schemas.Token(access_token=token, user=schemas.UserOut.model_validate(user))


@router.post("/login", response_model=schemas.Token)
def login(payload: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )
    token = create_access_token({"sub": str(user.id)})
    return schemas.Token(access_token=token, user=schemas.UserOut.model_validate(user))


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user

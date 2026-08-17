from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import require_roles
from ..database import get_db
from ..models import VehicleType, VerificationStatus
from ..utils import save_upload

router = APIRouter(prefix="/api/delivery/verification", tags=["delivery-verification"])
admin_router = APIRouter(prefix="/api/admin/verification", tags=["admin"])


def _get_or_create_profile(db: Session, user: models.User) -> models.DeliveryProfile:
    profile = (
        db.query(models.DeliveryProfile)
        .filter(models.DeliveryProfile.user_id == user.id)
        .first()
    )
    if not profile:
        profile = models.DeliveryProfile(user_id=user.id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


# ---------- DELIVERY PARTNER SIDE ----------
@router.get("/me", response_model=schemas.DeliveryProfileOut)
def my_verification(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles(models.UserRole.delivery)),
):
    return _get_or_create_profile(db, user)


@router.post("/submit", response_model=schemas.DeliveryProfileOut)
async def submit_verification(
    aadhar_number: str = Form(...),
    pan_number: str = Form(...),
    license_number: str = Form(...),
    vehicle_type: VehicleType = Form(...),
    vehicle_number: str = Form(...),
    bank_account_number: str = Form(""),
    bank_ifsc: str = Form(""),
    bank_account_holder: str = Form(""),
    aadhar_image: UploadFile = File(...),
    pan_image: UploadFile = File(...),
    selfie_image: UploadFile = File(...),
    license_image: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles(models.UserRole.delivery)),
):
    """Delivery partner submits/resubmits KYC documents for admin review."""
    profile = _get_or_create_profile(db, user)

    if profile.verification_status == VerificationStatus.approved:
        raise HTTPException(status_code=400, detail="Your account is already verified")

    profile.aadhar_number = aadhar_number.strip()
    profile.pan_number = pan_number.strip()
    profile.license_number = license_number.strip()
    profile.vehicle_type = vehicle_type
    profile.vehicle_number = vehicle_number.strip().upper()
    profile.bank_account_number = bank_account_number.strip()
    profile.bank_ifsc = bank_ifsc.strip().upper()
    profile.bank_account_holder = bank_account_holder.strip()

    profile.aadhar_image_url = await save_upload(aadhar_image, "aadhar")
    profile.pan_image_url = await save_upload(pan_image, "pan")
    profile.selfie_image_url = await save_upload(selfie_image, "selfie")
    profile.license_image_url = await save_upload(license_image, "license")

    profile.verification_status = VerificationStatus.pending
    profile.rejection_reason = ""
    profile.submitted_at = datetime.utcnow()
    profile.reviewed_at = None

    db.commit()
    db.refresh(profile)
    return profile


@router.put("/online", response_model=schemas.DeliveryProfileOut)
def set_online_status(
    payload: schemas.OnlineToggle,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles(models.UserRole.delivery)),
):
    profile = _get_or_create_profile(db, user)
    if payload.is_online and profile.verification_status != VerificationStatus.approved:
        raise HTTPException(
            status_code=403,
            detail="Complete document verification before going online",
        )
    profile.is_online = payload.is_online
    db.commit()
    db.refresh(profile)
    return profile


# ---------- ADMIN SIDE ----------
@admin_router.get("/pending", response_model=List[schemas.DeliveryProfileOut])
def list_pending_verifications(
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_roles(models.UserRole.admin)),
):
    return (
        db.query(models.DeliveryProfile)
        .filter(models.DeliveryProfile.verification_status == VerificationStatus.pending)
        .order_by(models.DeliveryProfile.submitted_at.asc())
        .all()
    )


@admin_router.get("/all", response_model=List[schemas.DeliveryProfileOut])
def list_all_verifications(
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_roles(models.UserRole.admin)),
):
    return db.query(models.DeliveryProfile).order_by(models.DeliveryProfile.id.desc()).all()


@admin_router.put("/{profile_id}/review", response_model=schemas.DeliveryProfileOut)
def review_verification(
    profile_id: int,
    payload: schemas.VerificationReview,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_roles(models.UserRole.admin)),
):
    profile = db.query(models.DeliveryProfile).filter(models.DeliveryProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Verification record not found")

    profile.verification_status = VerificationStatus.approved if payload.approve else VerificationStatus.rejected
    profile.rejection_reason = "" if payload.approve else (payload.rejection_reason or "Documents did not pass review")
    profile.reviewed_at = datetime.utcnow()
    if not payload.approve:
        profile.is_online = False
    db.commit()
    db.refresh(profile)
    return profile

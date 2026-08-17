from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import require_roles
from ..database import get_db
from ..models import VerificationStatus
from ..routers.verification import _get_or_create_profile

router = APIRouter(prefix="/api/delivery", tags=["delivery"])


def _serialize(o: models.Order) -> schemas.OrderOut:
    out = schemas.OrderOut.model_validate(o)
    out.restaurant_name = o.restaurant.name if o.restaurant else None
    out.restaurant_address = o.restaurant.address if o.restaurant else None
    out.customer_name = o.customer.name if o.customer else None
    out.customer_phone = o.customer.phone if o.customer else None
    return out


def _require_approved_and_online(db: Session, user: models.User) -> models.DeliveryProfile:
    profile = _get_or_create_profile(db, user)
    if profile.verification_status != VerificationStatus.approved:
        raise HTTPException(
            status_code=403,
            detail="Complete document verification (Aadhar, PAN, selfie, driving licence & vehicle details) before accessing orders.",
        )
    if not profile.is_online:
        raise HTTPException(status_code=403, detail="Go online to see available orders.")
    return profile


@router.get("/available", response_model=List[schemas.OrderOut])
def available_orders(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles(models.UserRole.delivery)),
):
    _require_approved_and_online(db, user)
    orders = (
        db.query(models.Order)
        .filter(
            models.Order.status == models.OrderStatus.ready,
            models.Order.delivery_id.is_(None),
        )
        .order_by(models.Order.id.asc())
        .all()
    )
    return [_serialize(o) for o in orders]


@router.get("/my-deliveries", response_model=List[schemas.OrderOut])
def my_deliveries(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles(models.UserRole.delivery)),
):
    orders = (
        db.query(models.Order)
        .filter(models.Order.delivery_id == user.id)
        .order_by(models.Order.id.desc())
        .all()
    )
    return [_serialize(o) for o in orders]


@router.put("/orders/{order_id}/accept", response_model=schemas.OrderOut)
def accept_delivery(
    order_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles(models.UserRole.delivery)),
):
    _require_approved_and_online(db, user)
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != models.OrderStatus.ready or order.delivery_id is not None:
        raise HTTPException(status_code=400, detail="Order not available for pickup")
    order.delivery_id = user.id
    db.commit()
    db.refresh(order)
    return _serialize(order)


@router.put("/orders/{order_id}/status", response_model=schemas.OrderOut)
def update_delivery_status(
    order_id: int,
    payload: schemas.OrderStatusUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles(models.UserRole.delivery)),
):
    order = (
        db.query(models.Order)
        .filter(models.Order.id == order_id, models.Order.delivery_id == user.id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    allowed = {models.OrderStatus.picked_up, models.OrderStatus.delivered}
    if payload.status not in allowed:
        raise HTTPException(status_code=400, detail="Delivery partner cannot set this status")

    order.status = payload.status

    # Credit the delivery partner's earnings ledger once the order is delivered.
    # Payout is distance-based: ₹{RATE_PER_KM}/km (see utils.compute_distance_and_fees).
    if payload.status == models.OrderStatus.delivered:
        profile = _get_or_create_profile(db, user)
        profile.total_earnings = round((profile.total_earnings or 0) + (order.delivery_partner_payout or 0), 2)
        profile.total_deliveries = (profile.total_deliveries or 0) + 1
        if order.payment_method == models.PaymentMethod.cod:
            order.payment_status = models.PaymentStatus.paid

    db.commit()
    db.refresh(order)
    return _serialize(order)


@router.get("/earnings", response_model=schemas.DeliveryProfileOut)
def my_earnings(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles(models.UserRole.delivery)),
):
    return _get_or_create_profile(db, user)

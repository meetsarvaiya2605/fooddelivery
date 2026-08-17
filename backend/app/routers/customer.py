from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import require_roles
from ..database import get_db
from ..routers.payment import verify_payment_signature
from ..utils import compute_distance_and_fees

router = APIRouter(prefix="/api/customer", tags=["customer"])


@router.post("/quote", response_model=schemas.QuoteOut)
def quote_delivery_fee(
    payload: schemas.QuoteRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles(models.UserRole.customer)),
):
    """Lets the frontend preview distance + delivery fee before checkout."""
    rest = db.query(models.Restaurant).filter(models.Restaurant.id == payload.restaurant_id).first()
    if not rest:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    distance_km, fee, _payout = compute_distance_and_fees(
        rest.latitude, rest.longitude, payload.delivery_latitude, payload.delivery_longitude
    )
    return schemas.QuoteOut(distance_km=distance_km, delivery_fee=fee)


@router.post("/orders", response_model=schemas.OrderOut)
def place_order(
    payload: schemas.OrderCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles(models.UserRole.customer)),
):
    rest = db.query(models.Restaurant).filter(models.Restaurant.id == payload.restaurant_id).first()
    if not rest:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    if not rest.is_open:
        raise HTTPException(status_code=400, detail="Restaurant is currently closed")
    if not payload.items:
        raise HTTPException(status_code=400, detail="Order must contain at least one item")

    distance_km, delivery_fee, delivery_payout = compute_distance_and_fees(
        rest.latitude, rest.longitude, payload.delivery_latitude, payload.delivery_longitude
    )

    # ---- Online payment methods (UPI / card / wallet) must carry a verified Razorpay payment ----
    payment_status = models.PaymentStatus.pending
    if payload.payment_method == models.PaymentMethod.cod:
        payment_status = models.PaymentStatus.pending  # collected on delivery
    else:
        if not payload.razorpay_order_id or not payload.razorpay_payment_id or not payload.razorpay_signature:
            raise HTTPException(status_code=400, detail="Missing payment confirmation details")
        if not verify_payment_signature(
            payload.razorpay_order_id, payload.razorpay_payment_id, payload.razorpay_signature
        ):
            raise HTTPException(status_code=400, detail="Payment verification failed")
        payment_status = models.PaymentStatus.paid

    order = models.Order(
        customer_id=user.id,
        restaurant_id=rest.id,
        delivery_address=payload.delivery_address,
        delivery_latitude=payload.delivery_latitude,
        delivery_longitude=payload.delivery_longitude,
        distance_km=distance_km,
        delivery_fee=delivery_fee,
        delivery_partner_payout=delivery_payout,
        notes=payload.notes or "",
        status=models.OrderStatus.pending,
        payment_method=payload.payment_method,
        payment_status=payment_status,
        razorpay_order_id=payload.razorpay_order_id or "",
        razorpay_payment_id=payload.razorpay_payment_id or "",
    )
    db.add(order)
    db.flush()

    total = 0.0
    for line in payload.items:
        menu_item = (
            db.query(models.MenuItem)
            .filter(
                models.MenuItem.id == line.menu_item_id,
                models.MenuItem.restaurant_id == rest.id,
            )
            .first()
        )
        if not menu_item or not menu_item.is_available:
            raise HTTPException(
                status_code=400, detail=f"Menu item {line.menu_item_id} unavailable"
            )
        qty = max(1, line.quantity)
        subtotal = menu_item.price * qty
        total += subtotal
        db.add(
            models.OrderItem(
                order_id=order.id,
                menu_item_id=menu_item.id,
                name=menu_item.name,
                price=menu_item.price,
                quantity=qty,
            )
        )

    order.total_amount = total + order.delivery_fee
    db.commit()
    db.refresh(order)

    out = schemas.OrderOut.model_validate(order)
    out.restaurant_name = rest.name
    out.restaurant_address = rest.address
    out.customer_name = user.name
    out.customer_phone = user.phone
    return out


@router.get("/orders", response_model=List[schemas.OrderOut])
def my_orders(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles(models.UserRole.customer)),
):
    orders = (
        db.query(models.Order)
        .filter(models.Order.customer_id == user.id)
        .order_by(models.Order.id.desc())
        .all()
    )
    result = []
    for o in orders:
        out = schemas.OrderOut.model_validate(o)
        out.restaurant_name = o.restaurant.name if o.restaurant else None
        out.customer_name = user.name
        out.customer_phone = user.phone
        result.append(out)
    return result


@router.get("/orders/{order_id}", response_model=schemas.OrderOut)
def get_my_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles(models.UserRole.customer)),
):
    o = (
        db.query(models.Order)
        .filter(models.Order.id == order_id, models.Order.customer_id == user.id)
        .first()
    )
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    out = schemas.OrderOut.model_validate(o)
    out.restaurant_name = o.restaurant.name if o.restaurant else None
    out.customer_name = user.name
    out.customer_phone = user.phone
    return out


@router.put("/orders/{order_id}/cancel", response_model=schemas.OrderOut)
def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles(models.UserRole.customer)),
):
    o = (
        db.query(models.Order)
        .filter(models.Order.id == order_id, models.Order.customer_id == user.id)
        .first()
    )
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    if o.status not in (models.OrderStatus.pending, models.OrderStatus.accepted):
        raise HTTPException(status_code=400, detail="Order can no longer be cancelled")
    o.status = models.OrderStatus.cancelled
    db.commit()
    db.refresh(o)
    out = schemas.OrderOut.model_validate(o)
    out.restaurant_name = o.restaurant.name if o.restaurant else None
    return out

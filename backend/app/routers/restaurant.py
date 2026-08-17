from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user, require_roles
from ..database import get_db

router = APIRouter(prefix="/api/restaurant", tags=["restaurant"])


def _get_owned_restaurant(db: Session, user: models.User) -> models.Restaurant:
    rest = db.query(models.Restaurant).filter(models.Restaurant.owner_id == user.id).first()
    if not rest:
        raise HTTPException(status_code=404, detail="Restaurant profile not found")
    return rest


# ---------- PUBLIC LISTING (used by customer side too) ----------
@router.get("/public/list", response_model=List[schemas.RestaurantOut])
def list_restaurants(db: Session = Depends(get_db)):
    return db.query(models.Restaurant).order_by(models.Restaurant.id.desc()).all()


@router.get("/public/{restaurant_id}", response_model=schemas.RestaurantWithMenu)
def get_restaurant_public(restaurant_id: int, db: Session = Depends(get_db)):
    rest = db.query(models.Restaurant).filter(models.Restaurant.id == restaurant_id).first()
    if not rest:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return rest


# ---------- OWNER: PROFILE ----------
@router.get("/me", response_model=schemas.RestaurantWithMenu)
def my_restaurant(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles(models.UserRole.restaurant)),
):
    return _get_owned_restaurant(db, user)


@router.put("/me", response_model=schemas.RestaurantOut)
def update_my_restaurant(
    payload: schemas.RestaurantUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles(models.UserRole.restaurant)),
):
    rest = _get_owned_restaurant(db, user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(rest, field, value)
    db.commit()
    db.refresh(rest)
    return rest


# ---------- OWNER: MENU MANAGEMENT ----------
@router.post("/menu", response_model=schemas.MenuItemOut)
def add_menu_item(
    payload: schemas.MenuItemCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles(models.UserRole.restaurant)),
):
    rest = _get_owned_restaurant(db, user)
    item = models.MenuItem(restaurant_id=rest.id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/menu/{item_id}", response_model=schemas.MenuItemOut)
def update_menu_item(
    item_id: int,
    payload: schemas.MenuItemUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles(models.UserRole.restaurant)),
):
    rest = _get_owned_restaurant(db, user)
    item = (
        db.query(models.MenuItem)
        .filter(models.MenuItem.id == item_id, models.MenuItem.restaurant_id == rest.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/menu/{item_id}")
def delete_menu_item(
    item_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles(models.UserRole.restaurant)),
):
    rest = _get_owned_restaurant(db, user)
    item = (
        db.query(models.MenuItem)
        .filter(models.MenuItem.id == item_id, models.MenuItem.restaurant_id == rest.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")
    db.delete(item)
    db.commit()
    return {"detail": "deleted"}


# ---------- OWNER: ORDERS ----------
@router.get("/orders", response_model=List[schemas.OrderOut])
def my_restaurant_orders(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles(models.UserRole.restaurant)),
):
    rest = _get_owned_restaurant(db, user)
    orders = (
        db.query(models.Order)
        .filter(models.Order.restaurant_id == rest.id)
        .order_by(models.Order.id.desc())
        .all()
    )
    result = []
    for o in orders:
        out = schemas.OrderOut.model_validate(o)
        out.restaurant_name = rest.name
        out.restaurant_address = rest.address
        out.customer_name = o.customer.name if o.customer else None
        out.customer_phone = o.customer.phone if o.customer else None
        result.append(out)
    return result


@router.put("/orders/{order_id}/status", response_model=schemas.OrderOut)
def update_order_status(
    order_id: int,
    payload: schemas.OrderStatusUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_roles(models.UserRole.restaurant)),
):
    rest = _get_owned_restaurant(db, user)
    order = (
        db.query(models.Order)
        .filter(models.Order.id == order_id, models.Order.restaurant_id == rest.id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    allowed = {
        models.OrderStatus.accepted,
        models.OrderStatus.preparing,
        models.OrderStatus.ready,
        models.OrderStatus.rejected,
    }
    if payload.status not in allowed:
        raise HTTPException(status_code=400, detail="Restaurant cannot set this status")

    order.status = payload.status
    db.commit()
    db.refresh(order)
    out = schemas.OrderOut.model_validate(order)
    out.restaurant_name = rest.name
    out.customer_name = order.customer.name if order.customer else None
    out.customer_phone = order.customer.phone if order.customer else None
    return out

import enum
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Enum, Float, ForeignKey, Integer, String, Text
)
from sqlalchemy.orm import relationship

from .database import Base


class UserRole(str, enum.Enum):
    customer = "customer"
    restaurant = "restaurant"
    delivery = "delivery"
    admin = "admin"


class OrderStatus(str, enum.Enum):
    pending = "pending"                 # placed by customer, waiting restaurant
    accepted = "accepted"               # restaurant accepted, preparing
    preparing = "preparing"
    ready = "ready"                     # ready for pickup, waiting delivery partner
    picked_up = "picked_up"             # delivery partner picked it up
    delivered = "delivered"             # completed
    cancelled = "cancelled"
    rejected = "rejected"


class VerificationStatus(str, enum.Enum):
    not_submitted = "not_submitted"     # partner hasn't submitted KYC docs yet
    pending = "pending"                 # submitted, waiting admin review
    approved = "approved"               # verified, can go online & accept orders
    rejected = "rejected"               # rejected, must resubmit


class VehicleType(str, enum.Enum):
    bike = "bike"
    scooter = "scooter"
    bicycle = "bicycle"
    car = "car"


class PaymentMethod(str, enum.Enum):
    cod = "cod"
    upi = "upi"
    card = "card"
    wallet = "wallet"


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"
    failed = "failed"
    refunded = "refunded"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False)
    phone = Column(String(30), default="")
    address = Column(String(255), default="")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    restaurant = relationship("Restaurant", back_populates="owner", uselist=False)
    orders_as_customer = relationship(
        "Order", back_populates="customer", foreign_keys="Order.customer_id"
    )
    deliveries = relationship(
        "Order", back_populates="delivery_partner", foreign_keys="Order.delivery_id"
    )
    delivery_profile = relationship(
        "DeliveryProfile", back_populates="user", uselist=False,
        cascade="all, delete-orphan"
    )


class DeliveryProfile(Base):
    """KYC / verification profile for a delivery partner (role=delivery)."""
    __tablename__ = "delivery_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)

    # Identity documents
    aadhar_number = Column(String(20), default="")
    aadhar_image_url = Column(String(500), default="")
    pan_number = Column(String(20), default="")
    pan_image_url = Column(String(500), default="")
    selfie_image_url = Column(String(500), default="")
    license_number = Column(String(30), default="")
    license_image_url = Column(String(500), default="")

    # Vehicle
    vehicle_type = Column(Enum(VehicleType), default=VehicleType.bike)
    vehicle_number = Column(String(20), default="")

    # Bank details (for payouts)
    bank_account_number = Column(String(30), default="")
    bank_ifsc = Column(String(20), default="")
    bank_account_holder = Column(String(120), default="")

    verification_status = Column(Enum(VerificationStatus), default=VerificationStatus.not_submitted)
    rejection_reason = Column(String(500), default="")
    is_online = Column(Boolean, default=False)

    # Simple earnings ledger (sum of per-delivery payouts, cash-in-hand style)
    total_earnings = Column(Float, default=0.0)
    total_deliveries = Column(Integer, default=0)

    submitted_at = Column(DateTime, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="delivery_profile")


class Restaurant(Base):
    __tablename__ = "restaurants"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    name = Column(String(150), nullable=False)
    description = Column(Text, default="")
    cuisine = Column(String(120), default="")
    address = Column(String(255), default="")
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    image_url = Column(String(500), default="")
    is_open = Column(Boolean, default=True)
    rating = Column(Float, default=4.5)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="restaurant")
    menu_items = relationship(
        "MenuItem", back_populates="restaurant", cascade="all, delete-orphan"
    )
    orders = relationship("Order", back_populates="restaurant")


class MenuItem(Base):
    __tablename__ = "menu_items"

    id = Column(Integer, primary_key=True, index=True)
    restaurant_id = Column(Integer, ForeignKey("restaurants.id"), nullable=False)
    name = Column(String(150), nullable=False)
    description = Column(Text, default="")
    price = Column(Float, nullable=False)
    category = Column(String(80), default="General")
    image_url = Column(String(500), default="")
    is_available = Column(Boolean, default=True)

    restaurant = relationship("Restaurant", back_populates="menu_items")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    restaurant_id = Column(Integer, ForeignKey("restaurants.id"), nullable=False)
    delivery_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    status = Column(Enum(OrderStatus), default=OrderStatus.pending)
    delivery_address = Column(String(255), nullable=False)
    delivery_latitude = Column(Float, nullable=True)
    delivery_longitude = Column(Float, nullable=True)
    distance_km = Column(Float, default=0.0)

    total_amount = Column(Float, default=0.0)
    delivery_fee = Column(Float, default=25.0)          # = distance_km * RATE_PER_KM (customer charge)
    delivery_partner_payout = Column(Float, default=0.0)  # amount credited to delivery partner (₹8/km)
    notes = Column(String(500), default="")

    # Payment
    payment_method = Column(Enum(PaymentMethod), default=PaymentMethod.cod)
    payment_status = Column(Enum(PaymentStatus), default=PaymentStatus.pending)
    razorpay_order_id = Column(String(120), default="")
    razorpay_payment_id = Column(String(120), default="")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    customer = relationship(
        "User", back_populates="orders_as_customer", foreign_keys=[customer_id]
    )
    restaurant = relationship("Restaurant", back_populates="orders")
    delivery_partner = relationship(
        "User", back_populates="deliveries", foreign_keys=[delivery_id]
    )
    items = relationship(
        "OrderItem", back_populates="order", cascade="all, delete-orphan"
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    menu_item_id = Column(Integer, ForeignKey("menu_items.id"), nullable=False)
    name = Column(String(150), nullable=False)
    price = Column(Float, nullable=False)
    quantity = Column(Integer, default=1)

    order = relationship("Order", back_populates="items")
    menu_item = relationship("MenuItem")

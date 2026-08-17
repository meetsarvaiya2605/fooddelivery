from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, ConfigDict

from .models import (
    UserRole, OrderStatus, VerificationStatus, VehicleType,
    PaymentMethod, PaymentStatus,
)


# ---------- USER / AUTH ----------
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: UserRole
    phone: Optional[str] = ""
    address: Optional[str] = ""


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: EmailStr
    role: UserRole
    phone: str
    address: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- RESTAURANT ----------
class RestaurantCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    cuisine: Optional[str] = ""
    address: Optional[str] = ""
    image_url: Optional[str] = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class RestaurantUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    cuisine: Optional[str] = None
    address: Optional[str] = None
    image_url: Optional[str] = None
    is_open: Optional[bool] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class RestaurantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    owner_id: int
    name: str
    description: str
    cuisine: str
    address: str
    image_url: str
    is_open: bool
    rating: float
    latitude: Optional[float] = None
    longitude: Optional[float] = None


# ---------- MENU ITEM ----------
class MenuItemCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    price: float
    category: Optional[str] = "General"
    image_url: Optional[str] = ""
    is_available: Optional[bool] = True


class MenuItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    category: Optional[str] = None
    image_url: Optional[str] = None
    is_available: Optional[bool] = None


class MenuItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    restaurant_id: int
    name: str
    description: str
    price: float
    category: str
    image_url: str
    is_available: bool


class RestaurantWithMenu(RestaurantOut):
    menu_items: List[MenuItemOut] = []


# ---------- ORDER ----------
class OrderItemCreate(BaseModel):
    menu_item_id: int
    quantity: int = 1


class OrderCreate(BaseModel):
    restaurant_id: int
    delivery_address: str
    delivery_latitude: Optional[float] = None
    delivery_longitude: Optional[float] = None
    notes: Optional[str] = ""
    items: List[OrderItemCreate]
    payment_method: PaymentMethod = PaymentMethod.cod
    # Populated after a successful Razorpay checkout (omit / leave blank for COD)
    razorpay_order_id: Optional[str] = ""
    razorpay_payment_id: Optional[str] = ""
    razorpay_signature: Optional[str] = ""


class QuoteRequest(BaseModel):
    """Used by the frontend to preview distance & delivery fee before checkout."""
    restaurant_id: int
    delivery_latitude: Optional[float] = None
    delivery_longitude: Optional[float] = None


class QuoteOut(BaseModel):
    distance_km: float
    delivery_fee: float


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    menu_item_id: int
    name: str
    price: float
    quantity: int


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    customer_id: int
    restaurant_id: int
    delivery_id: Optional[int]
    status: OrderStatus
    delivery_address: str
    delivery_latitude: Optional[float] = None
    delivery_longitude: Optional[float] = None
    distance_km: float
    total_amount: float
    delivery_fee: float
    delivery_partner_payout: float
    payment_method: PaymentMethod
    payment_status: PaymentStatus
    notes: str
    created_at: datetime
    updated_at: datetime
    items: List[OrderItemOut] = []
    restaurant_name: Optional[str] = None
    restaurant_address: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None


# ---------- PAYMENTS (Razorpay) ----------
class PaymentOrderCreate(BaseModel):
    amount: float  # rupees; converted to paise for Razorpay


class PaymentOrderOut(BaseModel):
    razorpay_order_id: str
    amount_paise: int
    currency: str = "INR"
    key_id: str  # public key id, safe to expose to frontend checkout widget


# ---------- DELIVERY PARTNER VERIFICATION (KYC) ----------
class DeliveryProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    aadhar_number: str
    aadhar_image_url: str
    pan_number: str
    pan_image_url: str
    selfie_image_url: str
    license_number: str
    license_image_url: str
    vehicle_type: VehicleType
    vehicle_number: str
    bank_account_number: str
    bank_ifsc: str
    bank_account_holder: str
    verification_status: VerificationStatus
    rejection_reason: str
    is_online: bool
    total_earnings: float
    total_deliveries: int
    submitted_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None


class DeliveryProfileTextFields(BaseModel):
    aadhar_number: str
    pan_number: str
    license_number: str
    vehicle_type: VehicleType
    vehicle_number: str
    bank_account_number: Optional[str] = ""
    bank_ifsc: Optional[str] = ""
    bank_account_holder: Optional[str] = ""


class OnlineToggle(BaseModel):
    is_online: bool


class VerificationReview(BaseModel):
    approve: bool
    rejection_reason: Optional[str] = ""

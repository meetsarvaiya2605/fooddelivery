import hashlib
import hmac

from fastapi import APIRouter, Depends, HTTPException

from .. import models, schemas
from ..auth import require_roles
from ..config import settings

router = APIRouter(prefix="/api/payment", tags=["payment"])

try:
    import razorpay
except ImportError:  # library optional until pip install -r requirements.txt is run
    razorpay = None


def _client():
    if razorpay is None:
        raise HTTPException(
            status_code=500,
            detail="razorpay package not installed. Run: pip install razorpay",
        )
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise HTTPException(
            status_code=500,
            detail=(
                "Payment gateway not configured. Add RAZORPAY_KEY_ID and "
                "RAZORPAY_KEY_SECRET to backend/.env (get them from "
                "https://dashboard.razorpay.com/app/keys)."
            ),
        )
    return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))


@router.get("/key")
def get_public_key():
    """Frontend calls this to know which Razorpay key to use for the Checkout widget."""
    return {"key_id": settings.RAZORPAY_KEY_ID, "configured": bool(settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET)}


@router.post("/create-order", response_model=schemas.PaymentOrderOut)
def create_payment_order(
    payload: schemas.PaymentOrderCreate,
    user: models.User = Depends(require_roles(models.UserRole.customer)),
):
    """Creates a Razorpay Order for the given amount (rupees). The frontend then
    opens Razorpay Checkout (supports UPI, cards, netbanking, wallets) using the
    returned order id, and on success calls /api/customer/orders with the
    resulting payment id + signature so the backend can verify and save the order.
    """
    client = _client()
    amount_paise = int(round(payload.amount * 100))
    if amount_paise <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount")

    rp_order = client.order.create({
        "amount": amount_paise,
        "currency": "INR",
        "payment_capture": 1,
    })
    return schemas.PaymentOrderOut(
        razorpay_order_id=rp_order["id"],
        amount_paise=amount_paise,
        currency="INR",
        key_id=settings.RAZORPAY_KEY_ID,
    )


def verify_payment_signature(order_id: str, payment_id: str, signature: str) -> bool:
    """Verifies the HMAC-SHA256 signature Razorpay returns after a successful checkout."""
    if not (order_id and payment_id and signature):
        return False
    if not settings.RAZORPAY_KEY_SECRET:
        return False
    body = f"{order_id}|{payment_id}".encode()
    expected = hmac.new(settings.RAZORPAY_KEY_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)

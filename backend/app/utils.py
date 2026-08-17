import math
import uuid
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, UploadFile

from .config import settings

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8 MB


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two lat/lng points, in kilometers."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def compute_distance_and_fees(
    restaurant_lat: Optional[float],
    restaurant_lng: Optional[float],
    customer_lat: Optional[float],
    customer_lng: Optional[float],
):
    """Returns (distance_km, customer_delivery_fee, delivery_partner_payout).

    Both the fee charged to the customer and the amount paid to the delivery
    partner are based on distance x ₹{RATE_PER_KM}/km, with a minimum floor fee.
    Falls back to a default distance if coordinates are unavailable (e.g. the
    customer didn't share location / restaurant hasn't set its coordinates).
    """
    if restaurant_lat is not None and restaurant_lng is not None and customer_lat is not None and customer_lng is not None:
        distance_km = haversine_km(restaurant_lat, restaurant_lng, customer_lat, customer_lng)
    else:
        distance_km = settings.DEFAULT_DISTANCE_KM

    distance_km = round(max(distance_km, 0.5), 2)  # never charge for < 0.5km
    raw_fee = round(distance_km * settings.RATE_PER_KM, 2)
    fee = max(raw_fee, settings.MIN_DELIVERY_FEE)
    payout = fee  # partner is paid the same ₹/km rate the customer is charged
    return distance_km, fee, payout


async def save_upload(file: UploadFile, subfolder: str) -> str:
    """Validates and saves an uploaded file under uploads/<subfolder>/, returns a public URL path."""
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 8MB)")

    ext = Path(file.filename or "").suffix.lower() or ".jpg"
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".pdf"}:
        ext = ".jpg"

    folder = settings.UPLOAD_DIR / subfolder
    folder.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = folder / filename
    with open(dest, "wb") as f:
        f.write(contents)

    return f"/uploads/{subfolder}/{filename}"

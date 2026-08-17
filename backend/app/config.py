import os
from pathlib import Path

# Load a .env file if present (no hard dependency required at import time)
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass


class Settings:
    # ---- Payment gateway (Razorpay) ----
    # Create a free account at https://dashboard.razorpay.com/ and generate
    # API keys under Settings > API Keys. Put them in backend/.env as:
    #   RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
    #   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
    RAZORPAY_KEY_ID: str = os.getenv("RAZORPAY_KEY_ID", "")
    RAZORPAY_KEY_SECRET: str = os.getenv("RAZORPAY_KEY_SECRET", "")

    # ---- Delivery payout ----
    RATE_PER_KM: float = float(os.getenv("RATE_PER_KM", "8"))       # ₹8 / km paid to delivery partner
    MIN_DELIVERY_FEE: float = float(os.getenv("MIN_DELIVERY_FEE", "20"))  # floor fee for very short trips
    DEFAULT_DISTANCE_KM: float = float(os.getenv("DEFAULT_DISTANCE_KM", "3"))  # fallback if no coordinates

    # ---- Uploads ----
    UPLOAD_DIR: Path = Path(__file__).resolve().parent.parent / "uploads"


settings = Settings()
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

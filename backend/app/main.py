from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import models
from .config import settings
from .database import Base, engine
from .routers import auth, customer, delivery, payment, restaurant, verification

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Food Delivery App", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(restaurant.router)
app.include_router(customer.router)
app.include_router(delivery.router)
app.include_router(verification.router)
app.include_router(verification.admin_router)
app.include_router(payment.router)

# ---------- Serve uploaded KYC documents / selfies ----------
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(settings.UPLOAD_DIR)), name="uploads")

# ---------- Serve frontend (static files) ----------
FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"

if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")


@app.get("/api/health")
def health():
    return {"status": "ok"}

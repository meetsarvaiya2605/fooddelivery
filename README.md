# FoodFlow — Full-Stack Food Delivery App

A complete food delivery platform with **four portals** (Customer, Restaurant, Delivery,
Admin), built with **FastAPI** (backend + REST API) and a **vanilla JS/HTML/CSS** frontend
(served by the same FastAPI app — no separate build step needed).

## What's new in this version

- **Delivery partner KYC verification** — partners must upload Aadhar card, PAN card, a
  selfie, and driving licence, plus vehicle (type + number plate) and bank details, before
  they can go online and accept orders. An **Admin portal** lets you approve or reject
  submissions and view the uploaded documents.
- **Distance-based delivery pay** — delivery partners earn **₹8 per km** (restaurant →
  customer address), computed with the Haversine formula from GPS coordinates. The same
  rate is charged to the customer as the delivery fee, with a small minimum floor fee.
  Earnings are credited automatically when a partner marks an order "delivered", and are
  visible on an **Earnings** tab.
- **Payment gateway (Razorpay)** — customers can pay by **UPI, card, or wallet** at
  checkout (via Razorpay Checkout), or choose **Cash on Delivery**. Payments are verified
  server-side via HMAC signature before the order is created.

## Folder structure

```
food-delivery-app/
├── backend/
│   ├── app/
│   │   ├── main.py            FastAPI app, mounts routers + serves frontend + /uploads
│   │   ├── database.py        SQLAlchemy engine/session (SQLite)
│   │   ├── config.py          Loads Razorpay keys & payout rate from .env
│   │   ├── utils.py           Haversine distance, fee/payout calc, file upload saving
│   │   ├── models.py          User, DeliveryProfile, Restaurant, MenuItem, Order, OrderItem
│   │   ├── schemas.py         Pydantic request/response models
│   │   ├── auth.py            JWT auth, password hashing, role guards
│   │   └── routers/
│   │       ├── auth.py            /api/auth/register /login /me
│   │       ├── restaurant.py      restaurant profile (incl. pickup lat/lng), menu CRUD, orders
│   │       ├── customer.py        browse/quote/order/track/cancel
│   │       ├── delivery.py        available orders, accept, status, earnings
│   │       ├── verification.py    delivery KYC submit/status/online toggle + admin review
│   │       └── payment.py         Razorpay order creation & signature verification
│   ├── requirements.txt
│   ├── .env.example            copy to .env and add your Razorpay keys
│   └── seed.py                 creates demo accounts (customer/restaurant/rider/admin)
└── frontend/
    ├── index.html               login / register (role picker)
    ├── css/style.css            shared design system
    ├── js/api.js                shared fetch/auth/toast/geolocation helpers
    ├── customer/                browse, cart, location capture, Razorpay checkout, tracking
    ├── restaurant/               profile (+ pickup location), menu CRUD, order queue
    ├── delivery/                 KYC submission, online toggle, orders, earnings
    └── admin/                    review & approve/reject delivery partner documents
```

## How it works

- **One database**, four roles (`customer`, `restaurant`, `delivery`, `admin`).
- **Order lifecycle**:
  `pending → accepted → preparing → ready → (delivery partner accepts) → picked_up → delivered`
  (or `rejected` / `cancelled` along the way).
- **Delivery partner verification flow**: register as "Delivery" → submit KYC documents under
  "My Documents" → status is `pending` until an admin approves/rejects it in the Admin portal →
  once `approved`, the partner can flip the **online/offline** switch and start accepting orders.
- **Delivery fee / payout**: when a customer checks out, the app calls `/api/customer/quote`
  with the restaurant's saved coordinates and the customer's captured location (via the
  "Use my current location" button) to preview `distance_km × ₹8/km` (minimum ₹20). The same
  figure becomes the delivery partner's payout once the order is delivered.
- **Payments**: choosing UPI / Card / Wallet opens Razorpay Checkout; on success the frontend
  sends the payment id + signature to the backend, which verifies it with HMAC-SHA256 before
  saving the order as paid. Cash on Delivery skips this and is marked paid when the partner
  delivers it.
- Dashboards **poll every 8 seconds** so all sides stay roughly in sync without websockets.
- Auth uses JWT bearer tokens stored in `localStorage`; every protected endpoint checks the
  token and the user's role.

## Running it

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Payment gateway: copy the example env file and add your own Razorpay keys
cp .env.example .env
# then edit .env — get free test keys at https://dashboard.razorpay.com/app/keys

# optional: create demo accounts + a sample restaurant/menu
python seed.py

# start the server (serves both the API and the frontend)
uvicorn app.main:app --reload --port 8000
```

Open **http://localhost:8000** in your browser.

- Interactive API docs: **http://localhost:8000/docs**
- Register accounts (or use the seeded ones) to try all sides at once — easiest is to open
  each portal in a separate browser profile / incognito window, since each stores its own
  session in `localStorage`.
- The browser will ask for **location permission** when a customer clicks "Use my current
  location" or a restaurant sets its pickup point — allow it for accurate distance-based fees.

### Demo accounts (after running `python seed.py`)

| Role       | Email               | Password    | Notes                              |
|------------|----------------------|-------------|-------------------------------------|
| Customer   | customer@demo.com    | password123 |                                      |
| Restaurant | restaurant@demo.com  | password123 | Has demo coordinates pre-set        |
| Delivery   | rider@demo.com       | password123 | Pre-verified & online for demo ease |
| Admin      | admin@demo.com       | password123 | Reviews/approves delivery partners  |

To see the real KYC flow end-to-end, **register a new Delivery account** instead of using
`rider@demo.com` — it will start `not_submitted` and walk through submit → pending → admin
review → approved, exactly as a real partner would.

## Payment gateway setup (required for UPI/Card/Wallet)

1. Create a free account at https://dashboard.razorpay.com/signup
2. Go to **Settings → API Keys → Generate Test Key**
3. Put the two values into `backend/.env`:
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
   ```
4. Restart the server. Cash on Delivery works with no configuration; online payment
   methods will show a clear error until keys are configured.

Test-mode UPI ID `success@razorpay` and Razorpay's test cards (see their docs) can be used
to simulate successful payments without real money.

## Notes / production hardening ideas

- Swap the SQLite file DB for Postgres/MySQL by changing `SQLALCHEMY_DATABASE_URL` in
  `app/database.py`.
- Move `SECRET_KEY` in `app/auth.py` into an environment variable (same pattern as `.env`
  for Razorpay keys).
- Replace polling with WebSockets for real push updates.
- Store uploaded KYC documents in cloud storage (S3 etc.) instead of local disk, and
  restrict who can view them (currently served as static files under `/uploads`).
- Add SMS/email OTP verification of Aadhar/PAN in addition to manual admin review.
- Add ratings/reviews and real road-distance routing (Google Maps Directions API) instead
  of straight-line Haversine distance.

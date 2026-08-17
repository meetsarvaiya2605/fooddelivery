"""
Optional: populate the database with demo accounts and menu items.
Run with:  python seed.py   (from inside backend/ folder, after installing requirements)
"""
from datetime import datetime

from app.database import SessionLocal, Base, engine
from app import models
from app.auth import hash_password

Base.metadata.create_all(bind=engine)
db = SessionLocal()


def get_or_create_user(name, email, password, role, phone="9999999999", address="Demo City"):
    user = db.query(models.User).filter(models.User.email == email).first()
    if user:
        return user
    user = models.User(
        name=name,
        email=email,
        password_hash=hash_password(password),
        role=role,
        phone=phone,
        address=address,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# demo customer
customer = get_or_create_user("Asha Patel", "customer@demo.com", "password123", models.UserRole.customer)

# demo delivery partner (pre-verified so the demo account can accept orders immediately)
rider = get_or_create_user("Ravi Kumar", "rider@demo.com", "password123", models.UserRole.delivery)
rider_profile = db.query(models.DeliveryProfile).filter(models.DeliveryProfile.user_id == rider.id).first()
if not rider_profile:
    rider_profile = models.DeliveryProfile(
        user_id=rider.id,
        aadhar_number="XXXX-XXXX-1234",
        aadhar_image_url="",
        pan_number="ABCDE1234F",
        pan_image_url="",
        selfie_image_url="",
        license_number="DL-0420110012345",
        license_image_url="",
        vehicle_type=models.VehicleType.bike,
        vehicle_number="GJ06AB1234",
        bank_account_number="000000000000",
        bank_ifsc="DEMO0001234",
        bank_account_holder="Ravi Kumar",
        verification_status=models.VerificationStatus.approved,
        is_online=True,
        submitted_at=datetime.utcnow(),
        reviewed_at=datetime.utcnow(),
    )
    db.add(rider_profile)
    db.commit()

# demo admin (approves/rejects delivery partner KYC submissions)
admin = get_or_create_user("Admin", "admin@demo.com", "password123", models.UserRole.admin)

# demo restaurant owner + restaurant + menu
owner = get_or_create_user("Chef Mario", "restaurant@demo.com", "password123", models.UserRole.restaurant)
rest = db.query(models.Restaurant).filter(models.Restaurant.owner_id == owner.id).first()
if not rest:
    rest = models.Restaurant(owner_id=owner.id, name="Mario's Pizzeria")
    db.add(rest)
    db.commit()
    db.refresh(rest)

rest.description = "Authentic Italian pizza, pasta and more."
rest.cuisine = "Italian"
rest.address = "12 MG Road, Demo City"
rest.latitude = 22.3072   # Vadodara, Gujarat (demo coordinates)
rest.longitude = 73.1812
rest.image_url = "https://images.unsplash.com/photo-1548365328-9f547fb0953c?w=600"
rest.is_open = True
db.commit()

if not rest.menu_items:
    demo_items = [
        ("Margherita Pizza", "Classic cheese & tomato pizza", 249, "Pizza",
         "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400"),
        ("Pepperoni Pizza", "Loaded with pepperoni & mozzarella", 349, "Pizza",
         "https://images.unsplash.com/photo-1628840042765-356cda07504e?w=400"),
        ("Alfredo Pasta", "Creamy white sauce pasta", 219, "Pasta",
         "https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=400"),
        ("Garlic Bread", "Toasted bread with garlic butter", 99, "Sides",
         "https://images.unsplash.com/photo-1619535860434-ba1d8fa32b52?w=400"),
        ("Tiramisu", "Classic Italian coffee dessert", 149, "Dessert",
         "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=400"),
    ]
    for name, desc, price, cat, img in demo_items:
        db.add(
            models.MenuItem(
                restaurant_id=rest.id,
                name=name,
                description=desc,
                price=price,
                category=cat,
                image_url=img,
            )
        )
    db.commit()

print("Seed complete.")
print("Login with:")
print("  customer@demo.com / password123")
print("  restaurant@demo.com / password123")
print("  rider@demo.com / password123   (pre-verified & online)")
print("  admin@demo.com / password123   (reviews delivery partner KYC)")

db.close()

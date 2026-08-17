const user = requireRole("customer");
document.getElementById("greeting").textContent = `Hi, ${user.name.split(" ")[0]} 👋`;
document.getElementById("avatarInitials").textContent = initials(user.name);

let restaurants = [];
let currentRestaurant = null; // full restaurant + menu_items being viewed
let cart = loadCart(); // { restaurantId, restaurantName, items: {}, deliveryLat, deliveryLng }
let pollTimer = null;
let quoteInFlight = false;

/* ---------------- Cart persistence ---------------- */
function loadCart() {
  const raw = localStorage.getItem("fd_cart_" + user.id);
  return raw ? JSON.parse(raw) : { restaurantId: null, restaurantName: "", items: {}, deliveryLat: null, deliveryLng: null };
}
function saveCart() {
  localStorage.setItem("fd_cart_" + user.id, JSON.stringify(cart));
  renderCartFab();
}
function cartItemCount() {
  return Object.values(cart.items).reduce((s, i) => s + i.qty, 0);
}
function cartTotal() {
  return Object.values(cart.items).reduce((s, i) => s + i.qty * i.price, 0);
}
function renderCartFab() {
  const fab = document.getElementById("cartFab");
  const count = cartItemCount();
  if (count > 0) {
    fab.style.display = "flex";
    document.getElementById("cartCount").textContent = count;
    document.getElementById("cartTotal").textContent = money(cartTotal());
  } else {
    fab.style.display = "none";
  }
}

/* ---------------- Tabs ---------------- */
function showTab(tab) {
  document.getElementById("tabBrowse").classList.toggle("active", tab === "browse");
  document.getElementById("tabOrders").classList.toggle("active", tab === "orders");
  document.getElementById("browseView").style.display = tab === "browse" ? "block" : "none";
  document.getElementById("ordersView").style.display = tab === "orders" ? "block" : "none";
  if (tab === "orders") loadOrders();
}

/* ---------------- Browse restaurants ---------------- */
async function loadRestaurants() {
  try {
    restaurants = await api("/api/restaurant/public/list");
    renderRestaurantList();
  } catch (err) {
    document.getElementById("restaurantListWrap").innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

function renderRestaurantList() {
  const wrap = document.getElementById("restaurantListWrap");
  if (!restaurants.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="emoji">🍽️</div>No restaurants available yet.</div>`;
    return;
  }
  wrap.innerHTML = `<div class="grid grid-3">${restaurants.map(r => `
    <div class="rest-card" onclick="openRestaurant(${r.id})">
      <div class="thumb" style="background-image:url('${escapeHtml(r.image_url || fallbackImg())}')"></div>
      <div class="body">
        <div class="flex-between">
          <h3>${escapeHtml(r.name)}</h3>
          <span class="rest-badge ${r.is_open ? "open" : "closed"}">${r.is_open ? "Open" : "Closed"}</span>
        </div>
        <p class="muted small" style="margin:0;">${escapeHtml(r.cuisine || "Multi-cuisine")}</p>
        <div class="muted-row"><span>⭐ ${r.rating.toFixed(1)}</span><span>${escapeHtml(r.address || "")}</span></div>
      </div>
    </div>
  `).join("")}</div>`;
}

function fallbackImg() {
  return "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600";
}

async function openRestaurant(id) {
  try {
    currentRestaurant = await api(`/api/restaurant/public/${id}`);
  } catch (err) {
    toast(err.message, "error");
    return;
  }
  if (cart.restaurantId && cart.restaurantId !== id && cartItemCount() > 0) {
    if (!confirm(`Your cart has items from ${cart.restaurantName}. Start a new order at ${currentRestaurant.name} and clear the current cart?`)) {
      return;
    }
    cart = { restaurantId: null, restaurantName: "", items: {} };
    saveCart();
  }
  document.getElementById("restaurantListWrap").style.display = "none";
  const detail = document.getElementById("restaurantDetailWrap");
  detail.style.display = "block";
  renderRestaurantDetail();
}

function backToList() {
  currentRestaurant = null;
  document.getElementById("restaurantListWrap").style.display = "block";
  document.getElementById("restaurantDetailWrap").style.display = "none";
}

function renderRestaurantDetail() {
  const r = currentRestaurant;
  const detail = document.getElementById("restaurantDetailWrap");
  const categories = [...new Set(r.menu_items.map(m => m.category || "General"))];

  detail.innerHTML = `
    <button class="btn btn-ghost btn-sm mb-16" onclick="backToList()">← Back to restaurants</button>
    <div class="card mb-16" style="display:flex; gap:18px; flex-wrap:wrap; align-items:center;">
      <div class="thumb" style="width:110px;height:90px;border-radius:12px;background-image:url('${escapeHtml(r.image_url || fallbackImg())}');background-size:cover;background-position:center;"></div>
      <div style="flex:1; min-width:200px;">
        <div class="flex-between">
          <h2 style="margin:0;">${escapeHtml(r.name)}</h2>
          <span class="rest-badge ${r.is_open ? "open" : "closed"}">${r.is_open ? "Open" : "Closed"}</span>
        </div>
        <p class="muted" style="margin:4px 0;">${escapeHtml(r.description || r.cuisine || "")}</p>
        <p class="muted small" style="margin:0;">⭐ ${r.rating.toFixed(1)} · ${escapeHtml(r.address || "")}</p>
      </div>
    </div>
    ${!r.is_open ? `<div class="card" style="background:var(--danger-bg); color:var(--danger); margin-bottom:16px;">This restaurant is currently closed and not accepting orders.</div>` : ""}
    ${categories.map(cat => `
      <div class="section-title">${escapeHtml(cat)}</div>
      <div class="card">
        ${r.menu_items.filter(m => (m.category || "General") === cat).map(renderMenuRow).join("")}
      </div>
    `).join("")}
  `;
}

function renderMenuRow(item) {
  const qty = cart.items[item.id]?.qty || 0;
  return `
    <div class="menu-item-row">
      <div class="thumb-sm" style="background-image:url('${escapeHtml(item.image_url || fallbackImg())}')"></div>
      <div class="info">
        <h4>${escapeHtml(item.name)}</h4>
        <p>${escapeHtml(item.description || "")}</p>
        <div class="price">${money(item.price)}</div>
      </div>
      <div>
        ${item.is_available
          ? (qty > 0
              ? `<div class="qty-control">
                   <button onclick="changeQty(${item.id}, -1)">−</button>
                   <span>${qty}</span>
                   <button onclick="changeQty(${item.id}, 1)">+</button>
                 </div>`
              : `<button class="btn btn-outline btn-sm" onclick="changeQty(${item.id}, 1)">Add</button>`)
          : `<span class="status-badge status-cancelled">Sold out</span>`}
      </div>
    </div>
  `;
}

function changeQty(itemId, delta) {
  if (!currentRestaurant) return;
  const menuItem = currentRestaurant.menu_items.find(m => m.id === itemId);
  if (!menuItem) return;

  cart.restaurantId = currentRestaurant.id;
  cart.restaurantName = currentRestaurant.name;
  const existing = cart.items[itemId];
  const newQty = (existing?.qty || 0) + delta;

  if (newQty <= 0) {
    delete cart.items[itemId];
  } else {
    cart.items[itemId] = { id: menuItem.id, name: menuItem.name, price: menuItem.price, qty: newQty };
  }
  saveCart();
  renderRestaurantDetail();
}

/* ---------------- Cart drawer ---------------- */
function openCart() {
  const overlay = document.createElement("div");
  overlay.className = "drawer-overlay";
  overlay.id = "cartOverlay";
  overlay.onclick = (e) => { if (e.target === overlay) closeCart(); };

  const lines = Object.values(cart.items);
  overlay.innerHTML = `
    <div class="drawer">
      <div class="drawer-header">
        <h2>Your cart</h2>
        <button class="close-x" onclick="closeCart()">✕</button>
      </div>
      <p class="muted small mb-16">${escapeHtml(cart.restaurantName || "")}</p>
      ${lines.length === 0 ? `<div class="empty-state">Cart is empty</div>` : `
        ${lines.map(i => `
          <div class="cart-line">
            <div>
              <div class="name">${escapeHtml(i.name)}</div>
              <div class="price">${money(i.price)} each</div>
            </div>
            <div class="qty-control">
              <button onclick="changeQty(${i.id}, -1); refreshCartDrawer();">−</button>
              <span>${i.qty}</span>
              <button onclick="changeQty(${i.id}, 1); refreshCartDrawer();">+</button>
            </div>
          </div>
        `).join("")}

        <div class="form-group mt-16">
          <label>Delivery address</label>
          <textarea id="checkoutAddress" placeholder="Enter delivery address">${escapeHtml(user.address || "")}</textarea>
        </div>
        <button class="btn btn-outline btn-sm btn-block" id="locBtn" onclick="useMyLocation()">📍 Use my current location (for accurate delivery fee)</button>
        <p class="small muted mt-8" id="locStatus">${cart.deliveryLat ? "Location captured ✓ — delivery fee calculated by distance." : "No location set — a default distance-based fee will be used."}</p>

        <div class="form-group mt-16">
          <label>Order notes (optional)</label>
          <input type="text" id="checkoutNotes" placeholder="E.g. no onions, ring the bell..." />
        </div>

        <div id="feeSummary" class="mt-16">
          <div class="summary-row"><span>Subtotal</span><span>${money(cartTotal())}</span></div>
          <div class="summary-row"><span>Delivery fee <span class="muted small" id="distanceLabel"></span></span><span id="feeAmount">${money(25)}</span></div>
          <div class="summary-row total"><span>Total</span><span id="grandTotal">${money(cartTotal() + 25)}</span></div>
        </div>

        <div class="section-title" style="margin:20px 0 10px;">Payment method</div>
        <div class="payment-options" id="paymentOptions">
          <label class="pay-option active" data-method="cod">
            <input type="radio" name="payMethod" value="cod" checked /> 💵 Cash on delivery
          </label>
          <label class="pay-option" data-method="upi">
            <input type="radio" name="payMethod" value="upi" /> 📱 UPI
          </label>
          <label class="pay-option" data-method="card">
            <input type="radio" name="payMethod" value="card" /> 💳 Credit / Debit card
          </label>
          <label class="pay-option" data-method="wallet">
            <input type="radio" name="payMethod" value="wallet" /> 👛 Wallet
          </label>
        </div>

        <button class="btn btn-primary btn-block mt-16" id="placeOrderBtn" onclick="placeOrder()">Place order — <span id="placeOrderTotal">${money(cartTotal() + 25)}</span></button>
      `}
    </div>
  `;
  document.body.appendChild(overlay);

  if (lines.length) {
    wirePaymentOptionClicks();
    refreshQuote();
  }
}

function wirePaymentOptionClicks() {
  document.querySelectorAll(".pay-option").forEach(el => {
    el.addEventListener("click", () => {
      document.querySelectorAll(".pay-option").forEach(o => o.classList.remove("active"));
      el.classList.add("active");
      el.querySelector("input").checked = true;
    });
  });
}

function getSelectedPaymentMethod() {
  const el = document.querySelector('input[name="payMethod"]:checked');
  return el ? el.value : "cod";
}

async function useMyLocation() {
  const btn = document.getElementById("locBtn");
  btn.disabled = true;
  btn.textContent = "Getting your location...";
  try {
    const loc = await getCurrentLocation();
    cart.deliveryLat = loc.latitude;
    cart.deliveryLng = loc.longitude;
    saveCart();
    document.getElementById("locStatus").textContent = "Location captured ✓ — delivery fee calculated by distance.";
    toast("Location captured", "success");
    await refreshQuote();
  } catch (err) {
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "📍 Use my current location (for accurate delivery fee)";
  }
}

async function refreshQuote() {
  if (!cart.restaurantId || quoteInFlight) return;
  quoteInFlight = true;
  try {
    const q = await api("/api/customer/quote", {
      method: "POST",
      body: {
        restaurant_id: cart.restaurantId,
        delivery_latitude: cart.deliveryLat,
        delivery_longitude: cart.deliveryLng,
      },
    });
    const feeEl = document.getElementById("feeAmount");
    const distEl = document.getElementById("distanceLabel");
    const grandEl = document.getElementById("grandTotal");
    const placeTotalEl = document.getElementById("placeOrderTotal");
    if (feeEl) feeEl.textContent = money(q.delivery_fee);
    if (distEl) distEl.textContent = `(${q.distance_km.toFixed(1)} km)`;
    const total = cartTotal() + q.delivery_fee;
    if (grandEl) grandEl.textContent = money(total);
    if (placeTotalEl) placeTotalEl.textContent = money(total);
    cart._lastQuote = q;
  } catch (err) {
    // non-fatal — fall back to the default fee already shown
  } finally {
    quoteInFlight = false;
  }
}

function refreshCartDrawer() {
  closeCart();
  if (cartItemCount() > 0) openCart();
}

function closeCart() {
  const el = document.getElementById("cartOverlay");
  if (el) el.remove();
}

async function placeOrder() {
  const address = document.getElementById("checkoutAddress").value.trim();
  if (!address) { toast("Please enter a delivery address", "error"); return; }

  const method = getSelectedPaymentMethod();
  const btn = document.getElementById("placeOrderBtn");
  const deliveryFee = cart._lastQuote ? cart._lastQuote.delivery_fee : 25;
  const totalAmount = cartTotal() + deliveryFee;

  const basePayload = {
    restaurant_id: cart.restaurantId,
    delivery_address: address,
    delivery_latitude: cart.deliveryLat,
    delivery_longitude: cart.deliveryLng,
    notes: document.getElementById("checkoutNotes").value.trim(),
    items: Object.values(cart.items).map(i => ({ menu_item_id: i.id, quantity: i.qty })),
    payment_method: method,
  };

  if (method === "cod") {
    await submitOrder(basePayload);
    return;
  }

  // Online payment (UPI / card / wallet) via Razorpay Checkout
  if (typeof Razorpay === "undefined") {
    toast("Payment gateway failed to load. Check your connection or try Cash on delivery.", "error");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Starting payment...";
  let rpOrder;
  try {
    rpOrder = await api("/api/payment/create-order", { method: "POST", body: { amount: totalAmount } });
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Place order";
    toast(err.message, "error");
    return;
  }

  const options = {
    key: rpOrder.key_id,
    amount: rpOrder.amount_paise,
    currency: rpOrder.currency,
    name: "FoodFlow",
    description: `Order at ${cart.restaurantName}`,
    order_id: rpOrder.razorpay_order_id,
    prefill: { name: user.name, email: user.email || "", contact: user.phone || "" },
    theme: { color: "#ff5a1f" },
    method: {
      upi: method === "upi" ? 1 : undefined,
      card: method === "card" ? 1 : undefined,
      wallet: method === "wallet" ? 1 : undefined,
    },
    handler: async function (response) {
      await submitOrder({
        ...basePayload,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      });
    },
    modal: {
      ondismiss: function () {
        btn.disabled = false;
        btn.textContent = "Place order";
      },
    },
  };

  const rzp = new Razorpay(options);
  rzp.on("payment.failed", function (resp) {
    toast("Payment failed: " + (resp.error && resp.error.description ? resp.error.description : "please try again"), "error");
    btn.disabled = false;
    btn.textContent = "Place order";
  });
  rzp.open();
}

async function submitOrder(payload) {
  try {
    await api("/api/customer/orders", { method: "POST", body: payload });
    cart = { restaurantId: null, restaurantName: "", items: {}, deliveryLat: null, deliveryLng: null };
    saveCart();
    closeCart();
    toast("Order placed! Track it under 'My Orders'.", "success");
    backToList();
    showTab("orders");
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ---------------- Orders ---------------- */
async function loadOrders() {
  try {
    const orders = await api("/api/customer/orders");
    document.getElementById("ordersCount").textContent = orders.filter(o => !["delivered", "cancelled", "rejected"].includes(o.status)).length;
    renderOrders(orders);
  } catch (err) {
    document.getElementById("ordersListWrap").innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

function renderOrders(orders) {
  const wrap = document.getElementById("ordersListWrap");
  if (!orders.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="emoji">📦</div>No orders yet. Go browse some food!</div>`;
    return;
  }
  wrap.innerHTML = orders.map(o => `
    <div class="order-card">
      <div class="head">
        <div>
          <h3>${escapeHtml(o.restaurant_name || "Restaurant")}</h3>
          <div class="meta">Order #${o.id} · ${timeAgo(o.created_at)} · ${o.distance_km.toFixed(1)} km</div>
        </div>
        <span class="status-badge status-${o.status}">${statusLabel(o.status)}</span>
      </div>
      <div class="items-list">
        ${o.items.map(i => `<div><span>${i.quantity} × ${escapeHtml(i.name)}</span><span>${money(i.price * i.quantity)}</span></div>`).join("")}
      </div>
      <p class="small muted" style="margin:0 0 6px;">${paymentLabel(o)}</p>
      <div class="foot">
        <div class="total">${money(o.total_amount)}</div>
        <div class="actions">
          ${["pending", "accepted"].includes(o.status) ? `<button class="btn btn-danger btn-sm" onclick="cancelOrder(${o.id})">Cancel order</button>` : ""}
        </div>
      </div>
    </div>
  `).join("");
}

function paymentLabel(o) {
  const methodNames = { cod: "Cash on delivery", upi: "UPI", card: "Card", wallet: "Wallet" };
  const method = methodNames[o.payment_method] || o.payment_method;
  if (o.payment_method === "cod") {
    return o.payment_status === "paid" ? `💵 ${method} · Paid` : `💵 ${method} · Pay on delivery`;
  }
  return o.payment_status === "paid" ? `✅ Paid via ${method}` : `⏳ ${method} · ${escapeHtml(o.payment_status)}`;
}

async function cancelOrder(id) {
  if (!confirm("Cancel this order?")) return;
  try {
    await api(`/api/customer/orders/${id}/cancel`, { method: "PUT" });
    toast("Order cancelled", "success");
    loadOrders();
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ---------------- Init ---------------- */
loadRestaurants();
renderCartFab();
pollTimer = setInterval(() => {
  if (document.getElementById("ordersView").style.display !== "none") loadOrders();
}, 8000);

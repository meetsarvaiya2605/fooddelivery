const user = requireRole("restaurant");
document.getElementById("avatarInitials").textContent = initials(user.name);

let myRestaurant = null;
let myMenu = [];

/* ---------------- Tabs ---------------- */
function showTab(tab) {
  document.getElementById("tabOrders").classList.toggle("active", tab === "orders");
  document.getElementById("tabMenu").classList.toggle("active", tab === "menu");
  document.getElementById("tabProfile").classList.toggle("active", tab === "profile");
  document.getElementById("ordersView").style.display = tab === "orders" ? "block" : "none";
  document.getElementById("menuView").style.display = tab === "menu" ? "block" : "none";
  document.getElementById("profileView").style.display = tab === "profile" ? "block" : "none";
  if (tab === "orders") loadOrders();
  if (tab === "menu") loadMenu();
}

/* ---------------- Profile / open-close ---------------- */
async function loadRestaurant() {
  try {
    myRestaurant = await api("/api/restaurant/me");
    myMenu = myRestaurant.menu_items;
    document.getElementById("restName").textContent = myRestaurant.name;
    document.getElementById("openToggle").checked = myRestaurant.is_open;
    document.getElementById("openLabel").textContent = myRestaurant.is_open ? "Open" : "Closed";
    fillProfileForm();
  } catch (err) {
    toast(err.message, "error");
  }
}

function fillProfileForm() {
  document.getElementById("pName").value = myRestaurant.name || "";
  document.getElementById("pCuisine").value = myRestaurant.cuisine || "";
  document.getElementById("pDescription").value = myRestaurant.description || "";
  document.getElementById("pAddress").value = myRestaurant.address || "";
  document.getElementById("pImage").value = myRestaurant.image_url || "";
  document.getElementById("pLocStatus").textContent =
    (myRestaurant.latitude != null && myRestaurant.longitude != null)
      ? `Location set ✓ (${myRestaurant.latitude.toFixed(4)}, ${myRestaurant.longitude.toFixed(4)})`
      : "No location set yet — delivery fees will use a default distance until you set one.";
}

async function captureRestaurantLocation() {
  const btn = document.getElementById("pLocBtn");
  btn.disabled = true;
  btn.textContent = "Getting location...";
  try {
    const loc = await getCurrentLocation();
    myRestaurant = { ...myRestaurant, ...(await api("/api/restaurant/me", {
      method: "PUT",
      body: { latitude: loc.latitude, longitude: loc.longitude },
    })) };
    document.getElementById("pLocStatus").textContent = `Location set ✓ (${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)})`;
    toast("Pickup location saved", "success");
  } catch (err) {
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "📍 Set current location as pickup point";
  }
}

async function saveProfile() {
  const payload = {
    name: document.getElementById("pName").value.trim(),
    cuisine: document.getElementById("pCuisine").value.trim(),
    description: document.getElementById("pDescription").value.trim(),
    address: document.getElementById("pAddress").value.trim(),
    image_url: document.getElementById("pImage").value.trim(),
  };
  try {
    myRestaurant = { ...myRestaurant, ...(await api("/api/restaurant/me", { method: "PUT", body: payload })) };
    document.getElementById("restName").textContent = myRestaurant.name;
    toast("Profile updated", "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

async function toggleOpen() {
  const isOpen = document.getElementById("openToggle").checked;
  try {
    await api("/api/restaurant/me", { method: "PUT", body: { is_open: isOpen } });
    document.getElementById("openLabel").textContent = isOpen ? "Open" : "Closed";
    toast(isOpen ? "You're now accepting orders" : "You've paused new orders", "success");
  } catch (err) {
    toast(err.message, "error");
    document.getElementById("openToggle").checked = !isOpen;
  }
}

/* ---------------- Menu management ---------------- */
async function loadMenu() {
  try {
    const r = await api("/api/restaurant/me");
    myMenu = r.menu_items;
    renderMenu();
  } catch (err) {
    document.getElementById("menuListWrap").innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

function renderMenu() {
  const wrap = document.getElementById("menuListWrap");
  if (!myMenu.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="emoji">🍔</div>No menu items yet. Add your first dish!</div>`;
    return;
  }
  wrap.innerHTML = `<div class="card">${myMenu.map(item => `
    <div class="menu-item-row">
      <div class="thumb-sm" style="background-image:url('${escapeHtml(item.image_url || fallbackImg())}')"></div>
      <div class="info">
        <h4>${escapeHtml(item.name)} ${!item.is_available ? '<span class="status-badge status-cancelled">Unavailable</span>' : ''}</h4>
        <p>${escapeHtml(item.description || "")} · ${escapeHtml(item.category || "General")}</p>
        <div class="price">${money(item.price)}</div>
      </div>
      <div class="flex gap-8">
        <button class="btn btn-ghost btn-sm" onclick="editMenuItem(${item.id})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteMenuItem(${item.id})">Delete</button>
      </div>
    </div>
  `).join("")}</div>`;
}

function fallbackImg() {
  return "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400";
}

function openMenuModal() {
  document.getElementById("menuModalTitle").textContent = "Add menu item";
  document.getElementById("menuItemId").value = "";
  document.getElementById("miName").value = "";
  document.getElementById("miDescription").value = "";
  document.getElementById("miCategory").value = "";
  document.getElementById("miPrice").value = "";
  document.getElementById("miImage").value = "";
  document.getElementById("miAvailable").checked = true;
  document.getElementById("menuModal").style.display = "flex";
}

function editMenuItem(id) {
  const item = myMenu.find(m => m.id === id);
  if (!item) return;
  document.getElementById("menuModalTitle").textContent = "Edit menu item";
  document.getElementById("menuItemId").value = item.id;
  document.getElementById("miName").value = item.name;
  document.getElementById("miDescription").value = item.description;
  document.getElementById("miCategory").value = item.category;
  document.getElementById("miPrice").value = item.price;
  document.getElementById("miImage").value = item.image_url;
  document.getElementById("miAvailable").checked = item.is_available;
  document.getElementById("menuModal").style.display = "flex";
}

function closeMenuModal() {
  document.getElementById("menuModal").style.display = "none";
}

async function saveMenuItem() {
  const id = document.getElementById("menuItemId").value;
  const payload = {
    name: document.getElementById("miName").value.trim(),
    description: document.getElementById("miDescription").value.trim(),
    category: document.getElementById("miCategory").value.trim() || "General",
    price: parseFloat(document.getElementById("miPrice").value || "0"),
    image_url: document.getElementById("miImage").value.trim(),
    is_available: document.getElementById("miAvailable").checked,
  };
  if (!payload.name || payload.price <= 0) {
    toast("Please enter a name and a valid price", "error");
    return;
  }
  try {
    if (id) {
      await api(`/api/restaurant/menu/${id}`, { method: "PUT", body: payload });
    } else {
      await api("/api/restaurant/menu", { method: "POST", body: payload });
    }
    closeMenuModal();
    toast("Menu item saved", "success");
    loadMenu();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function deleteMenuItem(id) {
  if (!confirm("Delete this menu item?")) return;
  try {
    await api(`/api/restaurant/menu/${id}`, { method: "DELETE" });
    toast("Menu item deleted", "success");
    loadMenu();
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ---------------- Orders ---------------- */
const NEXT_ACTION = {
  pending: [{ label: "Accept", status: "accepted", cls: "btn-primary" }, { label: "Reject", status: "rejected", cls: "btn-danger" }],
  accepted: [{ label: "Start preparing", status: "preparing", cls: "btn-primary" }],
  preparing: [{ label: "Mark ready for pickup", status: "ready", cls: "btn-primary" }],
  ready: [],
};

async function loadOrders() {
  try {
    const orders = await api("/api/restaurant/orders");
    document.getElementById("pendingCount").textContent = orders.filter(o => o.status === "pending").length;
    renderOrders(orders);
  } catch (err) {
    document.getElementById("ordersView").innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

function renderOrders(orders) {
  const wrap = document.getElementById("ordersView");
  if (!orders.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="emoji">📭</div>No orders yet.</div>`;
    return;
  }
  wrap.innerHTML = orders.map(o => `
    <div class="order-card">
      <div class="head">
        <div>
          <h3>Order #${o.id} · ${escapeHtml(o.customer_name || "Customer")}</h3>
          <div class="meta">${escapeHtml(o.customer_phone || "")} · ${timeAgo(o.created_at)}</div>
        </div>
        <span class="status-badge status-${o.status}">${statusLabel(o.status)}</span>
      </div>
      <div class="items-list">
        ${o.items.map(i => `<div><span>${i.quantity} × ${escapeHtml(i.name)}</span><span>${money(i.price * i.quantity)}</span></div>`).join("")}
      </div>
      <p class="small muted" style="margin:6px 0;">📍 ${escapeHtml(o.delivery_address)}</p>
      ${o.notes ? `<p class="small muted" style="margin:0;">📝 ${escapeHtml(o.notes)}</p>` : ""}
      <div class="foot">
        <div class="total">${money(o.total_amount)}</div>
        <div class="actions">
          ${(NEXT_ACTION[o.status] || []).map(a => `<button class="btn ${a.cls} btn-sm" onclick="setStatus(${o.id}, '${a.status}')">${a.label}</button>`).join("")}
        </div>
      </div>
    </div>
  `).join("");
}

async function setStatus(orderId, status) {
  try {
    await api(`/api/restaurant/orders/${orderId}/status`, { method: "PUT", body: { status } });
    toast("Order updated", "success");
    loadOrders();
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ---------------- Init ---------------- */
loadRestaurant();
loadOrders();
setInterval(() => {
  if (document.getElementById("ordersView").style.display !== "none") loadOrders();
}, 8000);

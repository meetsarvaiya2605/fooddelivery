const user = requireRole("delivery");
document.getElementById("greeting").textContent = `Hey, ${user.name.split(" ")[0]} 🛵`;
document.getElementById("avatarInitials").textContent = initials(user.name);

let currentTab = "available";
let profile = null; // delivery verification profile

const VEHICLE_LABELS = { bike: "Motorbike", scooter: "Scooter", bicycle: "Bicycle", car: "Car" };

/* ---------------- Boot ---------------- */
async function boot() {
  try {
    profile = await api("/api/delivery/verification/me");
  } catch (err) {
    toast(err.message, "error");
    return;
  }
  renderVerifyBanner();

  if (profile.verification_status === "approved") {
    document.getElementById("mainTabs").style.display = "flex";
    document.getElementById("onlineToggleWrap").style.display = "flex";
    document.getElementById("onlineToggle").checked = profile.is_online;
    document.getElementById("onlineLabel").textContent = profile.is_online ? "Online" : "Offline";
    showTab("available");
  } else {
    showTab("kyc");
  }
}

function renderVerifyBanner() {
  const el = document.getElementById("verifyBanner");
  el.style.display = "block";
  const status = profile.verification_status;
  if (status === "approved") {
    el.style.display = "none";
    return;
  }
  const banners = {
    not_submitted: {
      cls: "info", icon: "🪪",
      text: "Complete your verification to start accepting deliveries. Submit your Aadhar card, PAN card, a selfie, and your driving licence & vehicle details under \"My Documents\".",
    },
    pending: {
      cls: "warning", icon: "⏳",
      text: "Your documents are submitted and awaiting review by our verification team. This usually takes a short while — check back soon.",
    },
    rejected: {
      cls: "danger", icon: "⚠️",
      text: `Your verification was rejected${profile.rejection_reason ? ": " + profile.rejection_reason : "."} Please review and resubmit your documents under "My Documents".`,
    },
  };
  const b = banners[status] || banners.not_submitted;
  el.innerHTML = `<div class="verify-banner verify-${b.cls}"><span class="emoji">${b.icon}</span><span>${escapeHtml(b.text)}</span></div>`;
}

/* ---------------- Tabs ---------------- */
function showTab(tab) {
  currentTab = tab;
  const isApproved = profile.verification_status === "approved";
  ["Available", "Active", "History", "Earnings", "Kyc"].forEach(t => {
    const btn = document.getElementById(`tab${t}`);
    if (btn) btn.classList.toggle("active", t.toLowerCase() === tab);
  });
  document.getElementById("availableView").style.display = tab === "available" ? "block" : "none";
  document.getElementById("activeView").style.display = tab === "active" ? "block" : "none";
  document.getElementById("historyView").style.display = tab === "history" ? "block" : "none";
  document.getElementById("earningsView").style.display = tab === "earnings" ? "block" : "none";
  document.getElementById("kycView").style.display = tab === "kyc" ? "block" : "none";

  if (tab === "kyc") renderKycView();
  if (tab === "earnings") loadEarnings();
  if (isApproved && ["available", "active", "history"].includes(tab)) refresh();
}

/* ---------------- Online toggle ---------------- */
async function toggleOnline() {
  const wantOnline = document.getElementById("onlineToggle").checked;
  try {
    profile = await api("/api/delivery/verification/online", { method: "PUT", body: { is_online: wantOnline } });
    document.getElementById("onlineLabel").textContent = profile.is_online ? "Online" : "Offline";
    toast(profile.is_online ? "You're online — looking for orders" : "You're offline", "success");
    if (currentTab === "available" || currentTab === "active") refresh();
  } catch (err) {
    document.getElementById("onlineToggle").checked = !wantOnline;
    toast(err.message, "error");
  }
}

/* ---------------- Orders ---------------- */
async function refresh() {
  if (profile.verification_status !== "approved") return;
  try {
    if (currentTab === "available") {
      if (!profile.is_online) {
        document.getElementById("availableView").innerHTML = `<div class="empty-state"><div class="emoji">💤</div>You're offline. Flip the switch above to start seeing orders.</div>`;
      } else {
        const orders = await api("/api/delivery/available");
        document.getElementById("availableCount").textContent = orders.length;
        renderAvailable(orders);
      }
    } else {
      const orders = await api("/api/delivery/my-deliveries");
      const active = orders.filter(o => !["delivered", "cancelled", "rejected"].includes(o.status));
      const past = orders.filter(o => ["delivered", "cancelled", "rejected"].includes(o.status));
      document.getElementById("activeCount").textContent = active.length;
      if (currentTab === "active") renderActive(active);
      if (currentTab === "history") renderHistory(past);
    }
    if (profile.is_online) {
      const avail = await api("/api/delivery/available");
      document.getElementById("availableCount").textContent = avail.length;
    }
  } catch (err) {
    toast(err.message, "error");
  }
}

function renderAvailable(orders) {
  const wrap = document.getElementById("availableView");
  if (!orders.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="emoji">📦</div>No orders ready for pickup right now.</div>`;
    return;
  }
  wrap.innerHTML = orders.map(o => `
    <div class="order-card">
      <div class="head">
        <div>
          <h3>${escapeHtml(o.restaurant_name || "Restaurant")} → ${escapeHtml(o.customer_name || "Customer")}</h3>
          <div class="meta">Order #${o.id} · ${timeAgo(o.created_at)} · ${o.distance_km.toFixed(1)} km</div>
        </div>
        <span class="status-badge status-${o.status}">${statusLabel(o.status)}</span>
      </div>
      <p class="small muted" style="margin:6px 0;">📍 Pickup: ${escapeHtml(o.restaurant_address || "Restaurant")}</p>
      <p class="small muted" style="margin:6px 0;">🏠 Deliver to: ${escapeHtml(o.delivery_address)}</p>
      <div class="items-list">
        ${o.items.map(i => `<div><span>${i.quantity} × ${escapeHtml(i.name)}</span></div>`).join("")}
      </div>
      <div class="foot">
        <div class="total">You earn: ${money(o.delivery_partner_payout)} <span class="muted small">(${o.distance_km.toFixed(1)} km × ₹8/km)</span></div>
        <div class="actions">
          <button class="btn btn-primary btn-sm" onclick="acceptOrder(${o.id})">Accept delivery</button>
        </div>
      </div>
    </div>
  `).join("");
}

const NEXT_ACTION = {
  ready: { label: "Mark picked up", status: "picked_up" },
  picked_up: { label: "Mark delivered", status: "delivered" },
};

function renderActive(orders) {
  const wrap = document.getElementById("activeView");
  if (!orders.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="emoji">🛵</div>No active deliveries. Check "Available Orders".</div>`;
    return;
  }
  wrap.innerHTML = orders.map(o => `
    <div class="order-card">
      <div class="head">
        <div>
          <h3>${escapeHtml(o.restaurant_name || "Restaurant")} → ${escapeHtml(o.customer_name || "Customer")}</h3>
          <div class="meta">Order #${o.id} · ${escapeHtml(o.customer_phone || "")} · ${o.distance_km.toFixed(1)} km</div>
        </div>
        <span class="status-badge status-${o.status}">${statusLabel(o.status)}</span>
      </div>
      <p class="small muted" style="margin:6px 0;">📍 ${escapeHtml(o.delivery_address)}</p>
      <p class="small muted" style="margin:0 0 6px;">${o.payment_method === "cod" ? "💵 Collect cash on delivery: " + money(o.total_amount) : "✅ Paid online"}</p>
      <div class="foot">
        <div class="total">Payout: ${money(o.delivery_partner_payout)}</div>
        <div class="actions">
          ${NEXT_ACTION[o.status] ? `<button class="btn btn-primary btn-sm" onclick="setStatus(${o.id}, '${NEXT_ACTION[o.status].status}')">${NEXT_ACTION[o.status].label}</button>` : ""}
        </div>
      </div>
    </div>
  `).join("");
}

function renderHistory(orders) {
  const wrap = document.getElementById("historyView");
  if (!orders.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="emoji">🗂️</div>No completed deliveries yet.</div>`;
    return;
  }
  wrap.innerHTML = orders.map(o => `
    <div class="order-card">
      <div class="head">
        <div>
          <h3>${escapeHtml(o.restaurant_name || "Restaurant")} → ${escapeHtml(o.customer_name || "Customer")}</h3>
          <div class="meta">Order #${o.id} · ${timeAgo(o.created_at)} · ${o.distance_km.toFixed(1)} km</div>
        </div>
        <span class="status-badge status-${o.status}">${statusLabel(o.status)}</span>
      </div>
      <div class="foot"><div class="total">${o.status === "delivered" ? "Earned: " + money(o.delivery_partner_payout) : money(o.total_amount)}</div></div>
    </div>
  `).join("");
}

async function acceptOrder(id) {
  try {
    await api(`/api/delivery/orders/${id}/accept`, { method: "PUT" });
    toast("Delivery accepted!", "success");
    showTab("active");
  } catch (err) {
    toast(err.message, "error");
    refresh();
  }
}

async function setStatus(id, status) {
  try {
    await api(`/api/delivery/orders/${id}/status`, { method: "PUT", body: { status } });
    toast(status === "delivered" ? "Delivered! Earnings updated." : "Status updated", "success");
    refresh();
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ---------------- Earnings ---------------- */
async function loadEarnings() {
  try {
    const p = await api("/api/delivery/earnings");
    profile = p;
    const wrap = document.getElementById("earningsView");
    wrap.innerHTML = `
      <div class="grid grid-3">
        <div class="card"><div class="muted small">Total earnings</div><div class="stat-big">${money(p.total_earnings)}</div></div>
        <div class="card"><div class="muted small">Deliveries completed</div><div class="stat-big">${p.total_deliveries}</div></div>
        <div class="card"><div class="muted small">Payout rate</div><div class="stat-big">₹8 <span class="small muted">/ km</span></div></div>
      </div>
      <p class="muted small mt-16">You're paid ₹8 per kilometre travelled (restaurant → delivery address) for every completed order, credited automatically once you mark it "delivered".</p>
    `;
  } catch (err) {
    document.getElementById("earningsView").innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

/* ---------------- KYC / Verification ---------------- */
function renderKycView() {
  const wrap = document.getElementById("kycView");
  const p = profile;
  const readOnly = p.verification_status === "pending";
  const approved = p.verification_status === "approved";

  if (approved) {
    wrap.innerHTML = `
      <div class="card">
        <div class="flex-between mb-16"><h2 style="margin:0;">Verified documents</h2><span class="status-badge status-delivered">Approved</span></div>
        <div class="kyc-grid">
          <div><div class="muted small">Aadhar number</div><div>${escapeHtml(maskId(p.aadhar_number))}</div></div>
          <div><div class="muted small">PAN number</div><div>${escapeHtml(p.pan_number)}</div></div>
          <div><div class="muted small">Driving licence</div><div>${escapeHtml(p.license_number)}</div></div>
          <div><div class="muted small">Vehicle</div><div>${escapeHtml(VEHICLE_LABELS[p.vehicle_type] || p.vehicle_type)} · ${escapeHtml(p.vehicle_number)}</div></div>
        </div>
      </div>
    `;
    return;
  }

  if (readOnly) {
    wrap.innerHTML = `
      <div class="card">
        <div class="flex-between mb-16"><h2 style="margin:0;">Documents submitted</h2><span class="status-badge status-pending">Under review</span></div>
        <div class="kyc-grid">
          <div><div class="muted small">Aadhar number</div><div>${escapeHtml(maskId(p.aadhar_number))}</div></div>
          <div><div class="muted small">PAN number</div><div>${escapeHtml(p.pan_number)}</div></div>
          <div><div class="muted small">Driving licence</div><div>${escapeHtml(p.license_number)}</div></div>
          <div><div class="muted small">Vehicle</div><div>${escapeHtml(VEHICLE_LABELS[p.vehicle_type] || p.vehicle_type)} · ${escapeHtml(p.vehicle_number)}</div></div>
        </div>
        <p class="muted small mt-16">Submitted ${p.submitted_at ? timeAgo(p.submitted_at) : ""}. We'll notify you once reviewed — check back here for updates.</p>
      </div>
    `;
    return;
  }

  // not_submitted or rejected -> show the submission form
  wrap.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0;">Delivery partner verification</h2>
      <p class="muted small">Upload clear photos of each document. This is required once before you can go online and accept deliveries.</p>

      <div class="form-group">
        <label>Aadhar card number</label>
        <input type="text" id="kAadharNumber" placeholder="XXXX XXXX XXXX" value="${escapeHtml(p.aadhar_number || "")}" />
      </div>
      <div class="form-group">
        <label>Aadhar card photo</label>
        <input type="file" id="kAadharImage" accept="image/*,.pdf" />
      </div>

      <div class="form-group">
        <label>PAN card number</label>
        <input type="text" id="kPanNumber" placeholder="ABCDE1234F" value="${escapeHtml(p.pan_number || "")}" />
      </div>
      <div class="form-group">
        <label>PAN card photo</label>
        <input type="file" id="kPanImage" accept="image/*,.pdf" />
      </div>

      <div class="form-group">
        <label>Selfie (clear face photo)</label>
        <input type="file" id="kSelfieImage" accept="image/*" />
      </div>

      <div class="form-group">
        <label>Driving licence number</label>
        <input type="text" id="kLicenseNumber" placeholder="DL-0420110012345" value="${escapeHtml(p.license_number || "")}" />
      </div>
      <div class="form-group">
        <label>Driving licence photo</label>
        <input type="file" id="kLicenseImage" accept="image/*,.pdf" />
      </div>

      <div class="section-title" style="margin-top:8px;">Vehicle details</div>
      <div class="form-group">
        <label>Vehicle type</label>
        <select id="kVehicleType">
          <option value="bike" ${p.vehicle_type === "bike" ? "selected" : ""}>Motorbike</option>
          <option value="scooter" ${p.vehicle_type === "scooter" ? "selected" : ""}>Scooter</option>
          <option value="bicycle" ${p.vehicle_type === "bicycle" ? "selected" : ""}>Bicycle</option>
          <option value="car" ${p.vehicle_type === "car" ? "selected" : ""}>Car</option>
        </select>
      </div>
      <div class="form-group">
        <label>Vehicle number plate</label>
        <input type="text" id="kVehicleNumber" placeholder="GJ06AB1234" value="${escapeHtml(p.vehicle_number || "")}" />
      </div>

      <div class="section-title">Bank details (for payouts)</div>
      <div class="form-group">
        <label>Account holder name</label>
        <input type="text" id="kBankHolder" placeholder="As per bank records" value="${escapeHtml(p.bank_account_holder || "")}" />
      </div>
      <div class="form-group">
        <label>Account number</label>
        <input type="text" id="kBankAccount" placeholder="Bank account number" value="${escapeHtml(p.bank_account_number || "")}" />
      </div>
      <div class="form-group">
        <label>IFSC code</label>
        <input type="text" id="kBankIfsc" placeholder="e.g. HDFC0001234" value="${escapeHtml(p.bank_ifsc || "")}" />
      </div>

      <button class="btn btn-primary btn-block" onclick="submitKyc()">Submit for verification</button>
    </div>
  `;
}

function maskId(v) {
  if (!v) return "";
  return v.length > 4 ? "•".repeat(Math.max(0, v.length - 4)) + v.slice(-4) : v;
}

async function submitKyc() {
  const aadharNumber = document.getElementById("kAadharNumber").value.trim();
  const panNumber = document.getElementById("kPanNumber").value.trim();
  const licenseNumber = document.getElementById("kLicenseNumber").value.trim();
  const vehicleType = document.getElementById("kVehicleType").value;
  const vehicleNumber = document.getElementById("kVehicleNumber").value.trim();
  const bankHolder = document.getElementById("kBankHolder").value.trim();
  const bankAccount = document.getElementById("kBankAccount").value.trim();
  const bankIfsc = document.getElementById("kBankIfsc").value.trim();

  const aadharImage = document.getElementById("kAadharImage").files[0];
  const panImage = document.getElementById("kPanImage").files[0];
  const selfieImage = document.getElementById("kSelfieImage").files[0];
  const licenseImage = document.getElementById("kLicenseImage").files[0];

  if (!aadharNumber || !panNumber || !licenseNumber || !vehicleNumber) {
    toast("Please fill in all document numbers and vehicle number", "error");
    return;
  }
  if (!aadharImage || !panImage || !selfieImage || !licenseImage) {
    toast("Please upload all four documents: Aadhar, PAN, selfie & driving licence", "error");
    return;
  }

  const fd = new FormData();
  fd.append("aadhar_number", aadharNumber);
  fd.append("pan_number", panNumber);
  fd.append("license_number", licenseNumber);
  fd.append("vehicle_type", vehicleType);
  fd.append("vehicle_number", vehicleNumber);
  fd.append("bank_account_holder", bankHolder);
  fd.append("bank_account_number", bankAccount);
  fd.append("bank_ifsc", bankIfsc);
  fd.append("aadhar_image", aadharImage);
  fd.append("pan_image", panImage);
  fd.append("selfie_image", selfieImage);
  fd.append("license_image", licenseImage);

  try {
    profile = await apiForm("/api/delivery/verification/submit", fd);
    toast("Documents submitted! We'll review them shortly.", "success");
    renderVerifyBanner();
    renderKycView();
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ---------------- Init ---------------- */
boot();
setInterval(() => {
  if (profile && profile.verification_status === "approved" && ["available", "active"].includes(currentTab)) refresh();
}, 8000);

const user = requireRole("admin");
document.getElementById("avatarInitials").textContent = initials(user.name);

const VEHICLE_LABELS = { bike: "Motorbike", scooter: "Scooter", bicycle: "Bicycle", car: "Car" };
const STATUS_BADGE = {
  pending: "status-pending", approved: "status-delivered",
  rejected: "status-cancelled", not_submitted: "status-cancelled",
};

function showTab(tab) {
  document.getElementById("tabPending").classList.toggle("active", tab === "pending");
  document.getElementById("tabAll").classList.toggle("active", tab === "all");
  document.getElementById("pendingView").style.display = tab === "pending" ? "block" : "none";
  document.getElementById("allView").style.display = tab === "all" ? "block" : "none";
  if (tab === "pending") loadPending();
  if (tab === "all") loadAll();
}

async function loadPending() {
  try {
    const list = await api("/api/admin/verification/pending");
    document.getElementById("pendingCount").textContent = list.length;
    renderList(document.getElementById("pendingView"), list, true);
  } catch (err) {
    document.getElementById("pendingView").innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

async function loadAll() {
  try {
    const list = await api("/api/admin/verification/all");
    renderList(document.getElementById("allView"), list, false);
  } catch (err) {
    document.getElementById("allView").innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

function renderList(wrap, list, showActions) {
  if (!list.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="emoji">🪪</div>Nothing here right now.</div>`;
    return;
  }
  wrap.innerHTML = list.map(p => `
    <div class="order-card">
      <div class="head">
        <div>
          <h3>Partner #${p.user_id}</h3>
          <div class="meta">Submitted ${p.submitted_at ? timeAgo(p.submitted_at) : "—"}</div>
        </div>
        <span class="status-badge ${STATUS_BADGE[p.verification_status] || ""}">${statusLabel(p.verification_status)}</span>
      </div>

      <div class="kyc-grid">
        <div><div class="muted small">Aadhar number</div><div>${escapeHtml(p.aadhar_number || "—")}</div></div>
        <div><div class="muted small">PAN number</div><div>${escapeHtml(p.pan_number || "—")}</div></div>
        <div><div class="muted small">Driving licence</div><div>${escapeHtml(p.license_number || "—")}</div></div>
        <div><div class="muted small">Vehicle</div><div>${escapeHtml(VEHICLE_LABELS[p.vehicle_type] || p.vehicle_type)} · ${escapeHtml(p.vehicle_number || "—")}</div></div>
      </div>

      <div class="doc-thumbs">
        ${docThumb("Aadhar", p.aadhar_image_url)}
        ${docThumb("PAN", p.pan_image_url)}
        ${docThumb("Selfie", p.selfie_image_url)}
        ${docThumb("Licence", p.license_image_url)}
      </div>

      ${p.rejection_reason ? `<p class="small" style="color:var(--danger); margin:10px 0 0;">Rejection reason: ${escapeHtml(p.rejection_reason)}</p>` : ""}

      ${showActions ? `
        <div class="foot">
          <div></div>
          <div class="actions">
            <button class="btn btn-danger btn-sm" onclick="reject(${p.id})">Reject</button>
            <button class="btn btn-primary btn-sm" onclick="approve(${p.id})">Approve</button>
          </div>
        </div>
      ` : ""}
    </div>
  `).join("");
}

function docThumb(label, url) {
  if (!url) return `<div class="doc-thumb empty">${escapeHtml(label)}<br/><span class="small muted">Not uploaded</span></div>`;
  const isPdf = url.toLowerCase().endsWith(".pdf");
  return `
    <a href="${url}" target="_blank" rel="noopener" class="doc-thumb">
      ${isPdf ? `<div class="pdf-icon">📄</div>` : `<img src="${url}" alt="${escapeHtml(label)}" />`}
      <span class="small">${escapeHtml(label)}</span>
    </a>
  `;
}

async function approve(profileId) {
  try {
    await api(`/api/admin/verification/${profileId}/review`, { method: "PUT", body: { approve: true } });
    toast("Partner approved", "success");
    loadPending();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function reject(profileId) {
  const reason = prompt("Reason for rejection (shown to the partner):", "Documents unclear, please resubmit");
  if (reason === null) return;
  try {
    await api(`/api/admin/verification/${profileId}/review`, { method: "PUT", body: { approve: false, rejection_reason: reason } });
    toast("Partner rejected", "success");
    loadPending();
  } catch (err) {
    toast(err.message, "error");
  }
}

showTab("pending");

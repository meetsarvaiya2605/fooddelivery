/* ---------------- Config ---------------- */
const API_BASE = ""; // same origin (FastAPI serves the frontend too)

/* ---------------- Auth storage ---------------- */
const Auth = {
  getToken() { return localStorage.getItem("fd_token"); },
  getUser() {
    const raw = localStorage.getItem("fd_user");
    return raw ? JSON.parse(raw) : null;
  },
  setSession(token, user) {
    localStorage.setItem("fd_token", token);
    localStorage.setItem("fd_user", JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem("fd_token");
    localStorage.removeItem("fd_user");
  },
  isLoggedIn() { return !!this.getToken(); },
};

/* Redirect helpers */
function roleHome(role) {
  if (role === "customer") return "/customer/index.html";
  if (role === "restaurant") return "/restaurant/index.html";
  if (role === "delivery") return "/delivery/index.html";
  if (role === "admin") return "/admin/index.html";
  return "/index.html";
}

function requireRole(role) {
  const user = Auth.getUser();
  if (!Auth.isLoggedIn() || !user || user.role !== role) {
    window.location.href = "/index.html";
  }
  return user;
}

function logout() {
  Auth.clear();
  window.location.href = "/index.html";
}

/* ---------------- API wrapper ---------------- */
async function api(path, { method = "GET", body = null, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && Auth.getToken()) {
    headers["Authorization"] = `Bearer ${Auth.getToken()}`;
  }
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error("Network error — is the backend server running?");
  }

  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    if (res.status === 401) {
      Auth.clear();
      window.location.href = "/index.html";
    }
    const detail = (data && data.detail) ? data.detail : `Request failed (${res.status})`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data;
}

/* ---------------- Multipart form upload wrapper (for KYC docs) ---------------- */
async function apiForm(path, formData) {
  const headers = {};
  if (Auth.getToken()) headers["Authorization"] = `Bearer ${Auth.getToken()}`;
  let res;
  try {
    res = await fetch(API_BASE + path, { method: "POST", headers, body: formData });
  } catch (err) {
    throw new Error("Network error — is the backend server running?");
  }
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    if (res.status === 401) {
      Auth.clear();
      window.location.href = "/index.html";
    }
    const detail = (data && data.detail) ? data.detail : `Request failed (${res.status})`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data;
}

/* ---------------- Geolocation helper ---------------- */
function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject(new Error(err.message || "Could not get your location")),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

/* ---------------- Toast ---------------- */
function ensureToastWrap() {
  let wrap = document.querySelector(".toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    document.body.appendChild(wrap);
  }
  return wrap;
}

function toast(message, type = "default") {
  const wrap = ensureToastWrap();
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

/* ---------------- Formatting helpers ---------------- */
function money(n) {
  return "₹" + Number(n).toFixed(2);
}

function timeAgo(dateStr) {
  const d = new Date(dateStr + (dateStr.endsWith("Z") ? "" : "Z"));
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function statusLabel(status) {
  return status.replace(/_/g, " ");
}

function initials(name) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

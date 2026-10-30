/**
 * DESIGN TO DEPLOY - FRONT END
 * All content lives in the database and is read/written through /api/* routes.
 * Admin authentication happens on the server (HttpOnly session cookie).
 */

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */
let appsData = [];
let updatesData = [];
let requestsData = [];
let requestCount = 0;
let isAdmin = false;
let activeCategoryFilter = "ALL";
let loadFailed = null; // error message if the first load failed

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */
async function api(path, body) {
  const opts = { credentials: "same-origin", cache: "no-store" };
  if (body !== undefined) {
    opts.method = "POST";
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new Error("Network error. Check your connection and try again.");
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

let toastTimer;
function showToast(message, icon = "fa-circle-check") {
  const toast = $("toast");
  toast.textContent = "";
  const i = document.createElement("i");
  i.className = `fa-solid ${icon}`;
  const span = document.createElement("span");
  span.textContent = message; // textContent: never interpreted as HTML
  toast.append(i, span);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
}

/** Handles an admin API failure; returns true if the session had expired. */
function handleAdminError(err) {
  if (err.status === 401) {
    setAdmin(false);
    $("cmsDrawer").classList.remove("active");
    showToast("Your admin session expired. Please sign in again.", "fa-lock");
    return true;
  }
  showToast(err.message, "fa-triangle-exclamation");
  return false;
}

function setAdmin(value) {
  isAdmin = value;
  $("adminBtnText").textContent = value ? "Admin Portal" : "Admin Access";
}

function formatDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/* ------------------------------------------------------------------ */
/* Loading data                                                        */
/* ------------------------------------------------------------------ */
async function loadData({ quiet = false } = {}) {
  try {
    const data = await api("/api/data");
    appsData = data.apps || [];
    updatesData = data.updates || [];
    requestCount = data.requestCount || 0;
    loadFailed = null;
    if (data.admin !== isAdmin) setAdmin(Boolean(data.admin));
    renderApp();
    if ($("cmsDrawer").classList.contains("active")) {
      renderCmsTable();
      renderCmsUpdatesList();
    }
  } catch (err) {
    if (!quiet || appsData.length === 0) {
      loadFailed = err.message;
      renderApp();
    }
  }
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */
function renderApp() {
  renderAnalytics();
  renderAppCards();
  renderUpdatesTimeline();
}

function renderAnalytics() {
  $("statTotalApps").textContent = appsData.length;
  const total = appsData.reduce((acc, a) => acc + (parseInt(a.counter, 10) || 0), 0);
  $("statTotalDownloads").textContent = total.toLocaleString();
  $("statTotalRequests").textContent = requestCount.toLocaleString();
}

function getCategoryIcon(cat) {
  switch (cat) {
    case "Mobile App":
      return "fa-solid fa-mobile-screen-button";
    case "Developer Tool":
      return "fa-solid fa-code";
    case "Security":
      return "fa-solid fa-shield-halved";
    default:
      return "fa-solid fa-gears";
  }
}

function renderAppCards() {
  const container = $("appCardsGrid");

  if (loadFailed && appsData.length === 0) {
    container.innerHTML = `
      <div class="state-message">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <p>${escapeHTML(loadFailed)}</p>
        <button class="retry-btn" id="retryLoadBtn">Try again</button>
      </div>`;
    return;
  }

  const keyword = $("searchInput").value.toLowerCase().trim();
  const filtered = appsData.filter((app) => {
    const matchesCategory = activeCategoryFilter === "ALL" || app.category === activeCategoryFilter;
    const haystack = `${app.title} ${app.description} ${app.category} ${app.version} ${app.badge}`.toLowerCase();
    return matchesCategory && haystack.includes(keyword);
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="state-message">
        <i class="fa-solid fa-box-open"></i>
        <p>${appsData.length === 0 ? "No applications published yet." : "No applications match your search."}</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered
    .map(
      (app) => `
    <div class="app-card">
      <div>
        <div class="app-card-header">
          <div class="app-icon-wrapper"><i class="${getCategoryIcon(app.category)}"></i></div>
          <div class="badge-group">
            <span class="version-badge">${escapeHTML(app.version)}</span>
            <span class="status-badge">${escapeHTML(app.badge)}</span>
          </div>
        </div>
        <h3 class="app-title">${escapeHTML(app.title)}</h3>
        <p class="app-description">${escapeHTML(app.description)}</p>
      </div>
      <div class="app-card-footer">
        <div class="user-counter-badge">
          <i class="fa-solid fa-users"></i>
          <strong id="counter-val-${escapeHTML(app.id)}">${(parseInt(app.counter, 10) || 0).toLocaleString()}</strong> Users
        </div>
        <button class="app-download-btn" data-app-id="${escapeHTML(app.id)}">
          <i class="fa-solid fa-download"></i> Download / Launch
        </button>
      </div>
    </div>`
    )
    .join("");
}

function renderUpdatesTimeline() {
  const container = $("updatesTimeline");
  if (updatesData.length === 0) {
    container.innerHTML = `<p class="empty-note">No updates posted yet.</p>`;
    return;
  }
  container.innerHTML = updatesData
    .map(
      (upd) => `
    <div class="update-item">
      <div class="update-item-header">
        <span class="update-title">${escapeHTML(upd.title)}</span>
        <span class="update-tag ${getTagClass(upd.status)}">${escapeHTML(upd.status)}</span>
      </div>
      <p class="update-desc">${escapeHTML(upd.details)}</p>
    </div>`
    )
    .join("");
}

function getTagClass(status) {
  if (status === "In Progress") return "tag-progress";
  if (status === "Planned") return "tag-planned";
  return "tag-done";
}

/* ------------------------------------------------------------------ */
/* Downloads                                                           */
/* ------------------------------------------------------------------ */
async function handleDownload(appId, button) {
  const app = appsData.find((a) => a.id === appId);
  if (!app) return;

  // Open the link immediately (inside the click) so popup blockers allow it.
  const url = app.downloadUrl;
  if (url && url !== "#") window.open(url, "_blank", "noopener");
  else showToast("This app's download link isn't set up yet.", "fa-circle-info");

  button.disabled = true;
  try {
    const result = await api("/api/download", { id: appId });
    app.counter = result.counter;
    const el = $(`counter-val-${appId}`);
    if (el) {
      el.textContent = result.counter.toLocaleString();
      if (result.counted) {
        el.classList.add("animate-pop");
        setTimeout(() => el.classList.remove("animate-pop"), 400);
      }
    }
    renderAnalytics();
    if (url && url !== "#") showToast(`Opening ${app.title}...`, "fa-cloud-arrow-down");
  } catch (err) {
    showToast(err.message, "fa-triangle-exclamation");
  } finally {
    button.disabled = false;
  }
}

/* ------------------------------------------------------------------ */
/* Admin CMS rendering                                                 */
/* ------------------------------------------------------------------ */
function openCmsDrawer() {
  renderCmsTable();
  renderCmsUpdatesList();
  loadRequests();
  $("cmsDrawer").classList.add("active");
}

function renderCmsTable() {
  $("cmsAppsTableBody").innerHTML = appsData.length
    ? appsData
        .map(
          (app) => `
    <tr>
      <td><strong>${escapeHTML(app.title)}</strong></td>
      <td>${escapeHTML(app.category)}</td>
      <td><code>${escapeHTML(app.version)}</code></td>
      <td><strong>${(parseInt(app.counter, 10) || 0).toLocaleString()}</strong></td>
      <td>
        <div class="cms-action-btns">
          <button class="icon-btn" data-action="edit-app" data-id="${escapeHTML(app.id)}" title="Edit app" aria-label="Edit ${escapeHTML(app.title)}"><i class="fa-solid fa-pen-to-square"></i></button>
          <button class="icon-btn delete" data-action="delete-app" data-id="${escapeHTML(app.id)}" title="Delete app" aria-label="Delete ${escapeHTML(app.title)}"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </td>
    </tr>`
        )
        .join("")
    : `<tr><td colspan="5" class="empty-note">No apps yet. Use "Add New App" to publish one.</td></tr>`;
}

function renderCmsUpdatesList() {
  const statuses = ["In Progress", "Planned", "Completed"];
  const container = $("cmsUpdatesList");
  if (updatesData.length === 0) {
    container.innerHTML = `<p class="empty-note">No updates yet.</p>`;
    return;
  }
  container.innerHTML = updatesData
    .map(
      (upd) => `
    <div class="cms-update-item">
      <div>
        <strong>${escapeHTML(upd.title)}</strong>
        <p style="font-size:0.8rem; color:var(--text-muted);">${escapeHTML(upd.details)}</p>
      </div>
      <div class="cms-item-actions">
        <select class="inline-select" data-action="update-status" data-id="${escapeHTML(upd.id)}" aria-label="Status">
          ${statuses.map((s) => `<option value="${s}"${s === upd.status ? " selected" : ""}>${s}</option>`).join("")}
        </select>
        <button class="icon-btn delete" data-action="delete-update" data-id="${escapeHTML(upd.id)}" title="Delete update" aria-label="Delete update"><i class="fa-solid fa-trash-can"></i></button>
      </div>
    </div>`
    )
    .join("");
}

async function loadRequests() {
  const container = $("cmsRequestsList");
  try {
    const data = await api("/api/admin", { action: "listRequests" });
    requestsData = data.requests || [];
    renderCmsRequests();
  } catch (err) {
    if (!handleAdminError(err)) container.innerHTML = `<p class="empty-note">Couldn't load requests.</p>`;
  }
}

function renderCmsRequests() {
  const container = $("cmsRequestsList");
  if (requestsData.length === 0) {
    container.innerHTML = `<p class="empty-note">No requests yet.</p>`;
    return;
  }
  container.innerHTML = requestsData
    .map(
      (r) => `
    <div class="cms-update-item">
      <div>
        <strong>${escapeHTML(r.title)}</strong><span class="cms-request-tag">${escapeHTML(r.category)}</span>
        <p style="font-size:0.85rem; color:var(--text-muted); white-space:pre-wrap;">${escapeHTML(r.description)}</p>
        <div class="cms-request-meta">${r.contact ? `From: ${escapeHTML(r.contact)} &middot; ` : ""}${escapeHTML(formatDate(r.createdAt))}</div>
      </div>
      <div class="cms-item-actions">
        <button class="icon-btn delete" data-action="delete-request" data-id="${escapeHTML(r.id)}" title="Delete request" aria-label="Delete request"><i class="fa-solid fa-trash-can"></i></button>
      </div>
    </div>`
    )
    .join("");
}

function resetAppForm() {
  $("cmsAppForm").reset();
  $("editAppId").value = "";
  $("appFormHeading").textContent = "Publish New Application";
  $("saveAppBtn").innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save &amp; Deploy Application`;
  $("cancelEditAppBtn").style.display = "none";
}

function startEditApp(id) {
  const app = appsData.find((a) => a.id === id);
  if (!app) return;
  $("editAppId").value = app.id;
  $("appTitle").value = app.title;
  $("appCategory").value = app.category;
  $("appVersion").value = app.version;
  $("appBadge").value = app.badge;
  $("appDownloadUrl").value = app.downloadUrl;
  $("appDescription").value = app.description;
  $("appCounter").value = app.counter;
  $("appFormHeading").textContent = "Edit Application Details";
  $("saveAppBtn").innerHTML = `<i class="fa-solid fa-check"></i> Update Application`;
  $("cancelEditAppBtn").style.display = "inline-block";
  document.querySelectorAll(".cms-tabs .tab-btn")[1].click();
}

/* ------------------------------------------------------------------ */
/* Event wiring                                                        */
/* ------------------------------------------------------------------ */
function openModal(el, focusId) {
  el.classList.add("active");
  if (focusId) setTimeout(() => $(focusId).focus(), 50);
}

function setupEventListeners() {
  const requestModal = $("requestModal");
  const authModal = $("authModal");
  const cmsDrawer = $("cmsDrawer");

  // Search + category filters
  $("searchInput").addEventListener("input", renderAppCards);
  $("categoryPills").addEventListener("click", (e) => {
    const btn = e.target.closest(".pill-btn");
    if (!btn) return;
    document.querySelectorAll(".pill-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeCategoryFilter = btn.dataset.category;
    renderAppCards();
  });

  // App grid: download buttons + retry (event delegation, no inline handlers)
  $("appCardsGrid").addEventListener("click", (e) => {
    const dl = e.target.closest(".app-download-btn");
    if (dl) return handleDownload(dl.dataset.appId, dl);
    if (e.target.closest("#retryLoadBtn")) loadData();
  });

  // Request modal
  $("openRequestBtn").onclick = () => openModal(requestModal, "reqTitle");
  $("footerRequestLink").onclick = (e) => {
    e.preventDefault();
    openModal(requestModal, "reqTitle");
  };
  $("closeRequestModal").onclick = () => requestModal.classList.remove("active");

  // Admin entry points
  const openAdmin = (e) => {
    if (e) e.preventDefault();
    if (isAdmin) openCmsDrawer();
    else openModal(authModal, "masterKeyInput");
  };
  $("openAdminAuthBtn").onclick = openAdmin;
  $("footerAdminLink").onclick = openAdmin;
  $("closeAuthModal").onclick = () => authModal.classList.remove("active");
  $("closeCmsDrawer").onclick = () => cmsDrawer.classList.remove("active");

  // Click outside a small modal to close it; Escape closes whatever is open
  [requestModal, authModal].forEach((m) =>
    m.addEventListener("mousedown", (e) => {
      if (e.target === m) m.classList.remove("active");
    })
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelectorAll(".modal-overlay.active").forEach((m) => m.classList.remove("active"));
  });

  // Password visibility
  $("togglePwdBtn").onclick = () => {
    const input = $("masterKeyInput");
    const icon = $("togglePwdBtn").querySelector("i");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    icon.className = show ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
  };

  // Visitor request form
  $("requestForm").onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const result = await api("/api/request", {
        title: $("reqTitle").value,
        category: $("reqCategory").value,
        description: $("reqDescription").value,
        contact: $("reqContact").value,
        website: $("reqWebsite").value,
      });
      if (typeof result.requestCount === "number") {
        requestCount = result.requestCount;
        renderAnalytics();
      }
      requestModal.classList.remove("active");
      e.target.reset();
      showToast("Application recommendation submitted! Thank you.", "fa-paper-plane");
    } catch (err) {
      showToast(err.message, "fa-triangle-exclamation");
    } finally {
      btn.disabled = false;
    }
  };

  // Admin sign-in
  $("authForm").onsubmit = async (e) => {
    e.preventDefault();
    const errorEl = $("authErrorMsg");
    errorEl.style.display = "none";
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      await api("/api/auth", { action: "login", password: $("masterKeyInput").value });
      setAdmin(true);
      authModal.classList.remove("active");
      $("masterKeyInput").value = "";
      showToast("Signed in as admin.", "fa-lock-open");
      openCmsDrawer();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = "block";
    } finally {
      btn.disabled = false;
    }
  };

  // Admin sign-out
  $("cmsLogoutBtn").onclick = async () => {
    try {
      await api("/api/auth", { action: "logout" });
    } catch {
      /* cookie will expire on its own */
    }
    setAdmin(false);
    cmsDrawer.classList.remove("active");
    showToast("Admin session locked.", "fa-lock");
  };

  // CMS tabs
  document.querySelectorAll(".cms-tabs .tab-btn").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll(".cms-tabs .tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((tc) => tc.classList.remove("active"));
      btn.classList.add("active");
      $(btn.dataset.tab).classList.add("active");
      if (btn.dataset.tab === "tabRequests") loadRequests();
    };
  });

  // CMS: delegated clicks for edit / delete buttons
  cmsDrawer.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || btn.tagName === "SELECT") return;
    const { action, id } = btn.dataset;
    try {
      if (action === "edit-app") return startEditApp(id);
      if (action === "delete-app") {
        const app = appsData.find((a) => a.id === id);
        if (!confirm(`Delete "${app ? app.title : "this app"}"? This cannot be undone.`)) return;
        await api("/api/admin", { action: "deleteApp", id });
        showToast("Application deleted.");
        await loadData();
      }
      if (action === "delete-update") {
        await api("/api/admin", { action: "deleteUpdate", id });
        showToast("Update deleted.");
        await loadData();
      }
      if (action === "delete-request") {
        await api("/api/admin", { action: "deleteRequest", id });
        showToast("Request deleted.");
        await loadRequests();
      }
    } catch (err) {
      handleAdminError(err);
    }
  });

  // CMS: inline status change on roadmap updates
  cmsDrawer.addEventListener("change", async (e) => {
    const sel = e.target.closest('select[data-action="update-status"]');
    if (!sel) return;
    try {
      await api("/api/admin", { action: "setUpdateStatus", id: sel.dataset.id, status: sel.value });
      showToast("Status updated.");
      await loadData();
    } catch (err) {
      handleAdminError(err);
      await loadData();
    }
  });

  // CMS: add / edit app
  $("cmsAppForm").onsubmit = async (e) => {
    e.preventDefault();
    const editing = $("editAppId").value;
    const btn = $("saveAppBtn");
    btn.disabled = true;
    try {
      await api("/api/admin", {
        action: "saveApp",
        id: editing || undefined,
        title: $("appTitle").value,
        category: $("appCategory").value,
        version: $("appVersion").value,
        badge: $("appBadge").value,
        downloadUrl: $("appDownloadUrl").value,
        description: $("appDescription").value,
        counter: $("appCounter").value,
      });
      showToast(editing ? "Application details updated!" : "New application published!");
      resetAppForm();
      await loadData();
      document.querySelectorAll(".cms-tabs .tab-btn")[0].click();
    } catch (err) {
      handleAdminError(err);
    } finally {
      btn.disabled = false;
    }
  };
  $("cancelEditAppBtn").onclick = resetAppForm;

  // CMS: post roadmap update
  $("cmsUpdateForm").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      await api("/api/admin", {
        action: "saveUpdate",
        title: $("updTitle").value,
        status: $("updStatus").value,
        details: $("updDetails").value,
      });
      form.reset();
      showToast("Roadmap update posted!");
      await loadData();
    } catch (err) {
      handleAdminError(err);
    }
  };

  // CMS: change password
  $("changeKeyForm").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const next = $("newMasterKey").value;
    if (next !== $("confirmMasterKey").value) {
      showToast("New passwords do not match.", "fa-triangle-exclamation");
      return;
    }
    try {
      await api("/api/admin", { action: "changePassword", current: $("currentMasterKey").value, next });
      form.reset();
      showToast("Password updated.", "fa-key");
    } catch (err) {
      handleAdminError(err);
    }
  };
}

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  loadData();
  // Keep counters / content fresh without a page reload.
  setInterval(() => {
    if (!document.hidden && !document.querySelector(".modal-overlay.active")) loadData({ quiet: true });
  }, 60000);
});

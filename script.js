/**
 * DESIGN TO DEPLOY - APPLICATION ENGINE & CLIENT-SIDE CRYPTOGRAPHY
 */

// INITIAL STATE DATA
const DEFAULT_APPS = [
  {
    id: "app-1",
    title: "Emergency Distress Beacon",
    category: "Mobile App",
    version: "v1.4.2",
    badge: "Stable Release",
    description: "Real-time WebSocket emergency signaling application featuring offline GPS tracking, Capacitor native integration, and emergency alerts.",
    downloadUrl: "#",
    counter: 1280
  },
  {
    id: "app-2",
    title: "Mobile POS & Inventory Suite",
    category: "Mobile App",
    version: "v2.1.0",
    badge: "New Release",
    description: "Android POS software built with Java, camera barcode scanning, offline SQL cart management, and PDF receipt generator.",
    downloadUrl: "#",
    counter: 945
  },
  {
    id: "app-3",
    title: "AI Co-Pilot Desktop Utility",
    category: "Developer Tool",
    version: "v1.0.5-beta",
    badge: "Beta",
    description: "Local desktop co-pilot application featuring local LLM integration, real-time screen overlays, and WebSocket audio streaming.",
    downloadUrl: "#",
    counter: 610
  },
  {
    id: "app-4",
    title: "UAP Web Conference Platform",
    category: "Utility Tool",
    version: "v3.0.0",
    badge: "Featured",
    description: "Full-stack event management & video web application with LiveKit, Zoom SDK, and PostgreSQL integration.",
    downloadUrl: "#",
    counter: 2150
  }
];

const DEFAULT_UPDATES = [
  {
    id: "upd-1",
    title: "Android SDK 34 Migration & Camera Scanner Speedup",
    status: "In Progress",
    details: "Updating Mobile POS core dependencies to Target SDK 34 for enhanced barcode scanning speed and memory efficiency."
  },
  {
    id: "upd-2",
    title: "Offline Mesh Messaging for Emergency Beacon",
    status: "Planned",
    details: "Exploring Bluetooth LE advertisement mesh protocol for distress beacons when cellular/Wi-Fi connection is unavailable."
  }
];

// DEFAULT MASTER KEY: "admin123" HASHED WITH SHA-256
// SHA-256("admin123") = "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9"
const DEFAULT_KEY_HASH = "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";

// LOCAL STORAGE STATE KEYS
const STORAGE_KEYS = {
  APPS: "dtd_apps_data_v2",
  UPDATES: "dtd_updates_data_v2",
  REQUESTS: "dtd_requests_count",
  KEY_HASH: "dtd_master_key_hash"
};

// STATE VARIABLES
let appsData = [];
let updatesData = [];
let requestCount = 0;
let masterKeyHash = "";
let isAuthenticated = false;
let failedAuthAttempts = 0;
let authLockoutUntil = 0;
let activeCategoryFilter = "ALL";

// UTILITY: SHA-256 HASH GENERATOR (Web Crypto API)
async function hashSHA256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// UTILITY: TOAST NOTIFICATIONS
function showToast(message, icon = "fa-circle-check") {
  const toast = document.getElementById("toast");
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

// INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
  loadStoredData();
  setupEventListeners();
  renderApp();
});

// LOAD STORED DATA
function loadStoredData() {
  const storedApps = localStorage.getItem(STORAGE_KEYS.APPS);
  appsData = storedApps ? JSON.parse(storedApps) : DEFAULT_APPS;

  const storedUpdates = localStorage.getItem(STORAGE_KEYS.UPDATES);
  updatesData = storedUpdates ? JSON.parse(storedUpdates) : DEFAULT_UPDATES;

  const storedRequests = localStorage.getItem(STORAGE_KEYS.REQUESTS);
  requestCount = storedRequests ? parseInt(storedRequests, 10) : 14;

  const storedHash = localStorage.getItem(STORAGE_KEYS.KEY_HASH);
  masterKeyHash = storedHash ? storedHash : DEFAULT_KEY_HASH;
}

// SAVE STATE TO LOCAL STORAGE
function saveData() {
  localStorage.setItem(STORAGE_KEYS.APPS, JSON.stringify(appsData));
  localStorage.setItem(STORAGE_KEYS.UPDATES, JSON.stringify(updatesData));
  localStorage.setItem(STORAGE_KEYS.REQUESTS, requestCount.toString());
  localStorage.setItem(STORAGE_KEYS.KEY_HASH, masterKeyHash);
}

// RENDER ALL PAGE ELEMENTS
function renderApp() {
  renderAnalytics();
  renderAppCards();
  renderUpdatesTimeline();
}

// RENDER HERO ANALYTICS COUNTERS
function renderAnalytics() {
  document.getElementById("statTotalApps").textContent = appsData.length;
  
  const totalDownloads = appsData.reduce((acc, item) => acc + (parseInt(item.counter, 10) || 0), 0);
  document.getElementById("statTotalDownloads").textContent = totalDownloads.toLocaleString();
  
  document.getElementById("statTotalRequests").textContent = requestCount.toLocaleString();
}

// RENDER APPLICATION CARDS
function renderAppCards() {
  const container = document.getElementById("appCardsGrid");
  const searchKeyword = document.getElementById("searchInput").value.toLowerCase().trim();

  const filtered = appsData.filter(app => {
    const matchesCategory = activeCategoryFilter === "ALL" || app.category === activeCategoryFilter;
    const matchesSearch = app.title.toLowerCase().includes(searchKeyword) || 
                          app.description.toLowerCase().includes(searchKeyword) ||
                          app.category.toLowerCase().includes(searchKeyword);
    return matchesCategory && matchesSearch;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--text-muted);">
        <i class="fa-solid fa-box-open" style="font-size:2.5rem; margin-bottom:12px; color:var(--text-dim);"></i>
        <p>No applications match your query.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(app => `
    <div class="app-card">
      <div>
        <div class="app-card-header">
          <div class="app-icon-wrapper">
            <i class="${getCategoryIcon(app.category)}"></i>
          </div>
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
          <strong id="counter-val-${app.id}">${parseInt(app.counter, 10).toLocaleString()}</strong> Users
        </div>
        <button class="app-download-btn" onclick="handleDownload('${app.id}', '${escapeHTML(app.downloadUrl)}')">
          <i class="fa-solid fa-download"></i> Download / Launch
        </button>
      </div>
    </div>
  `).join("");
}

// GET ICON BY CATEGORY
function getCategoryIcon(cat) {
  switch (cat) {
    case "Mobile App": return "fa-solid fa-mobile-screen-button";
    case "Developer Tool": return "fa-solid fa-code";
    case "Security": return "fa-solid fa-shield-cat";
    default: return "fa-solid fa-gears";
  }
}

// HANDLE DOWNLOAD & ATOMIC COUNTER INCREMENT
function handleDownload(appId, url) {
  const app = appsData.find(a => a.id === appId);
  if (app) {
    app.counter = (parseInt(app.counter, 10) || 0) + 1;
    saveData();
    
    // Animate local counter element
    const counterEl = document.getElementById(`counter-val-${appId}`);
    if (counterEl) {
      counterEl.textContent = app.counter.toLocaleString();
      counterEl.classList.add("animate-pop");
      setTimeout(() => counterEl.classList.remove("animate-pop"), 400);
    }
    
    renderAnalytics();
    showToast(`Downloading ${app.title}... Counter updated!`, "fa-cloud-arrow-down");

    // Execute download or link open if valid URL exists
    if (url && url !== "#") {
      window.open(url, '_blank');
    }
  }
}

// RENDER UPDATES TIMELINE
function renderUpdatesTimeline() {
  const container = document.getElementById("updatesTimeline");
  if (updatesData.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted); font-size:0.9rem;">No updates posted yet.</p>`;
    return;
  }

  container.innerHTML = updatesData.map(upd => `
    <div class="update-item">
      <div class="update-item-header">
        <span class="update-title">${escapeHTML(upd.title)}</span>
        <span class="update-tag ${getTagClass(upd.status)}">${escapeHTML(upd.status)}</span>
      </div>
      <p class="update-desc">${escapeHTML(upd.details)}</p>
    </div>
  `).join("");
}

function getTagClass(status) {
  if (status === "In Progress") return "tag-progress";
  if (status === "Planned") return "tag-planned";
  return "tag-done";
}

// SETUP EVENT LISTENERS
function setupEventListeners() {
  // SEARCH INPUT
  document.getElementById("searchInput").addEventListener("input", renderAppCards);

  // CATEGORY PILLS
  document.getElementById("categoryPills").addEventListener("click", (e) => {
    if (e.target.classList.contains("pill-btn")) {
      document.querySelectorAll(".pill-btn").forEach(btn => btn.classList.remove("active"));
      e.target.classList.add("active");
      activeCategoryFilter = e.target.dataset.category;
      renderAppCards();
    }
  });

  // MODAL TOGGLES
  const requestModal = document.getElementById("requestModal");
  const authModal = document.getElementById("authModal");
  const cmsDrawer = document.getElementById("cmsDrawer");

  document.getElementById("openRequestBtn").onclick = () => requestModal.classList.add("active");
  document.getElementById("footerRequestLink").onclick = (e) => {
    e.preventDefault();
    requestModal.classList.add("active");
  };
  document.getElementById("closeRequestModal").onclick = () => requestModal.classList.remove("active");

  document.getElementById("openAdminAuthBtn").onclick = () => {
    if (isAuthenticated) {
      openCmsDrawer();
    } else {
      authModal.classList.add("active");
    }
  };

  document.getElementById("footerAdminLink").onclick = (e) => {
    e.preventDefault();
    if (isAuthenticated) {
      openCmsDrawer();
    } else {
      authModal.classList.add("active");
    }
  };

  document.getElementById("closeAuthModal").onclick = () => authModal.classList.remove("active");
  document.getElementById("closeCmsDrawer").onclick = () => cmsDrawer.classList.remove("active");

  // PASSWORD VISIBILITY TOGGLE
  document.getElementById("togglePwdBtn").onclick = () => {
    const input = document.getElementById("masterKeyInput");
    const icon = document.getElementById("togglePwdBtn").querySelector("i");
    if (input.type === "password") {
      input.type = "text";
      icon.className = "fa-solid fa-eye-slash";
    } else {
      input.type = "password";
      icon.className = "fa-solid fa-eye";
    }
  };

  // REQUEST FORM SUBMIT
  document.getElementById("requestForm").onsubmit = (e) => {
    e.preventDefault();
    requestCount++;
    saveData();
    renderAnalytics();
    requestModal.classList.remove("active");
    e.target.reset();
    showToast("Application recommendation submitted! Thank you.", "fa-paper-plane");
  };

  // MASTER KEY AUTH FORM SUBMIT
  document.getElementById("authForm").onsubmit = async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("authErrorMsg");
    errorEl.style.display = "none";

    // Lockout Check
    if (Date.now() < authLockoutUntil) {
      const secondsLeft = Math.ceil((authLockoutUntil - Date.now()) / 1000);
      errorEl.textContent = `Too many failed attempts. Locked out for ${secondsLeft}s.`;
      errorEl.style.display = "block";
      return;
    }

    const inputKey = document.getElementById("masterKeyInput").value.trim();
    const computedHash = await hashSHA256(inputKey);

    if (computedHash === masterKeyHash) {
      isAuthenticated = true;
      failedAuthAttempts = 0;
      document.getElementById("adminBtnText").textContent = "Admin Portal";
      authModal.classList.remove("active");
      document.getElementById("masterKeyInput").value = "";
      showToast("Master Key Authenticated!", "fa-shield-check");
      openCmsDrawer();
    } else {
      failedAuthAttempts++;
      if (failedAuthAttempts >= 3) {
        authLockoutUntil = Date.now() + 30000; // 30s lockout
        errorEl.textContent = "3 Failed attempts! Locked out for 30 seconds.";
      } else {
        errorEl.textContent = `Invalid Master Key! (${3 - failedAuthAttempts} attempts remaining)`;
      }
      errorEl.style.display = "block";
    }
  };

  // CMS LOGOUT
  document.getElementById("cmsLogoutBtn").onclick = () => {
    isAuthenticated = false;
    document.getElementById("adminBtnText").textContent = "Admin Access";
    cmsDrawer.classList.remove("active");
    showToast("Admin session locked.", "fa-lock");
  };

  // CMS TAB SWITCHING
  document.querySelectorAll(".cms-tabs .tab-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".cms-tabs .tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(tc => tc.classList.remove("active"));
      
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    };
  });

  // CMS APP FORM (ADD / EDIT)
  document.getElementById("cmsAppForm").onsubmit = (e) => {
    e.preventDefault();
    const editId = document.getElementById("editAppId").value;
    const title = document.getElementById("appTitle").value.trim();
    const category = document.getElementById("appCategory").value;
    const version = document.getElementById("appVersion").value.trim();
    const badge = document.getElementById("appBadge").value.trim();
    const downloadUrl = document.getElementById("appDownloadUrl").value.trim();
    const description = document.getElementById("appDescription").value.trim();
    const counter = parseInt(document.getElementById("appCounter").value, 10) || 0;

    if (editId) {
      // Edit mode
      const index = appsData.findIndex(a => a.id === editId);
      if (index !== -1) {
        appsData[index] = { ...appsData[index], title, category, version, badge, downloadUrl, description, counter };
        showToast("Application details updated!");
      }
    } else {
      // Add mode
      const newApp = {
        id: "app-" + Date.now(),
        title, category, version, badge, downloadUrl, description, counter
      };
      appsData.unshift(newApp);
      showToast("New application published!");
    }

    saveData();
    renderApp();
    renderCmsTable();
    resetAppForm();
  };

  document.getElementById("cancelEditAppBtn").onclick = resetAppForm;

  // CMS UPDATE FORM
  document.getElementById("cmsUpdateForm").onsubmit = (e) => {
    e.preventDefault();
    const title = document.getElementById("updTitle").value.trim();
    const status = document.getElementById("updStatus").value;
    const details = document.getElementById("updDetails").value.trim();

    const newUpd = { id: "upd-" + Date.now(), title, status, details };
    updatesData.unshift(newUpd);
    saveData();
    renderApp();
    renderCmsUpdatesList();
    e.target.reset();
    showToast("Roadmap update posted!");
  };

  // CHANGE MASTER KEY FORM
  document.getElementById("changeKeyForm").onsubmit = async (e) => {
    e.preventDefault();
    const newKey = document.getElementById("newMasterKey").value.trim();
    const confirmKey = document.getElementById("confirmMasterKey").value.trim();

    if (newKey !== confirmKey) {
      alert("New Master Keys do not match!");
      return;
    }

    masterKeyHash = await hashSHA256(newKey);
    saveData();
    e.target.reset();
    showToast("Master Key hash updated successfully!", "fa-key");
  };
}

// OPEN CMS DRAWER & POPULATE TABLES
function openCmsDrawer() {
  renderCmsTable();
  renderCmsUpdatesList();
  document.getElementById("cmsDrawer").classList.add("active");
}

// RENDER CMS APP MANAGEMENT TABLE
function renderCmsTable() {
  const tbody = document.getElementById("cmsAppsTableBody");
  tbody.innerHTML = appsData.map(app => `
    <tr>
      <td><strong>${escapeHTML(app.title)}</strong></td>
      <td>${escapeHTML(app.category)}</td>
      <td><code>${escapeHTML(app.version)}</code></td>
      <td><strong>${parseInt(app.counter, 10).toLocaleString()}</strong></td>
      <td>
        <div class="cms-action-btns">
          <button class="icon-btn" onclick="editApp('${app.id}')" title="Edit App"><i class="fa-solid fa-pen-to-square"></i></button>
          <button class="icon-btn delete" onclick="deleteApp('${app.id}')" title="Delete App"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </td>
    </tr>
  `).join("");
}

// EDIT APP PRE-FILL
window.editApp = function(id) {
  const app = appsData.find(a => a.id === id);
  if (!app) return;

  document.getElementById("editAppId").value = app.id;
  document.getElementById("appTitle").value = app.title;
  document.getElementById("appCategory").value = app.category;
  document.getElementById("appVersion").value = app.version;
  document.getElementById("appBadge").value = app.badge;
  document.getElementById("appDownloadUrl").value = app.downloadUrl;
  document.getElementById("appDescription").value = app.description;
  document.getElementById("appCounter").value = app.counter;

  document.getElementById("appFormHeading").textContent = "Edit Application Details";
  document.getElementById("saveAppBtn").innerHTML = `<i class="fa-solid fa-check"></i> Update Application`;
  document.getElementById("cancelEditAppBtn").style.display = "inline-block";

  // Switch to Add/Edit tab
  document.querySelectorAll(".cms-tabs .tab-btn")[1].click();
};

// DELETE APP
window.deleteApp = function(id) {
  if (confirm("Are you sure you want to remove this application?")) {
    appsData = appsData.filter(a => a.id !== id);
    saveData();
    renderApp();
    renderCmsTable();
    showToast("Application deleted.");
  }
};

// RESET APP FORM
function resetAppForm() {
  document.getElementById("cmsAppForm").reset();
  document.getElementById("editAppId").value = "";
  document.getElementById("appFormHeading").textContent = "Publish New Application";
  document.getElementById("saveAppBtn").innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save & Deploy Application`;
  document.getElementById("cancelEditAppBtn").style.display = "none";
}

// RENDER CMS UPDATES LIST
function renderCmsUpdatesList() {
  const container = document.getElementById("cmsUpdatesList");
  container.innerHTML = updatesData.map(upd => `
    <div class="cms-update-item">
      <div>
        <strong>${escapeHTML(upd.title)}</strong>
        <p style="font-size:0.8rem; color:var(--text-muted);">${escapeHTML(upd.details)}</p>
      </div>
      <button class="icon-btn delete" onclick="deleteUpdate('${upd.id}')"><i class="fa-solid fa-trash-can"></i></button>
    </div>
  `).join("");
}

// DELETE UPDATE
window.deleteUpdate = function(id) {
  updatesData = updatesData.filter(u => u.id !== id);
  saveData();
  renderApp();
  renderCmsUpdatesList();
  showToast("Update item deleted.");
};

// SANITIZE HTML TO PREVENT XSS
function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Shared server helpers for all /api routes.
 * Database: Upstash Redis (free via the Vercel Marketplace).
 */
const crypto = require("crypto");

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */
const CATEGORIES = ["Mobile App", "Utility Tool", "Developer Tool", "Security"];
const REQUEST_CATEGORIES = [...CATEGORIES, "Other"];
const STATUSES = ["In Progress", "Planned", "Completed"];

const KEYS = {
  apps: "dtd:apps",
  updates: "dtd:updates",
  requests: "dtd:requests",
  requestTotal: "dtd:requests:total",
  downloads: "dtd:downloads", // hash: appId -> number of downloads counted so far
  password: "dtd:admin:pw", // scrypt hash, set when admin changes password in the UI
};

const SESSION_COOKIE = "dtd_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours
const MAX_STORED_REQUESTS = 200;

/* Starter content, written to the database the first time the site loads.
   `counter` here is the starting number; real downloads are added on top. */
const DEFAULT_APPS = [
  {
    id: "app-1",
    title: "Emergency Distress Beacon",
    category: "Mobile App",
    version: "v1.4.2",
    badge: "Stable Release",
    description:
      "Real-time WebSocket emergency signaling application featuring offline GPS tracking, Capacitor native integration, and emergency alerts.",
    downloadUrl: "#",
    counter: 0,
  },
  {
    id: "app-2",
    title: "Mobile POS & Inventory Suite",
    category: "Mobile App",
    version: "v2.1.0",
    badge: "New Release",
    description:
      "Android POS software built with Java, camera barcode scanning, offline SQL cart management, and PDF receipt generator.",
    downloadUrl: "#",
    counter: 0,
  },
  {
    id: "app-3",
    title: "AI Co-Pilot Desktop Utility",
    category: "Developer Tool",
    version: "v1.0.5-beta",
    badge: "Beta",
    description:
      "Local desktop co-pilot application featuring local LLM integration, real-time screen overlays, and WebSocket audio streaming.",
    downloadUrl: "#",
    counter: 0,
  },
  {
    id: "app-4",
    title: "UAP Web Conference Platform",
    category: "Utility Tool",
    version: "v3.0.0",
    badge: "Featured",
    description:
      "Full-stack event management & video web application with LiveKit, Zoom SDK, and PostgreSQL integration.",
    downloadUrl: "#",
    counter: 0,
  },
];

const DEFAULT_UPDATES = [
  {
    id: "upd-1",
    title: "Android SDK 34 Migration & Camera Scanner Speedup",
    status: "In Progress",
    details:
      "Updating Mobile POS core dependencies to Target SDK 34 for enhanced barcode scanning speed and memory efficiency.",
  },
  {
    id: "upd-2",
    title: "Offline Mesh Messaging for Emergency Beacon",
    status: "Planned",
    details:
      "Exploring Bluetooth LE advertisement mesh protocol for distress beacons when cellular/Wi-Fi connection is unavailable.",
  },
];

/* ------------------------------------------------------------------ */
/* Database                                                            */
/* ------------------------------------------------------------------ */
let _db;
function getDb() {
  if (_db) return _db;
  // Vercel's Upstash integration injects KV_REST_API_*; a manual setup uses UPSTASH_REDIS_REST_*.
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (url && token) {
    const { Redis } = require("@upstash/redis");
    _db = new Redis({ url, token });
  } else if (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development") {
    // Local development only: in-memory store so you can try the site with no setup.
    // Never used on a deployed site (data would vanish between requests).
    console.warn("[dtd] No database env vars found - using temporary in-memory store (dev only).");
    _db = require("./memory-db");
  } else {
    throw httpError(503, "Database not connected. Add an Upstash Redis store to this Vercel project.");
  }
  return _db;
}

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */
function httpError(status, message, extra) {
  const err = new Error(message);
  err.status = status;
  err.extra = extra;
  return err;
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === "string") {
    try {
      return JSON.parse(b);
    } catch {
      throw httpError(400, "Invalid JSON body.");
    }
  }
  return typeof b === "object" ? b : {};
}

/** Wraps a route: enforces method, JSON content-type on POST, and turns thrown errors into JSON. */
function route(methods, fn) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) {
        res.setHeader("Allow", methods.join(", "));
        throw httpError(405, "Method not allowed.");
      }
      if (req.method === "POST") {
        // Requiring JSON forces a CORS preflight for cross-site requests (basic CSRF defence).
        const ct = String(req.headers["content-type"] || "");
        if (!ct.toLowerCase().includes("application/json")) {
          throw httpError(415, "Content-Type must be application/json.");
        }
      }
      await fn(req, res);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error("[dtd] API error:", err);
      send(res, status, { error: status >= 500 && !err.status ? "Server error." : err.message, ...(err.extra || {}) });
    }
  };
}

function clientKey(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = fwd || req.headers["x-real-ip"] || (req.socket && req.socket.remoteAddress) || "unknown";
  // Hash so raw IP addresses are never stored in the database.
  return crypto.createHash("sha256").update(String(ip)).digest("hex").slice(0, 16);
}

async function rateLimit(db, bucket, limit, windowSeconds) {
  const key = `dtd:rl:${bucket}`;
  const n = await db.incr(key);
  if (n === 1) await db.expire(key, windowSeconds);
  return { allowed: n <= limit, count: n };
}

/* ------------------------------------------------------------------ */
/* Passwords & sessions                                                */
/* ------------------------------------------------------------------ */
function sha256(s) {
  return crypto.createHash("sha256").update(s).digest();
}

function safeEqual(a, b) {
  // Compare fixed-length digests so length differences don't leak through timing.
  return crypto.timingSafeEqual(sha256(String(a)), sha256(String(b)));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyScrypt(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const known = Buffer.from(hash, "hex");
  return test.length === known.length && crypto.timingSafeEqual(test, known);
}

async function verifyPassword(db, password) {
  const stored = await db.get(KEYS.password);
  if (stored) return verifyScrypt(password, stored);
  const envPw = process.env.ADMIN_PASSWORD;
  if (!envPw) throw httpError(500, "ADMIN_PASSWORD is not set on the server.");
  return safeEqual(password, envPw);
}

function sessionSecret() {
  const s = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!s) throw httpError(500, "Set ADMIN_PASSWORD (and ideally SESSION_SECRET) in Vercel environment variables.");
  return s;
}

/** Changes whenever the stored password changes, which invalidates older sessions. */
async function passwordVersion(db) {
  const stored = await db.get(KEYS.password);
  return crypto.createHash("sha256").update(String(stored || "env")).digest("hex").slice(0, 16);
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || "")
    .split(";")
    .forEach((part) => {
      const i = part.indexOf("=");
      if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    });
  return out;
}

function isHttps(req) {
  return String(req.headers["x-forwarded-proto"] || "").split(",")[0] === "https";
}

async function setSessionCookie(req, res, db) {
  const token = sign({ exp: Date.now() + SESSION_TTL_SECONDS * 1000, v: await passwordVersion(db) });
  const flags = ["Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${SESSION_TTL_SECONDS}`];
  if (isHttps(req)) flags.push("Secure");
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; ${flags.join("; ")}`);
}

function clearSessionCookie(req, res) {
  const flags = ["Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
  if (isHttps(req)) flags.push("Secure");
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; ${flags.join("; ")}`);
}

async function isAdmin(req, db) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  let secret;
  try {
    secret = sessionSecret();
  } catch {
    return false;
  }
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const { exp, v } = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!exp || Date.now() > exp) return false;
    return v === (await passwordVersion(db));
  } catch {
    return false;
  }
}

async function requireAdmin(req, db) {
  if (!(await isAdmin(req, db))) throw httpError(401, "Not signed in as admin.");
}

/* ------------------------------------------------------------------ */
/* Data access                                                         */
/* ------------------------------------------------------------------ */
async function loadApps(db) {
  let apps = await db.get(KEYS.apps);
  if (!Array.isArray(apps)) {
    // First run: seed starter content. NX avoids clobbering if two requests race.
    await db.set(KEYS.apps, DEFAULT_APPS, { nx: true });
    apps = (await db.get(KEYS.apps)) || DEFAULT_APPS;
  }
  return apps;
}

async function loadUpdates(db) {
  let updates = await db.get(KEYS.updates);
  if (!Array.isArray(updates)) {
    await db.set(KEYS.updates, DEFAULT_UPDATES, { nx: true });
    updates = (await db.get(KEYS.updates)) || DEFAULT_UPDATES;
  }
  return updates;
}

async function loadDownloadCounts(db) {
  const h = (await db.hgetall(KEYS.downloads)) || {};
  const out = {};
  for (const k of Object.keys(h)) out[k] = Number(h[k]) || 0;
  return out;
}

/** Apps with the live total (starting number + counted downloads). */
async function appsWithTotals(db) {
  const [apps, counts] = await Promise.all([loadApps(db), loadDownloadCounts(db)]);
  return apps.map((a) => ({ ...a, counter: Math.max(0, (Number(a.counter) || 0) + (counts[a.id] || 0)) }));
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */
function text(value, { min = 0, max, label }) {
  const s = typeof value === "string" ? value.trim() : "";
  if (s.length < min) throw httpError(400, `${label} is required${min > 1 ? ` (at least ${min} characters)` : ""}.`);
  if (s.length > max) throw httpError(400, `${label} is too long (max ${max} characters).`);
  return s;
}

function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw httpError(400, `${label} is not valid.`);
  return value;
}

/** Allows http(s) links, site-relative paths (e.g. /files/app.apk) and "#" placeholders. */
function downloadUrl(value) {
  const s = text(value, { min: 1, max: 2000, label: "Download URL" });
  if (s === "#") return s;
  if (/^https?:\/\/[^\s]+$/i.test(s)) return s;
  if (/^\/(?!\/)[^\s]*$/.test(s)) return s;
  throw httpError(400, "Download URL must start with https://, http:// or / (for files hosted on your own site).");
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`;
}

module.exports = {
  CATEGORIES,
  REQUEST_CATEGORIES,
  STATUSES,
  KEYS,
  MAX_STORED_REQUESTS,
  getDb,
  httpError,
  send,
  readBody,
  route,
  clientKey,
  rateLimit,
  hashPassword,
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
  isAdmin,
  requireAdmin,
  loadApps,
  loadUpdates,
  loadDownloadCounts,
  appsWithTotals,
  text,
  oneOf,
  downloadUrl,
  newId,
};

// POST /api/request  -> a visitor suggests a new app.
const S = require("../lib/shared");

module.exports = S.route(["POST"], async (req, res) => {
  const db = S.getDb();
  const body = S.readBody(req);

  // Honeypot: real people never fill the hidden "website" field. Pretend success, store nothing.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return S.send(res, 200, { ok: true });
  }

  const rl = await S.rateLimit(db, `req:${S.clientKey(req)}`, 5, 3600);
  if (!rl.allowed) throw S.httpError(429, "Too many requests. Please try again in a while.");

  const entry = {
    id: S.newId("req"),
    title: S.text(body.title, { min: 3, max: 120, label: "App name" }),
    category: S.oneOf(body.category, S.REQUEST_CATEGORIES, "Category"),
    description: S.text(body.description, { min: 10, max: 1500, label: "Description" }),
    contact: S.text(body.contact || "", { max: 120, label: "Contact" }),
    createdAt: new Date().toISOString(),
  };

  const list = (await db.get(S.KEYS.requests)) || [];
  list.unshift(entry);
  await db.set(S.KEYS.requests, list.slice(0, S.MAX_STORED_REQUESTS));
  const total = await db.incr(S.KEYS.requestTotal);

  S.send(res, 200, { ok: true, requestCount: total });
});

// POST /api/auth {action:"login", password} | {action:"logout"}
const S = require("../lib/shared");

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60;

module.exports = S.route(["POST"], async (req, res) => {
  const { action, password } = S.readBody(req);

  if (action === "logout") {
    S.clearSessionCookie(req, res);
    return S.send(res, 200, { ok: true });
  }
  if (action !== "login") throw S.httpError(400, "Unknown action.");

  const db = S.getDb();
  const bucket = `login:${S.clientKey(req)}`;
  const used = Number(await db.get(`dtd:rl:${bucket}`)) || 0;
  if (used >= MAX_ATTEMPTS) {
    throw S.httpError(429, "Too many failed attempts. Try again in 15 minutes.");
  }

  const ok = typeof password === "string" && password.length > 0 && password.length < 500 && (await S.verifyPassword(db, password));
  if (!ok) {
    const rl = await S.rateLimit(db, bucket, MAX_ATTEMPTS, WINDOW_SECONDS);
    const left = Math.max(0, MAX_ATTEMPTS - rl.count);
    throw S.httpError(401, left > 0 ? `Incorrect password. ${left} attempt${left === 1 ? "" : "s"} remaining.` : "Too many failed attempts. Try again in 15 minutes.");
  }

  await db.del(`dtd:rl:${bucket}`);
  await S.setSessionCookie(req, res, db);
  S.send(res, 200, { ok: true });
});

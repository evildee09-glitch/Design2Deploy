// POST /api/download {id}  -> counts a download (max once per visitor per app per hour).
const S = require("../lib/shared");

module.exports = S.route(["POST"], async (req, res) => {
  const db = S.getDb();
  const id = S.text(S.readBody(req).id, { min: 1, max: 80, label: "App id" });

  const apps = await S.loadApps(db);
  const app = apps.find((a) => a.id === id);
  if (!app) throw S.httpError(404, "App not found.");

  const who = S.clientKey(req);
  const first = await db.set(`dtd:dl:${who}:${id}`, 1, { nx: true, ex: 3600 });
  let inc;
  if (first) {
    inc = await db.hincrby(S.KEYS.downloads, id, 1);
  } else {
    inc = Number((await S.loadDownloadCounts(db))[id]) || 0;
  }
  S.send(res, 200, { counted: Boolean(first), counter: Math.max(0, (Number(app.counter) || 0) + inc) });
});

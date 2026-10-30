// GET /api/data  -> everything the public page needs, plus whether the visitor is signed in as admin.
const S = require("../lib/shared");

module.exports = S.route(["GET"], async (req, res) => {
  const db = S.getDb();
  const [apps, updates, requestTotal, admin] = await Promise.all([
    S.appsWithTotals(db),
    S.loadUpdates(db),
    db.get(S.KEYS.requestTotal),
    S.isAdmin(req, db),
  ]);
  S.send(res, 200, { apps, updates, requestCount: Number(requestTotal) || 0, admin });
});

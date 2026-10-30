// POST /api/admin {action, ...}  -> all content management. Every action requires a valid admin session.
const S = require("../lib/shared");

module.exports = S.route(["POST"], async (req, res) => {
  const db = S.getDb();
  await S.requireAdmin(req, db);
  const body = S.readBody(req);

  switch (body.action) {
    case "saveApp": {
      const fields = {
        title: S.text(body.title, { min: 2, max: 100, label: "Application name" }),
        category: S.oneOf(body.category, S.CATEGORIES, "Category"),
        version: S.text(body.version, { min: 1, max: 30, label: "Version" }),
        badge: S.text(body.badge, { min: 1, max: 30, label: "Status badge" }),
        downloadUrl: S.downloadUrl(body.downloadUrl),
        description: S.text(body.description, { min: 5, max: 600, label: "Description" }),
      };
      const wanted = Math.max(0, Math.floor(Number(body.counter) || 0)); // total the admin wants displayed
      const apps = await S.loadApps(db);
      const counts = await S.loadDownloadCounts(db);

      if (body.id) {
        const i = apps.findIndex((a) => a.id === body.id);
        if (i === -1) throw S.httpError(404, "App not found.");
        // Stored starting number = wanted total minus downloads already counted.
        apps[i] = { ...apps[i], ...fields, counter: wanted - (counts[body.id] || 0) };
      } else {
        apps.unshift({ id: S.newId("app"), ...fields, counter: wanted });
      }
      if (apps.length > 100) throw S.httpError(400, "Too many apps (max 100).");
      await db.set(S.KEYS.apps, apps);
      return S.send(res, 200, { ok: true });
    }

    case "deleteApp": {
      const apps = await S.loadApps(db);
      await db.set(S.KEYS.apps, apps.filter((a) => a.id !== body.id));
      await db.hdel(S.KEYS.downloads, String(body.id));
      return S.send(res, 200, { ok: true });
    }

    case "saveUpdate": {
      const entry = {
        id: S.newId("upd"),
        title: S.text(body.title, { min: 2, max: 140, label: "Update title" }),
        status: S.oneOf(body.status, S.STATUSES, "Status"),
        details: S.text(body.details, { min: 5, max: 800, label: "Details" }),
      };
      const updates = await S.loadUpdates(db);
      updates.unshift(entry);
      await db.set(S.KEYS.updates, updates.slice(0, 50));
      return S.send(res, 200, { ok: true });
    }

    case "setUpdateStatus": {
      const status = S.oneOf(body.status, S.STATUSES, "Status");
      const updates = await S.loadUpdates(db);
      const u = updates.find((x) => x.id === body.id);
      if (!u) throw S.httpError(404, "Update not found.");
      u.status = status;
      await db.set(S.KEYS.updates, updates);
      return S.send(res, 200, { ok: true });
    }

    case "deleteUpdate": {
      const updates = await S.loadUpdates(db);
      await db.set(S.KEYS.updates, updates.filter((u) => u.id !== body.id));
      return S.send(res, 200, { ok: true });
    }

    case "listRequests": {
      return S.send(res, 200, { requests: (await db.get(S.KEYS.requests)) || [] });
    }

    case "deleteRequest": {
      const list = (await db.get(S.KEYS.requests)) || [];
      await db.set(S.KEYS.requests, list.filter((r) => r.id !== body.id));
      return S.send(res, 200, { ok: true });
    }

    case "changePassword": {
      const { current, next } = body;
      if (typeof current !== "string" || !(await S.verifyPassword(db, current))) {
        throw S.httpError(403, "Current password is incorrect.");
      }
      if (typeof next !== "string" || next.length < 8) throw S.httpError(400, "New password must be at least 8 characters.");
      if (next.length > 200) throw S.httpError(400, "New password is too long.");
      await db.set(S.KEYS.password, S.hashPassword(next));
      await S.setSessionCookie(req, res, db); // keep this browser signed in; all other sessions are invalidated
      return S.send(res, 200, { ok: true });
    }

    default:
      throw S.httpError(400, "Unknown action.");
  }
});

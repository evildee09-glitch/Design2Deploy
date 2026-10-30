# Design to Deploy

Static site (`public/`) + serverless API (`api/`) + Upstash Redis database. Edit content from the Admin Portal on the live site.

## Deploy on Vercel
1. Push this folder to a GitHub repo and import it in Vercel (Framework Preset: **Other**, leave build settings empty).
2. **Database:** Project -> Storage -> Marketplace -> **Upstash Redis** (free plan) -> connect to this project. It adds `KV_REST_API_URL` / `KV_REST_API_TOKEN` automatically.
3. **Settings -> Environment Variables**, add:
   - `ADMIN_PASSWORD` - your admin login password
   - `SESSION_SECRET` - any long random string (e.g. run `openssl rand -hex 32`)
4. Redeploy. Click **Admin Access** on the site and sign in.

First load seeds the 4 sample apps and 2 roadmap items; edit or delete them in the portal.

## Notes
- After you change the password inside the portal, it is stored (hashed) in the database and overrides `ADMIN_PASSWORD`. Forgot it? Delete the key `dtd:admin:pw` in the Upstash console, then `ADMIN_PASSWORD` works again.
- Host app files yourself by putting them in `public/files/` and using `/files/yourapp.apk` as the download URL (Vercel limit: 100 MB per file on the free plan; use GitHub Releases or similar for bigger ones).
- Local dev: `npm i -g vercel && npm i && vercel dev`. Without database variables it uses a temporary in-memory store.

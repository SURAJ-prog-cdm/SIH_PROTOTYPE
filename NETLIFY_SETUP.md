# Shared application ledger setup

Netlify deploys the existing `index.html` from the repository root and bundles `netlify/functions/applications.mjs` as `/.netlify/functions/applications`. The function uses Netlify Blobs so application records are shared and persist across function invocations.

After Netlify finishes deploying these files:

1. In the Netlify site connected to `SURAJ-prog-cdm/SIH_PROTOTYPE`, confirm the base directory is the repository root and publish directory is `.` (or leave the publish directory controlled by this repository's `netlify.toml`).
2. Set a strong, private `SETUGOV_ADMIN_KEY` environment variable in the Netlify site's environment-variable settings, then trigger another deploy so the function receives it.
3. Open the Admin POV and enter that same key when prompted. It is kept in the current browser tab's session storage.
4. Check `/.netlify/functions/applications` is no longer a Netlify HTML 404. Without the admin key, a JSON 401 or 503 is expected for GET; a JSON response confirms the function route is deployed.

Citizen submissions are stored in the shared ledger. Applications previously stored only in browser `localStorage` are not automatically migrated. This is a demo, not a production identity or access-management system; use mock applicant data only.

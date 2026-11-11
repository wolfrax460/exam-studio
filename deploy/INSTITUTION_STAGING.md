# Institution entry staging

Build the client and run the browser suite with MongoDB available on local port 27017. The suite starts the real API on a random loopback port, creates a disposable test database, enables institution entry, and sets up synthetic accounts with distinct reviewer and institution roles. It tests the feature-disabled state in the same run and removes its database when it exits.

```sh
npm --prefix server ci
npm --prefix client ci
npm --prefix client run build
npm --prefix client exec -- playwright install chromium
npm --prefix client run test:institution-entry
```

Set `EXAM_STUDIO_SCREENSHOTS` to an absolute directory to retain screenshots. Set `EXAM_STUDIO_BROWSER_CHANNEL=chrome` to use a local Chrome installation. CI runs the same suite with its own MongoDB service and Chromium.

The people-management scenario checks the dashboard with real enrollment, staff profiles, an existing member account linked to a student record, and a teacher's assigned roster. Its browser context uses local fallback fonts so it can run offline. Student and staff records are disposable fixtures.

For hosted staging, use a separate API and database behind your staging access controls. Serve the built client and API from the staging origin. Enable `EXAM_STUDIO_INSTITUTIONS_ENABLED=true` and set `EXAM_STUDIO_SUPERADMIN_IDS` to dedicated reviewer account IDs in the staging database. Verify the dependencies and permission checks on that environment before public rollout.

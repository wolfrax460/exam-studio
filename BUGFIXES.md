# Bug-fix report

A full pass over the project: what was broken, what was fixed, and how each fix is verified.

The project had two half-merged generations of code: an older file-storage + access-code app, and a
newer accounts + multi-provider app. Files from both were present, but the wiring between them was
missing, so several features were unreachable or crashed on use.

Everything below was reproduced first, then fixed, then covered by a test.

## Verification

```
npm test                                  # 81 server tests + 15 client tests, all passing
npm --prefix client run build             # production bundle builds
npm --prefix server run live-check        # 24 checks against the running app: all passing
```

`live-check` talks to a server that is already running, over HTTP, exactly as the browser does —
including a real multipart upload. It registers one throwaway account and deletes it again when the
database is reachable.

The suite covers the file-store fallback as well as MongoDB, drives the real MCP server over stdio,
points the AI engine at a stub OpenAI-compatible server (tool calls, plain text, fenced JSON,
servers that reject tools, cut-off output, non-JSON replies), and checks that a damaged data file is
kept rather than overwritten.

---

## Round 2: reported from the running app

| # | Reported | Cause | Fix |
| --- | --- | --- | --- |
| 1 | "Claude Code (terminal)" → **"Something went wrong on the server."** | `C:\Users\mugis\.local\bin\claude.exe` is a 158-byte batch script renamed to `.exe`. Windows refuses to start it, and the spawn failed with a raw `UNKNOWN` that had no handler — so an environment problem surfaced as a server fault. The working launcher (`claude.cmd`) was never tried, because the old code only retried on `ENOENT`/`EINVAL`. | The launcher now resolves every shim on `PATH` with `where`/`which`, starts `.cmd`/`.bat` through the shell and real programs directly, and falls through to the next one when a start fails. If none works it says "installed but could not be started" and names the cause. Verified live: Claude Code answered "OK". |
| 2 | Ollama Cloud → "is busy or over its limit" with no explanation | The 429 was real, but the message discarded what the provider actually said. | Provider errors now include the provider's own explanation (trimmed), e.g. "you have reached your hourly limit for this model", plus the suggestion to wait or switch provider. |
| 3 | Uploaded a Backend Application Development PDF and got an unrelated 35-mark exam | `DEMO_MODE=1`: every generator returns the built-in sample from `lib/demo.js` and never calls the AI. The sample is 35 marks, which also produced a bogus-looking "marks add up to 35, not 100" warning. | Demo results are marked `demo: true`; the app shows a banner explaining that demo mode is on and how to turn it off, labels the sample result, and no longer shows the un-actionable mark warnings for it. |

Note on `.env`: the file had `DEMO_MODE` twice, and dotenv keeps the **last** value, so the app was
really in demo mode even though the first line said `0`. It is now set once.

---

## Found by an adversarial review of this pass

A separate review agent re-tested the finished code and found five more real defects, all fixed and
now covered by tests:

| # | Bug | Effect | Fix |
| --- | --- | --- | --- |
| 1 | `examFrom` validated the question *array* but not its entries | `POST /api/export/exam-docx` with `"questions": [null]` threw `TypeError` in the Word writer and answered **500** | Every entry must be a plain object, else 400 |
| 2 | `engine.js` called `response.json()` outside any guard | A provider or gateway answering `2xx` with an HTML page turned into a **500** (and echoed the body) instead of a clean 502 | The body is read and parsed explicitly; a non-JSON reply is a 502 with a safe message, and the detail goes to the log |
| 3 | `PUT /api/settings` used `typeof profile === 'object'` | `"profile": []` passed and **silently wiped** that provider's saved model, address and key | A profile that is not a plain object is a 400 |
| 4 | Settings and store files were replaced when unreadable | A truncated `settings.json` or `store.json` was read as empty and then **overwritten**, destroying it | An unparseable file is kept as `<file>.corrupt` with a warning, and the server carries on with empty state |
| 5 | `profile[k] || undefined` when clearing a field | Clearing Model or Address did not take effect; the stale value kept winning over the provider default | An empty string now removes the key |

Three more were reported as lower severity and also addressed: `/api/health` no longer discloses the
absolute data-file path to callers that are not on this computer; the number of sequential provider
calls for very long notes is capped (`MAX_PARTS`) instead of growing with the input; and `s()` no
longer stringifies arrays and objects, so a title of `{}` can no longer be stored as
`[object Object]`.

Two further review notes were accepted as design, not defects: `POST /api/settings/test` and
`GET /api/settings/models` are available to any signed-in user (bounded by their own rate limit) so a
remote user can diagnose the AI their own generations use; and signing out drops the browser's copy of
the token but does not revoke it server-side, so a token copied beforehand stays valid until it expires.

---

## Critical: signing in and creating an account

| # | Bug | Effect | Fix |
| --- | --- | --- | --- |
| 1 | `client/src/App.jsx` called `register(...)` but never imported it from `./auth.js` | **Creating an account always failed** with a `ReferenceError` | Import `register` (`App.jsx`) |
| 2 | The error banner was rendered inside `{user && (...)}` | Every sign-in/registration error was **invisible**; the button simply "did nothing" | Errors render on the auth screen too |
| 3 | The auth fields were not in a `<form>` | Enter did nothing, and `required` / `type=email` / `minLength` were never enforced | Real `<form onSubmit>` with validation and a live password-rule checklist |
| 4 | `handleLogout` existed but no button called it | **No way to sign out** | Sign out in the header, which also clears the notes and results from the screen |
| 5 | On start the app trusted `localStorage` blindly | An expired token showed a working-looking app where every action failed | `currentUser()` validates the session against `/api/auth/me`; expiry is also checked locally |
| 6 | A 401 during use logged out state but left a broken shell | Confusing dead end | `api.js` clears the session and raises `exam-studio:signed-out`; the app returns to sign-in with a message |
| 7 | No limit on sign-in or registration | Password guessing at full speed | `LOGIN_LIMIT_PER_15_MIN` (30 failed per 15 min) and `REGISTER_LIMIT_PER_HOUR` (10) |
| 8 | `JWT_SECRET` fell back to a hard-coded public string | Anyone could forge a token for any account | Real secret required; a random one is generated and stored (mode 0600) in development; the server refuses to start with a placeholder secret in production |
| 9 | `JWT_EXPIRES_IN` was documented but ignored | Sessions always lasted 7 days | Honoured |
| 10 | Non-string input (`{"name": 1}`) reached `.trim()` / `bcrypt.hash` | **500** instead of a 400 | Every field is type- and length-checked |
| 11 | Two simultaneous registrations could both pass the "already exists" check | Duplicate accounts (file store) or a 500 (MongoDB unique index) | Re-checked at write time; duplicate-key errors map to 409 |
| 12 | A malformed token or missing account produced vague messages | Hard to diagnose | Specific 401 messages; storage failures are 503, not "invalid login" |
| 13 | Password length was unbounded | bcrypt silently ignores anything past 72 bytes | Capped at 72, with the limit explained in the UI |
| 14 | `/api/health` had dead code claiming to report the signed-in user | — | Now uses optional auth and reports the user, provider, storage backend and version |

## Critical: file upload was broken

`authenticatedFetch` set `Content-Type: application/json` on **every** request. A browser cannot add the
multipart boundary when a Content-Type is already set, so `/api/extract` never saw a file and answered
"Choose a file to upload." FormData requests now leave the header unset. Covered by a client test and by
a real multipart upload in the end-to-end run.

## Critical: the AI Settings screen did not exist, and would not have worked

- `client/src/Settings.jsx` and `client/src/Agents.jsx` were **never rendered** and `/api/settings*`
  did not exist on the server. The whole multi-provider feature was unreachable.
- `client/src/api.js` had no `put`, which `Settings.jsx` imports — opening it would have crashed.
- `server/lib/ai.js` ignored `providers.js` and `settings.js` completely: only Anthropic and DeepSeek
  were supported, and changing provider, model, address or key would have had **no effect**.

Fixed by adding `server/lib/engine.js` (one structured-output call across the Anthropic, OpenAI-compatible
and terminal-tool protocols), a `providerCatalog()` for the Settings screen, the `/api/settings`,
`/api/settings/test`, `/api/settings/models` and `/api/agents/info` routes, and by wiring the two dialogs
into the header. Changing provider now takes effect on the next generation, without a restart.

Generation is verified end-to-end against a stub OpenAI-compatible server: tool-call replies, plain-text
replies, fenced JSON, servers that reject tools, and cut-off output.

## Critical: the desktop app and the MCP server could not run

- `electron/main.js` imported `{ start }` from `server/index.js`, but **nothing was exported** — the
  desktop app always showed "Exam Studio could not start".
- The desktop shell pointed `DATA_FILE` at its own folder, but the server had moved to MongoDB and
  ignored it, so a machine without MongoDB could not create an account at all.
- `server/mcp.js` imported `TYPE_HELP` (not exported), `pdfkit`, `zod` and `@modelcontextprotocol/sdk`
  (not in `package.json`, not installed), and called `listItems()`/`saveItem()` without the `userId`
  the storage layer now requires. The agent integration was dead on arrival.
- The MCP server printed storage messages on **stdout**, which carries the JSON-RPC protocol — a single
  stray line breaks the connection.

Fixed: `start(port, host)` is exported and only auto-listens when the file is the entry point; storage
falls back to a local JSON file when MongoDB is unreachable; the missing dependencies are declared;
owner resolution lets the agent tools work without a signed-in user; and all diagnostics go to stderr.
Verified by a test that drives the real MCP server over stdio and asserts that nothing but JSON-RPC
reaches stdout.

## Other bugs fixed

- **Malformed library ids returned 500** (Mongoose `CastError`) from `GET`/`DELETE /api/library/:id`.
  Now a clean 404, in both storage backends.
- **MongoDB was mandatory**: a top-level `await connectToDatabase()` crashed the whole server when no
  database was reachable. Storage now prefers MongoDB and falls back to a local JSON file
  (`DATA_FILE`), reported on the sign-in screen and in `/api/health`.
- **`.env.example` contained a real-looking DeepSeek API key** (`sk-4a70…`). Removed from the template;
  see the note at the end of this file.
- **`server/.env` had `DEMO_MODE` twice** (`0`, then `1`). dotenv keeps the *last* value, so the app was
  really running in demo mode. Now set once, explicitly.
- **`JWT_SECRET` in `server/.env` was the placeholder** that ships in the docs (`your-super-secret-…`),
  so any token was forgeable. Replaced with a random 96-character secret.
- **`.env.example` was missing `MONGODB_URI`, `JWT_SECRET` and `JWT_EXPIRES_IN`**, so following the
  README left the server on a default database and a public secret.
- **The sign-in screen and both dialogs had no CSS at all** — `.auth-box`, `.overlay`, `.dialog` and
  friends were used but never defined, so the login form rendered as raw unstyled HTML. Added, along
  with `input[type=email]`, which the field styling also missed.
- **`GET /api/library/:id` leaked nothing but `POST /api/library` accepted arrays**, and titles were
  uncapped. Both validated now.
- **Dead code removed**: the `CodeBox` component, `setCode`/`clearCode` no-ops, `getMongoClient()`, and
  the unused `isAuthenticated` import.
- **Duplicate-key and validation errors** are mapped to 409/400 instead of a generic 500.
- **Deprecated Mongoose options** (`useNewUrlParser`, `useUnifiedTopology`) removed; connection now has a
  timeout so startup cannot hang.
- **The settings file was cached on first read and never checked again**, so a `settings.json` edited — or
  deleted — outside the running server was ignored until a restart. It is now re-read when the file changes.
- **`/api/settings/test` and `/api/settings/models` had no limit** while making a paid call on the user's
  account. They now share a limit (20 per 15 minutes).

## Not changed

- No OCR for scanned PDFs, no direct Google Sheets export, no in-app editing of options/answers, and no
  password reset by email — all still "not built yet" in the README.
- The old `server/data/library.json` is no longer read automatically. It was the pre-account, single-user
  format; importing it silently would have attached one machine's data to whoever registered first.

## Action for you

The API key that was sitting in `server/.env.example` is in the project's history and should be treated
as exposed: **rotate it at platform.deepseek.com**. The template now ships with an empty value.

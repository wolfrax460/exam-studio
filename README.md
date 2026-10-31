# Exam Studio

Paste or upload course notes, then get study handouts, study notes, flashcards and exams. Exams export to Word (two-column paper plus a separate marking scheme) and to CSV for Google Sheets; handouts export to Word and PDF. There is also an MCP server, so an AI agent can drive the same tools.

## Run it

You need Node.js 18 or newer.

```
npm install          # installs the root helper (concurrently)
npm run setup        # installs server and client
cp server/.env.example server/.env
```

Then open `server/.env` and set at least:

- `DEEPSEEK_API_KEY` (or `ANTHROPIC_API_KEY` with `AI_PROVIDER=anthropic`), or other providers — see **Choosing the AI** below,
- `JWT_SECRET` — generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

`MONGODB_URI` is optional: the app uses MongoDB when it can reach it and otherwise keeps accounts and the library in a local JSON file. You do not need a database installed to try it.

```
npm run dev          # API on :3001, app on http://localhost:5173
```

To look around without a key, run `npm run demo`. Demo mode returns a small fixed sample (7 questions, 35 marks) and makes no API calls, so the "marks add up to 35, not 100" warning is expected there.

### One server, no dev tools

```
npm run build
npm start            # serves the API and the built app on http://localhost:3001
```

### Desktop app

```
npm run desktop       # build the app and open it in an Electron window
npm run desktop:pack  # build an unpacked app in release/ to smoke-test
npm run dist:win      # Windows installer + portable .exe (release/)
npm run dist:mac      # macOS .dmg
npm run dist:linux    # AppImage + .deb
```

The desktop app runs the same server inside itself, on `127.0.0.1` only, and keeps your accounts, library, settings, log, update-cache and window position in the app's own data folder — never inside the program files, so an upgrade never loses your work. `Help → Open the data folder` shows you where. `Help → Check for updates…` asks straight away, and the app also checks quietly by itself once every 24 hours.

What is in the build: the app files are packaged as an asar, with `server/` and `shared/` unpacked
next to it so the MCP (agent) server can be started as a separate process. Windows builds are
unsigned, so SmartScreen will show "Windows protected your PC" the first time: **More info → Run
anyway**. To distribute without that warning you need a code-signing certificate.

If the app will not start, look at `desktop.log` in the data folder (`Help → Open the log file`).

### Notes library

The app reads the `notes/` folder beside the project root (read-only). Drop official module manuals there as PDF, Word or text files, then use the **Notes library** picker in `1. Your notes` to load one; the module code/title, detected units and page ranges are shown before generation. Generated files stay in the app's `output`/library; nothing is written back to `notes/`.

### Tests

```
npm test                                  # server: auth, library, storage, AI providers, MCP, exam checking
                                          # client: session handling and request signing
npm --prefix server run live-check        # optional: exercise a server that is already running
```

The suite runs against a throwaway database (`examstudio_dsh_test`), so it never touches your data.

## How to use it

1. Create an account (email, password, name) or sign in. Your library is private to your account.
2. Enter the module title, level, trade and school. They go on the exam header.
3. Upload a PDF, Word or text file, or paste notes. A whole trainee's manual is fine (up to 600,000 characters). Scanned PDFs have no text and are rejected.
4. Study handout / Study notes / Exam / Flashcards: press the button. A handout is the slow one — see below.
5. Exam tab: the banner shows the mark total and any problems (marks that do not add up, an answer letter that does not exist, a sequence that is not a permutation). Edit wording and marks, then download.
6. Handout tab: the banner counts units, lessons, worked examples and revision questions, and lists any checks that failed. Download it as Word or PDF.
7. Save to library keeps a result. "Avoid questions from saved exams" stops a new exam repeating the last five saved ones.

## Study handouts

A **study handout** is the document a trainee revises from: one lesson per indicative content, each with a key terms table, explanations and comparison tables, numbered procedures, exam-tip / remember / trap callouts and a full worked example. After the lessons come diagrams with instructions for redrawing them, an exam memory sheet, revision questions with a reasoned answer key, answers to the manual's own exercises, a practical assessment task and last-minute study tips.

It is built in four passes, not one:

| Pass | What it does | AI calls |
| --- | --- | --- |
| 1 PLAN | reads the whole manual and returns the skeleton: units, lessons, sub-topics, and the defects it found in the notes | 1 (or one per slice for a very long manual) |
| 2 BUILD | writes one lesson, given the plan and its own slice of the manual | one per lesson |
| 3 EXTRAS | writes the end-of-unit material: diagrams, memory sheet, revision, practical task, tips | one per unit |
| 4 ASSEMBLE | pure code: puts it together, checks it and reports | none |

That is why a four-unit manual takes a long time and costs real money: 19 lessons means about 25 AI calls. The handout tab shows a progress bar, the pass it is on and the lesson it is writing. Two guards refuse a runaway plan with a clear error: `HANDOUT_MAX_LESSONS` (40) and `HANDOUT_MAX_CALLS` (120). You can build one unit at a time to spread the cost, and `HANDOUT_CONCURRENCY` (3) controls how many lessons are written at once.

If you put Exam Studio behind a proxy, raise that proxy's read timeout: a handout build can legitimately run for twenty minutes or more.

## Accounts

- Register and sign in from the first screen. Passwords are hashed with bcrypt (cost 12); the hash is never sent back to the browser.
- A session is a JWT kept in the browser's `localStorage` and valid for `JWT_EXPIRES_IN` (default 7 days). The app checks the session on start, and if it has expired you are returned to the sign-in screen instead of a page where nothing works.
- **Sign out** is in the top-right corner. Signing out removes the token from this browser; it is not
  revoked on the server, so a copy taken beforehand stays valid until it expires.
- Failed sign-ins are limited to `LOGIN_LIMIT_PER_15_MIN` (default 30) per address, and new accounts to `REGISTER_LIMIT_PER_HOUR` (default 10) per address.
- Passwords need 8+ characters with a lower-case letter, an upper-case letter and a digit, and at most 72 characters.

## Choosing the AI

The **Settings** screen (top-right, once signed in) switches provider without editing files:

| Provider | Protocol | Notes |
| --- | --- | --- |
| Anthropic (Claude) | Anthropic | Paid API key from console.anthropic.com |
| DeepSeek | Anthropic-compatible | Key from platform.deepseek.com |
| NVIDIA, Ollama, Ollama Cloud, Other | OpenAI-compatible | Any `/chat/completions` service: OpenRouter, Groq, Together, LM Studio, vLLM, a company server |
| Claude Code, Codex, OpenCode, Gemini CLI | Terminal | Uses the tool you already signed in to; no API key. Only from the machine running the server |

Settings are stored server-side in `server/data/settings.json` and win over `.env`. They can only be changed from the computer running the server (set `EXAM_STUDIO_ALLOW_REMOTE_SETTINGS=1` to allow it from elsewhere).

## Connecting AI agents (MCP)

Exam Studio is also an MCP server, so Claude Desktop, Claude Code, Codex, OpenCode and Gemini CLI can read your notes, write an exam or a study handout, check it and export Word/PDF/CSV files. The **Agents** button shows the exact snippet to paste, with the right paths for this computer and installation.

### Remote MCP (Streamable HTTP)

A remote MCP server is available at `https://examstudio.duckdns.org/mcp` (Streamable HTTP). It reuses the same REST API logic, tools, daily limits and scopes as the local MCP server.

**Authentication**: OAuth 2.1 authorization code with PKCE (`/oauth/authorize`, `/oauth/token`) plus personal access tokens (PATs) sent as `Authorization: Bearer est_...` for clients that support custom headers. Tokens are hashed, scoped, and revocable from account settings.

**Client configs** (absolute URLs, no `$VARS`):

- **Claude Desktop / opencode / Cursor**: add `https://examstudio.duckdns.org/mcp` as a custom MCP connector with header `Authorization: Bearer es_live_YOUR_PERSONAL_ACCESS_TOKEN`.
- **Connector configs**: download from `https://examstudio.duckdns.org/downloads/claude/`.

**MCP inspector**: `npx @modelcontextprotocol/inspector` against `https://examstudio.duckdns.org/mcp` with a Bearer PAT.

### Integrations (downloadable packages)

From `https://examstudio.duckdns.org/downloads/integrations/0.2.1/`:

| Package | What it is |
|---|---|
| `exam-studio-skill-0.2.1.zip` | Claude skill: SKILL.md with workflow, marking-scheme rules, tool definitions, worked examples |
| `exam-studio-plugin-0.2.1.zip` | Claude plugin: skill + remote MCP connector config + slash commands `/exam`, `/notes`, `/handout`, `/flashcards`, `/usage` |
| `tools.json` | OpenAI-compatible function/tool definitions (DeepSeek, NVIDIA, OpenRouter, Groq, any OpenAI-compatible model) |
| `openapi.json` (ChatGPT) | Trimmed OpenAPI 3.1 schema for Custom GPT Actions (generate + library endpoints only) |

Checksums are in `https://examstudio.duckdns.org/downloads/downloads.json` (CORS-enabled for `https://exams-studio.vercel.app`).

### Local MCP (stdio)

The handout tools are `exam_studio_generate_handout`, `exam_studio_check_handout` and `exam_studio_export_handout`; `exam_studio_format_guide` documents the full handout shape so an agent can also write one by hand.


## Files

```
shared/format.js       question rendering, the exam checker and the handout checker, used by server and client
server/index.js        routes, upload, rate limits, authentication, start()
server/lib/auth.js     password hashing, JWT issuing/verification, auth middlewares
server/lib/version.js  the 24-hour check for a newer version
server/lib/repository.js  accounts and library: MongoDB, or a local file when it is absent
server/lib/providers.js   the AI services the app can talk to, and Settings for them
server/lib/engine.js   one structured-output call across the anthropic/openai/CLI protocols
server/lib/ai.js       prompts and generation: notes, flashcards and exams, plus the four handout passes
server/lib/schema.js   the tool schemas the AI must answer with, including the handout plan/lesson/extras
server/lib/docx.js     Word: the exam (two columns), the marking scheme, study notes and the handout
server/lib/pdf.js      the same documents as PDF
server/lib/csv.js      CSV for Google Sheets
server/mcp.js          the MCP server for AI agents
server/test/           the test suite
client/src/App.jsx     the app
client/src/Settings.jsx, Agents.jsx  the dialogs
electron/main.js       desktop shell (npm run desktop, needs electron installed)
```

## AI health and errors

- **`GET /health/ai`** — public AI health check. Returns `{ ok, latency }` or `{ ok: false, error }` without exposing provider internals. Fails quietly for visitors.
- **`GET /api/admin/ai-health`** — admin-only: last success time, last error, last latency.
- **Precise error codes** (user-safe, provider details logged server-side without note content):
  - `daily_limit_reached` — with reset time and `Retry-After`
  - `ai_rate_limited` — "try again in N seconds"
  - `ai_unavailable` — key rejected, no balance, model/address not recognised
  - `input_too_large` — source exceeds plan limit
  - `generation_timed_out` — provider took too long
- Transient `429`/`5xx` provider errors are retried once with backoff before surfacing to the user.


Exam Studio checks whether a newer version exists **at most once every 24 hours**, and tells you: a banner in the app, and in the desktop build a dialog you see once per new version. A failed check is recorded and otherwise ignored — the app never blocks on it and works offline.

Point it at where you publish releases. You can do this in **Settings → Updates** (which is how you do it in the desktop app, where there is no `.env` file), or in `server/.env`:

| Setting | Example | What it reads |
| --- | --- | --- |
| `UPDATE_REPO` / *GitHub repository* | `your-name/exam-studio` | the latest GitHub release, `tag_name` (e.g. `v1.0.1`) |
| `UPDATE_FEED_URL` / *feed address* | `https://example.com/version.json` | any JSON with `version` or `tag_name`, or plain text |

A value in `server/.env` wins over one saved in the app. With neither set, update checks are off and the Settings screen says so. The answer is cached in `update-check.json` beside your settings for 24 hours, so the app makes at most one request a day, and a network failure never wipes what it already knew. `Settings → Check for updates now` forces a check; that can only be run from the computer running the server.

Versions are compared as `major.minor.patch`. A `v` prefix is allowed, so `0.2.0` against `v1.0.1` is an update; `1.0.0-beta.1` is older than `1.0.0`; and `1.10.0` is newer than `1.9.0`. `version.json` at the root of this repository is a ready-made feed file if you would rather host a file than use GitHub releases.

## Security notes

- API keys stay on the server. The browser never sees them, and a saved key is never sent back — only whether one exists.
- Personal Access Tokens (PATs, `est_...`) are SHA-256 hashed, scoped, and revocable. `Authorization` headers are redacted in logs.
- The JWT secret comes from `JWT_SECRET`. If it is unset in development the server generates a random one and saves it next to the data files; it refuses to start with a placeholder secret when `NODE_ENV=production`. There is no shared default secret.
- Your notes are sent to the AI provider you choose. Do not paste student names, marks or other personal data into the notes box. Note content is never logged.
- Every generation costs money. Generation is limited to 30 per hour per address (`GENERATE_LIMIT_PER_HOUR`), plus per-user daily limits from plans.
- Uploads are limited to 15 MB and to `.pdf`, `.docx`, `.txt` and `.md`. Notes are limited to `MAX_NOTES_CHARS` characters (600,000, which is one whole trainee's manual).
- CSV cells that start with `=`, `+`, `-` or `@` are prefixed so spreadsheets do not run them as formulas.
- Each user has their own private library; every library and settings route requires a valid session. No endpoint exposes another user's data.
- OAuth 2.1 authorization code with PKCE secures the remote MCP server (`/oauth/authorize`, `/oauth/token`). Dynamic client registration is available at `/oauth/register`.

## Not built yet

- Recently added: in-app editing of exam options/answers (classic and sectioned), direct Google
  Sheets export via `GOOGLE_SERVICE_ACCOUNT_JSON`, and OCR fallback for scanned PDFs
  (`OCR_MAX_PAGES`, default 50).
- Handout in-place editing is still not available.
- Password reset by email.

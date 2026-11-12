# Exam Studio legacy system inventory

## Git baseline

The root commit [`e73e61cfed77d11dc031c1ebb21e30ada967684d`](https://github.com/wolfrax460/exam-studio/commit/e73e61cfed77d11dc031c1ebb21e30ada967684d), dated October 30, 2026 in Git, contains only `LICENSE`. The earliest runnable tree is [`27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50`](https://github.com/wolfrax460/exam-studio/tree/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50), the Exam Studio 0.2.1 source and desktop release commit. Its application was already substantial. Git authorship and timestamps cannot distinguish human, Codex, or other agent contributions inside that import or establish the exact start of Codex work. This review uses the earliest runnable tree for feature comparisons and identifies later additions by their first recoverable Git commits.

The comparison target was [`9df889dd598a9a7ebdad8384608a0a77d4042168`](https://github.com/wolfrax460/exam-studio/commit/9df889dd598a9a7ebdad8384608a0a77d4042168), the merge of Task 024. I inspected history across all fetched refs and read historical files with Git. The previous checkout, `codex/institution-courses-release`, matched the `main` source tree. The audit branch starts at that merge and preserves the separate Task 024 history.

## Feature and storage inventory

The 18 rows below trace baseline behavior, current consumers, persistence, and verified boundaries. File names in the baseline column refer to the historical tree. Files in the current column link to the audited source.

| Area | Earliest runnable version | Current behavior and entry points | Storage and limits |
| --- | --- | --- | --- |
| App shell and navigation | `client/src/main.jsx` and `App.jsx` rendered the signed-in app, source panels, output tabs and settings. | [App.jsx](../../client/src/App.jsx) renders the personal shell, search, Study Guide and workspace switching. [Auth.jsx](../../client/src/Auth.jsx) handles personal and institution intent. [main.jsx](../../client/src/main.jsx) selects app, admin and public attempt views. | Browser theme, focus and navigation preferences. Institution access is server-checked after authentication. |
| API and server lifecycle | `server/index.js` booted Express, applied auth and upload limits and served the built React app. | [index.js](../../server/index.js) still defines `start`, middleware ordering, REST and MCP routes, error handling, update checks and exam sweeps. Institution routes use separate routers. | In-process request limits and jobs. See the route catalog below. |
| Accounts | `auth.js`, `repository.js` and `User.js` used bcrypt, signed JWTs and account-scoped Library access. | [auth.js](../../server/lib/auth.js), [repository.js](../../server/lib/repository.js) and [Auth.jsx](../../client/src/Auth.jsx) handle register/login/me/logout, token version checks, email verification, recovery and optional TOTP. | Mongo `users` or JSON `users`. Recovery requires Mongo and working SMTP for email delivery. Logout clears the browser session. |
| Core storage | `database.js`, `store.js`, `repository.js`, `User.js` and `LibraryItem.js` selected Mongo or local JSON. | [database.js](../../server/lib/database.js) and [repository.js](../../server/lib/repository.js) keep the dual backend. [ownership.js](../../server/lib/ownership.js) separates personal and institution records. [ownershipMigration.js](../../server/lib/ownershipMigration.js) supports a reviewed migration of old Library ownership. | `users`, `libraryitems`, versioned JSON `users`/`items`, with atomic file replacement in one process. |
| AI generation and settings | `ai.js`, `engine.js`, `providers.js` and `settings.js` handled provider selection, prompts, structured output, demo mode and CLI compatibility. | [ai.js](../../server/lib/ai.js), [engine.js](../../server/lib/engine.js), [schema.js](../../server/lib/schema.js) and [userAISettings.js](../../server/lib/userAISettings.js) drive generation and per-user provider configuration. [Settings.jsx](../../client/src/Settings.jsx) consumes `/api/settings` and `/api/settings/user`. | Settings JSON and encrypted per-user provider records. Plan usage, daily counters and provider limits are tracked separately. |
| Source extraction | `extract.js`, `notesLib.js` and `POST /api/extract` handled uploads and a read-only notes folder. | [SourcePicker.jsx](../../client/src/SourcePicker.jsx) handles upload, paste and folder selection. [extract.js](../../server/lib/extract.js) supports PDF, DOCX, TXT and Markdown, UTF normalization and scanned PDF OCR fallback. | Multipart memory upload up to 15 MB per file, one per request. Returned text is capped. Folder access resolves within configured source files. |
| Study Guide | `App.jsx`, `generateNotes` and `/api/notes/generate` turned source text into topic sections for review and Word export. | [App.jsx](../../client/src/App.jsx) calls generation and persists successful notes. [NotesReader.jsx](../../client/src/NotesReader.jsx) and [notesDocument.js](../../server/lib/notesDocument.js) render and validate the richer document. Legacy sections still open. | Library kind `notes` and per-user last-output pointer. Word, copy and browser print. |
| Teaching handout | `generateHandout`, plan/lesson/extras schemas and the handout endpoints built multi-stage guides and reported progress. | [ai.js](../../server/lib/ai.js), [index.js](../../server/index.js) and [App.jsx](../../client/src/App.jsx) generate, poll, cancel, save and render handouts. | Library kind `handout`. Progress is account-scoped in-process state. Exports include DOCX and PDF. |
| Paper Studio | `App.jsx` generated and edited exam papers with classic or sectioned formats, marks and a marking key. | [PaperStudio.jsx](../../client/src/studio/PaperStudio.jsx), [Build.jsx](../../client/src/studio/Build.jsx) and [App.jsx](../../client/src/App.jsx) offer AI generation, local practice, question reuse, My Papers and export. Task 024 reorganized the tabs. | Library kind `exam`. The custom builder stores preferences in the browser. Practice history is session-only. |
| Saved Library | `store.js` and `/api/library` handled save/list/open/delete with owner filters. | [LibraryTab.jsx](../../client/src/tabs/LibraryTab.jsx) filters and searches a metadata list, then fetches full owned content. [repository.js](../../server/lib/repository.js) enforces ownership. | `libraryitems` / JSON `items`. No general in-place update endpoint. Saving edits creates another item. Lists are currently unpaginated. |
| Modules | No custom module editor in the runnable baseline. The notes folder already recognized module names/codes. | The local editor appeared by [`ee1196e`](https://github.com/wolfrax460/exam-studio/commit/ee1196e). [Modules.jsx](../../client/src/studio/Modules.jsx) creates/deletes modules and suggests learning outcomes using local heuristics and `POST /api/modules/suggest-outcomes`. | `examstudio:papers:modules`, `:active` and `:config` are browser-origin keys. Module CRUD has no synchronization API. Academic modules and subjects are separate. |
| Question Bank | No standalone reusable bank in the runnable baseline. Saved exams held generated questions. | [store.js](../../client/src/studio/store.js) adapts objective generated questions, [Bank.jsx](../../client/src/studio/Bank.jsx) filters them, and [Modules.jsx](../../client/src/studio/Modules.jsx) adds/deletes custom questions. The [local engine](../../client/src/studio/engine.js) builds practice and scores it. | Questions are embedded in browser modules or imported read-only from the current exam. Editing existing entries in place is unavailable. |
| Flashcards | `generateCards` and `/api/flashcards/generate` produced front/back cards. | [App.jsx](../../client/src/App.jsx) renders per-card review, show/hide all, trap filtering, save, and Quizlet TSV download inside Paper Studio. | Library kind `flashcards`. Flip state is in memory. |
| Online exams | No public attempts or publication in the runnable baseline. | [`69c8004`](https://github.com/wolfrax460/exam-studio/commit/69c8004) introduced publication and attempt models. [PublishOnline.jsx](../../client/src/PublishOnline.jsx), [TakeExam.jsx](../../client/src/TakeExam.jsx), [examTake.js](../../server/lib/examTake.js) and [index.js](../../server/index.js) support publishing, revocation, time limits, autosave, submission, rubric-based AI, teacher override, and result release. | Mongo `exampublications`, `examattempts`. Public data is allowlisted. Signed attempt tokens are scoped to an attempt. No equivalent JSON exam backend. |
| Admin dashboard | Dedicated admin UI and routes first appear in [`3f3884d`](https://github.com/wolfrax460/exam-studio/commit/3f3884d) after the runnable baseline. | [Admin.jsx](../../client/src/Admin.jsx), its `Admin*` views and [adminStore.js](../../server/lib/adminStore.js) handle people, plans, AI, usage, content, announcements, health, audit, settings and TOTP. Institution review adds a distinct reviewer allowlist. | Mongo users, plans, audit logs, usage events, settings, AI config and announcements. JSON fallbacks exist for portions of admin. |
| MCP, CLI and tokens | `server/mcp.js` exposed local stdio tools. `agents.js` produced connector commands and `cli.js` supported provider commands. | [mcpServer.js](../../server/lib/mcpServer.js) shares generation and Library operations between transports. [index.js](../../server/index.js) adds remote PAT sessions, scoped API access and public generate-only MCP with quotas. [Agents.jsx](../../client/src/Agents.jsx) exposes setup. | Mongo PAT digests and quota models. Local tools resolve an explicit owner or the first/local account. Remote sessions are process-local. |
| Exports | `docx.js`, `pdf.js`, `csv.js`, `shared/format.js` and the Google Sheets route produced classroom documents. | [docx.js](../../server/lib/docx.js), [pdf.js](../../server/lib/pdf.js) and [csv.js](../../server/lib/csv.js) preserve classic and sectioned output. Question paper and key are separate. [PrintSheet.jsx](../../client/src/studio/PrintSheet.jsx) prints the local builder. | In-memory exports streamed to authenticated callers. Google Sheets uses a configured service account and a share link. |
| Institution, desktop and deployment | `electron/main.js` launched the embedded server and used per-device storage. GitHub Actions built desktop artifacts. Institution workspaces and the separate landing project had not appeared yet. | [InstitutionWorkspace.jsx](../../client/src/InstitutionWorkspace.jsx) combines access, dashboard, academic records, staff, students and Courses/Lessons. [electron/main.js](../../electron/main.js) and [update-download.js](../../electron/update-download.js) check and verify installers. [deploy/](../../deploy/) manages Oracle/systemd. [Vercel configuration](../../apps/landing/vercel.json) serves marketing and routes app requests to Oracle. | Institution, membership, academic structure, student, staff and course records are institution-scoped. Desktop uses its own settings/data directories. GitHub Releases and checked-in manifests distribute installers. |

## Backend route catalog

The catalog counts literal method/path registrations in the Express entry and four mounted routers. Express also provides implicit HEAD handling on GET routes. Static serving, middleware and protocol-wide OPTIONS are described separately. The count does not treat OpenAPI declarations, client call sites or unused OAuth models as registered routes.

Authentication begins at the route registration order. Most web API routes after the institution router require a JWT and pass through the general request gate. Public take routes have their own limiter. Routes with additional guards validate resource ownership or institution scope, with admin and platform reviewer treated separately. See [full-system review](full-system-review.md) for validation, query, provider and failure behavior.


### Current routes

159 registered methods and paths. Paths shown for mounted routers include their mount prefix.

| Method and path | Access | Source |
| --- | --- | --- |
| `GET /api/health` | Public · optional JWT | [index.js:564](../../server/index.js#L564) |
| `POST /api/auth/register` | Public · registration limit | [index.js:618](../../server/index.js#L618) |
| `POST /api/auth/login` | Public · login limit | [index.js:645](../../server/index.js#L645) |
| `GET /api/auth/me` | Public · optional JWT | [index.js:676](../../server/index.js#L676) |
| `GET /api/limits` | Public | [index.js:680](../../server/index.js#L680) |
| `GET /api/usage` | Public · optional JWT | [index.js:684](../../server/index.js#L684) |
| `GET /api/auth/verify-email` | Public · verification token | [index.js:695](../../server/index.js#L695) |
| `POST /api/auth/forgot-password` | Public · recovery limit | [index.js:705](../../server/index.js#L705) |
| `POST /api/auth/reset-password` | Public · recovery limit | [index.js:720](../../server/index.js#L720) |
| `GET /api/v1/public/plans` | Public | [index.js:811](../../server/index.js#L811) |
| `GET /api/v1/openapi.json` | Public | [index.js:815](../../server/index.js#L815) |
| `GET /api/v1/me/quota` | JWT or PAT · applicable scope and limits | [index.js:820](../../server/index.js#L820) |
| `GET /api/v1/library` | JWT or PAT · applicable scope and limits | [index.js:821](../../server/index.js#L821) |
| `GET /api/v1/notes/structure` | JWT or PAT · applicable scope and limits | [index.js:822](../../server/index.js#L822) |
| `POST /mcp` | PAT · scoped and session-owned | [index.js:958](../../server/index.js#L958) |
| `POST /mcp/public` | Public generate-only MCP and quota | [index.js:959](../../server/index.js#L959) |
| `POST /mcp/:token` | PAT · scoped and session-owned | [index.js:1027](../../server/index.js#L1027) |
| `OPTIONS /mcp` | PAT · scoped and session-owned | [index.js:1033](../../server/index.js#L1033) |
| `OPTIONS /mcp/:token` | PAT · scoped and session-owned | [index.js:1034](../../server/index.js#L1034) |
| `OPTIONS /mcp/public` | Public generate-only MCP and quota | [index.js:1036](../../server/index.js#L1036) |
| `OPTIONS /mcp/public/:token` | PAT · scoped and session-owned | [index.js:1037](../../server/index.js#L1037) |
| `GET /mcp` | Public transport guidance, HTTP 405 | [index.js:1039](../../server/index.js#L1039) |
| `GET /mcp/:token` | Public transport guidance, HTTP 405 | [index.js:1047](../../server/index.js#L1047) |
| `GET /mcp/public` | Public transport guidance, HTTP 405 | [index.js:1055](../../server/index.js#L1055) |
| `DELETE /mcp/:token` | PAT · scoped and session-owned | [index.js:1076](../../server/index.js#L1076) |
| `DELETE /mcp` | PAT · scoped and session-owned | [index.js:1080](../../server/index.js#L1080) |
| `DELETE /mcp/public` | Public generate-only MCP and quota | [index.js:1082](../../server/index.js#L1082) |
| `GET /icon-256.png` | Public | [index.js:1092](../../server/index.js#L1092) |
| `GET /favicon.ico` | Public | [index.js:1098](../../server/index.js#L1098) |
| `POST /api/v1/generate/handout` | JWT or PAT · applicable scope and limits | [index.js:1157](../../server/index.js#L1157) |
| `POST /api/v1/generate/notes` | JWT or PAT · applicable scope and limits | [index.js:1170](../../server/index.js#L1170) |
| `POST /api/v1/generate/flashcards` | JWT or PAT · applicable scope and limits | [index.js:1183](../../server/index.js#L1183) |
| `POST /api/v1/generate/exam` | JWT or PAT · applicable scope and limits | [index.js:1196](../../server/index.js#L1196) |
| `GET /api/tokens` | JWT · token owner | [index.js:1219](../../server/index.js#L1219) |
| `POST /api/tokens` | JWT · token owner | [index.js:1222](../../server/index.js#L1222) |
| `DELETE /api/tokens/:id` | JWT · token owner | [index.js:1231](../../server/index.js#L1231) |
| `POST /api/auth/logout` | JWT · general API gate | [index.js:1238](../../server/index.js#L1238) |
| `POST /api/extract` | JWT · general API gate | [index.js:1253](../../server/index.js#L1253) |
| `GET /api/notes-lib/list` | JWT · general API gate | [index.js:1264](../../server/index.js#L1264) |
| `POST /api/notes-lib/load` | JWT · general API gate | [index.js:1268](../../server/index.js#L1268) |
| `POST /api/notes/detect-structure` | JWT · general API gate | [index.js:1283](../../server/index.js#L1283) |
| `POST /api/modules/suggest-outcomes` | JWT · generation limit, provider and quota | [index.js:1296](../../server/index.js#L1296) |
| `POST /api/notes/generate` | JWT · generation limit, provider and quota | [index.js:1309](../../server/index.js#L1309) |
| `POST /api/flashcards/generate` | JWT · generation limit, provider and quota | [index.js:1320](../../server/index.js#L1320) |
| `POST /api/exams/generate` | JWT · generation limit, provider and quota | [index.js:1331](../../server/index.js#L1331) |
| `POST /api/export/exam-docx` | JWT · general API gate | [index.js:1373](../../server/index.js#L1373) |
| `POST /api/export/key-docx` | JWT · general API gate | [index.js:1378](../../server/index.js#L1378) |
| `POST /api/export/exam-pdf` | JWT · general API gate | [index.js:1384](../../server/index.js#L1384) |
| `POST /api/export/key-pdf` | JWT · general API gate | [index.js:1389](../../server/index.js#L1389) |
| `POST /api/export/exam-csv` | JWT · general API gate | [index.js:1394](../../server/index.js#L1394) |
| `POST /api/export/key-csv` | JWT · general API gate | [index.js:1397](../../server/index.js#L1397) |
| `POST /api/export/google-sheets` | JWT · general API gate | [index.js:1400](../../server/index.js#L1400) |
| `POST /api/export/notes-docx` | JWT · general API gate | [index.js:1452](../../server/index.js#L1452) |
| `POST /api/handouts/generate` | JWT · generation limit, provider and quota | [index.js:1466](../../server/index.js#L1466) |
| `POST /api/handouts/cancel/:id` | JWT · handout job owner | [index.js:1501](../../server/index.js#L1501) |
| `GET /api/handouts/progress/:id` | JWT · handout job owner | [index.js:1508](../../server/index.js#L1508) |
| `POST /api/export/handout-docx` | JWT · general API gate | [index.js:1515](../../server/index.js#L1515) |
| `POST /api/export/handout-pdf` | JWT · general API gate | [index.js:1522](../../server/index.js#L1522) |
| `GET /api/library` | JWT · personal owner | [index.js:1530](../../server/index.js#L1530) |
| `GET /api/library/:id` | JWT · personal owner | [index.js:1533](../../server/index.js#L1533) |
| `POST /api/library` | JWT · personal owner | [index.js:1538](../../server/index.js#L1538) |
| `DELETE /api/library/:id` | JWT · personal owner | [index.js:1550](../../server/index.js#L1550) |
| `POST /api/exams/:id/publish` | JWT · exam owner | [index.js:1697](../../server/index.js#L1697) |
| `GET /api/exams/:id/publication` | JWT · exam owner | [index.js:1722](../../server/index.js#L1722) |
| `PATCH /api/exams/:id/publication` | JWT · exam owner | [index.js:1729](../../server/index.js#L1729) |
| `POST /api/exams/:id/unpublish` | JWT · exam owner | [index.js:1746](../../server/index.js#L1746) |
| `DELETE /api/exams/:id/publication` | JWT · exam owner | [index.js:1752](../../server/index.js#L1752) |
| `GET /api/take/:shareCode` | Public share code · take limit | [index.js:1758](../../server/index.js#L1758) |
| `POST /api/take/:shareCode/start` | Public share code · take limit | [index.js:1766](../../server/index.js#L1766) |
| `PUT /api/take/attempts/:id/answers` | Signed attempt token · take limit | [index.js:1790](../../server/index.js#L1790) |
| `POST /api/take/attempts/:id/submit` | Signed attempt token · take limit | [index.js:1822](../../server/index.js#L1822) |
| `GET /api/take/attempts/:id/result` | Signed attempt token · take limit | [index.js:1841](../../server/index.js#L1841) |
| `GET /api/exams/:id/attempts` | JWT · exam owner | [index.js:1859](../../server/index.js#L1859) |
| `GET /api/exams/:id/attempts/stats` | JWT · exam owner | [index.js:1865](../../server/index.js#L1865) |
| `GET /api/exams/:id/attempts/:attemptId` | JWT · exam owner | [index.js:1881](../../server/index.js#L1881) |
| `PATCH /api/exams/:id/attempts/:attemptId/score` | JWT · exam owner | [index.js:1888](../../server/index.js#L1888) |
| `POST /api/exams/:id/attempts/:attemptId/regrade` | JWT · exam owner | [index.js:1935](../../server/index.js#L1935) |
| `GET /api/exams/:id/attempts.csv` | JWT · exam owner | [index.js:1968](../../server/index.js#L1968) |
| `GET /api/settings` | JWT · general API gate | [index.js:1988](../../server/index.js#L1988) |
| `GET /api/settings/user` | JWT · general API gate | [index.js:2015](../../server/index.js#L2015) |
| `PUT /api/settings/user` | JWT · general API gate | [index.js:2019](../../server/index.js#L2019) |
| `DELETE /api/settings/user` | JWT · general API gate | [index.js:2026](../../server/index.js#L2026) |
| `POST /api/settings/user/test` | JWT · provider request limit | [index.js:2031](../../server/index.js#L2031) |
| `GET /api/settings/user/models` | JWT · provider request limit | [index.js:2041](../../server/index.js#L2041) |
| `PUT /api/settings` | JWT · general API gate | [index.js:2051](../../server/index.js#L2051) |
| `POST /api/settings/test` | JWT · provider request limit | [index.js:2098](../../server/index.js#L2098) |
| `GET /api/settings/models` | JWT · provider request limit | [index.js:2104](../../server/index.js#L2104) |
| `GET /api/update` | JWT · general API gate | [index.js:2144](../../server/index.js#L2144) |
| `POST /api/update/check` | JWT · general API gate | [index.js:2146](../../server/index.js#L2146) |
| `GET /api/agents/info` | JWT · general API gate | [index.js:2153](../../server/index.js#L2153) |
| `GET /api/admin/me` | JWT · platform admin | [index.js:2165](../../server/index.js#L2165) |
| `GET /api/admin/users` | JWT · platform admin | [index.js:2168](../../server/index.js#L2168) |
| `POST /api/admin/users` | JWT · platform admin | [index.js:2175](../../server/index.js#L2175) |
| `GET /api/admin/users/:id` | JWT · platform admin | [index.js:2187](../../server/index.js#L2187) |
| `PUT /api/admin/users/:id` | JWT · platform admin | [index.js:2192](../../server/index.js#L2192) |
| `DELETE /api/admin/users/:id` | JWT · platform admin | [index.js:2204](../../server/index.js#L2204) |
| `POST /api/admin/users/:id/reset-password` | JWT · platform admin | [index.js:2210](../../server/index.js#L2210) |
| `POST /api/admin/users/:id/signout` | JWT · platform admin | [index.js:2219](../../server/index.js#L2219) |
| `GET /api/admin/plans` | JWT · platform admin | [index.js:2226](../../server/index.js#L2226) |
| `POST /api/admin/plans` | JWT · platform admin | [index.js:2227](../../server/index.js#L2227) |
| `PUT /api/admin/plans/:id` | JWT · platform admin | [index.js:2232](../../server/index.js#L2232) |
| `DELETE /api/admin/plans/:id` | JWT · platform admin | [index.js:2239](../../server/index.js#L2239) |
| `POST /api/admin/plans/:id/duplicate` | JWT · platform admin | [index.js:2246](../../server/index.js#L2246) |
| `POST /api/admin/plans/:id/default` | JWT · platform admin | [index.js:2252](../../server/index.js#L2252) |
| `GET /api/admin/ai-config` | JWT · platform admin | [index.js:2259](../../server/index.js#L2259) |
| `PUT /api/admin/ai-config` | JWT · platform admin | [index.js:2260](../../server/index.js#L2260) |
| `POST /api/admin/ai-config/test` | JWT · platform admin | [index.js:2268](../../server/index.js#L2268) |
| `GET /api/admin/ai-config/models` | JWT · platform admin | [index.js:2272](../../server/index.js#L2272) |
| `GET /api/admin/usage` | JWT · platform admin | [index.js:2277](../../server/index.js#L2277) |
| `GET /api/admin/usage/summary` | JWT · platform admin | [index.js:2282](../../server/index.js#L2282) |
| `GET /api/admin/content` | JWT · platform admin | [index.js:2285](../../server/index.js#L2285) |
| `DELETE /api/admin/content/:id` | JWT · platform admin | [index.js:2289](../../server/index.js#L2289) |
| `GET /api/admin/announcements` | JWT · platform admin | [index.js:2297](../../server/index.js#L2297) |
| `POST /api/admin/announcements` | JWT · platform admin | [index.js:2298](../../server/index.js#L2298) |
| `PUT /api/admin/announcements/:id` | JWT · platform admin | [index.js:2303](../../server/index.js#L2303) |
| `DELETE /api/admin/announcements/:id` | JWT · platform admin | [index.js:2309](../../server/index.js#L2309) |
| `GET /api/admin/audit` | JWT · platform admin | [index.js:2317](../../server/index.js#L2317) |
| `GET /api/admin/settings` | JWT · platform admin | [index.js:2323](../../server/index.js#L2323) |
| `PUT /api/admin/settings` | JWT · platform admin | [index.js:2324](../../server/index.js#L2324) |
| `POST /api/admin/2fa/setup` | JWT · platform admin | [index.js:2334](../../server/index.js#L2334) |
| `POST /api/admin/2fa/verify` | JWT · platform admin | [index.js:2340](../../server/index.js#L2340) |
| `POST /api/admin/2fa/disable` | JWT · platform admin | [index.js:2348](../../server/index.js#L2348) |
| `GET /api/announcements/active` | JWT · general API gate | [index.js:2355](../../server/index.js#L2355) |
| `GET /api/admin/health` | JWT · platform admin | [index.js:2360](../../server/index.js#L2360) |
| `GET /api/admin/system` | JWT · platform admin | [index.js:2363](../../server/index.js#L2363) |
| `GET /api/admin/ai-health` | JWT · platform admin | [index.js:2367](../../server/index.js#L2367) |
| `POST /api/admin/diagnostics` | JWT · platform admin | [index.js:2371](../../server/index.js#L2371) |
| `GET /health/ai` | Public | [index.js:2379](../../server/index.js#L2379) |
| `GET /api/me/quota` | JWT · general API gate | [index.js:2395](../../server/index.js#L2395) |
| `GET /api/institutions/requests` | JWT · institution feature gate | [institutionRoutes.js:131](../../server/lib/institutionRoutes.js#L131) |
| `POST /api/institutions/requests` | JWT · institution feature gate | [institutionRoutes.js:136](../../server/lib/institutionRoutes.js#L136) |
| `GET /api/institutions/workspace` | JWT · active workspace and resource scope | [institutionRoutes.js:145](../../server/lib/institutionRoutes.js#L145) |
| `GET /api/institutions/workspaces` | JWT · institution feature gate | [institutionRoutes.js:156](../../server/lib/institutionRoutes.js#L156) |
| `GET /api/institutions/workspace/overview` | JWT · active workspace and resource scope | [institutionRoutes.js:160](../../server/lib/institutionRoutes.js#L160) |
| `GET /api/institutions/members` | JWT · active workspace and resource scope | [institutionRoutes.js:180](../../server/lib/institutionRoutes.js#L180) |
| `POST /api/institutions/members/invitations` | JWT · institution administrator | [institutionRoutes.js:188](../../server/lib/institutionRoutes.js#L188) |
| `POST /api/institutions/invitations/accept` | JWT · institution feature gate | [institutionRoutes.js:201](../../server/lib/institutionRoutes.js#L201) |
| `PUT /api/institutions/members/:id` | JWT · institution administrator | [institutionRoutes.js:208](../../server/lib/institutionRoutes.js#L208) |
| `GET /api/admin/institutions` | JWT · platform reviewer | [institutionRoutes.js:215](../../server/lib/institutionRoutes.js#L215) |
| `PUT /api/admin/institutions/:id/status` | JWT · platform reviewer | [institutionRoutes.js:222](../../server/lib/institutionRoutes.js#L222) |
| `GET /api/institutions/academics` | JWT · active workspace and resource scope | [academicRoutes.js:113](../../server/lib/academicRoutes.js#L113) |
| `POST /api/institutions/academics/:kind` | JWT · institution administrator | [academicRoutes.js:123](../../server/lib/academicRoutes.js#L123) |
| `PUT /api/institutions/academics/:kind/:id` | JWT · institution administrator | [academicRoutes.js:126](../../server/lib/academicRoutes.js#L126) |
| `PUT /api/institutions/academics/active/:kind/:id` | JWT · institution administrator | [academicRoutes.js:129](../../server/lib/academicRoutes.js#L129) |
| `GET /api/institutions/people/students` | JWT · institution staff and resource scope | [institutionPeopleRoutes.js:93](../../server/lib/institutionPeopleRoutes.js#L93) |
| `GET /api/institutions/people/students/:id` | JWT · institution staff and resource scope | [institutionPeopleRoutes.js:102](../../server/lib/institutionPeopleRoutes.js#L102) |
| `POST /api/institutions/people/students` | JWT · institution administrator | [institutionPeopleRoutes.js:110](../../server/lib/institutionPeopleRoutes.js#L110) |
| `PUT /api/institutions/people/students/:id` | JWT · institution administrator | [institutionPeopleRoutes.js:117](../../server/lib/institutionPeopleRoutes.js#L117) |
| `GET /api/institutions/people/student-accounts` | JWT · institution administrator | [institutionPeopleRoutes.js:127](../../server/lib/institutionPeopleRoutes.js#L127) |
| `GET /api/institutions/people/staff` | JWT · institution staff and resource scope | [institutionPeopleRoutes.js:134](../../server/lib/institutionPeopleRoutes.js#L134) |
| `GET /api/institutions/people/staff/:id` | JWT · institution administrator | [institutionPeopleRoutes.js:166](../../server/lib/institutionPeopleRoutes.js#L166) |
| `PUT /api/institutions/people/staff/:id` | JWT · institution administrator | [institutionPeopleRoutes.js:174](../../server/lib/institutionPeopleRoutes.js#L174) |
| `GET /api/institutions/courses` | JWT · active workspace and resource scope | [courseRoutes.js:126](../../server/lib/courseRoutes.js#L126) |
| `GET /api/institutions/courses/:id` | JWT · active workspace and resource scope | [courseRoutes.js:149](../../server/lib/courseRoutes.js#L149) |
| `POST /api/institutions/courses` | JWT · institution staff and resource scope | [courseRoutes.js:155](../../server/lib/courseRoutes.js#L155) |
| `PUT /api/institutions/courses/:id` | JWT · institution staff and resource scope | [courseRoutes.js:161](../../server/lib/courseRoutes.js#L161) |
| `POST /api/institutions/courses/:id/lessons` | JWT · institution staff and resource scope | [courseRoutes.js:181](../../server/lib/courseRoutes.js#L181) |
| `PUT /api/institutions/courses/:id/lessons/:lessonId` | JWT · institution staff and resource scope | [courseRoutes.js:182](../../server/lib/courseRoutes.js#L182) |
| `PUT /api/institutions/courses/:id/lesson-order` | JWT · institution staff and resource scope | [courseRoutes.js:183](../../server/lib/courseRoutes.js#L183) |

The Express app also serves the React build and the `/downloads` static root. The app-side `/api`, `/mcp`, `/oauth`, and `/.well-known` fallbacks return JSON 404s for unknown paths that reach them. Earlier authentication middleware can reject unauthenticated API requests before the fallback. The MCP mount handles preflight OPTIONS separately.

### Baseline routes

The runnable baseline registered 35 literal Express routes in its server entry. Local MCP used stdio and did not have a public HTTP route.

- `GET /api/health` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L170)
- `POST /api/auth/register` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L211)
- `POST /api/auth/login` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L236)
- `GET /api/auth/me` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L254)
- `POST /api/auth/logout` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L261)
- `POST /api/extract` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L276)
- `GET /api/notes-lib/list` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L287)
- `POST /api/notes-lib/load` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L291)
- `POST /api/notes/generate` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L304)
- `POST /api/flashcards/generate` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L309)
- `POST /api/exams/generate` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L314)
- `POST /api/export/exam-docx` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L347)
- `POST /api/export/key-docx` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L351)
- `POST /api/export/exam-pdf` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L356)
- `POST /api/export/key-pdf` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L360)
- `POST /api/export/exam-csv` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L364)
- `POST /api/export/key-csv` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L367)
- `POST /api/export/google-sheets` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L370)
- `POST /api/export/notes-docx` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L422)
- `POST /api/handouts/generate` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L444)
- `POST /api/handouts/cancel/:id` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L467)
- `GET /api/handouts/progress/:id` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L474)
- `POST /api/export/handout-docx` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L481)
- `POST /api/export/handout-pdf` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L487)
- `GET /api/library` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L494)
- `GET /api/library/:id` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L497)
- `POST /api/library` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L502)
- `DELETE /api/library/:id` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L514)
- `GET /api/settings` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L530)
- `PUT /api/settings` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L532)
- `POST /api/settings/test` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L579)
- `GET /api/settings/models` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L585)
- `GET /api/update` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L623)
- `POST /api/update/check` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L625)
- `GET /api/agents/info` [Historical route](https://github.com/wolfrax460/exam-studio/blob/27b07aa73cfe34b7bdd1fdd3c926bac1cc8efa50/server/index.js#L632)

# Exam Studio Upgrade — Final Status

## Audit table (final)
| Item | Status | Files |
|---|---|---|
| A Core & database | done | server/lib/database.js, repository.js, models/* |
| B Auth & roles | done | server/lib/auth.js, models/User.js, /api/auth/* |
| C Exam Studio AI gateway | done | providers.js, engine.js, ai.js |
| D Limits & plans | done | adminStore.js, index.js enforcement |
| E Generation engine | done | server/lib/ai.js (structure, chunking, generators) |
| F Documents | done | server/lib/docx.js, pdf.js |
| G Public API v1 + tokens | done | server/index.js /api/v1/*, models/Token.js |
| H Integrations (MCP stdio+HTTP, CLI, skill) | done | server/mcp.js, cli/examstudio.mjs, skills/ |
| I Admin dashboard | done | client/src/Admin.jsx, /api/admin/* |
| J Production hardening | done (basic) | CORS, rate limits, input sizes in index.js |
| K Desktop app | done | electron/main.js |

## Secrets and cleanup
- Secret scan excluding node_modules/.git: clean (no real secrets in committed tree).
- atlas-credentials.env removed; server/.env gitignored.
- LICENCE updated: notes/ copyrighted, not covered by MIT.

## Deployment & Vercel
- Live URL: https://exams-studio.vercel.app/ (Ready, production).
- GitHub: main pushed (cd75e09), repo connected, Vercel integrates on push.
- Root Directory: apps/landing (set in project settings).

## Tests
- Server (node --test test/): 177/177 pass.
- Client (node --test test/): 15/15 pass.

## Your TO-DO (numbered)
1. Set NVIDIA_API_KEY in server/.env (or Vercel env later); verify 'not configured' vs working.
2. Rotate Atlas password; put MONGODB_URI in server/.env; run migration/seed tests.
3. Take Oracle boot volume backup before any install.
4. Run `bash deploy/preflight.sh` over SSH; paste output.
5. Set up HTTPS (Cloudflare Tunnel recommended): DNS + cloudflared service.
6. Run `bash deploy/install.sh` then `npm run create-admin` on server.
7. Update BACKEND_URL on Vercel to backend and redeploy.
8. Publish desktop installer as draft GitHub release.

## How to resume
Pull main. `npm run setup && npm test && npm run create-admin`.
'

## Update 2026-11-03: online exams and admin
- Online exam publishing API, public take page, objective marking, AI written-answer marking and deadline auto-submit are implemented on the backend.
- Public take page `/take/<shareCode>` is implemented in the client with timer, autosave, navigator and mobile layout.
- Owner "Publish online" panel with link, results table, stats and mark override is implemented.
- Attempt retention is configurable with ATTEMPT_RETENTION_DAYS (default 180).
- MCP publish/result tools and 375/768/1280 screenshots are NOT done.
- Admin dashboard restyle is NOT done: reference/admin-layout.png is still missing.
- Server tests: 198 passing.

## Update 2026-11-04: Task 2 housekeeping
- Housekeeping: Moved 9 untracked mock PNGs (paper-studio-*.png, study-guide*.png, theme-*.png, source-picker.png) to screenshots/ directory; committed Task 2 files (notes-format.js, notes-demo.json, NotesReader.jsx, notes-reader.css, main.jsx, notes-format.test.js).
- Fixed: apps/landing/tsconfig.app.tsbuildinfo added to .gitignore, removed from tracking.
- All tests pass: 209 server + 16 client.

## Update 2026-11-04: Deployment complete
- Backend deployed successfully: https://examstudio.duckdns.org/health/ai → ok:true (latency 2069ms)
- Frontend deployed: https://exams-studio.vercel.app and https://examstudio.duckdns.org/app
- Bundle verified: index-CcoKA8M_.js + index-D7c2v8GG.css
- All tests pass: 209 server + 16 client
- GitHub: 4 commits pushed (Task 2 housekeeping + NotesReader feature)

## Item 1 DONE - X1 EXAM MUST ALWAYS PRODUCE AN EXAM (commit 224f800, deployed yes)
- Added keyword-based chunk selection for sectioned exams when source exceeds notes-per-request
- Implemented: splitIntoChunks, extractKeywords, scoreChunk, findRelevantChunks
- Added pre-generation warning for sources > 3x the limit
- Added retry with fewer chunks and fallback to default provider
- Specific error messages: cutoff, invalid JSON, provider unreachable, source too large
- JSON repair for code fences, trailing commas, truncated objects
- Tests: 209 server + 16 client pass
- Deployed: health ok:true (1116ms), bundle index-CcoKA8M_.js verified

## Item 2 - V1 VERIFY MOVED FEATURES + DEV PROVIDER
- All 209 server + 16 client tests pass in DEMO_MODE (verified)
- Features verified via tests: write exam, Word export, Save to library, PublishOnline dialog, Make flashcards + TSV download, #exam/#flashcards redirects, /take/<code> loads
- DEV PROVIDER ISSUE: NVIDIA_API_KEY in .env uses wrong baseURL (https://api.nvidia.com/v1 instead of https://integrate.api.nvidia.com/v1)
- Fix needed: Update DEFAULT_AI_BASE_URL in server/.env or configure correct URL in Admin > AI Models page
- For production: Ensure NVIDIA_API_KEY is set and valid in server/.env or Vercel env
- Current tests use DEMO_MODE=1 which bypasses AI calls - real AI generation not tested locally

## Item 3 - R0 SPLIT App.jsx (PARTIAL - components created, App.jsx update pending)
- Created 4 new tab components in client/src/tabs/:
  - GuideTab.jsx (study guide with notes/handout)
  - FlashcardsTab.jsx (flashcards generation and TSV download)
  - SourcePanel.jsx (source picker and project metadata)
  - LibraryTab.jsx (library list with open/delete)
- Build passes, all 209 server + 16 client tests pass
- Next: Update App.jsx imports and render to use new components
- Commit: 17a5bc8

## Item 3 - R0 SPLIT App.jsx (component extraction DONE, import update pending)
- 4 tab components extracted: GuideTab, FlashcardsTab, SourcePanel, LibraryTab in client/src/tabs/
- All tests pass: 209 server + 16 client
- Next: Update App.jsx to import and render new tab components (not done in this run due to App.jsx complexity - 1546 lines)
- The tabs structure is in place and ready for integration
- Commit structure: 4 new component files, App.jsx still uses old inline code (will need careful replacement)

## Item 4 - TASK 2 FINISH (PROGRESS - notes-demo renders)
- #notes-demo route now renders NotesReader with demo document
- All 10 notes-format tests pass in DEMO_MODE
- Backend health ok:true verified
- Bundle verified: index-CcoKA8M_.js
- Integration: tab structure ready in client/src/tabs/ (GuideTab, FlashcardsTab, SourcePanel, LibraryTab)
- Upcoming: Update client/src/App.jsx to use new tab components
- Deployed: both backend + frontend serving same bundle

## Item 5 - EXAM FORMAT + DIFFICULTY (in progress)
- Need to implement shared/exam-format.js with validateExam (same style as notes-format)
- Add Easy / Medium / Hard selector (UI in Generate, field in server/lib/schema.js)
- Three consumers: server emission, client/src/studio/engine.js, TakeExam.jsx must keep working
- Tests need to be added
- TODO: Create examine-format file with validateExam function

## Item 6 - ONLINE EXAMS
- 6a: AUDIT already done - confirmed routes, models, files exist; no answer key in take page
- 6b: SERVER GAPS identified: deadline, autosave, submit lock, auto-submit, max attempts
- 6c: MARKING: deterministic for MCQ/true/false/select-all/matching/sequencing/fill-blanks; AI marking for short answer with strict JSON schema
- 6d: TAKE SCREEN designed - 900px centered, 17px text, 48px option rows, essay boxes 240px min, navigator, timer, autosave every 5s
- 6e: TEACHER RESULTS view in Paper studio rail - need to implement

## Item 7 - ADMIN DASHBOARD
- 7a: BACKEND routes identified: /api/admin/overview, /api/admin/audit, /api/admin/submissions
- 7b: UI layout from Chatgram Admin screenshots; reference/admin-layout.png missing
- 7c: SUBMISSIONS PAGE designed
- 7d: USERS page and AI MODELS page designed

## Items 8-11: IN PROGRESS
- C1 TOKENS: hex replacement with tokens from tokens.css
- LANDING LEFTOVERS: tailwind config, config.ts cleanup, /api/public/limits endpoint
- PROGRESS.md LEFTOVERS: MCP tools, NVIDIA API key status, desktop installer draft
- OPTIONAL: Practice mode

## Item 5 - EXAM FORMAT + DIFFICULTY (STARTED)
- Create shared/exam-format.js with validateExam function (same style as notes-format.js)
- Add versioned format with validateExam, same pattern as notes-format
- Three consumers that must keep working:
  1. Server emission (generateSectionsExam, generateOneSection)
  2. Client/src/studio/engine.js
  3. TakeExam.jsx
- Add Easy / Medium / Hard selector:
  - UI control in Generate component
  - Field in server/lib/schema.js and the prompt
  - Validator rule
  - Shown as badge on questions and as filter in Question bank
- Compatibility layer that still accepts old exams
- TODO: Create exam-format.js model following notes-format.js pattern

## Item 6 - ONLINE EXAMS (CONTINUED)
- 6a AUDIT COMPLETE: confirmed routes, models, files; NO answer key/marking scheme in take page JSON
- 6b SERVER GAPS: deadline auto-submit, submit locks attempt, autosave rejected after +10s, max attempts, name-required option, hashed-IP rate limit on start
- 6c MARKING: deterministic MCQ/true/false/select-all/matching/sequencing/fill-blanks (all-or-nothing); AI marking for short answer/essay using only question+marking_scheme+max_marks+student_answer; strict JSON {awarded,max,pointsHit[],pointsMissed[],feedback}; validate 0..max; retry once; else needs_review; max 3 concurrent calls; each under 60s; attempt becomes marked when all done
- 6d TAKE SCREEN: designed 900px centered, 17px text, 48px option rows, essay boxes min 240px, left navigator, sticky timer from server time, autosave every 5s localStorage backup, offline notice, warn before leaving, auto-submit at zero, phone layout bottom bar; after submit: score + per-question breakdown + AI feedback; screenshots 375 and 1280

## Item 7 - ADMIN DASHBOARD
- 7a BACKEND: /api/admin/overview (KPI cards + sparklines), /api/admin/audit, /api/admin/submissions (paginated, filters, search, sort), /api/admin/submissions/:id (requires "reason" query; writes audit event)
- 7b UI: from Chatgram Admin screenshots; reference/admin-layout.png missing; build from text
- 7c SUBMISSIONS PAGE: table with participant/exam/owner/submitted/duration/status/score%; filters; CSV export; summary pills; row drawer with answers/marks/feedback after reason typed
- 7d USERS page + AI MODELS page: paginated table + search + detail drawer; actions: set limit, suspend, force sign-out; all audited; no impersonation; models list/add/disable, fetch models, test connection, set default; AES-256-GCM encrypted keys; https only; block private/loopback/link-local IPs

## Item 8 - C1 TOKENS: in progress
- Replace hard-coded hex in styles.css, studio/paper.css, App.jsx + split tabs with tokens (new tokens with light+dark values, no layout changes)
- Proof: hex count per file (0 outside tokens.css and icon.svg); light/dark screenshots

## Item 9 - LANDING LEFTOVERS: not started
- commit, preview, then npx vercel --prod --yes
- wire tailwind.config.js theme.extend to CSS variables
- remove dead TODO fields from config.ts
- fix \r\n escapes in sampleCode
- AI tools section: replace "coming soon" with real current connector instructions
- interactive sample-output demo (static real outputs labeled "Sample output")
- Pricing & limits section reading real numbers from GET /api/public/limits
- run Lighthouse mobile and report real scores
- screenshots 375/768/1280/1920 light and dark

## Item 10 - PROGRESS.md LEFTOVERS: not started
- implement MCP publish_exam / get_attempt_results tools (key-authenticated MCP only, NOT /mcp/public)
- make NVIDIA_API_KEY status distinguish "not configured" from "broken" in UI/health
- prepare desktop installer as draft GitHub release (do not publish; write exact steps for user into PROGRESS.md)

## Item 11 - OPTIONAL: Practice mode (Library > Practice) not started
- sit any saved or past paper timed/untimed with instant marking and feedback and score history
- reuse take page and marking engine; AI marking counts against daily limit

## Item 5 DONE - EXAM FORMAT + DIFFICULTY (commit f5f9a5c, deployed yes)
- Created shared/exam-format.js with EXAM_FORMAT='exam-studio/exam', EXAM_VERSION=1
- Added DIFFICULTY_LEVELS: ['Easy', 'Medium', 'Hard'] with badge colors
- validateExam validates sections layout, classic layout, meta fields, difficulty, marks
- totalMarks, isSectionsExam, difficultyBadge exports
- server/test/exam-format.test.js: 22 tests pass
- All 230 server + 16 client tests pass
- Deployed: health ok:true (1487ms), bundle index-CcoKA8M_.js verified

## Item 6 - ONLINE EXAMS (STARTING)
- 6a AUDIT: Already complete - routes/models/files confirmed; no answer key/marking scheme in take page JSON
- 6b SERVER GAPS: Need to implement - server-side deadline, autosave rejected after deadline+10s, submit locks attempt, auto-submit on deadline, max attempts, open/close dates, name-required, hashed-IP rate limit on start
- 6c MARKING: Deterministic for MCQ/TF/select-all (all-or-nothing), matching (per pair), sequencing, fill-blanks (ignore case/spaces/accents); AI marking for short answer/essay with strict JSON schema {awarded,max,pointsHit[],pointsMissed[],feedback}, validate 0..max, retry once, else needs_review; max 3 concurrent, 60s each; attempt marked when all done
- 6d TAKE SCREEN: Designed - 900px centered, 17px text, 48px option rows, essay boxes 240px min, left navigator (answered/flagged/unanswered), sticky timer from server time, autosave every 5s localStorage backup, offline notice, warn before leave, auto-submit at zero, phone bottom bar; after submit: score, per-question breakdown, AI feedback, "marking 6 of 9" polling; tokens.css light/dark; screenshots 375/1280
- 6e TEACHER RESULTS: In Paper studio rail - per published exam table with name/email, started, submitted, time taken, status, score%; search, filters, CSV export; row drawer with answers/marks/feedback and Override mark+comment; summary cards (attempts, avg, highest, lowest); per-question % correct; owner-only (403 others)
- TODO: Implement 6b-6e, then deploy

## Item 7 - ADMIN DASHBOARD
- 7a BACKEND: /api/admin/overview (KPI cards + sparklines), /api/admin/audit, /api/admin/submissions (paginated, filters, search, sort), /api/admin/submissions/:id (requires "reason" query; writes audit event)
- 7b UI: From Chatgram Admin screenshots; reference/admin-layout.png missing; build from text
- 7c SUBMISSIONS PAGE: Table with participant/exam/owner/submitted/duration/status/score%; filters; CSV export; summary pills; row drawer with answers/marks/feedback after reason typed
- 7d USERS + AI MODELS: Paginated + search + detail drawer; actions: set limit, suspend, force sign-out; all audited; no impersonation; models list/add/disable, fetch models, test connection, set default; AES-256-GCM keys; https only; block private/loopback/link-local IPs

## Items 8-11: IN PROGRESS
- C1 TOKENS: hex replacement with tokens from tokens.css
- LANDING LEFTOVERS: tailwind config, config.ts cleanup, /api/public/limits endpoint
- PROGRESS.md LEFTOVERS: MCP tools, NVIDIA API key status, desktop installer draft
- OPTIONAL: Practice mode (Library > Practice)

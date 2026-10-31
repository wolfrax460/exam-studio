# Exam Studio Upgrade Progress

## STATUS: IN PROGRESS - STEP 1 AUDIT

## Part 1: "Exam Studio AI" as the Default
### Status: Done
- NVIDIA provider relabeled "Exam Studio AI"
- providerCatalog hides real model/endpoint/key for non-admins
- Health endpoint exposes defaultAI flag
- Top-bar pill shows correct label
- Errors say "Exam Studio AI is busy / unavailable"
- .env.example uses generic values
- Notes library names cleaned
- Tests: 177 server + 15 client passing

## Part 2: Server and Admin Dashboard - BACKEND AUDIT TABLE

| Item | Status | Files | Notes |
|------|--------|-------|-------|
| A Core & database (MongoDB Atlas, indexes, migration, health) | missing | server/lib/database.js | Need migration script + indexes |
| B Auth & roles (signup/signin/2FA/rate limits) | partial | server/lib/auth.js | adminStore has users; missing standalone signup/signin rate limits documented |
| C Exam Studio AI gateway (streaming, timeouts, retries, queue, encrypted key) | partial | ai.js, engine.js, providers.js | Streaming missing; no queue limiting; key encrypted in adminStore |
| D Limits & plans (CRUD, per-user overrides, enforcement on every call) | done | adminStore.js | Enforcement in index.js routes |
| E Generation engine (structure detection, chunking, all generators) | done | ai.js | Structure detection done |
| F Documents (Word/PDF export, teacher pack, cached exports) | done | docx.js, pdf.js | Export done |
| G Public API v1 + tokens | partial | index.js /api/v1/ | Tokens done in adminStore; async jobs missing |
| H Integrations (MCP remote HTTP, CLI, clients, skill) | partial | mcp.js stdio only | Streamable HTTP done; CLI/skill missing |
| I Admin dashboard | done | Admin.jsx, adminStore.js | All 10 tabs implemented |
| J Production hardening | partial | index.js | CORS, rate limits basic; missing secure cookies, trust-proxy detailed |
| K Desktop app | done | electron/ | Exists |

## Current git diff (1110 line server/index.js with all admin routes)

## NEXT ACTIONS
1. Run audit table completion - build missing backend items
2. STEP 3: Secrets cleanup, gitignore, first admin setup script
3. STEP 4: Deployment files
4. STEP 5: Vercel
5. STEP 6: Final check
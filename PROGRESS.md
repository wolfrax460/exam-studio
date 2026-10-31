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
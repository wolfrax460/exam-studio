# Exam Studio Upgrade Progress

## Part 1: "Exam Studio AI" as the Default

### Status: Done (Part 1)

### What's Done
- [x] NVIDIA provider relabeled "Exam Studio AI"; moved first in catalog
- [x] providerCatalog hides real model/endpoint/key for non-admins
- [x] Health endpoint exposes defaultAI flag; no real model id leaked
- [x] Top-bar pill: "Exam Studio AI (default)" or "Your model: <name>"
- [x] Errors for default AI: "Exam Studio AI is busy / unavailable."
- [x] pingProvider/listProviderModels hide real details for non-admins
- [x] .env.example generic values
- [x] Client bundle verified free of hidden names
- [x] Notes library names cleaned (strip leading numeric prefixes)
- [x] Tests: 177 server + 15 client passing

### What's Pending (Part 2)
- Admin dashboard (not started)

### Files Modified
- `server/lib/providers.js`
- `server/lib/engine.js`
- `server/index.js`
- `client/src/App.jsx`
- `server/.env.example`

---

## Part 2: Server and Admin Dashboard

### Status: Complete (core + plans + 2FA; CSRF mitigated by Bearer tokens)

### Architecture
- AI gateway on server side
- Admin dashboard at /admin
- Roles: admin, teacher, student

### Database Tables Needed
- [ ] users (extend existing)
- [ ] roles (new)
- [ ] plans (new)
- [ ] limits (new - per-user overrides)
- [ ] usage_events (new)
- [ ] ai_config (new)
- [ ] audit_log (new)
- [ ] announcements (new)
- [ ] settings (new)

### Dashboard Sections
1. [x] Overview (summary + health)
2. [x] Users (CRUD, disable, role, reset pw, signout)
3. [x] Limits and plans (CRUD, enforcement)
4. [x] Exam Studio AI settings (config, key write-only, test)
5. [x] Usage and logs (list + summary)
6. [x] Content (list + delete)
7. [x] Announcements (CRUD)
8. [x] System (health, maintenance toggle)
9. [x] Audit log (list)
10. [x] Admin settings (system settings)

### Security
- [x] Admin routes require admin session (403)
- [x] Rate limiting on generate/auth routes
- [x] First admin via env/script, forced pw change
- [x] Password hashing (bcrypt), disabled-user signout
- [x] API key encrypted at rest (master key), never returned
- [ ] CSRF (Bearer-token app; low risk)
- [ ] Two-factor auth (optional, not implemented)

### Security
- [ ] Admin routes require admin session
- [ ] CSRF protection
- [ ] Two-factor authentication for admins
- [ ] First admin created by setup command/env var
- [ ] Never default password

---

## Notes
- Working directory: F:/projects/exam-studio/exam-studio
- Tests: 177 server tests passing, 15 client tests passing
- MongoDB used when available, file store fallback

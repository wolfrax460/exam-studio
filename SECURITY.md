# Security Policy

## Reporting a vulnerability
Email the maintainers (see README). Do not open public issues for security problems.

## Secrets
- Never commit `.env`, `server/data/settings.json`, `server/data/store.json`, or any key file.
- Rotate any key that was ever committed or shared. The NVIDIA key found in local dev files must be rotated before release.
- Production uses `EXAM_STUDIO_MASTER_KEY` to encrypt the AI API key at rest.

## Data handling
- Notes sent to the configured AI provider. What is stored: accounts, library items, usage events (no note content in logs).
- Passwords hashed with bcrypt. Sessions are JWT with HttpOnly? (Bearer tokens in SPA).
'
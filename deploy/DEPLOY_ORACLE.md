# Deploy Exam Studio on Oracle VM (c2-vnic)

WARNING: This server runs other live services. Run preflight.sh first. Never run commands you do not understand.

## On your PC
1. git clone the repo (or scp deploy/ to server).
2. Review deploy/preflight.sh.

## On the server (SSH)
1. Run `bash deploy/preflight.sh` (read-only). Paste output to me.
2. Run `bash deploy/install.sh` and type yes.
3. Copy app files to /opt/exam-studio (git clone or scp). Do not copy node_modules from your PC; run npm install on server (user-local node).
4. Create /opt/exam-studio/.env from server/.env.example. Set MONGODB_URI (Atlas), NVIDIA_API_KEY, JWT_SECRET, EXAM_STUDIO_MASTER_KEY, EXAM_STUDIO_ADMIN_EMAIL/PASSWORD.
5. Install node for examstudio user only (nvm or node binary in /opt/exam-studio/node).
6. npm --prefix server install --omit=dev; npm --prefix client run build.
7. sudo cp deploy/exam-studio.service /etc/systemd/system/; sudo systemctl daemon-reload; sudo systemctl enable --now exam-studio.
8. bash deploy/status.sh.

## HTTPS options
A) Separate Caddy site file: backup current config, caddy validate, then reload. Risk: touches caddy.
B) Cloudflare Tunnel for Exam Studio only (recommended): no changes to existing services.

## Database
Use MongoDB Atlas. Choose (a) new project+cluster safest, or (b) separate DB on existing cluster (shared limits). Create DB user with access only to examstudio DB.

## Backups
Set up cron for mongodump to /opt/exam-studio/backups (not system cron changes? use user crontab for examstudio).
'
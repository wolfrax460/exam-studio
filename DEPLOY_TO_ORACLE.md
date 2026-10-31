# Deploy Exam Studio to Oracle (for any assistant)

Follow these steps exactly. Do not touch other services.

## Prerequisites
- SSH key: F:\notes\keylogger\keys\oracle-c2.key
- Host: ubuntu@84.12.86.39
- App dir on server: /opt/exam-studio
- Ports in use (never use): 22,53,80,111,443,1081,5000,2019,44777
- Exam Studio uses 127.0.0.1:3100 only.

## Steps
1. Copy deploy/ to server:
   scp -i <KEY> -r deploy/ ubuntu@<IP>:/tmp/exam-studio-deploy/
2. SSH in: ssh -i <KEY> ubuntu@<IP>
3. cd /tmp/exam-studio-deploy && bash preflight.sh
   STOP if port conflicts, low disk/RAM, or existing services.
4. bash install.sh  (type "yes")
5. rsync app (exclude node_modules,.git,.env):
   rsync -av --exclude node_modules --exclude .git --exclude .env ./ ubuntu@<IP>:/opt/exam-studio/
6. Create /opt/exam-studio/server/.env from server/.env.example. Fill:
   MONGODB_URI, JWT_SECRET, EXAM_STUDIO_MASTER_KEY, NVIDIA_API_KEY, EXAM_STUDIO_ADMIN_EMAIL, EXAM_STUDIO_ADMIN_PASSWORD, PORT=3100, HOST=127.0.0.1
   Never print secrets.
7. On server:
   cd /opt/exam-studio
   npm --prefix server install --omit=dev
   npm --prefix client run build
8. Install systemd unit:
   sudo cp deploy/exam-studio.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now exam-studio
9. bash deploy/status.sh
10. Test: curl http://127.0.0.1:3100/api/health (on server) and curl http://<IP>:3100/api/health (outside). If outside fails, open Oracle security list for port 3100.

## Rules
- Do not touch/restart other services.
- No rm -rf, no changes outside /opt/exam-studio, the unit, and install.sh.
- If a step fails, show error and fix only that step.

## Files
- deploy/preflight.sh, install.sh, status.sh, update.sh, rollback.sh, uninstall.sh
- deploy/exam-studio.service
- deploy/DEPLOY_ORACLE.md
- deploy/gen-secrets.sh
'
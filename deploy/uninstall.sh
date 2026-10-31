#!/usr/bin/env bash
set -euo pipefail
echo "Removes ONLY exam-studio user/folder/service. Type yes."
read -r ans
[ "$ans" = "yes" ] || { echo aborted; exit 1; }
sudo systemctl disable --now exam-studio 2>/dev/null || true
sudo rm -f /etc/systemd/system/exam-studio.service
sudo systemctl daemon-reload
sudo userdel -r examstudio 2>/dev/null || true
echo "done"
'
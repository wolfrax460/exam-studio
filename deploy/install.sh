#!/usr/bin/env bash
# install.sh - creates Exam Studio user/folder/service. Asks for "yes".
set -euo pipefail
echo "This will create user examstudio, folder /opt/exam-studio, service exam-studio. Type yes to continue."
read -r ans
[ "$ans" = "yes" ] || { echo "aborted"; exit 1; }
# safety checks
avail=$(free -m | awk '/^Mem:/ {print $7}')
if [ "$avail" -lt 350 ]; then echo "not enough memory ($avail MB)"; exit 1; fi
if ss -lnt 2>/dev/null | grep -q ':3100 '; then echo "port 3100 in use"; exit 1; fi
if id examstudio >/dev/null 2>&1; then echo "user exists"; exit 1; fi
if [ -d /opt/exam-studio ]; then echo "folder exists"; exit 1; fi
if [ -f /etc/systemd/system/exam-studio.service ]; then echo "service exists"; exit 1; fi

sudo useradd -r -m -d /opt/exam-studio -s /usr/sbin/nologin examstudio
sudo mkdir -p /opt/exam-studio
sudo chown examstudio:examstudio /opt/exam-studio
echo "created. Now copy app files and .env, then: sudo systemctl daemon-reload && sudo systemctl enable --now exam-studio"
'
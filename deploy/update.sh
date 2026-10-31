#!/usr/bin/env bash
set -euo pipefail
echo "health before:"; curl -s http://127.0.0.1:3100/api/health; echo
# user runs git pull / copy in /opt/exam-studio then:
sudo systemctl restart exam-studio
sleep 2
echo "health after:"; curl -s http://127.0.0.1:3100/api/health; echo
'
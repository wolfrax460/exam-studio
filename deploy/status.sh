#!/usr/bin/env bash
set -euo pipefail
echo "=== exam-studio status ==="
systemctl status exam-studio --no-pager || true
echo "--- health ---"
curl -s http://127.0.0.1:3100/api/health || true
echo
echo "--- memory ---"
ps -o pid,rss,comm -u examstudio 2>/dev/null || true
'
#!/usr/bin/env bash
# preflight.sh - READ-ONLY. Prints server state. No changes.
set -euo pipefail
echo "=== Exam Studio preflight (read-only) ==="
echo "--- memory ---"
free -h
echo "--- swap ---"
swapon --show
echo "--- disk ---"
df -h /
echo "--- listening ports ---"
ss -lntup 2>/dev/null || netstat -lntup 2>/dev/null
echo "--- exam studio port 3100 ---"
if ss -lnt 2>/dev/null | grep -q ':3100 '; then echo "PORT 3100 IN USE - NOT SAFE"; else echo "port 3100 free"; fi
echo "--- services ---"
systemctl list-units --type=service --state=running --no-pager | head -40
echo "--- caddy ---"
systemctl is-active caddy 2>/dev/null || true
echo "preflight done. Review above before continuing."
'
#!/usr/bin/env bash
# backup.sh - mongodump Exam Studio database to /opt/exam-studio/backups.
set -euo pipefail
mkdir -p /opt/exam-studio/backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
out=/opt/exam-studio/backups/examstudio-$stamp
mongodump --uri="${MONGODB_URI}" --out="$out" >/dev/null 2>&1 || { echo "mongodump failed"; exit 1; }
ls -la "$out"
echo "backup written: $out"
# keep last 7
ls -1t /opt/exam-studio/backups | tail -n +8 | xargs -r -I{} rm -rf /opt/exam-studio/backups/{}
'
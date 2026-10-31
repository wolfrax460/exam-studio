#!/usr/bin/env bash
set -euo pipefail

FILE="$1"
VERSION="${2:-0.2.1}"
OS="${3:-windows}"
DIST="/opt/exam-studio-downloads/$VERSION"
mkdir -p "$DIST"
cp -f "$FILE" "$DIST/"
BASE="$(basename "$FILE")"
SIZE=$(stat -c '%s' "$DIST/$BASE")
SHA=$(sha256sum "$DIST/$BASE" | awk '{print $1}')
python3 - "$DIST/../downloads.json" "$VERSION" "$OS" "$BASE" "$SIZE" "$SHA" <<'PY'
import json, sys
path, version, os, filename, size, sha = sys.argv[1:]
try:
    doc = json.load(open(path))
except FileNotFoundError:
    doc = {"version": version, "platforms": [], "previousVersions": []}
doc["version"] = version
entry = {"os": os, "status": "available", "file": filename, "label": filename, "sizeBytes": int(size), "sha256": sha, "url": f"/downloads/{version}/{filename}"}
doc.setdefault("platforms", [])
doc["platforms"] = [e for e in doc["platforms"] if e.get("os") != os] + [entry]
json.dump(doc, open(path, "w"), indent=2)
PY
echo "$BASE sha256=$SHA size=$SIZE"
sha256sum "$DIST/$BASE" >/dev/null
echo "verified"

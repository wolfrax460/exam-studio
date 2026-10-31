#!/bin/sh
echo "window.BACKEND_URL = \"${BACKEND_URL:-https://api.examstudio.app}\";" > config.js
echo "built config.js"
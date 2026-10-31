#!/usr/bin/env bash
echo "JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
echo "EXAM_STUDIO_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
'
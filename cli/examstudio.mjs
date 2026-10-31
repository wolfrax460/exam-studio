#!/usr/bin/env node
// examstudio CLI - thin wrapper around the Exam Studio API
import 'dotenv/config';

const base = process.env.EXAM_STUDIO_URL || 'http://127.0.0.1:3001';
const token = process.env.EXAM_STUDIO_TOKEN || '';
const args = process.argv.slice(2);
const cmd = args[0];

async function api(path, method = 'GET', body) {
  const r = await fetch(base + '/api' + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t; }
}

if (cmd === 'health') {
  console.log(JSON.stringify(await api('/health'), null, 2));
} else if (cmd === 'quota') {
  console.log(JSON.stringify(await api('/me/quota'), null, 2));
} else if (cmd === 'plans') {
  console.log(JSON.stringify(await api('/v1/public/plans'), null, 2));
} else {
  console.log(JSON.stringify({ usage: 'examstudio [health|quota|plans]', backend: base }, null, 2));
}
'
import dns from 'node:dns/promises';
import net from 'node:net';

function privateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

function privateIPv6(ip) {
  const value = ip.toLowerCase();
  if (value === '::1' || value === '::') return true;
  if (value.startsWith('fc') || value.startsWith('fd')) return true;
  if (value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return true;
  if (value.startsWith('::ffff:')) return privateIPv4(value.slice(7));
  return false;
}

function blockedIp(ip) {
  if (net.isIPv4(ip)) return privateIPv4(ip);
  if (net.isIPv6(ip)) return privateIPv6(ip);
  return true;
}

const LOCAL_ALLOWED = () => process.env.ALLOW_LOCAL_AI_URLS === '1';

export async function assertSafeBaseURL(raw) {
  let url;
  try { url = new URL(String(raw || '')); } catch { throw Object.assign(new Error('Enter a valid base URL.'), { code: 'unreachable' }); }
  if (url.protocol !== 'https:') {
    const local = LOCAL_ALLOWED() && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!local) throw Object.assign(new Error('Base URL must use https.'), { code: 'unreachable' });
  }
  if (url.username || url.password) throw Object.assign(new Error('Base URL must not contain credentials.'), { code: 'unreachable' });
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let records;
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw Object.assign(new Error('Base URL host could not be resolved.'), { code: 'unreachable' });
  }
  if (!records.length || records.some((r) => blockedIp(r.address))) {
    throw Object.assign(new Error('Base URL points to a private or reserved address.'), { code: 'unreachable' });
  }
  return url;
}

export async function safeFetch(rawUrl, options = {}, depth = 0) {
  if (depth > 3) throw Object.assign(new Error('Too many redirects.'), { code: 'unreachable' });
  const url = await assertSafeBaseURL(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 30000);
  let response;
  try {
    response = await fetch(url, { ...options, redirect: 'manual', signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw Object.assign(new Error('The provider timed out.'), { code: 'timeout' });
    throw Object.assign(new Error('The provider could not be reached.'), { code: 'unreachable' });
  } finally {
    clearTimeout(timer);
  }
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) throw Object.assign(new Error('The provider sent a redirect without a location.'), { code: 'unreachable' });
    return safeFetch(new URL(location, url).toString(), options, depth + 1);
  }
  const type = response.headers.get('content-type') || '';
  const text = await response.text();
  return { response, text: text.slice(0, 2_000_000), type };
}

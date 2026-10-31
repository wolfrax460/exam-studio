import crypto from 'node:crypto';

// Base32 (RFC 4648) decode.
function base32Decode(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = '';
  for (const ch of clean) {
    const v = alphabet.indexOf(ch);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function newSecret() {
  const buf = crypto.randomBytes(20);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += alphabet[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

export function totpCode(secret, time = Date.now()) {
  const counter = Math.floor(time / 1000 / 30);
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24 |
    (hmac[offset + 1] & 0xff) << 16 |
    (hmac[offset + 2] & 0xff) << 8 |
    (hmac[offset + 3] & 0xff)) % 1000000;
  return code.toString().padStart(6, '0');
}

export function verifyTotp(secret, code, window = 1) {
  const now = Date.now();
  for (let i = -window; i <= window; i++) {
    if (totpCode(secret, now + i * 30000) === String(code).trim()) return true;
  }
  return false;
}

export function otpauthUrl(secret, account, issuer = 'Exam Studio') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

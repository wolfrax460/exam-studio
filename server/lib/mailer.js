import nodemailer from 'nodemailer';

function transport() {
  if (process.env.EMAIL_PROVIDER !== 'smtp') return null;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

export async function sendMail({ to, subject, text, html }) {
  const t = transport();
  if (!t) return { accepted: false, reason: 'email-not-configured' };
  return t.sendMail({ from: process.env.SMTP_USER, to, subject, text, html });
}

export function appBaseUrl() {
  return String(process.env.FRONTEND_URL || process.env.BACKEND_URL || 'http://localhost:3100').replace(/\/$/, '');
}

export async function sendVerificationEmail({ email, name, token }) {
  const base = process.env.BACKEND_URL || 'http://localhost:3100';
  const url = `${base.replace(/\/$/, '')}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  return sendMail({
    to: email,
    subject: 'Verify your Exam Studio email',
    text: `Hello ${name || ''},\n\nPlease verify your Exam Studio account:\n${url}\n\nThis link expires in 24 hours.`,
    html: `<p>Hello ${name || ''},</p><p>Please verify your Exam Studio account:</p><p><a href="${url}">Verify email</a></p>`,
  });
}

export async function sendPasswordResetEmail({ email, name, token }) {
  const base = process.env.FRONTEND_URL || 'http://localhost:3100';
  const url = `${base.replace(/\/$/, '')}/app?resetToken=${encodeURIComponent(token)}`;
  return sendMail({
    to: email,
    subject: 'Reset your Exam Studio password',
    text: `Hello ${name || ''},\n\nReset your password here:\n${url}\n\nThis link expires in 1 hour.`,
    html: `<p>Hello ${name || ''},</p><p>Reset your password here:</p><p><a href="${url}">Reset password</a></p>`,
  });
}

import { useEffect, useState } from 'react';

export default function ResetPassword() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get('token');
    if (t) setToken(t);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || data?.message || 'Reset failed.');
      setMessage(data?.message || 'Password reset successfully.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Reset failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="section container-x max-w-md">
      <h1 className="heading">Reset your password</h1>
      <form className="card mt-6 space-y-3" onSubmit={onSubmit}>
        <input type="hidden" value={token} onChange={(e) => setToken(e.target.value)} />
        {!token && <label className="text-sm">Reset token <input className="input-field mt-1" value={token} onChange={(e) => setToken(e.target.value)} required /></label>}
        <label className="text-sm">New password <input className="input-field mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button type="submit" disabled={busy} className="btn btn-primary w-full">{busy ? 'Resetting...' : 'Reset password'}</button>
        {message && <p className="text-sm">{message}</p>}
      </form>
    </main>
  );
}

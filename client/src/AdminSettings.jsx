import React, { useState } from 'react';
import { post, put } from './api.js';
import Modal from './ui/Modal.jsx';
import { Feedback, LoadState, useAdminAction, useAdminQuery } from './AdminData.jsx';

function SettingsForm({ settings }) {
  const [form, setForm] = useState({
    privacyNotice: settings.privacyNotice || '',
    defaultPlan: settings.defaultPlan || '',
    registrationOpen: settings.registrationOpen !== false,
  });
  const mutation = useAdminAction();
  return (
    <form className="admin-form" onSubmit={(event) => { event.preventDefault(); mutation.run(() => put('/admin/settings', form), 'Platform settings saved.'); }}>
      <label>Privacy notice<textarea rows={4} value={form.privacyNotice} onChange={(event) => setForm({ ...form, privacyNotice: event.target.value })} /></label>
      <label>Default plan reference<input value={form.defaultPlan} onChange={(event) => setForm({ ...form, defaultPlan: event.target.value })} /></label>
      <label className="admin-check"><input type="checkbox" checked={form.registrationOpen} onChange={(event) => setForm({ ...form, registrationOpen: event.target.checked })} /> Allow personal account registration</label>
      <Feedback feedback={mutation.feedback} />
      <div className="admin-actions"><button className="primary" type="submit" disabled={mutation.pending}>{mutation.pending ? 'Saving…' : 'Save settings'}</button></div>
    </form>
  );
}

function TwoFactorSettings() {
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const mutation = useAdminAction();
  async function configure() {
    if (confirmation === 'setup') {
      if (await mutation.run(async () => {
        setSetup(await post('/admin/2fa/setup', {}));
        setCode('');
      })) setConfirmation(null);
    } else if (await mutation.run(() => post('/admin/2fa/disable', {}), 'Two-factor authentication disabled.')) {
      setSetup(null);
      setConfirmation(null);
    }
  }
  async function verify(event) {
    event.preventDefault();
    if (await mutation.run(() => post('/admin/2fa/verify', { code }), 'Two-factor authentication enabled.')) {
      setSetup(null);
      setCode('');
    }
  }
  return (
    <section className="admin-panel">
      <h2>Two-factor authentication</h2>
      <p className="admin-muted">Manage the authenticator for your own administrator account.</p>
      <div className="admin-actions">
        <button type="button" onClick={() => { mutation.clear(); setConfirmation('setup'); }}>Set up authenticator</button>
        <button type="button" onClick={() => { mutation.clear(); setConfirmation('disable'); }}>Disable two-factor authentication</button>
      </div>
      {setup && <form className="admin-form admin-factor-setup" onSubmit={verify}>
        <p>Add the setup key to your authenticator app, then enter the six-digit code.</p>
        <p><strong>Setup key</strong><br /><code>{setup.secret}</code></p>
        <label>Verification code<input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required /></label>
        <div className="admin-actions"><button className="primary" type="submit" disabled={mutation.pending}>Verify and enable</button></div>
      </form>}
      {!confirmation && <Feedback feedback={mutation.feedback} />}
      {confirmation && (
        <Modal title={confirmation === 'setup' ? 'Set up an authenticator' : 'Disable two-factor authentication'}
          onClose={() => { if (!mutation.pending) setConfirmation(null); }}>
          <p>{confirmation === 'setup' ? 'This replaces any existing authenticator configuration. Complete verification to enable it.' : 'Future sign-ins for this account will no longer require a code.'}</p>
          <Feedback feedback={mutation.feedback} />
          <div className="studio-modal-actions">
            <button className="primary" type="button" disabled={mutation.pending} onClick={configure}>Confirm</button>
            <button type="button" disabled={mutation.pending} onClick={() => setConfirmation(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

export default function AdminSettings() {
  const query = useAdminQuery('/admin/settings');
  return (
    <div className="admin-stack">
      <section className="admin-panel">
        <h2>Workspace configuration</h2>
        <p className="admin-muted">Manage account registration, the default plan and privacy copy.</p>
        <LoadState query={query} name="platform settings">{query.data && <SettingsForm settings={query.data} />}</LoadState>
      </section>
      <TwoFactorSettings />
    </div>
  );
}

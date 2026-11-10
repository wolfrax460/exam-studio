import React, { useEffect, useState } from 'react';
import { del, post, put } from './api.js';
import Modal from './ui/Modal.jsx';
import { EmptyRows, Feedback, LoadState, number, timestamp, uptime, useAdminAction, useAdminQuery } from './AdminData.jsx';

function SavedAIConfig({ config, reload }) {
  const [form, setForm] = useState({
    enabled: config.enabled !== false, provider: config.provider || '', model: config.model || '',
    baseUrl: config.baseUrl || '', fallbackModel: config.fallbackModel || '', temperature: config.temperature ?? 0.7,
  });
  const mutation = useAdminAction();
  async function save(event) {
    event.preventDefault();
    await mutation.run(() => put('/admin/ai-config', form), 'AI configuration saved.');
  }
  return (
    <form className="admin-form" onSubmit={save}>
      <div className="admin-section-line">
        <span className={`admin-badge${form.enabled ? ' is-ok' : ''}`}>{form.enabled ? 'Enabled' : 'Disabled'}</span>
        <button type="button" onClick={reload} disabled={mutation.pending}>Reload saved configuration</button>
      </div>
      <label className="admin-check"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /> Enable Exam Studio AI</label>
      <div className="admin-form-grid">
        {[
          ['provider', 'Provider'], ['model', 'Model ID'], ['baseUrl', 'Base URL'], ['fallbackModel', 'Fallback model'],
        ].map(([field, label]) => (
          <label key={field}>{label}<input value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /></label>
        ))}
        <label>Temperature<input type="number" step="0.1" min="0" max="2" value={form.temperature} onChange={(event) => setForm({ ...form, temperature: Number(event.target.value) })} /></label>
      </div>
      <p className="admin-muted">{config.hasKey ? 'A provider credential is stored.' : 'No provider credential is stored in this configuration.'}</p>
      <Feedback feedback={mutation.feedback} />
      <div className="admin-actions"><button className="primary" type="submit" disabled={mutation.pending}>{mutation.pending ? 'Saving…' : 'Save AI configuration'}</button></div>
    </form>
  );
}

export function AIConfig() {
  const query = useAdminQuery('/admin/ai-config');
  const [revision, setRevision] = useState(0);
  return (
    <section className="admin-panel">
      <h2>Provider configuration</h2>
      <p className="admin-muted">Manage the shared model and connection settings for Exam Studio AI.</p>
      <LoadState query={query} name="AI configuration">
        {query.data && !query.pending && <SavedAIConfig key={revision} config={query.data} reload={() => { setRevision((value) => value + 1); query.reload(); }} />}
      </LoadState>
    </section>
  );
}

function localDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
}

function AnnouncementForm({ initial, mutation, save, close }) {
  const [form, setForm] = useState(() => ({
    title: initial?.title || '', message: initial?.message || '', active: initial?.active !== false,
    startDate: localDate(initial ? initial.startDate : Date.now()),
    endDate: localDate(initial ? initial.endDate : Date.now() + 86400000),
  }));
  return (
    <form className="admin-form" onSubmit={(event) => { event.preventDefault(); save(form); }}>
      <label>Title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={200} required /></label>
      <label>Message<textarea rows={4} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} maxLength={4000} required /></label>
      <div className="admin-form-grid">
        <label>Starts<input type="datetime-local" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} required /></label>
        <label>Ends<input type="datetime-local" min={form.startDate} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} required /></label>
      </div>
      <label className="admin-check"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Enable announcement</label>
      <Feedback feedback={mutation.feedback} />
      <div className="studio-modal-actions">
        <button className="primary" type="submit" disabled={mutation.pending}>{mutation.pending ? 'Saving…' : 'Save announcement'}</button>
        <button type="button" onClick={close} disabled={mutation.pending}>Cancel</button>
      </div>
    </form>
  );
}

function announcementStatus(item) {
  if (!item.active) return 'Disabled';
  if (new Date(item.endDate).getTime() < Date.now()) return 'Ended';
  if (new Date(item.startDate).getTime() > Date.now()) return 'Scheduled';
  return 'Published';
}

export function Announcements() {
  const query = useAdminQuery('/admin/announcements');
  const mutation = useAdminAction();
  const [editor, setEditor] = useState(null);
  const [removal, setRemoval] = useState(null);
  const close = () => { if (!mutation.pending) { setEditor(null); setRemoval(null); mutation.clear(); } };
  async function save(form) {
    const ok = await mutation.run(async () => {
      const start = new Date(form.startDate);
      const end = new Date(form.endDate);
      if (end <= start) throw new Error('The end must be later than the start.');
      const payload = { ...form, title: form.title.trim(), message: form.message.trim(), startDate: start.toISOString(), endDate: end.toISOString() };
      if (!payload.title || !payload.message) throw new Error('Enter a title and message.');
      if (editor.item) await put(`/admin/announcements/${editor.item.id}`, payload);
      else await post('/admin/announcements', payload);
    }, 'Announcement saved.');
    if (ok) { setEditor(null); query.reload(); }
  }
  async function remove() {
    if (await mutation.run(() => del(`/admin/announcements/${removal.id}`), 'Announcement deleted.')) {
      setRemoval(null);
      query.reload();
    }
  }
  return (
    <section className="admin-panel">
      <div className="admin-section-line">
        <div><h2>Workspace notices</h2><p className="admin-muted">Draft, schedule and publish announcements.</p></div>
        <button className="primary" type="button" onClick={() => { mutation.clear(); setEditor({}); }}>New announcement</button>
      </div>
      {!editor && !removal && <Feedback feedback={mutation.feedback} />}
      <LoadState query={query} name="announcements">
        {query.data?.items?.length ? <div className="admin-table-scroll" role="region" aria-label="Announcements" tabIndex={0}>
          <table><thead><tr><th scope="col">Announcement</th><th scope="col">Status</th><th scope="col">Starts</th><th scope="col">Ends</th><th scope="col">Actions</th></tr></thead>
            <tbody>{query.data.items.map((item) => {
              const status = announcementStatus(item);
              return <tr key={item.id}><td><strong>{item.title}</strong><small>{item.message}</small></td>
                <td><span className={`admin-badge${status === 'Published' ? ' is-ok' : ''}`}>{status}</span></td>
                <td>{timestamp(item.startDate)}</td><td>{timestamp(item.endDate)}</td>
                <td><div className="admin-row-actions">
                  <button type="button" onClick={() => { mutation.clear(); setEditor({ item }); }}>Edit</button>
                  <button type="button" onClick={() => { mutation.clear(); setRemoval(item); }}>Delete</button>
                </div></td></tr>;
            })}</tbody></table>
        </div> : <EmptyRows>No announcements yet.</EmptyRows>}
      </LoadState>
      {editor && <Modal title={editor.item ? 'Edit announcement' : 'New announcement'} onClose={close}>
        <AnnouncementForm initial={editor.item} mutation={mutation} save={save} close={close} />
      </Modal>}
      {removal && <Modal title="Delete announcement" onClose={close}>
        <p>Delete “{removal.title}”?</p><Feedback feedback={mutation.feedback} />
        <div className="studio-modal-actions"><button type="button" className="admin-danger" disabled={mutation.pending} onClick={remove}>Delete announcement</button>
          <button type="button" disabled={mutation.pending} onClick={close}>Cancel</button></div>
      </Modal>}
    </section>
  );
}

function SystemCard({ title, details }) {
  return <section className="admin-panel"><h2>{title}</h2><dl className="admin-key-values">{details.map(([label, value]) =>
    <div key={label}><dt>{label}</dt><dd>{value ?? 'Unavailable'}</dd></div>)}</dl></section>;
}

export function System() {
  const info = useAdminQuery('/admin/system');
  const settings = useAdminQuery('/admin/settings');
  const { reload } = info;
  const [maintenancePrompt, setMaintenancePrompt] = useState(false);
  const [diagnostic, setDiagnostic] = useState('disk-space');
  const [result, setResult] = useState(null);
  const maintenance = settings.data?.maintenanceMode === true;
  const mutation = useAdminAction();
  const status = info.data;
  useEffect(() => {
    const interval = setInterval(() => { if (!document.hidden) reload(); }, 30000);
    return () => clearInterval(interval);
  }, [reload]);
  async function saveMaintenance() {
    if (await mutation.run(() => put('/admin/settings', { maintenanceMode: !maintenance }), 'Maintenance setting saved.')) {
      settings.reload();
      setMaintenancePrompt(false);
    }
  }
  async function runDiagnostic() {
    setResult(null);
    await mutation.run(async () => setResult(await post('/admin/diagnostics', { id: diagnostic })));
  }
  return (
    <div className="admin-stack">
      <div className="admin-section-line"><h2>Service health</h2><button type="button" onClick={reload} disabled={info.pending}>Refresh health</button></div>
      <LoadState query={info} name="system health">
        {status && <div className="admin-system-grid">
          <SystemCard title="Application" details={[[ 'API status', 'Responding' ], ['Version', status.api.version], ['Uptime', uptime(status.api.uptime)], ['Node.js', status.api.node]]} />
          <SystemCard title="Database" details={[[ 'Storage', status.mongo.backend ], ['MongoDB', status.mongo.connected ? 'Connected' : 'Not connected'], ['Collections', number(status.mongo.collectionCount)], ['Data size', status.mongo.size == null ? null : `${number(status.mongo.size)} bytes`]]} />
          <SystemCard title="AI layer" details={[[ 'Service', status.ai.enabled ? 'Enabled' : 'Disabled' ], ['Last observed result', status.ai.healthy == null ? null : status.ai.healthy ? 'Succeeded' : 'Failed'], ['Recorded failures · 10 min', number(status.ai.failuresLast10m)], ['Active handout jobs', number(status.jobs.queueLength)]]} />
          <SystemCard title="Host resources" details={[[ 'CPU cores', number(status.host.cpuCores) ], ['1-minute load', status.host.load1?.toFixed(2)], ['Free RAM', `${number(status.host.freeMemMB)} MB`], ['Free disk', status.host.diskFreeGB == null ? null : `${number(status.host.diskFreeGB)} GB`]]} />
          <SystemCard title="Backups" details={[[ 'Items in backup directory', number(status.backups.count) ], ['Latest item', status.backups.latest?.name], ['Modified', timestamp(status.backups.latest?.mtime)]]} />
        </div>}
      </LoadState>
      <section className="admin-panel admin-section-line">
        <div><h2>Maintenance mode</h2><p className="admin-muted">Current setting · {settings.data ? maintenance ? 'Enabled' : 'Disabled' : 'Unavailable'}</p></div>
        <button type="button" disabled={!settings.data || settings.pending || mutation.pending} onClick={() => { mutation.clear(); setMaintenancePrompt(true); }}>{maintenance ? 'Disable' : 'Enable'} maintenance mode</button>
      </section>
      {settings.error && <p className="admin-feedback is-error" role="alert">Maintenance settings are unavailable. <button type="button" onClick={settings.reload}>Try again</button></p>}
      <section className="admin-panel">
        <h2>Server diagnostics</h2>
        <div className="admin-filters">
          <label>Diagnostic<select value={diagnostic} onChange={(event) => { setDiagnostic(event.target.value); setResult(null); }}>
            {['disk-space', 'memory', 'service-status', 'log-tail', 'backup-list'].map((id) => <option key={id}>{id}</option>)}
          </select></label>
          <button type="button" onClick={runDiagnostic} disabled={mutation.pending}>{mutation.pending ? 'Running…' : 'Run diagnostic'}</button>
        </div>
        {result && <p className="admin-feedback" role="status">{result.detail}</p>}
      </section>
      {!maintenancePrompt && <Feedback feedback={mutation.feedback} />}
      {maintenancePrompt && <Modal title={`${maintenance ? 'Disable' : 'Enable'} maintenance mode`} onClose={() => !mutation.pending && setMaintenancePrompt(false)}>
        <p>Save this setting for the entire platform?</p><Feedback feedback={mutation.feedback} />
        <div className="studio-modal-actions"><button className="primary" type="button" disabled={mutation.pending} onClick={saveMaintenance}>Confirm change</button>
          <button type="button" disabled={mutation.pending} onClick={() => setMaintenancePrompt(false)}>Cancel</button></div>
      </Modal>}
    </div>
  );
}

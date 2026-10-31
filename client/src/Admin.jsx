import React, { useEffect, useState } from 'react';
import { get, post, put, del } from './api.js';
import { isAuthenticated, getUser, clearSession } from './auth.js';

const TABS = ['overview', 'users', 'plans', 'exam-studio-ai', 'usage', 'content', 'announcements', 'system', 'audit', 'settings'];

export default function Admin({ onExit }) {
  const [tab, setTab] = useState('overview');
  const [me, setMe] = useState(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) { setLoading(false); return; }
    get('/admin/me').then((d) => { setMe(d.user); setLoading(false); }).catch((e) => {
      if (e.status === 403) setForbidden(true);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="admin"><p>Loading…</p></div>;
  if (!isAuthenticated()) return <div className="admin"><p>Please sign in.</p><button onClick={onExit}>Back</button></div>;
  if (forbidden) return <div className="admin"><h2>403 — Administrator access required</h2><button onClick={onExit}>Back</button></div>;

  return (
    <div className="admin">
      <header className="admin-head">
        <h1>Admin dashboard</h1>
        <span className="who">{me?.email}</span>
        <button className="link" onClick={onExit}>Exit</button>
      </header>
      <nav className="admin-tabs">
        {TABS.map((t) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t === 'exam-studio-ai' ? 'Exam Studio AI' : t}</button>)}
      </nav>
      <main className="admin-main">
        {tab === 'overview' && <Overview />}
        {tab === 'users' && <Users />}
        {tab === 'plans' && <Plans />}
        {tab === 'exam-studio-ai' && <AIConfig />}
        {tab === 'usage' && <Usage />}
        {tab === 'content' && <Content />}
        {tab === 'announcements' && <Announcements />}
        {tab === 'system' && <System />}
        {tab === 'audit' && <Audit />}
        {tab === 'settings' && <AdminSettings />}
      </main>
    </div>
  );
}

function Overview() {
  const [summary, setSummary] = useState(null);
  const [health, setHealth] = useState(null);
  useEffect(() => {
    get('/admin/usage/summary').then(setSummary).catch(() => {});
    get('/admin/health').then(setHealth).catch(() => {});
  }, []);
  return (
    <div>
      <h2>Overview</h2>
      {summary && <ul>
        <li>Requests today: {summary.requestsToday}</li>
        <li>Requests this week: {summary.requestsWeek}</li>
        <li>Requests this month: {summary.requestsMonth}</li>
        <li>Failures this month: {summary.failuresMonth}</li>
      </ul>}
      {health && <p>Server uptime: {Math.round(health.uptime)}s · storage: {health.storage?.backend}</p>}
    </div>
  );
}

function Users() {
  const [items, setItems] = useState([]);
  const [plans, setPlans] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState([]);
  const [bulkPlan, setBulkPlan] = useState('');
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'student', planId: '' });
  const [msg, setMsg] = useState('');
  const [detail, setDetail] = useState(null);
  const load = () => get(`/admin/users?search=${encodeURIComponent(search)}&page=${page}&limit=20`).then((d) => { setItems(d.items); setTotal(d.total); }).catch((e) => setMsg(e.message));
  const loadPlans = () => get('/admin/plans').then((d) => setPlans(d.items || [])).catch(() => {});
  useEffect(() => { load(); loadPlans(); }, [search, page]);
  async function create() {
    try { await post('/admin/users', form); setForm({ email: '', name: '', password: '', role: 'student', planId: '' }); setMsg('Created.'); load(); }
    catch (e) { setMsg(e.message); }
  }
  async function toggle(u) {
    await put(`/admin/users/${u.id}`, { active: !u.active });
    load();
  }
  async function changeRole(u, role) {
    await put(`/admin/users/${u.id}`, { role });
    load();
  }
  async function changePlan(u, planId) {
    await put(`/admin/users/${u.id}`, { planId: planId || null });
    load();
  }
  async function bulkChangePlan() {
    if (!bulkPlan || selected.length === 0) return;
    for (const id of selected) await put(`/admin/users/${id}`, { planId: bulkPlan });
    setSelected([]);
    load();
    setMsg('Updated.');
  }
  async function remove(u) {
    if (!confirm('Delete user?')) return;
    await del(`/admin/users/${u.id}`);
    load();
  }
  async function resetPw(u) {
    const pw = prompt('New password:');
    if (!pw) return;
    try { await post(`/admin/users/${u.id}/reset-password`, { password: pw }); setMsg('Password reset.'); }
    catch (e) { setMsg(e.message); }
  }
  async function signout(u) {
    await post(`/admin/users/${u.id}/signout`, {});
    setMsg('Signed out.');
  }
  async function saveOverride() {
    if (!detail) return;
    try {
      await put(`/admin/users/${detail.id}`, { overrides: detail.overrides });
      setMsg('Override saved.');
      setDetail(null);
      load();
    } catch (e) { setMsg(e.message); }
  }
  return (
    <div>
      <h2>Users</h2>
      <div className="row">
        <input placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={bulkPlan} onChange={(e) => setBulkPlan(e.target.value)}>
          <option value="">Bulk change plan…</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={bulkChangePlan} disabled={!bulkPlan || selected.length === 0}>Apply to selected</button>
      </div>
      <table><thead><tr><th></th><th>Email</th><th>Name</th><th>Role</th><th>Plan</th><th>Active</th><th>Actions</th></tr></thead>
        <tbody>{items.map((u) => (
          <tr key={u.id}>
            <td><input type="checkbox" checked={selected.includes(u.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, u.id] : selected.filter((x) => x !== u.id))} /></td>
            <td>{u.email}</td><td>{u.name}</td>
            <td><select value={u.role} onChange={(e) => changeRole(u, e.target.value)}><option>admin</option><option>teacher</option><option>student</option></select></td>
            <td>
              <select value={u.planId || ''} onChange={(e) => changePlan(u, e.target.value)}>
                <option value="">—</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </td>
            <td>{u.active ? 'yes' : 'no'}</td>
            <td>
              <button onClick={() => toggle(u)}>{u.active ? 'Disable' : 'Enable'}</button>
              <button onClick={() => setDetail(u)}>Override</button>
              <button onClick={() => resetPw(u)}>Reset pw</button>
              <button onClick={() => signout(u)}>Sign out</button>
              <button onClick={() => remove(u)}>Delete</button>
            </td>
          </tr>
        ))}</tbody></table>
      <p>Total: {total}</p>
      <h3>Create user</h3>
      <div className="row2">
        <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option>student</option><option>teacher</option><option>admin</option></select>
        <select value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}>
          <option value="">No plan</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={create}>Create</button>
      </div>
      {msg && <p>{msg}</p>}

      {detail && (
        <div className="admin-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setDetail(null)}>
          <div className="admin-modal">
            <h2>Override for {detail.email}</h2>
            <div className="admin-field"><label>Extra daily requests</label><input type="number" min="0" value={detail.overrides?.extraDailyRequests || 0} onChange={(e) => setDetail({ ...detail, overrides: { ...(detail.overrides || {}), extraDailyRequests: Number(e.target.value) } })} /></div>
            <div className="admin-field"><label>Extra daily tokens</label><input type="number" min="0" value={detail.overrides?.extraDailyTokens || 0} onChange={(e) => setDetail({ ...detail, overrides: { ...(detail.overrides || {}), extraDailyTokens: Number(e.target.value) } })} /></div>
            <div className="admin-field"><label>Boost expiry</label><input type="date" value={detail.overrides?.boostExpiry ? new Date(detail.overrides.boostExpiry).toISOString().slice(0, 10) : ''} onChange={(e) => setDetail({ ...detail, overrides: { ...(detail.overrides || {}), boostExpiry: e.target.value ? new Date(e.target.value).toISOString() : null } })} /></div>
            <div className="row">
              <button className="primary" onClick={saveOverride}>Save</button>
              <button onClick={() => setDetail(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const FEATURE_OPTIONS = [
  ['study-notes', 'Study notes'],
  ['handout', 'Study handout'],
  ['exam', 'Exam'],
  ['flashcards', 'Flashcards'],
  ['export-word', 'Export to Word'],
  ['export-pdf', 'Export to PDF'],
  ['teacher-pack', 'Teacher pack (zip)'],
  ['notes-library', 'Notes library'],
  ['library-saving', 'Library saving'],
];

function emptyPlan() {
  return {
    name: '', description: '', active: true,
    requestsPerDay: '', requestsPerMonth: '', tokensPerDay: '', tokensPerMonth: '', concurrentJobs: '',
    maxSourceSize: '', maxExamMarks: '', maxFlashcardCount: '', maxHandoutPages: '',
    allowedFeatures: ['study-notes', 'flashcards'],
    allowOwnKey: false,
  };
}

function Plans() {
  const [items, setItems] = useState([]);
  const [defaultPlanId, setDefaultPlanId] = useState(null);
  const [modal, setModal] = useState(null); // null | {mode:'create'|'edit', plan}
  const [form, setForm] = useState(emptyPlan());
  const [editingId, setEditingId] = useState(null);
  const [msg, setMsg] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null); // plan
  const [moveTo, setMoveTo] = useState('');
  const [usersOnPlan, setUsersOnPlan] = useState(0);

  const load = () => get('/admin/plans').then((d) => {
    setItems(d.items || []);
    const def = (d.items || []).find((p) => p.isDefault);
    setDefaultPlanId(def ? def.id : null);
  }).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  function openCreate() { setForm(emptyPlan()); setEditingId(null); setModal('create'); }
  function openEdit(p) {
    setForm({
      name: p.name || '', description: p.description || '', active: p.active !== false,
      requestsPerDay: p.requestsPerDay == null ? '' : p.requestsPerDay,
      requestsPerMonth: p.requestsPerMonth == null ? '' : p.requestsPerMonth,
      tokensPerDay: p.tokensPerDay == null ? '' : p.tokensPerDay,
      tokensPerMonth: p.tokensPerMonth == null ? '' : p.tokensPerMonth,
      concurrentJobs: p.concurrentJobs == null ? '' : p.concurrentJobs,
      maxSourceSize: p.maxSourceSize == null ? '' : p.maxSourceSize,
      maxExamMarks: p.maxExamMarks == null ? '' : p.maxExamMarks,
      maxFlashcardCount: p.maxFlashcardCount == null ? '' : p.maxFlashcardCount,
      maxHandoutPages: p.maxHandoutPages == null ? '' : p.maxHandoutPages,
      allowedFeatures: Array.isArray(p.allowedFeatures) ? [...p.allowedFeatures] : [],
      allowOwnKey: Boolean(p.allowOwnKey),
    });
    setEditingId(p.id);
    setModal('edit');
  }

  function numOrNull(v) {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return NaN;
    return n;
  }

  function validate() {
    if (!form.name.trim()) return 'Name is required.';
    const nums = ['requestsPerDay', 'requestsPerMonth', 'tokensPerDay', 'tokensPerMonth', 'concurrentJobs', 'maxSourceSize', 'maxExamMarks', 'maxFlashcardCount', 'maxHandoutPages'];
    for (const k of nums) {
      const v = form[k];
      if (v !== '' && v !== null) {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return `${k} must be a whole number >= 0.`;
      }
    }
    return null;
  }

  async function save() {
    const err = validate();
    if (err) { setMsg(err); return; }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      active: form.active,
      requestsPerDay: numOrNull(form.requestsPerDay),
      requestsPerMonth: numOrNull(form.requestsPerMonth),
      tokensPerDay: numOrNull(form.tokensPerDay),
      tokensPerMonth: numOrNull(form.tokensPerMonth),
      concurrentJobs: numOrNull(form.concurrentJobs),
      maxSourceSize: numOrNull(form.maxSourceSize),
      maxExamMarks: numOrNull(form.maxExamMarks),
      maxFlashcardCount: numOrNull(form.maxFlashcardCount),
      maxHandoutPages: numOrNull(form.maxHandoutPages),
      allowedFeatures: form.allowedFeatures,
      allowOwnKey: form.allowOwnKey,
    };
    try {
      if (modal === 'create') await post('/admin/plans', payload);
      else await put(`/admin/plans/${editingId}`, payload);
      setModal(null);
      setMsg('Saved.');
      load();
    } catch (e) { setMsg(e.message); }
  }

  async function duplicate(p) {
    try { await post(`/admin/plans/${p.id}/duplicate`, {}); load(); setMsg('Duplicated.'); }
    catch (e) { setMsg(e.message); }
  }

  async function setDefault(p) {
    try { await post(`/admin/plans/${p.id}/default`, {}); load(); setMsg('Set as default.'); }
    catch (e) { setMsg(e.message); }
  }

  async function startDelete(p) {
    // count users on plan
    const { items: users } = await get('/admin/users?limit=100000');
    const count = (users || []).filter((u) => u.planId === p.id).length;
    setUsersOnPlan(count);
    setConfirmDelete(p);
    setMoveTo(items.find((x) => x.id !== p.id)?.id || '');
  }

  async function confirmDeletePlan() {
    try {
      await del(`/admin/plans/${confirmDelete.id}`, { movePlanId: usersOnPlan > 0 ? moveTo : undefined });
      setConfirmDelete(null);
      load();
      setMsg('Deleted.');
    } catch (e) { setMsg(e.message); }
  }

  function toggleFeature(f) {
    setForm((prev) => ({
      ...prev,
      allowedFeatures: prev.allowedFeatures.includes(f)
        ? prev.allowedFeatures.filter((x) => x !== f)
        : [...prev.allowedFeatures, f],
    }));
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Plans</h2>
        <button className="primary" onClick={openCreate}>New plan</button>
      </div>
      {msg && <p className="hint">{msg}</p>}
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Description</th><th>Users</th><th>Req/day</th><th>Req/month</th><th>Tokens/month</th>
              <th>Features</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td>{p.name} {p.isDefault && <span className="badge default">default</span>}</td>
                <td>{p.description}</td>
                <td>{p.userCount ?? 0}</td>
                <td>{p.requestsPerDay == null ? '∞' : p.requestsPerDay}</td>
                <td>{p.requestsPerMonth == null ? '∞' : p.requestsPerMonth}</td>
                <td>{p.tokensPerMonth == null ? '∞' : p.tokensPerMonth}</td>
                <td style={{ fontSize: 12 }}>{(p.allowedFeatures || []).join(', ')}</td>
                <td>{p.active !== false ? 'active' : 'inactive'}</td>
                <td>
                  <button onClick={() => openEdit(p)}>Edit</button>
                  <button onClick={() => duplicate(p)}>Duplicate</button>
                  <button onClick={() => setDefault(p)}>Set default</button>
                  <button onClick={() => startDelete(p)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="admin-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="admin-modal">
            <h2>{modal === 'create' ? 'New plan' : 'Edit plan'}</h2>
            <div className="admin-card">
              <h3>Basics</h3>
              <div className="admin-field"><label>Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><div className="help">Unique plan name.</div></div>
              <div className="admin-field"><label>Description</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="admin-field"><label><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label></div>
            </div>
            <div className="admin-card">
              <h3>Usage limits (blank = unlimited)</h3>
              <div className="row2">
                <div className="admin-field"><label>Requests / day</label><input type="number" min="0" value={form.requestsPerDay} onChange={(e) => setForm({ ...form, requestsPerDay: e.target.value })} /></div>
                <div className="admin-field"><label>Requests / month</label><input type="number" min="0" value={form.requestsPerMonth} onChange={(e) => setForm({ ...form, requestsPerMonth: e.target.value })} /></div>
                <div className="admin-field"><label>Tokens / day</label><input type="number" min="0" value={form.tokensPerDay} onChange={(e) => setForm({ ...form, tokensPerDay: e.target.value })} /></div>
                <div className="admin-field"><label>Tokens / month</label><input type="number" min="0" value={form.tokensPerMonth} onChange={(e) => setForm({ ...form, tokensPerMonth: e.target.value })} /></div>
                <div className="admin-field"><label>Concurrent jobs</label><input type="number" min="0" value={form.concurrentJobs} onChange={(e) => setForm({ ...form, concurrentJobs: e.target.value })} /></div>
              </div>
            </div>
            <div className="admin-card">
              <h3>Size limits (blank = unlimited)</h3>
              <div className="row2">
                <div className="admin-field"><label>Max source size (tokens)</label><input type="number" min="0" value={form.maxSourceSize} onChange={(e) => setForm({ ...form, maxSourceSize: e.target.value })} /></div>
                <div className="admin-field"><label>Max exam marks</label><input type="number" min="0" value={form.maxExamMarks} onChange={(e) => setForm({ ...form, maxExamMarks: e.target.value })} /></div>
                <div className="admin-field"><label>Max flashcards</label><input type="number" min="0" value={form.maxFlashcardCount} onChange={(e) => setForm({ ...form, maxFlashcardCount: e.target.value })} /></div>
                <div className="admin-field"><label>Max pages / document</label><input type="number" min="0" value={form.maxHandoutPages} onChange={(e) => setForm({ ...form, maxHandoutPages: e.target.value })} /></div>
              </div>
            </div>
            <div className="admin-card">
              <h3>Features</h3>
              <div className="row2">
                {FEATURE_OPTIONS.map(([val, label]) => (
                  <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input type="checkbox" checked={form.allowedFeatures.includes(val)} onChange={() => toggleFeature(val)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div className="admin-card">
              <h3>Own model</h3>
              <label><input type="checkbox" checked={form.allowOwnKey} onChange={(e) => setForm({ ...form, allowOwnKey: e.target.checked })} /> Allow users on this plan to add their own API key</label>
            </div>
            <div className="row">
              <button className="primary" onClick={save}>Save</button>
              <button onClick={() => setModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="admin-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="admin-modal">
            <h2>Delete plan</h2>
            <p>Delete "{confirmDelete.name}"?</p>
            {usersOnPlan > 0 && (
              <div className="admin-field">
                <label>Move {usersOnPlan} users to</label>
                <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                  {items.filter((p) => p.id !== confirmDelete.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            {confirmDelete.isDefault && <p className="hint" style={{ color: 'var(--err-ink)' }}>The default plan cannot be deleted.</p>}
            <div className="row">
              <button className="primary" disabled={confirmDelete.isDefault} onClick={confirmDeletePlan}>Delete</button>
              <button onClick={() => setConfirmDelete(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AIConfig() {
  const [cfg, setCfg] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { get('/admin/ai-config').then(setCfg).catch((e) => setMsg(e.message)); }, []);
  if (!cfg) return <p>Loading…</p>;
  async function save() {
    try { const c = await put('/admin/ai-config', cfg); setCfg(c); setMsg('Saved.'); } catch (e) { setMsg(e.message); }
  }
  async function toggle() { setCfg({ ...cfg, enabled: !cfg.enabled }); }
  return (
    <div>
      <h2>Exam Studio AI settings</h2>
      <label>Enabled <input type="checkbox" checked={cfg.enabled !== false} onChange={toggle} /></label>
      <label>Provider <input value={cfg.provider || ''} onChange={(e) => setCfg({ ...cfg, provider: e.target.value })} /></label>
      <label>Model ID <input value={cfg.model || ''} onChange={(e) => setCfg({ ...cfg, model: e.target.value })} /></label>
      <label>Base URL <input value={cfg.baseUrl || ''} onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })} /></label>
      <label>Fallback model <input value={cfg.fallbackModel || ''} onChange={(e) => setCfg({ ...cfg, fallbackModel: e.target.value })} /></label>
      <label>Temperature <input type="number" step="0.1" value={cfg.temperature ?? 0.7} onChange={(e) => setCfg({ ...cfg, temperature: Number(e.target.value) })} /></label>
      <button onClick={save}>Save</button>
      {msg && <p>{msg}</p>}
      <p className="hint">API key is write-only and never displayed.</p>
    </div>
  );
}

function Usage() {
  const [data, setData] = useState(null);
  useEffect(() => { get('/admin/usage').then(setData).catch(() => {}); }, []);
  return (
    <div>
      <h2>Usage and logs</h2>
      {data && <p>Total events: {data.total}</p>}
      <ul>{(data?.items || []).slice(0, 20).map((e, i) => <li key={i}>{e.taskType} · {e.success ? 'ok' : 'fail'} · {new Date(e.createdAt).toLocaleString()}</li>)}</ul>
    </div>
  );
}

function Content() {
  const [data, setData] = useState(null);
  useEffect(() => { get('/admin/content').then(setData).catch(() => {}); }, []);
  async function remove(id) { await del(`/admin/content/${id}`); get('/admin/content').then(setData); }
  return (
    <div>
      <h2>Content (Library)</h2>
      <ul>{(data?.items || []).map((i) => <li key={i.id}>{i.kind} · {i.title} · {new Date(i.createdAt).toLocaleString()} <button onClick={() => remove(i.id)}>Delete</button></li>)}</ul>
    </div>
  );
}

function Announcements() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ title: '', message: '', startDate: new Date().toISOString(), endDate: new Date(Date.now() + 86400000).toISOString(), active: true });
  useEffect(() => { get('/admin/announcements').then((d) => setItems(d.items)).catch(() => {}); }, []);
  async function create() {
    await post('/admin/announcements', form);
    get('/admin/announcements').then((d) => setItems(d.items));
  }
  async function remove(id) { await del(`/admin/announcements/${id}`); get('/admin/announcements').then((d) => setItems(d.items)); }
  return (
    <div>
      <h2>Announcements</h2>
      <ul>{items.map((a) => <li key={a.id}>{a.title} — {a.active ? 'active' : 'off'} <button onClick={() => remove(a.id)}>Delete</button></li>)}</ul>
      <h3>New</h3>
      <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <textarea placeholder="Message" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
      <button onClick={create}>Create</button>
    </div>
  );
}

function System() {
  const [info, setInfo] = useState(null);
  const [maintenance, setMaintenance] = useState(false);
  const [diag, setDiag] = useState(null);
  const [diagId, setDiagId] = useState('disk-space');
  useEffect(() => {
    const load = () => get('/admin/system').then(setInfo).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    get('/admin/settings').then((s) => setMaintenance(!!s.maintenanceMode)).catch(() => {});
    return () => clearInterval(t);
  }, []);
  async function toggleMaintenance() {
    await put('/admin/settings', { maintenanceMode: !maintenance });
    setMaintenance(!maintenance);
  }
  async function runDiag() {
    try { setDiag(await post('/admin/diagnostics', { id: diagId })); } catch (e) { setDiag({ error: e.message }); }
  }
  return (
    <div>
      <h2>System</h2>
      {info && (
        <div className="row2">
          <div className="admin-card"><h3>API</h3><p>Uptime {Math.round(info.api.uptime)}s<br/>Node {info.api.node}<br/>RSS {Math.round(info.api.memory.rss / 1048576)} MB</p></div>
          <div className="admin-card"><h3>MongoDB</h3><p>{info.mongo.backend}<br/>Collections: {info.mongo.collectionCount}<br/>Size: {info.mongo.size ?? 'n/a'}</p></div>
          <div className="admin-card"><h3>AI layer</h3><p>{info.ai.enabled ? 'enabled' : 'disabled'}<br/>Failures (10m): {info.ai.failuresLast10m}</p></div>
          <div className="admin-card"><h3>Host</h3><p>Cores: {info.host.cpuCores}<br/>Load: {info.host.load1?.toFixed(2)}<br/>Free RAM: {info.host.freeMemMB} MB<br/>Disk free: {info.host.diskFreeGB} GB</p></div>
          <div className="admin-card"><h3>Jobs</h3><p>Queue: {info.jobs.queueLength}</p></div>
          <div className="admin-card"><h3>Backups</h3><p>Count: {info.backups.count}<br/>Latest: {info.backups.latest?.name || 'none'}<br/>Stale: {info.backups.stale ? 'yes' : 'no'}</p></div>
        </div>
      )}
      <div className="row">
        <button onClick={toggleMaintenance}>{maintenance ? 'Disable' : 'Enable'} maintenance mode</button>
      </div>
      <div className="admin-card">
        <h3>Server diagnostics</h3>
        <div className="row">
          <select value={diagId} onChange={(e) => setDiagId(e.target.value)}>
            <option value="disk-space">disk-space</option>
            <option value="memory">memory</option>
            <option value="service-status">service-status</option>
            <option value="log-tail">log-tail</option>
            <option value="backup-list">backup-list</option>
          </select>
          <button onClick={runDiag}>Run</button>
        </div>
        {diag && <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(diag, null, 2)}</pre>}
      </div>
    </div>
  );
}

function Audit() {
  const [data, setData] = useState(null);
  useEffect(() => { get('/admin/audit').then(setData).catch(() => {}); }, []);
  return (
    <div>
      <h2>Audit log</h2>
      <ul>{(data?.items || []).map((e, i) => <li key={i}>{new Date(e.createdAt).toLocaleString()} · {e.actorEmail} · {e.action}</li>)}</ul>
    </div>
  );
}

function AdminSettings() {
  const [s, setS] = useState({});
  const [twoFA, setTwoFA] = useState({ secret: '', url: '', code: '', msg: '' });
  useEffect(() => { get('/admin/settings').then(setS).catch(() => {}); }, []);
  async function save() { await put('/admin/settings', s); }
  async function setup2FA() {
    try {
      const r = await post('/admin/2fa/setup', {});
      setTwoFA({ ...twoFA, secret: r.secret, url: r.otpauthUrl, msg: 'Scan the secret in your authenticator app, then enter a code to verify.' });
    } catch (e) { setTwoFA({ ...twoFA, msg: e.message }); }
  }
  async function verify2FA() {
    try { await post('/admin/2fa/verify', { code: twoFA.code }); setTwoFA({ secret: '', url: '', code: '', msg: '2FA enabled.' }); }
    catch (e) { setTwoFA({ ...twoFA, msg: e.message }); }
  }
  async function disable2FA() {
    try { await post('/admin/2fa/disable', {}); setTwoFA({ secret: '', url: '', code: '', msg: '2FA disabled.' }); }
    catch (e) { setTwoFA({ ...twoFA, msg: e.message }); }
  }
  return (
    <div>
      <h2>Admin settings</h2>
      <label>Privacy notice <textarea value={s.privacyNotice || ''} onChange={(e) => setS({ ...s, privacyNotice: e.target.value })} /></label>
      <label>Default plan <input value={s.defaultPlan || ''} onChange={(e) => setS({ ...s, defaultPlan: e.target.value })} /></label>
      <label>Registration open <input type="checkbox" checked={s.registrationOpen !== false} onChange={(e) => setS({ ...s, registrationOpen: e.target.checked })} /></label>
      <button onClick={save}>Save</button>

      <div className="admin-card" style={{ marginTop: 16 }}>
        <h3>Two-factor authentication (optional)</h3>
        <div className="row">
          <button onClick={setup2FA}>Set up 2FA</button>
          <button onClick={disable2FA}>Disable 2FA</button>
        </div>
        {twoFA.secret && <p><strong>Secret:</strong> {twoFA.secret}</p>}
        {twoFA.url && <p className="hint">{twoFA.url}</p>}
        {twoFA.secret && (
          <div className="row">
            <input placeholder="6-digit code" value={twoFA.code} onChange={(e) => setTwoFA({ ...twoFA, code: e.target.value })} />
            <button onClick={verify2FA}>Verify & enable</button>
          </div>
        )}
        {twoFA.msg && <p className="hint">{twoFA.msg}</p>}
      </div>
    </div>
  );
}

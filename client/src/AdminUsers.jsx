import React, { useState } from 'react';
import { del, post, put } from './api.js';
import Modal from './ui/Modal.jsx';
import Icon from './ui/Icon.jsx';
import { EmptyRows, Feedback, LoadState, Pagination, useAdminAction, useAdminQuery } from './AdminData.jsx';

const ROLES = ['student', 'teacher', 'admin'];
const NEW_USER = { name: '', email: '', password: '', role: 'student', planId: '' };
const ACTIONS = {
  edit: 'Edit account',
  override: 'Usage overrides',
  reset: 'Reset password',
  signout: 'Sign out sessions',
  enable: 'Enable account',
  disable: 'Disable account',
  delete: 'Delete account',
  bulk: 'Assign plan',
  create: 'Create user',
};

function PlanSelect({ plans, value, onChange, required = false }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} required={required}>
      <option value="">{required ? 'Select a plan' : 'No plan'}</option>
      {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
    </select>
  );
}

function UserFields({ mode, form, setForm, plans }) {
  const change = (key) => (value) => setForm((previous) => ({ ...previous, [key]: value }));
  return (
    <div className="admin-form-grid">
      {mode === 'create' && <>
        <label>Name<input value={form.name} onChange={(event) => change('name')(event.target.value)} required maxLength={80} /></label>
        <label>Email address<input type="email" value={form.email} onChange={(event) => change('email')(event.target.value)} required maxLength={254} /></label>
        <label>Initial password<input type="password" autoComplete="new-password" value={form.password} onChange={(event) => change('password')(event.target.value)} required minLength={8} maxLength={72} /></label>
      </>}
      <label>Platform role<select value={form.role} onChange={(event) => change('role')(event.target.value)}>
        {ROLES.map((role) => <option key={role}>{role}</option>)}
      </select></label>
      <label>Plan<PlanSelect plans={plans} value={form.planId} onChange={change('planId')} /></label>
    </div>
  );
}

function UserActionDialog({ action, plans, selected, mutation, close, save }) {
  const { kind, user } = action;
  const [form, setForm] = useState(() => {
    if (kind === 'edit') return { role: user.role, planId: user.planId || '' };
    if (kind === 'override') return {
      extraDailyRequests: user.overrides?.extraDailyRequests ?? 0,
      extraDailyTokens: user.overrides?.extraDailyTokens ?? 0,
      boostExpiry: user.overrides?.boostExpiry?.slice(0, 10) || '',
    };
    return NEW_USER;
  });
  const description = {
    edit: 'Review the platform role and assigned plan before saving.',
    signout: 'Existing sessions for this account will need to sign in again.',
    disable: 'This account will lose access until it is enabled again.',
    delete: 'This permanently removes the user account and its library items.',
    bulk: `Choose a plan for the ${selected.length} selected accounts.`,
  }[kind];
  return (
    <Modal title={ACTIONS[kind]} onClose={close}>
      {user && <p className="admin-modal-context">{user.name || user.email} · {user.email}</p>}
      {description && <p>{description}</p>}
      <form className="admin-form" onSubmit={(event) => { event.preventDefault(); save(form); }}>
        {(kind === 'create' || kind === 'edit') && <UserFields mode={kind} form={form} setForm={setForm} plans={plans} />}
        {kind === 'bulk' && <label>Plan<PlanSelect plans={plans} value={form.planId} required onChange={(planId) => setForm({ ...form, planId })} /></label>}
        {kind === 'reset' && <label>New password<input type="password" autoComplete="new-password" value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={8} maxLength={72} required /></label>}
        {kind === 'override' && <div className="admin-form-grid">
          <label>Extra daily requests<input type="number" min="0" value={form.extraDailyRequests} onChange={(event) => setForm({ ...form, extraDailyRequests: Number(event.target.value) })} /></label>
          <label>Extra daily tokens<input type="number" min="0" value={form.extraDailyTokens} onChange={(event) => setForm({ ...form, extraDailyTokens: Number(event.target.value) })} /></label>
          <label>Boost expiry<input type="date" value={form.boostExpiry} onChange={(event) => setForm({ ...form, boostExpiry: event.target.value })} /></label>
        </div>}
        <Feedback feedback={mutation.feedback?.error ? mutation.feedback : null} />
        <div className="studio-modal-actions">
          <button type="submit" className={kind === 'delete' ? 'admin-danger' : 'primary'} disabled={mutation.pending}>
            {mutation.pending ? 'Working…' : kind === 'edit' || kind === 'override' ? 'Save changes' : ACTIONS[kind]}
          </button>
          <button type="button" disabled={mutation.pending} onClick={close}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminUsers() {
  const [draftSearch, setDraftSearch] = useState('');
  const [filters, setFilters] = useState({ search: '', role: '', status: '' });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [action, setAction] = useState(null);
  const users = useAdminQuery(`/admin/users?${new URLSearchParams({ ...filters, page, limit: 20 })}`);
  const plans = useAdminQuery('/admin/plans');
  const mutation = useAdminAction();
  const planItems = plans.data?.items || [];
  const planNames = new Map(planItems.map(({ id, name }) => [id, name]));
  function filter(name, value) {
    setFilters((previous) => ({ ...previous, [name]: value }));
    setPage(1);
    setSelected([]);
  }
  function open(kind, user) {
    mutation.clear();
    setAction({ kind, user });
  }
  function close() {
    if (mutation.pending) return;
    mutation.clear();
    setAction(null);
  }
  async function save(form) {
    const { kind, user } = action;
    const path = user && `/admin/users/${user.id}`;
    const ok = await mutation.run(async () => {
      if (kind === 'create') await post('/admin/users', form);
      else if (kind === 'edit') await put(path, { ...form, planId: form.planId || null });
      else if (kind === 'override') {
        await put(path, { overrides: { ...form, boostExpiry: form.boostExpiry ? new Date(form.boostExpiry).toISOString() : null } });
      } else if (kind === 'reset') await post(`${path}/reset-password`, { password: form.password });
      else if (kind === 'signout') await post(`${path}/signout`, {});
      else if (kind === 'delete') await del(path);
      else if (kind === 'bulk') {
        for (const id of selected) {
          await put(`/admin/users/${id}`, { planId: form.planId });
          setSelected((current) => current.filter((item) => item !== id));
        }
      } else await put(path, { active: kind === 'enable' });
    }, 'Changes saved.');
    if (ok) {
      if (kind === 'delete') setSelected((current) => current.filter((id) => id !== user.id));
      setAction(null);
    }
    users.reload();
  }
  return (
    <div className="admin-stack">
      <section className="admin-panel">
        <div className="admin-section-line">
          <div><h2>Account directory</h2><p className="admin-muted">Find and manage personal accounts, roles and usage limits.</p></div>
          <button className="primary" type="button" onClick={() => open('create')}><Icon name="user" size={16} /> Create user</button>
        </div>
        <form className="admin-filters" onSubmit={(event) => { event.preventDefault(); filter('search', draftSearch.trim()); }}>
          <label>Search users<input type="search" value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="Name or email" maxLength={100} /></label>
          <button type="submit">Search</button>
          <label>Role<select value={filters.role} onChange={(event) => filter('role', event.target.value)}><option value="">All roles</option>{ROLES.map((role) => <option key={role}>{role}</option>)}</select></label>
          <label>Status<select value={filters.status} onChange={(event) => filter('status', event.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option></select></label>
        </form>
        {plans.error && <p className="admin-feedback is-error" role="alert">Plans could not be loaded. <button type="button" onClick={plans.reload}>Retry plans</button></p>}
        {!action && <Feedback feedback={mutation.feedback} />}
        <div className="admin-bulk">
          <span>{selected.length} selected</span>
          <button type="button" disabled={!selected.length || !planItems.length} onClick={() => open('bulk')}>Assign plan to selected</button>
        </div>
        <LoadState query={users} name="users">
          {users.data?.items?.length ? (
            <div className="admin-table-scroll" role="region" aria-label="Users table" tabIndex={0}>
              <table className="admin-users-table"><thead><tr><th scope="col">Select</th><th scope="col">Account</th><th scope="col">Role</th><th scope="col">Plan</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
                <tbody>{users.data.items.map((user) => (
                  <tr key={user.id}>
                    <td><input type="checkbox" aria-label={`Select ${user.email}`} checked={selected.includes(user.id)}
                      onChange={(event) => setSelected(event.target.checked ? [...selected, user.id] : selected.filter((id) => id !== user.id))} /></td>
                    <td><strong>{user.name || 'Unnamed account'}</strong><small>{user.email}</small></td>
                    <td className="admin-capitalize">{user.role}</td>
                    <td>{user.planId ? planNames.get(user.planId) || 'Assigned plan' : 'No plan'}</td>
                    <td><span className={`admin-badge${user.active ? ' is-ok' : ''}`}>{user.active ? 'Active' : 'Disabled'}</span></td>
                    <td><div className="admin-row-actions">
                      {['edit', 'override', 'reset', 'signout', user.active ? 'disable' : 'enable', 'delete'].map((kind) => (
                        <button type="button" key={kind} onClick={() => open(kind, user)}>{ACTIONS[kind]}</button>
                      ))}
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <EmptyRows>No accounts match these filters.</EmptyRows>}
          <Pagination page={page} total={users.data?.total || 0} setPage={setPage} />
        </LoadState>
      </section>
      {action && <UserActionDialog action={action} plans={planItems} selected={selected} mutation={mutation} close={close} save={save} />}
    </div>
  );
}

import React, { useState } from 'react';
import { del, post, put } from './api.js';
import Modal from './ui/Modal.jsx';
import { EmptyRows, Feedback, LoadState, number, useAdminAction, useAdminQuery } from './AdminData.jsx';

const USAGE_LIMITS = [
  ['requestsPerDay', 'Requests per day'], ['requestsPerMonth', 'Requests per month'],
  ['tokensPerDay', 'Tokens per day'], ['tokensPerMonth', 'Tokens per month'], ['concurrentJobs', 'Concurrent jobs'],
];
const SIZE_LIMITS = [
  ['maxSourceSize', 'Max source size (tokens)'], ['maxExamMarks', 'Max exam marks'],
  ['maxFlashcardCount', 'Max flashcards'], ['maxHandoutPages', 'Max pages per handout'],
];
const FEATURES = {
  'study-notes': 'Study notes', handout: 'Study handout', exam: 'Exam', flashcards: 'Flashcards',
  'export-word': 'Export to Word', 'export-pdf': 'Export to PDF', 'teacher-pack': 'Teacher pack (ZIP)',
  'notes-library': 'Notes library', 'library-saving': 'Library saving',
};
const LIMITS = [...USAGE_LIMITS, ...SIZE_LIMITS];
const limitLabel = (value) => value == null ? 'Unlimited' : number(value);

function PlanForm({ plan, save, close, mutation }) {
  const [form, setForm] = useState(() => ({
    name: plan?.name || '', description: plan?.description || '', active: plan?.active !== false,
    allowedFeatures: plan?.allowedFeatures || ['study-notes', 'flashcards'], allowOwnKey: Boolean(plan?.allowOwnKey),
    ...Object.fromEntries(LIMITS.map(([field]) => [field, plan?.[field] ?? ''])),
  }));
  const change = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));
  function submit(event) {
    event.preventDefault();
    save({
      ...form, name: form.name.trim(), description: form.description.trim(),
      ...Object.fromEntries(LIMITS.map(([field]) => [field, form[field] === '' ? null : Number(form[field])])),
    });
  }
  return (
    <form className="admin-form" onSubmit={submit}>
      <label>Plan name<input value={form.name} onChange={(event) => change('name', event.target.value)} maxLength={100} required /></label>
      <label>Description<textarea rows={2} value={form.description} onChange={(event) => change('description', event.target.value)} /></label>
      {[[ 'Usage limits', USAGE_LIMITS ], [ 'Document limits', SIZE_LIMITS ]].map(([title, fields]) => (
        <fieldset key={title} className="admin-form-fieldset"><legend>{title} · blank means unlimited</legend>
          <div className="admin-form-grid">{fields.map(([field, label]) => (
            <label key={field}>{label}<input type="number" min="0" step="1" value={form[field]} onChange={(event) => change(field, event.target.value)} /></label>
          ))}</div>
        </fieldset>
      ))}
      <fieldset className="admin-form-fieldset"><legend>Allowed features</legend>
        <div className="admin-form-grid">{Object.entries(FEATURES).map(([value, label]) => (
          <label className="admin-check" key={value}><input type="checkbox" checked={form.allowedFeatures.includes(value)} onChange={(event) => change('allowedFeatures',
            event.target.checked ? [...form.allowedFeatures, value] : form.allowedFeatures.filter((feature) => feature !== value))} /> {label}</label>
        ))}</div>
      </fieldset>
      <label className="admin-check"><input type="checkbox" checked={form.active} onChange={(event) => change('active', event.target.checked)} /> Active plan</label>
      <label className="admin-check"><input type="checkbox" checked={form.allowOwnKey} onChange={(event) => change('allowOwnKey', event.target.checked)} /> Allow users to bring their own provider key</label>
      <Feedback feedback={mutation.feedback} />
      <div className="studio-modal-actions"><button className="primary" type="submit" disabled={mutation.pending}>{mutation.pending ? 'Saving…' : 'Save plan'}</button>
        <button type="button" onClick={close} disabled={mutation.pending}>Cancel</button></div>
    </form>
  );
}

export default function Plans() {
  const query = useAdminQuery('/admin/plans');
  const mutation = useAdminAction();
  const [editor, setEditor] = useState(null);
  const [removal, setRemoval] = useState(null);
  const [moveTo, setMoveTo] = useState('');
  const items = query.data?.items || [];
  const close = () => { if (!mutation.pending) { setEditor(null); setRemoval(null); mutation.clear(); } };
  async function save(form) {
    const ok = await mutation.run(async () => {
      if (!form.name) throw new Error('Enter a plan name.');
      if (editor.plan) await put(`/admin/plans/${editor.plan.id}`, form);
      else await post('/admin/plans', form);
    }, 'Plan saved.');
    if (ok) { setEditor(null); query.reload(); }
  }
  async function planAction(plan, action) {
    if (await mutation.run(() => post(`/admin/plans/${plan.id}/${action}`, {}), action === 'duplicate' ? 'Plan duplicated.' : 'Default plan updated.')) query.reload();
  }
  async function remove(event) {
    event.preventDefault();
    if (await mutation.run(() => del(`/admin/plans/${removal.id}`, { movePlanId: removal.userCount > 0 ? moveTo : undefined }), 'Plan deleted.')) {
      setRemoval(null);
      query.reload();
    }
  }
  return (
    <div className="admin-stack">
      <div className="admin-section-line">
        <div><h2>Account plans</h2><p className="admin-muted">Configure request limits and feature access.</p></div>
        <button className="primary" type="button" onClick={() => { mutation.clear(); setEditor({}); }}>New plan</button>
      </div>
      {!editor && !removal && <Feedback feedback={mutation.feedback} />}
      <LoadState query={query} name="plans">
        {items.length ? <div className="admin-plan-grid">{items.map((plan) => (
          <article key={plan.id} className="admin-panel admin-plan">
            <div className="admin-plan-badges">
              <span className={`admin-badge${plan.active !== false ? ' is-ok' : ''}`}>{plan.active !== false ? 'Active' : 'Inactive'}</span>
              {plan.isDefault && <span className="admin-badge is-ok">Default</span>}
            </div>
            <h3>{plan.name}</h3><p className="admin-muted">{plan.description || 'No description provided.'}</p>
            <dl className="admin-key-values">
              <div><dt>Assigned users</dt><dd>{number(plan.userCount)}</dd></div>
              <div><dt>Requests per day</dt><dd>{limitLabel(plan.requestsPerDay)}</dd></div>
              <div><dt>Requests per month</dt><dd>{limitLabel(plan.requestsPerMonth)}</dd></div>
              <div><dt>Tokens per month</dt><dd>{limitLabel(plan.tokensPerMonth)}</dd></div>
            </dl>
            <ul className="admin-feature-list">{(plan.allowedFeatures || []).map((feature) => <li key={feature}>{FEATURES[feature] || feature}</li>)}</ul>
            <div className="admin-row-actions">
              <button type="button" disabled={mutation.pending} onClick={() => { mutation.clear(); setEditor({ plan }); }}>Edit</button>
              <button type="button" disabled={mutation.pending} onClick={() => planAction(plan, 'duplicate')}>Duplicate</button>
              <button type="button" disabled={mutation.pending || plan.isDefault} onClick={() => planAction(plan, 'default')}>Set default</button>
              <button type="button" disabled={mutation.pending || plan.isDefault} onClick={() => { mutation.clear(); setMoveTo(''); setRemoval(plan); }}>Delete</button>
            </div>
          </article>
        ))}</div> : <EmptyRows>No plans have been created.</EmptyRows>}
      </LoadState>
      {editor && <Modal title={editor.plan ? 'Edit plan' : 'New plan'} onClose={close}>
        <PlanForm plan={editor.plan} save={save} close={close} mutation={mutation} />
      </Modal>}
      {removal && <Modal title="Delete plan" onClose={close}>
        <p>Delete “{removal.name}”?</p>
        <form className="admin-form" onSubmit={remove}>
          {removal.userCount > 0 && <label>Move {number(removal.userCount)} assigned users to
            <select value={moveTo} onChange={(event) => setMoveTo(event.target.value)} required>
              <option value="">Select another plan</option>
              {items.filter((plan) => plan.id !== removal.id).map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
          </label>}
          <Feedback feedback={mutation.feedback} />
          <div className="studio-modal-actions"><button type="submit" className="admin-danger" disabled={mutation.pending}>Delete plan</button>
            <button type="button" onClick={close} disabled={mutation.pending}>Cancel</button></div>
        </form>
      </Modal>}
    </div>
  );
}

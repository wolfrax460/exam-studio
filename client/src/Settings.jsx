import React, { useEffect, useRef, useState } from 'react';
import { get, post, put, del } from './api.js';

const blank = { model: '', baseURL: '', apiKey: '', maxOutput: '', chunkChars: '' };
const fromProvider = (p) => ({ model: p.model || '', baseURL: p.baseURL || '', apiKey: '', maxOutput: String(p.maxOutput || ''), chunkChars: String(p.chunkChars || '') });

export default function Settings({ onClose, onChanged, update, onUpdate }) {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState('');
  const [form, setForm] = useState(blank);
  const [models, setModels] = useState([]);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null); // { ok, text }
  const [updateForm, setUpdateForm] = useState({ repo: '', feedUrl: '' });
  const first = useRef(null);

  useEffect(() => {
    get('/settings').then((d) => {
      setData(d); setSel(d.active);
      setForm(fromProvider(d.providers.find((p) => p.id === d.active)));
      setUpdateForm({ repo: d.update?.repo || '', feedUrl: d.update?.feedUrl || '' });
    })
      .catch((e) => setResult({ ok: false, text: e.message }));
  }, []);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => { first.current?.focus(); }, [data]);

  const prov = data?.providers.find((p) => p.id === sel);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const choose = (id) => { setSel(id); setForm(fromProvider(data.providers.find((p) => p.id === id))); setModels([]); setResult(null); };
  const locked = data && !data.canChange;
  const isCli = prov?.protocol === 'cli';
  const showKey = prov && !isCli && (prov.needsKey || prov.id === 'custom');

  async function save(extra = {}) {
    const profile = {
      model: form.model.trim(), baseURL: form.baseURL.trim(),
      maxOutput: form.maxOutput === '' ? '' : Number(form.maxOutput), chunkChars: form.chunkChars === '' ? '' : Number(form.chunkChars),
      ...extra,
    };
    if (form.apiKey.trim() && extra.apiKey === undefined) profile.apiKey = form.apiKey.trim();
    const d = await put('/settings', { provider: sel, profile });
    setData(d);
    setForm(fromProvider(d.providers.find((p) => p.id === sel)));
    onChanged(await get('/health'));
    return d;
  }
  const act = (name, fn) => async () => {
    setBusy(name); setResult(null);
    try { await fn(); } catch (e) { setResult({ ok: false, text: e.message }); } finally { setBusy(''); }
  };

  const onSave = act('save', async () => { await save(); setResult({ ok: true, text: 'Saved.' }); });
  const onTest = act('test', async () => {
    await save();
    const r = await post('/settings/test', {});
    setResult({ ok: true, text: `Works. ${r.provider} / ${r.model} answered in ${(r.ms / 1000).toFixed(1)} s.` });
  });
  const onModels = act('models', async () => {
    await save();
    const r = await get('/settings/models');
    setModels(r.models);
    setResult({ ok: true, text: r.models.length ? `${r.models.length} models found. Pick one in the Model box.` : 'No models listed. Type the model name yourself.' });
  });
  const onRemoveKey = act('key', async () => { await save({ apiKey: '' }); setResult({ ok: true, text: 'Saved key removed.' }); });

  // The app checks for a new version by itself at most once every 24 hours; this is the same
  // check, run on demand, which is why it can take a moment.
  // Where to look for a newer version. Saved on its own, because a packaged desktop app has no
  // .env to put it in.
  const onSaveUpdate = act('update-source', async () => {
    const d = await put('/settings', { update: updateForm });
    setData(d);
    setUpdateForm({ repo: d.update?.repo || '', feedUrl: d.update?.feedUrl || '' });
    onUpdate?.(await get('/update'));
    setResult({ ok: true, text: d.update?.configured ? 'Saved. The next check will use this.' : 'Saved. Update checks are now off.' });
  });

  const onCheckUpdate = act('update', async () => {
    const result = await post('/update/check', {});
    onUpdate?.(result);
    setResult(result.error
      ? { ok: false, text: result.error }
      : result.updateAvailable
        ? { ok: true, text: `Version ${result.latest} is available. You are using ${result.current}.` }
        : { ok: true, text: `You are up to date on ${result.current}.` });
  });

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="dialog-head">
          <h2 id="settings-title">AI settings</h2>
          <button className="link" onClick={onClose} aria-label="Close settings">Close</button>
        </div>
        {!data && !result && <p className="hint">Loading…</p>}
        {data && !data.signedIn && <div className="banner">Sign in to use your own provider.</div>}
        {data?.signedIn && <OwnProvider onChanged={onChanged} />}
        {(data?.isAdmin || data?.canChange) && prov && (
          <>
            <h3>Server default</h3>
            <p className="hint">This provider is used by everyone without their own settings. Only administrators can change it.</p>
            <label className="field">
              <span>Provider</span>
              <select ref={first} value={sel} onChange={(e) => choose(e.target.value)} disabled={!!busy}>
                {data.providers.map((p) => <option key={p.id} value={p.id}>{p.label}{p.id === data.active ? ' (in use)' : ''}</option>)}
              </select>
            </label>
            <p className="hint">{prov.help}</p>

            {isCli && prov.installed === false && <div className="banner error" role="alert">This tool was not found on this computer. Install it and sign in once, then reopen this screen.</div>}
            {isCli && prov.allowed === false && <div className="banner error" role="alert">Terminal tools only work when the server runs on this computer.</div>}
            <label className="field">
              <span>Model{isCli ? ' (optional: leave empty for the tool\'s own default)' : ''}</span>
              <input list="model-list" value={form.model} onChange={set('model')} placeholder={prov.defaults.model || (isCli ? 'tool default' : 'model name')} disabled={locked} />
              <datalist id="model-list">{models.map((m) => <option key={m} value={m} />)}</datalist>
            </label>

            {!isCli && (
              <label className="field">
                <span>Address (base URL){prov.id === 'custom' ? '' : ' Â· change only if you know you need to'}</span>
                <input value={form.baseURL} onChange={set('baseURL')} placeholder={prov.defaults.baseURL || 'https://â€¦/v1'} disabled={locked} />
              </label>
            )}

            {showKey && (
              <label className="field">
                <span>API key{prov.id === 'custom' ? ' (leave empty if the service needs none)' : ''}</span>
                <input type="password" autoComplete="off" spellCheck={false} value={form.apiKey} onChange={set('apiKey')} disabled={locked}
                  placeholder={prov.hasKey ? `Saved ${prov.keySource === 'env' ? '(from server/.env)' : 'on this computer'}. Leave empty to keep it.` : 'Paste your key'} />
              </label>
            )}
            {showKey && prov.keySource === 'settings' && !locked && <button className="link" onClick={onRemoveKey} disabled={!!busy}>Remove the saved key</button>}

            <details>
              <summary>Advanced</summary>
              <div className="row2" style={{ marginTop: 8 }}>
                <label className="field"><span>Max output (tokens)</span>
                  <input type="number" min={1000} value={form.maxOutput} onChange={set('maxOutput')} placeholder={String(prov.defaults.maxOutput)} disabled={locked} /></label>
                <label className="field"><span>Notes per request (characters)</span>
                  <input type="number" min={1500} value={form.chunkChars} onChange={set('chunkChars')} placeholder={String(prov.defaults.chunkChars)} disabled={locked} /></label>
              </div>
              <p className="hint">Small or local models write shorter answers. Lower these if you see "cut off" errors; raise them for large models.</p>
            </details>

            <div className="bar wrap">
              <button className="primary" onClick={onSave} disabled={!!busy || locked}>{busy === 'save' ? 'Savingâ€¦' : 'Save and use'}</button>
              <button onClick={onTest} disabled={!!busy || locked}>{busy === 'test' ? 'Testingâ€¦' : 'Test connection'}</button>
              {!isCli && <button onClick={onModels} disabled={!!busy || locked}>{busy === 'models' ? 'Loadingâ€¦' : 'List models'}</button>}
            </div>
          </>
        )}
        {result && <div className={`banner ${result.ok ? '' : 'error'}`} role={result.ok ? 'status' : 'alert'}>{result.text}</div>}

        <div className="update-box">
          <h3>Updates</h3>
          <p className="hint">
            {update?.configured === false
              ? update.message
              : update?.latest
                ? `You are using Exam Studio ${update.current}. The newest release is ${update.latest}${update.checkedAt ? `, checked ${new Date(update.checkedAt).toLocaleString()}` : ''}.`
                : `You are using Exam Studio ${update?.current || 'this build'}. The app also checks by itself once every 24 hours.`}
          </p>
          {update?.error && <p className="hint">The last check failed: {update.error}</p>}

          <div className="row2">
            <label className="field">
              <span>GitHub repository</span>
              <input value={updateForm.repo} onChange={(e) => setUpdateForm({ ...updateForm, repo: e.target.value })}
                placeholder="your-name/exam-studio" disabled={locked} spellCheck={false} />
            </label>
            <label className="field">
              <span>â€¦or a feed address</span>
              <input value={updateForm.feedUrl} onChange={(e) => setUpdateForm({ ...updateForm, feedUrl: e.target.value })}
                placeholder="https://example.com/version.json" disabled={locked} spellCheck={false} />
            </label>
          </div>
          <p className="hint">
            The repository is read through its latest GitHub release. A feed address can be any URL returning JSON with a
            <code> version</code> or <code>tag_name</code>, or plain text. Leave both empty to switch checks off.
            {data?.update?.fromEnvironment ? ' A value set in server/.env takes precedence over these.' : ''}
          </p>

          <div className="bar wrap">
            <button onClick={onSaveUpdate} disabled={!!busy || locked}>{busy === 'update-source' ? 'Savingâ€¦' : 'Save update settings'}</button>
            <button onClick={onCheckUpdate} disabled={!!busy}>{busy === 'update' ? 'Checkingâ€¦' : 'Check for updates now'}</button>
          </div>
        </div>
        <p className="hint">Your key is stored only on this computer and is never shown again. Your notes are sent to the provider you choose{prov?.id === 'ollama' ? ', except with Ollama on this computer, where nothing leaves it' : ''}{isCli ? ' (here: to whatever AI that terminal tool is signed in to)' : ''}.</p>
      </div>
    </div>
  );
}

function OwnProvider({ onChanged }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ provider: 'deepseek', model: '', baseURL: '', apiKey: '', maxOutput: '', chunkChars: '', timeoutMs: '' });
  const [models, setModels] = useState([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    get('/settings/user').then((d) => {
      setData(d);
      const s = d.settings || {};
      const preset = (d.presets || []).find((p) => p.id === (s.provider || 'deepseek')) || d.presets?.[0];
      setForm({ provider: s.provider || preset?.id || 'deepseek', model: s.model || '', baseURL: s.baseURL || '', apiKey: '', maxOutput: s.maxOutput ? String(s.maxOutput) : '', chunkChars: s.chunkChars ? String(s.chunkChars) : '', timeoutMs: s.timeoutMs ? String(s.timeoutMs) : '' });
    }).catch((e) => setMsg({ ok: false, text: e.message }));
  }, []);

  const presets = data?.presets || [];
  const preset = presets.find((p) => p.id === form.provider);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const choose = (id) => {
    const p = presets.find((x) => x.id === id);
    setForm({ ...form, provider: id, baseURL: '', model: '', apiKey: '', maxOutput: '', chunkChars: '' });
    setModels([]); setMsg(null);
    if (p) setForm((f) => ({ ...f, provider: id }));
  };
  const act = (name, fn) => async () => {
    setBusy(name); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); }
  };
  const save = act('save', async () => {
    const body = { provider: form.provider, model: form.model, baseURL: form.baseURL, maxOutput: form.maxOutput, chunkChars: form.chunkChars, timeoutMs: form.timeoutMs };
    if (form.apiKey.trim()) body.apiKey = form.apiKey.trim();
    const d = await put('/settings/user', body);
    setData((old) => ({ ...old, settings: d.settings }));
    setForm((f) => ({ ...f, apiKey: '' }));
    onChanged?.(await get('/health'));
    setMsg({ ok: true, text: 'Your provider settings were saved. Your own key usage does not count against the free daily limit.' });
  });
  const test = act('test', async () => {
    const body = { provider: form.provider, model: form.model, baseURL: form.baseURL, timeoutMs: form.timeoutMs };
    if (form.apiKey.trim()) body.apiKey = form.apiKey.trim();
    const r = await post('/settings/user/test', body);
    setMsg({ ok: true, text: `Connected in ${(r.ms / 1000).toFixed(1)} s. Reply: ${r.sample}` });
  });
  const listModels = act('models', async () => {
    const body = { provider: form.provider, model: form.model, baseURL: form.baseURL };
    await put('/settings/user', body);
    const r = await get('/settings/user/models');
    setModels(r.models || []);
    setMsg({ ok: true, text: r.models?.length ? `${r.models.length} real model ids found. Pick one below.` : 'This provider does not list models. Type the model id.' });
  });
  const remove = act('remove', async () => {
    await del('/settings/user');
    setData((old) => ({ ...old, settings: null }));
    setMsg({ ok: true, text: 'Your saved provider key was removed. The server default is used again.' });
  });

  return (
    <div className="own-provider">
      <h3>Your own provider</h3>
      <p className="hint">Use your own DeepSeek, OpenAI, Anthropic, OpenRouter or compatible API key. It is stored encrypted and never returned to the browser. Own-key usage is not counted against the free daily limit.</p>
      {data?.settings?.hasKey && (
        <p className="hint">Saved key ending in <strong>…{data.settings.keyLast4}</strong>. Leave the key box empty to keep it.</p>
      )}
      <label className="field">
        <span>Provider</span>
        <select value={form.provider} onChange={(e) => choose(e.target.value)} disabled={!!busy}>
          {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>
      {preset && <p className="hint">{preset.help}</p>}
      <label className="field">
        <span>Base URL {preset?.baseURL ? `(default ${preset.baseURL})` : ''}</span>
        <input value={form.baseURL} onChange={set('baseURL')} placeholder={preset?.baseURL || 'https://…/v1'} disabled={!!busy} />
      </label>
      <label className="field">
        <span>Model {preset?.model ? `(default ${preset.model})` : '(use List models)'}</span>
        <input list="own-model-list" value={form.model} onChange={set('model')} placeholder={preset?.model || 'model id'} disabled={!!busy} />
        <datalist id="own-model-list">{models.map((m) => <option key={m} value={m} />)}</datalist>
      </label>
      <label className="field">
        <span>API key {data?.settings?.hasKey ? '(leave empty to keep the saved key)' : '(write-only)'}</span>
        <input type="password" autoComplete="off" spellCheck={false} value={form.apiKey} onChange={set('apiKey')} placeholder={data?.settings?.hasKey ? 'Saved key' : 'Paste your key'} disabled={!!busy} />
      </label>
      <div className="bar wrap">
        <button className="primary" onClick={save} disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save my provider'}</button>
        <button onClick={test} disabled={!!busy}>{busy === 'test' ? 'Testing…' : 'Test connection'}</button>
        <button onClick={listModels} disabled={!!busy}>{busy === 'models' ? 'Loading…' : 'List models'}</button>
        {data?.settings && <button className="link danger" onClick={remove} disabled={!!busy}>Remove my key</button>}
      </div>
      {msg && <div className={`banner ${msg.ok ? '' : 'error'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</div>}
    </div>
  );
}

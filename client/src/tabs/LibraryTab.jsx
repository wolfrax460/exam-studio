import React, { useState, useEffect } from 'react';
import { get, del } from '../api.js';

export default function LibraryTab({
  onOpen,
}) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');

  const load = () => get('/library').then(setItems).catch((e) => setErr(e.message));

  const open = async (id) => {
    try { onOpen(await get(`/library/${id}`)); } catch (e) { setErr(e.message); }
  };

  const remove = async (id) => {
    if (window.confirm('Delete this item?')) {
      try { await del(`/library/${id}`); load(); } catch (e) { setErr(e.message); }
    }
  };

  useEffect(() => { load(); }, []);

  if (!items) return <div className="panel work"><p className="hint">Loading library…</p></div>;

  return (
    <section className="library-list">
      <div className="library-header">
        <h3>Library ({items.length})</h3>
        <p className="hint">Click an item to open it. Each item shows its kind, title and when it was created.</p>
      </div>
      {err && <div className="banner error" role="alert">{err}</div>}
      {items.length === 0 && <div className="empty">Nothing here yet. Generate something and save it to the library.</div>}
      <ul className="library-items" role="list">
        {items.map((it) => (
          <li key={it.id} className={`library-item kind-${it.kind}`} onClick={() => open(it.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') open(it.id); }}>
            <span className="kind-badge">{it.kind}</span>
            <div className="item-main">
              <strong>{it.title}</strong>
              <span className="item-meta">{new Date(it.createdAt).toLocaleString()}</span>
            </div>
            <button type="button" className="link" onClick={(e) => { e.stopPropagation(); remove(it.id); }} aria-label={`Delete ${it.title}`}>Delete</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

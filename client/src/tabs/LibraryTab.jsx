import React, { useState, useEffect } from 'react';
import { get, del } from '../api.js';

// Faithful move of the Library tab that lived inline in App.jsx. Markup, class
// names and empty states are unchanged on purpose: this is a split, not a redesign.
export default function LibraryTab({ onOpen }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');

  const load = () => get('/library').then(setItems).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const open = async (id) => { try { onOpen(await get(`/library/${id}`)); } catch (e) { setErr(e.message); } };
  const remove = async (id) => { if (window.confirm('Delete this item?')) { try { await del(`/library/${id}`); load(); } catch (e) { setErr(e.message); } } };

  if (err) return <p className="banner error">{err}</p>;
  if (!items) return <p className="empty">Loading…</p>;
  if (!items.length) return <p className="empty">Nothing saved yet. Use "Save to library" on any result.</p>;

  return (
    <ul className="library">
      {items.map((it) => (
        <li key={it.id}>
          <span className="qtype">{it.kind}</span>
          <button className="link grow" onClick={() => open(it.id)}>{it.title}</button>
          <time>{new Date(it.createdAt).toLocaleDateString()}</time>
          <button className="link" onClick={() => remove(it.id)}>Delete</button>
        </li>
      ))}
    </ul>
  );
}

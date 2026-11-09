import React, { useEffect, useMemo, useState } from 'react';
import { get, del } from '../api.js';

const KINDS = {
  notes: { label: 'Study notes', mark: 'N' },
  handout: { label: 'Handout', mark: 'H' },
  exam: { label: 'Paper', mark: 'P' },
  flashcards: { label: 'Flashcards', mark: 'F' },
};

const FILTERS = [
  ['all', 'All resources'],
  ['notes', 'Notes'],
  ['handout', 'Handouts'],
  ['exam', 'Papers'],
  ['flashcards', 'Flashcards'],
];

const kindInfo = (kind) => KINDS[kind] || { label: kind || 'Resource', mark: 'R' };

export default function LibraryTab({ onOpen, initialQuery = '' }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    setQuery(initialQuery || '');
    setFilter('all');
  }, [initialQuery]);

  const load = () => {
    setErr('');
    get('/library')
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((error) => setErr(error.message));
  };

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => {
    const next = { all: items?.length || 0 };
    for (const [key] of FILTERS.slice(1)) next[key] = 0;
    for (const item of items || []) if (next[item.kind] !== undefined) next[item.kind] += 1;
    return next;
  }, [items]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (items || []).filter((item) => {
      if (filter !== 'all' && item.kind !== filter) return false;
      if (!needle) return true;
      return `${item.title || ''} ${kindInfo(item.kind).label} ${item.kind || ''}`.toLowerCase().includes(needle);
    });
  }, [items, filter, query]);

  const open = async (id) => {
    setErr('');
    try { onOpen(await get(`/library/${id}`)); } catch (error) { setErr(error.message); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this item?')) return;
    setErr('');
    try {
      await del(`/library/${id}`);
      setItems((current) => (current || []).filter((item) => item.id !== id));
    } catch (error) {
      setErr(error.message);
    }
  };

  if (!items) {
    return (
      <section className="library-page">
        <div className="section-head">
          <div>
            <p className="eyebrow">Saved work</p>
            <h2>Your library</h2>
            <p className="hint">Loading your saved notes, handouts, papers and flashcards.</p>
          </div>
        </div>
        <div className="library-skeleton-grid" aria-busy="true" aria-label="Loading library">
          {[0, 1, 2, 3].map((key) => <div className="library-skeleton" key={key} />)}
        </div>
      </section>
    );
  }

  return (
    <section className="library-page">
      <div className="section-head">
        <div>
          <p className="eyebrow">Saved work</p>
          <h2>Your library</h2>
          <p className="hint">Open a resource to continue editing or export it, wherever it was created.</p>
        </div>
        <button type="button" onClick={load}>Refresh</button>
      </div>

      {err && (
        <div className="banner error" role="alert">
          <span>{err}</span>
          <button type="button" className="link" onClick={load}>Try again</button>
        </div>
      )}

      <div className="library-toolbar">
        <label className="library-search">
          <span className="sr-only">Search saved resources</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title or type" />
        </label>
        <div className="library-filters" role="tablist" aria-label="Filter library resources">
          {FILTERS.map(([key, label]) => (
            <button
              type="button"
              role="tab"
              aria-selected={filter === key}
              key={key}
              className={filter === key ? 'on' : ''}
              onClick={() => setFilter(key)}
            >
              {label} <span>{counts[key] || 0}</span>
            </button>
          ))}
        </div>
        <span className="library-count">{filtered.length} of {items.length}</span>
      </div>

      {items.length === 0 ? (
        <div className="library-empty">
          <span className="empty-mark" aria-hidden="true">⌂</span>
          <div>
            <strong>Nothing saved yet</strong>
            <p>Use “Save to Library” on a generated document and it will appear here.</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="library-empty">
          <span className="empty-mark" aria-hidden="true">⌕</span>
          <div>
            <strong>No matching resources</strong>
            <p>Try a different search, or clear the filters to see everything.</p>
            <button type="button" className="link" onClick={() => { setQuery(''); setFilter('all'); }}>Clear search and filters</button>
          </div>
        </div>
      ) : (
        <ul className="library library-grid">
          {filtered.map((item) => {
            const info = kindInfo(item.kind);
            return (
              <li className="library-card" key={item.id}>
                <div className="library-card-top">
                  <span className={`kind-badge kind-${item.kind || 'resource'}`}><b>{info.mark}</b>{info.label}</span>
                  <time dateTime={item.createdAt || undefined}>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Saved'}</time>
                </div>
                <h3>
                  <button type="button" className="library-title" onClick={() => open(item.id)}>{item.title || 'Untitled resource'}</button>
                </h3>
                <div className="library-card-actions">
                  <button type="button" className="primary" onClick={() => open(item.id)}>Open</button>
                  <button type="button" className="link danger" onClick={() => remove(item.id)}>Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

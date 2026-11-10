import React, { useCallback, useEffect, useRef, useState } from 'react';
import { get } from './api.js';

export function useAdminQuery(path, institutionId, sessionUserId) {
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((version) => version + 1), []);
  const [result, setResult] = useState({});
  useEffect(() => {
    if (!path) return undefined;
    const controller = new AbortController();
    const headers = institutionId ? { 'X-Institution-Id': institutionId } : undefined;
    get(path, { signal: controller.signal, headers }).then(
      (data) => { if (!controller.signal.aborted) setResult({ path, institutionId, sessionUserId, revision, data }); },
      (error) => { if (!controller.signal.aborted) setResult({ path, institutionId, sessionUserId, revision, error }); },
    );
    return () => controller.abort();
  }, [path, institutionId, sessionUserId, revision]);
  const current = result.path === path && result.institutionId === institutionId && result.sessionUserId === sessionUserId ? result : {};
  return {
    data: current.data,
    error: current.revision === revision ? current.error : undefined,
    pending: Boolean(path && current.revision !== revision),
    reload,
  };
}

export function useAdminAction() {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const running = useRef(false);
  async function run(action, success) {
    if (running.current) return false;
    running.current = true;
    setPending(true);
    setFeedback(null);
    try {
      await action();
      if (success) setFeedback({ message: success });
      return true;
    } catch (error) {
      setFeedback({ message: error.message, error: true });
      return false;
    } finally {
      running.current = false;
      setPending(false);
    }
  }
  return { pending, feedback, run, clear: () => setFeedback(null) };
}

export function Feedback({ feedback }) {
  if (!feedback) return null;
  return <p className={`admin-feedback${feedback.error ? ' is-error' : ''}`} role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>;
}

export function LoadState({ query, name, children }) {
  if (query.error) return (
    <div className="admin-empty" role="alert">
      <p>Could not load {name}. {query.error.message}</p>
      <button type="button" onClick={query.reload}>Try again</button>
    </div>
  );
  if (!query.data) return <div className="admin-empty" role="status">Loading {name}…</div>;
  return <div aria-busy={query.pending}>{children}</div>;
}

export function EmptyRows({ children }) {
  return <div className="admin-empty" role="status">{children}</div>;
}

export function Pagination({ page, total, setPage, limit = 20 }) {
  const last = Math.max(1, Math.ceil(total / limit));
  useEffect(() => { if (page > last) setPage(last); }, [page, last, setPage]);
  return (
    <nav className="admin-pagination" aria-label="Pagination">
      <span>{total ? `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${number(total)}` : '0 results'}</span>
      <div>
        <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <button type="button" disabled={page >= last} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </nav>
  );
}

const numbers = new Intl.NumberFormat();
export const number = (value) => Number.isFinite(value) ? numbers.format(value) : 'Unavailable';
export function timestamp(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Unavailable';
}
export function uptime(value) {
  if (!Number.isFinite(value)) return 'Unavailable';
  const minutes = Math.floor(value / 60);
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return minutes ? `${minutes}m` : `${Math.floor(value)}s`;
}

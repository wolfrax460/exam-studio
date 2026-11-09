import React, { useRef, useState } from 'react';
import { uploadFile } from './api.js';
import Icon from './ui/Icon.jsx';

const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPT = '.pdf,.docx,.txt,.md';

function kb(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * One place to bring notes in: upload, paste, or pick from the notes library.
 * Uploads multiple files through the existing /extract endpoint and reports each one separately,
 * because one unreadable file must not hide the text that did arrive.
 */
export default function SourcePicker({
  text,
  onText,
  onFileInfo,
  libraryItems = [],
  onRefreshLibrary,
  onPickLibrary,
  libraryExtra,
  footer,
}) {
  const [mode, setMode] = useState('upload');
  const [files, setFiles] = useState([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localText, setLocalText] = useState('');
  const input = useRef(null);

  const value = text === undefined ? localText : text;
  const setValue = (next) => {
    setLocalText(next);
    if (onText) onText(next);
  };

  const combined = (list) => list.filter((entry) => entry.text).map((entry) => entry.text).join('\n\n');

  const accept = async (pickedFiles) => {
    const picked = Array.from(pickedFiles || []);
    if (picked.length === 0) return;
    setMode('upload');
    setBusy(true);
    const uploaded = [];

    for (const file of picked) {
      const base = { id: `${file.name}-${file.size}-${uploaded.length}-${Date.now()}`, name: file.name, size: file.size };
      if (!/\.(pdf|docx|txt|md)$/i.test(file.name)) {
        uploaded.push({ ...base, error: 'Unsupported file. Use a PDF, Word (.docx), .txt or .md file.' });
        continue;
      }
      if (file.size > MAX_BYTES) {
        uploaded.push({ ...base, error: `Too big at ${kb(file.size)}. The limit is 15 MB per file.` });
        continue;
      }
      if (file.size === 0) {
        uploaded.push({ ...base, error: 'This file is empty.' });
        continue;
      }
      try {
        const result = await uploadFile(file);
        const chars = result.chars || 0;
        if (chars === 0) {
          uploaded.push({ ...base, error: 'No readable text in this file. A scanned PDF needs OCR.' });
          continue;
        }
        uploaded.push({ ...base, chars, text: result.text || '', truncated: Boolean(result.truncated) });
      } catch (error) {
        uploaded.push({ ...base, error: error.message || 'Could not read this file.' });
      }
    }

    const next = [...files, ...uploaded];
    setFiles(next);
    const text_ = combined(next);
    if (text_) setValue(text_);
    if (onFileInfo) {
      const ok = next.filter((entry) => entry.text).length;
      onFileInfo(ok ? `${ok} file${ok === 1 ? '' : 's'}, ${text_.length.toLocaleString()} characters` : '');
    }
    setBusy(false);
  };

  const remove = (id) => {
    const next = files.filter((entry) => entry.id !== id);
    setFiles(next);
    setValue(combined(next));
    if (onFileInfo) onFileInfo(next.length ? `${next.length} file${next.length === 1 ? '' : 's'}` : '');
  };

  return (
    <div className="source-picker">
      <div className="segmented source-picker-tabs" role="tablist" aria-label="Where the notes come from">
        <button type="button" role="tab" aria-selected={mode === 'upload'} className={mode === 'upload' ? 'on' : ''} onClick={() => setMode('upload')}><Icon name="upload" size={16} /> Upload file</button>
        <button type="button" role="tab" aria-selected={mode === 'paste'} className={mode === 'paste' ? 'on' : ''} onClick={() => setMode('paste')}><Icon name="clipboard" size={16} /> Paste text</button>
        <button type="button" role="tab" aria-selected={mode === 'library'} className={mode === 'library' ? 'on' : ''} onClick={() => setMode('library')}><Icon name="book" size={16} /> Library</button>
      </div>

      {mode === 'upload' && (
        <>
          <div
            className={`drop ${over ? 'over' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => { event.preventDefault(); setOver(false); accept(event.dataTransfer.files); }}
          >
            <input
              ref={input}
              type="file"
              hidden
              multiple
              accept={ACCEPT}
              onChange={(event) => { accept(event.target.files); event.target.value = ''; }}
            />
            <Icon name="upload" size={30} className="drop-icon" />
            <strong>Drag and drop your files here</strong>
            <span>or <button type="button" className="link" onClick={() => input.current.click()} disabled={busy}>
              {busy ? 'Reading files…' : 'click to browse'}
            </button></span>
            <span className="hint">PDF, DOCX, TXT or MD · up to 15 MB per file</span>
          </div>

          {files.length > 0 && (
            <ul className="source-files">
              {files.map((entry) => (
                <li key={entry.id} className={entry.error ? 'is-error' : ''}>
                  <span className="source-file-name">{entry.name}</span>
                  <span className="hint">
                    {entry.error
                      ? entry.error
                      : `${(entry.chars || 0).toLocaleString()} characters · ${kb(entry.size)}${entry.truncated ? ' · cut to the size limit' : ''}`}
                  </span>
                  <button type="button" className="link" onClick={() => remove(entry.id)}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          <div className="source-choice"><span>or</span></div>
          <button type="button" className="source-paste-shortcut" onClick={() => setMode('paste')}>
            <Icon name="document" size={18} /> Paste your notes or topic here…
          </button>
        </>
      )}

      {mode === 'paste' && (
        <label className="field">
          <span>Paste your notes</span>
          <textarea rows={10} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Paste chapters or lesson notes here" />
        </label>
      )}

      {mode === 'library' && (
        <div className="notes-lib">
          <div className="bar">
            <span>Notes folder (read-only)</span>
            {onRefreshLibrary && <button type="button" className="link" onClick={onRefreshLibrary}>Refresh</button>}
          </div>
          {libraryItems.length === 0 && <p className="hint">No files in the notes folder yet.</p>}
          <div className="cards notes-lib-cards">
            {libraryItems.map((file) => (
              <button
                key={file.name}
                type="button"
                className="card"
                onClick={() => onPickLibrary && onPickLibrary(file.name)}
              >
                <span className="qtype">{file.moduleCode || 'DOC'}</span>
                <span className="front">{file.moduleTitle || file.name}</span>
                <span className="hint">{(file.charCount || 0).toLocaleString()} chars{file.numPages ? ` · ${file.numPages} pages` : ''}</span>
                {file.scanned && <span className="hint warn">Possibly scanned</span>}
              </button>
            ))}
          </div>
          {libraryExtra}
          {footer}
        </div>
      )}

      {value.length > 0 && <p className="hint">{value.length.toLocaleString()} characters{value.trim().length < 50 ? ' (add a little more)' : ''}</p>}
    </div>
  );
}

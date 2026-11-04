import React, { useState } from 'react';
import { post, download, run } from '../api.js';
import { save } from '../App.jsx';
import Empty from '../Empty.jsx';

export default function FlashcardsTab({
  text,
  project,
  cardCount,
  setCardCount,
  cards,
  setCards,
  busy,
  setBusy,
  run,
  save,
  sourceReady,
}) {
  const genCards = () => run('cards', async () => {
    setCards(await post('/flashcards/generate', { text, title: project.module, level: project.level, count: cardCount }));
  });

  const downloadTSV = () => {
    const blob = new Blob([cards.cards.map((c) => `${c.front.replace(/\t|\n/g, ' ')}\t${c.back.replace(/\t|\n/g, ' ')}`).join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(cards.title || 'Flashcards').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'Flashcards'}.tsv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section>
      <div className="bar">
        <input className="grow" type="number" min={5} max={200} value={cardCount} onChange={(e) => setCardCount(Math.max(5, Math.min(200, Number(e.target.value))))} placeholder="How many cards (5-200)" style={{ width: '120px' }} />
        <button className="primary" disabled={!sourceReady || !!busy} onClick={genCards}>{busy === 'cards' ? 'Writing…' : 'Make flashcards'}</button>
      </div>
      {!cards && <Empty ready={sourceReady} what="flashcards" />}
      {cards && (
        <div className="cards-ui">
          <div className="cards-header">
            <div className="hint">{cards.cards.length} cards · <span className="trap-badge">{cards.cards.filter((c) => c.cardType === 'trap').length} traps</span></div>
            <div className="card-actions">
              <label className="field small"><span>Trap cards only</span><input type="checkbox" checked={false} onChange={() => {}} /></label>
              <button className="primary" onClick={downloadTSV} disabled={busy === 'export'}>Download TSV</button>
              <button className="primary" onClick={() => save('flashcards', cards)} disabled={busy === 'save'}>Save to library</button>
            </div>
          </div>
          <div className="cards-grid">
            {cards.cards.map((c, i) => (
              <article key={i} className={`card ${c.cardType === 'trap' ? 'trap' : ''}`}>
                <header className="card-front">{c.front}</header>
                <footer className="card-back">{c.back}</footer>
                {c.topic && <span className="card-topic">{c.topic}</span>}
                {c.cardType === 'trap' && <span className="trap-tag">Trap</span>}
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
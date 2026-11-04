// Paper Studio engine: pure functions, no React and no server calls.
// A paper is frozen when it is generated, so marking, review and printing always read the
// same questions the trainee saw.

export const PASS_PERCENT = 50;

export const DEFAULT_CONFIG = {
  outcomes: [],
  types: ['mcq', 'tf', 'fill'],
  difficulty: 'all',
  count: 20,
  mode: 'exam',
  durationMin: 30,
  shuffleOptions: true,
};

export function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = copy[i];
    copy[i] = copy[j];
    copy[j] = current;
  }
  return copy;
}

export function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isCorrect(question, given) {
  if (!given || !String(given).trim()) return false;
  const attempt = normalize(given);
  if (question.type === 'fill') {
    const accepted = [question.answer, ...(question.accept || [])].map(normalize);
    return accepted.includes(attempt);
  }
  return normalize(question.answer) === attempt;
}

export function poolFor(bank, config) {
  return bank.filter(
    (question) =>
      config.outcomes.includes(question.outcome) &&
      config.types.includes(question.type) &&
      (config.difficulty === 'all' || question.difficulty === config.difficulty),
  );
}

// Mirrors generatePaper's round-robin so the sidebar preview is exact, not an estimate.
export function previewDistribution(counts, limit) {
  const remaining = [...counts];
  const picked = counts.map(() => 0);
  let total = 0;
  while (total < limit && remaining.some((count) => count > 0)) {
    for (let index = 0; index < remaining.length && total < limit; index += 1) {
      if (remaining[index] > 0) {
        remaining[index] -= 1;
        picked[index] += 1;
        total += 1;
      }
    }
  }
  return picked;
}

export function generatePaper(bank, config, info) {
  const pool = poolFor(bank, config);
  const buckets = config.outcomes.map((outcome) =>
    shuffle(pool.filter((question) => question.outcome === outcome)),
  );
  const selected = [];
  let cursor = 0;

  while (selected.length < config.count && buckets.some((bucket) => bucket.length > 0)) {
    const bucket = buckets[cursor % buckets.length];
    const next = bucket.shift();
    if (next) selected.push(next);
    cursor += 1;
  }

  const sections = config.outcomes
    .map((outcome) => ({
      outcome,
      questions: selected
        .filter((question) => question.outcome === outcome)
        .map((question) =>
          question.type === 'mcq' && config.shuffleOptions
            ? { ...question, options: shuffle(question.options || []) }
            : question,
        ),
    }))
    .filter((section) => section.questions.length > 0);

  return {
    id: `paper-${Date.now().toString(36)}`,
    config,
    sections,
    totalMarks: selected.length,
    createdAt: Date.now(),
    code: info?.code || 'PAPER',
    title: info?.title || 'Examination',
    outcomes: info?.outcomes || [],
  };
}

export function scorePaper(paper, answers, secondsUsed) {
  const items = paper.sections.flatMap((section) =>
    section.questions.map((question) => {
      const given = answers[question.id] || '';
      return { question, given, correct: isCorrect(question, given) };
    }),
  );

  const byOutcome = paper.sections.map((section) => {
    const sectionItems = items.filter((item) => item.question.outcome === section.outcome);
    return {
      outcome: section.outcome,
      total: sectionItems.length,
      correct: sectionItems.filter((item) => item.correct).length,
      answered: sectionItems.filter((item) => item.given.trim().length > 0).length,
    };
  });

  const correct = items.filter((item) => item.correct).length;
  const answered = items.filter((item) => item.given.trim().length > 0).length;
  const percent = items.length === 0 ? 0 : Math.round((correct / items.length) * 100);

  return {
    total: items.length,
    answered,
    correct,
    marks: correct,
    percent,
    passed: percent >= PASS_PERCENT,
    byOutcome,
    items,
    secondsUsed,
  };
}

export function formatClock(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function typeLabel(type) {
  if (type === 'mcq') return 'Multiple choice';
  if (type === 'tf') return 'True or false';
  return 'Fill in the blank';
}

export function outcomeTitle(outcomes, id) {
  const found = (outcomes || []).find((outcome) => outcome.id === id);
  return found ? found.title : `Learning outcome ${id}`;
}

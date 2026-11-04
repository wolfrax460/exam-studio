// Storage for hand-built paper modules, plus an adapter that lifts auto-markable questions
// out of an AI-generated exam so they can be reused in a paper.

const MODULES_KEY = 'examstudio:papers:modules';
const ACTIVE_KEY = 'examstudio:papers:active';
const CONFIG_KEY = 'examstudio:papers:config';

export function createModuleId() {
  return `module-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createQuestionId() {
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ---------------------------------------------------------------- generated exam import

function optionList(item) {
  if (Array.isArray(item.options)) {
    return item.options.filter((option) => typeof option === 'string' && option.trim());
  }
  if (Array.isArray(item.choices)) {
    return item.choices.filter((option) => typeof option === 'string' && option.trim());
  }
  return [];
}

function answerFor(item, options) {
  const answer = item.answer === undefined || item.answer === null ? '' : String(item.answer).trim();
  if (!answer) return '';
  if (options.length > 0 && /^[A-Za-z]$/.test(answer)) {
    const index = answer.toUpperCase().charCodeAt(0) - 65;
    return options[index] || '';
  }
  return answer;
}

function baseQuestion(item, outcome, index, prompt) {
  const options = optionList(item);
  const answer = answerFor(item, options);
  if (!answer) return null;
  if (options.length > 0) {
    return {
      id: `imported-${outcome}-${index}-a`,
      outcome,
      topic: item.topic || 'Imported',
      type: 'mcq',
      difficulty: 'core',
      prompt,
      options,
      answer,
      explanation: item.notes || item.explanation || '',
      reference: item.reference || 'Imported from a generated exam',
    };
  }
  if (/^(true|false)$/i.test(answer)) {
    return {
      id: `imported-${outcome}-${index}-a`,
      outcome,
      topic: item.topic || 'Imported',
      type: 'tf',
      difficulty: 'core',
      prompt,
      options: ['True', 'False'],
      answer: answer.charAt(0).toUpperCase() + answer.slice(1).toLowerCase(),
      explanation: item.notes || item.explanation || '',
      reference: item.reference || 'Imported from a generated exam',
    };
  }
  // Longer written answers cannot be auto-marked, so they are left behind.
  if (answer.length > 60) return null;
  return {
    id: `imported-${outcome}-${index}-a`,
    outcome,
    topic: item.topic || 'Imported',
    type: 'fill',
    difficulty: 'core',
    prompt,
    answer,
    accept: Array.isArray(item.accepted) ? item.accepted : [],
    explanation: item.notes || item.explanation || '',
    reference: item.reference || 'Imported from a generated exam',
  };
}

// One generated question can hold several sub-items (each with its own options and answer).
function questionsFrom(item, outcome, index) {
  const prompt = String(item.text || item.prompt || '').trim();
  const items = Array.isArray(item.items) ? item.items : [];

  if (item.type === 'true_false' && items.length > 0) {
    return items
      .map((entry, entryIndex) => {
        const statement = String(entry.text || '').trim();
        const answer = String(entry.answer || '').trim();
        if (!statement || !/^(true|false)$/i.test(answer)) return null;
        return {
          id: `imported-${outcome}-${index}-${entryIndex}`,
          outcome,
          topic: item.topic || 'Imported',
          type: 'tf',
          difficulty: 'core',
          prompt: statement,
          options: ['True', 'False'],
          answer: answer.charAt(0).toUpperCase() + answer.slice(1).toLowerCase(),
          explanation: item.notes || '',
          reference: item.reference || 'Imported from a generated exam',
        };
      })
      .filter(Boolean);
  }

  if (items.length > 0 && item.type === 'mcq') {
    return items
      .map((entry, entryIndex) => {
        const options = optionList(entry);
        const answer = answerFor(entry, options);
        const text = String(entry.text || '').trim();
        if (!text || !answer) return null;
        if (options.length > 0) {
          return {
            id: `imported-${outcome}-${index}-${entryIndex}`,
            outcome,
            topic: item.topic || 'Imported',
            type: 'mcq',
            difficulty: 'core',
            prompt: text,
            options,
            answer,
            explanation: entry.notes || item.notes || '',
            reference: item.reference || 'Imported from a generated exam',
          };
        }
        return null;
      })
      .filter(Boolean);
  }

  const single = baseQuestion(item, outcome, index, prompt);
  return single ? [single] : [];
}

/**
 * Turn a generated exam (flat questions or sections) into a read-only module.
 * Anything that cannot be marked automatically is dropped rather than mis-marked.
 */
export function importExam(exam) {
  if (!exam || typeof exam !== 'object') return null;

  const outcomes = [];
  const questions = [];

  if (Array.isArray(exam.sections) && exam.sections.length > 0) {
    exam.sections.forEach((section, sectionIndex) => {
      const id = sectionIndex + 1;
      const title = String(section.title || `Section ${String.fromCharCode(65 + sectionIndex)}`).trim();
      let added = 0;
      (section.items || []).forEach((item, itemIndex) => {
        const lifted = questionsFrom(item, id, itemIndex);
        lifted.forEach((question, offset) => {
          questions.push({ ...question, id: `${question.id}-${offset}` });
          added += 1;
        });
      });
      if (added > 0) outcomes.push({ id, title });
    });
  } else if (Array.isArray(exam.questions) && exam.questions.length > 0) {
    outcomes.push({ id: 1, title: String(exam.title || 'Generated exam') });
    exam.questions.forEach((item, index) => {
      questions.push(...questionsFrom(item, 1, index));
    });
  }

  if (questions.length === 0) return null;

  return {
    id: 'generated',
    code: 'GENERATED',
    title: String(exam.title || 'Generated exam'),
    description: 'Questions lifted from your generated exam. Read-only; create a module to add your own.',
    outcomes,
    questions,
    builtin: true,
  };
}

// ---------------------------------------------------------------- sanitising and storage

function sanitizeQuestion(raw, outcomes) {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.prompt !== 'string' ||
    typeof candidate.answer !== 'string' ||
    typeof candidate.outcome !== 'number' ||
    !outcomes.some((outcome) => outcome.id === candidate.outcome)
  ) {
    return null;
  }

  const type = candidate.type === 'tf' || candidate.type === 'fill' ? candidate.type : 'mcq';
  if (type === 'tf' && candidate.answer !== 'True' && candidate.answer !== 'False') return null;

  const options = Array.isArray(candidate.options)
    ? candidate.options.filter((option) => typeof option === 'string')
    : [];
  if (type === 'mcq' && (options.length < 2 || !options.includes(candidate.answer))) return null;

  return {
    id: candidate.id,
    outcome: candidate.outcome,
    topic: typeof candidate.topic === 'string' && candidate.topic.trim() ? candidate.topic : 'General',
    type,
    difficulty: candidate.difficulty === 'advanced' ? 'advanced' : 'core',
    prompt: candidate.prompt,
    options: type === 'tf' ? ['True', 'False'] : type === 'mcq' ? options : undefined,
    answer: candidate.answer,
    accept: Array.isArray(candidate.accept)
      ? candidate.accept.filter((entry) => typeof entry === 'string')
      : undefined,
    explanation: typeof candidate.explanation === 'string' ? candidate.explanation : '',
    reference:
      typeof candidate.reference === 'string' && candidate.reference.trim()
        ? candidate.reference
        : 'Manually added question',
  };
}

function sanitizeModule(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.code !== 'string' ||
    typeof candidate.title !== 'string'
  ) {
    return null;
  }

  const outcomes = (Array.isArray(candidate.outcomes) ? candidate.outcomes : [])
    .filter(
      (outcome) =>
        outcome && typeof outcome === 'object' && typeof outcome.id === 'number' && typeof outcome.title === 'string',
    )
    .map((outcome) => ({ id: outcome.id, title: outcome.title.trim() || `Learning outcome ${outcome.id}` }));

  if (outcomes.length === 0) return null;

  const questions = (Array.isArray(candidate.questions) ? candidate.questions : [])
    .map((question) => sanitizeQuestion(question, outcomes))
    .filter(Boolean);

  return {
    id: candidate.id,
    code: candidate.code,
    title: candidate.title,
    description: typeof candidate.description === 'string' ? candidate.description : '',
    outcomes,
    questions,
    builtin: false,
  };
}

export function loadModules() {
  try {
    const raw = window.localStorage.getItem(MODULES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeModule).filter(Boolean);
  } catch {
    return [];
  }
}

export function saveModules(modules) {
  try {
    window.localStorage.setItem(
      MODULES_KEY,
      JSON.stringify(modules.filter((module) => !module.builtin)),
    );
  } catch {
    /* storage unavailable: modules still work for this session */
  }
}

export function loadActiveId() {
  try {
    return window.localStorage.getItem(ACTIVE_KEY) || '';
  } catch {
    return '';
  }
}

export function saveActiveId(id) {
  try {
    window.localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function loadConfig() {
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveConfig(config) {
  try {
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
}

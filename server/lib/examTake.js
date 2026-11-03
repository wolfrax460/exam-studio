import crypto from 'node:crypto';

const SECRET = process.env.EXAM_ATTEMPT_SECRET || process.env.JWT_SECRET || 'exam-studio-attempt-dev';

export function signAttemptToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 1000 * 60 * 60 * 24 })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyAttemptToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}

const HIDDEN = new Set(['answer', 'correct', 'markingPoints', 'modelAnswer', 'notes', 'explanation', 'explanations', 'solution', 'code']);

function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (HIDDEN.has(key)) continue;
    out[key] = clean(item);
  }
  return out;
}

export function studentExam(exam) {
  return clean(exam || {});
}

export function questionList(exam) {
  const questions = [];
  if (Array.isArray(exam?.sections)) {
    for (const section of exam.sections) {
      (section.items || []).forEach((item, index) => {
        questions.push({ ...item, id: item.id || `${section.id || 'Q'}-${index + 1}`, marks: Number(item.marks) || Number(item.totalMarks) || Number(section.marksPerItem) || 1, sectionId: section.id, sectionTitle: section.title });
      });
    }
  } else {
    (exam?.questions || []).forEach((q, index) => questions.push({ ...q, id: q.id || `Q-${index + 1}` }));
  }
  return questions;
}

export function totalMarks(exam) {
  return questionList(exam).reduce((sum, q) => sum + (Number(q.marks) || Number(q.totalMarks) || 0), 0);
}

const norm = (v) => String(v ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

export function markObjective(questions, answers) {
  const perQuestion = [];
  let total = 0;
  for (const q of questions) {
    const max = Number(q.marks) || Number(q.totalMarks) || 0;
    const given = answers?.[q.id ?? q._id];
    const kind = q.type || q.kind;
    let awarded = 0;
    if (kind === 'mcq') {
      const expected = q.answer;
      awarded = given !== undefined && norm(given) === norm(expected) ? max : 0;
    } else if (kind === 'true_false') {
      if (Array.isArray(q.items)) {
        const got = Array.isArray(given) ? given : [];
        awarded = q.items.reduce((sum, item, i) => sum + (norm(item.answer) === norm(got[i]) ? (Number(item.marks) || 1) : 0), 0);
      } else {
        awarded = given !== undefined && norm(given) === norm(q.answer) ? max : 0;
      }
    } else if (kind === 'fill_blank') {
      const accepted = Array.isArray(q.accepted) ? q.accepted : [q.answer];
      awarded = accepted.some((a) => norm(a) === norm(given)) ? max : 0;
    } else if (kind === 'select_all') {
      const expected = (q.correct || []).map(norm).sort();
      const got = (Array.isArray(given) ? given : []).map(norm).sort();
      awarded = expected.length === got.length && expected.every((v, i) => v === got[i]) ? max : 0;
    } else {
      // Subjective questions are left for the AI marking phase.
      perQuestion.push({ questionId: q.id ?? q._id, awarded: 0, max, needsReview: true });
      continue;
    }
    total += awarded;
    perQuestion.push({ questionId: q.id ?? q._id, awarded, max, needsReview: false });
  }
  return { total, max: questions.reduce((sum, q) => sum + (Number(q.marks) || Number(q.totalMarks) || 0), 0), perQuestion };
}

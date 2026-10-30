// Tool definitions that force Claude to return structured JSON.

const str = { type: 'string' };
const strArr = { type: 'array', items: str };

export const examTool = {
  name: 'submit_exam',
  description: 'Submit the finished exam paper and its answer key.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short exam title' },
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['mcq', 'true_false', 'select_all', 'matching', 'sequencing', 'short_answer', 'essay'] },
            marks: { type: 'integer', description: 'Total marks for the whole question' },
            prompt: { type: 'string', description: 'Instruction or scenario shown above the question content' },
            items: {
              type: 'array',
              description: 'mcq: sub-questions with exactly 4 options and a letter answer. true_false: statements with answer "True" or "False". short_answer: prompts with the expected answer.',
              items: {
                type: 'object',
                properties: { text: str, options: strArr, answer: str },
                required: ['text', 'answer'],
              },
            },
            options: { ...strArr, description: 'select_all only: 5 options' },
            correct: { ...strArr, description: 'select_all only: letters of the correct options, e.g. ["A","C"]' },
            columnA: { ...strArr, description: 'matching only' },
            columnB: { ...strArr, description: 'matching only, same length as columnA, listed in mixed order' },
            matchAnswers: { ...strArr, description: 'matching only: for each columnA item, the letter of its columnB match' },
            steps: { ...strArr, description: 'sequencing only: steps shown in SHUFFLED order' },
            sequenceAnswer: { type: 'array', items: { type: 'integer' }, description: 'sequencing only: step numbers in the correct order' },
            parts: {
              type: 'array',
              description: 'essay only: lettered parts such as (a), (b)',
              items: { type: 'object', properties: { label: str, text: str, marks: { type: 'integer' } }, required: ['label', 'text', 'marks'] },
            },
            markingPoints: {
              type: 'array',
              description: 'essay only: what earns marks, with marks per point. Must add up to the question marks.',
              items: { type: 'object', properties: { text: str, marks: { type: 'integer' } }, required: ['text', 'marks'] },
            },
            notes: { type: 'string', description: 'Optional marking note, such as why a distractor is wrong' },
          },
          required: ['type', 'marks', 'prompt'],
        },
      },
    },
    required: ['title', 'questions'],
  },
};

export const notesTool = {
  name: 'submit_notes',
  description: 'Submit the finished study notes.',
  input_schema: {
    type: 'object',
    properties: {
      title: str,
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'Topic heading, keep the numbering used in the source if it has one' },
            keyPoints: { ...strArr, description: 'Short, self-contained points a student can memorise' },
            example: { type: 'string', description: 'One example or memory aid from the source' },
          },
          required: ['topic', 'keyPoints'],
        },
      },
    },
    required: ['title', 'sections'],
  },
};

export const cardsTool = {
  name: 'submit_flashcards',
  description: 'Submit the finished flashcards.',
  input_schema: {
    type: 'object',
    properties: {
      title: str,
      cards: {
        type: 'array',
        items: { type: 'object', properties: { front: str, back: str, topic: str, cardType: { type: 'string', enum: ['term', 'fact', 'trap'], description: 'Defaults to "term". Use "trap" when the front is a pair of terms students confuse and the back states the difference.' } }, required: ['front', 'back'] },
      },
    },
    required: ['title', 'cards'],
  },
};

// ---------------------------------------------------------------- sectioned exam (sections A-E)
// Generated one section at a time, so a 64-question paper still fits inside a small model's output
// limit, and a section that gets cut off can be retried on its own.

const answerField = { type: 'string', description: 'mcq: the letter A-D. true_false: "True" or "False". fill_blank and short_answer: the answer text.' };

const examSectionItems = {
  type: 'array',
  description: 'The questions of this section, in order.',
  items: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The question, statement or sentence. For fill_blank put ________ where the blank is.' },
      options: { type: 'array', items: { type: 'string' }, description: 'mcq only: exactly 4 options, without the A. B. C. D. letters.' },
      answer: answerField,
      notes: { type: 'string', description: 'mcq only, optional: one line saying why the tempting wrong option is wrong.' },
      marks: { type: 'integer', description: 'short_answer only: the marks for this question.' },
      markingPoints: {
        type: 'array',
        description: 'short_answer and structured only: what earns the marks.',
        items: { type: 'object', properties: { point: { type: 'string' }, marks: { type: 'integer' } }, required: ['point', 'marks'] },
      },
      title: { type: 'string', description: 'structured only: a short scenario title.' },
      totalMarks: { type: 'integer', description: 'structured only: the marks for the whole question.' },
      parts: {
        type: 'array',
        description: 'structured only: lettered parts (a), (b)... whose marks add up to totalMarks.',
        items: { type: 'object', properties: { letter: { type: 'string' }, text: { type: 'string' }, marks: { type: 'integer' } }, required: ['letter', 'text', 'marks'] },
      },
      modelAnswer: { type: 'string', description: 'short_answer and structured only: a full model answer.' },
      code: { type: 'string', description: 'structured only, optional: model code, with \\n for newlines.' },
    },
  },
};

export const examSectionTool = {
  name: 'submit_exam_section',
  description: 'Submit ONE section of an end-of-module examination paper.',
  input_schema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'The section letter, e.g. "A".' },
      title: { type: 'string', description: 'The section title in capitals, e.g. "MULTIPLE CHOICE".' },
      instruction: { type: 'string', description: 'The italic line under the banner, e.g. "Each question carries 1 mark. Circle the letter of the correct answer."' },
      items: examSectionItems,
    },
    required: ['id', 'items'],
  },
};

// ---------------------------------------------------------------- study handouts
// A handout is built in passes, so it needs three tools: the plan, one lesson, and the
// end-of-unit extras. See the HANDOUT STYLE preamble in ai.js.

export const handoutPlanTool = {
  name: 'submit_handout_plan',
  description: 'Submit the structure of a study handout: the units, their indicative contents, and the lessons.',
  input_schema: {
    type: 'object',
    properties: {
      moduleName: { type: 'string', description: 'Module title exactly as the notes give it' },
      moduleCode: { type: 'string', description: 'Module code, e.g. SWDBD401. Empty string if the notes have none.' },
      level: { type: 'string', description: 'RQF level, e.g. "Level 4". Empty string if absent.' },
      trade: { type: 'string', description: 'Trade or programme, e.g. "Software Development". Empty string if absent.' },
      units: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            number: { type: 'string', description: 'Unit number as written in the notes, e.g. "1"' },
            title: { type: 'string', description: 'Unit / learning outcome title' },
            learningOutcome: { type: 'string', description: 'The learning outcome sentence' },
            duration: { type: 'string', description: 'Duration as stated, e.g. "45 hours". Empty string if absent.' },
            indicativeContents: {
              type: 'array', items: { type: 'string' },
              description: 'The indicative contents exactly as listed in the notes, in order',
            },
            objectives: {
              type: 'array', items: { type: 'string' },
              description: 'What the trainee will be able to do by the end of the unit',
            },
            lessons: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  number: { type: 'string', description: 'Lesson number matching the source, e.g. "1.3"' },
                  title: { type: 'string', description: 'Lesson title' },
                  indicativeContent: { type: 'string', description: 'Which indicative content this lesson covers' },
                  subtopics: {
                    type: 'array', items: { type: 'string' },
                    description: 'Every sub-topic heading under this indicative content, in the notes order. Be complete - nothing may be skipped.',
                  },
                  sourceMarker: { type: 'string', description: 'A short distinctive phrase that appears at the START of this lesson in the source notes, used later to locate its text' },
                },
                required: ['number', 'title', 'subtopics'],
              },
            },
          },
          required: ['number', 'title', 'lessons'],
        },
      },
      errorsInSource: {
        type: 'array',
        description: 'Defects found in the notes: factual errors, mis-numbered lists, mismatched answers, wrong labels, duplicated words.',
        items: {
          type: 'object',
          properties: {
            where: { type: 'string', description: 'Where it is, e.g. "Unit 1, end assessment Q32"' },
            says: { type: 'string', description: 'What the notes say' },
            correction: { type: 'string', description: 'What is actually correct' },
          },
          required: ['where', 'says', 'correction'],
        },
      },
    },
    required: ['moduleName', 'units'],
  },
};

export const handoutLessonTool = {
  name: 'submit_handout_lesson',
  description: 'Submit one finished lesson of a study handout.',
  input_schema: {
    type: 'object',
    properties: {
      number: { type: 'string' },
      title: { type: 'string' },
      keyTerms: {
        type: 'array',
        description: 'One row per term this lesson introduces. Plain-language meaning, not a copy of the notes sentence.',
        items: {
          type: 'object',
          properties: {
            term: { type: 'string' },
            meaning: { type: 'string' },
          },
          required: ['term', 'meaning'],
        },
      },
      blocks: {
        type: 'array',
        description: 'The body of the lesson, in order. Use "prose" for a paragraph, "bullets" for a bold-lead-in bullet list, "steps" for a numbered procedure, "table" for a two-column reference table, "compare" for a Feature|A|B comparison.',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['prose', 'bullets', 'steps', 'table', 'compare'] },
            heading: { type: 'string', description: "Sub-heading, following the notes' own wording" },
            text: { type: 'string', description: 'prose only' },
            items: { type: 'array', items: { type: 'string' }, description: 'bullets and steps only. Start each with a bold lead-in written as **Lead-in:** rest of the point' },
            headers: { type: 'array', items: { type: 'string' }, description: 'table and compare only' },
            rows: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'table and compare only' },
            code: { type: 'string', description: 'Optional monospaced block shown after the items, e.g. a command or code listing' },
          },
          required: ['kind'],
        },
      },
      callouts: {
        type: 'array',
        description: 'Boxes that must not be missed. Use "tip" for traps and corrections of errors in the notes, "remember" for a definition or default to memorise, "trap" for a commonly confused pair.',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['tip', 'remember', 'trap'] },
            label: { type: 'string', description: 'Short bold label, e.g. "Exam tip" or "Remember"' },
            text: { type: 'string' },
          },
          required: ['kind', 'label', 'text'],
        },
      },
      workedExample: {
        type: 'object',
        description: "One full, correct, commented solution based on the notes' own practical activities.",
        properties: {
          title: { type: 'string' },
          task: { type: 'string', description: "The task, restated from the notes' scenario" },
          thinking: { type: 'string', description: 'How to think about it before starting' },
          steps: { type: 'array', items: { type: 'string' }, description: 'The solution, step by step' },
          code: { type: 'string', description: 'Optional full code / calculation / table as text' },
          expected: { type: 'string', description: 'What the correct result looks like' },
          why: { type: 'string', description: 'Why each decision is correct' },
          mistakes: { type: 'array', items: { type: 'string' }, description: 'The common mistakes to avoid' },
        },
        required: ['title', 'task', 'steps'],
      },
    },
    required: ['number', 'title', 'keyTerms', 'blocks'],
  },
};

export const handoutExtrasTool = {
  name: 'submit_handout_unit_extras',
  description: 'Submit the end-of-unit material: diagrams, memory sheet, revision questions, practical task and study tips.',
  input_schema: {
    type: 'object',
    properties: {
      unitNumber: { type: 'string' },
      diagrams: {
        type: 'array',
        description: 'Four to six of the most exam-relevant processes in this unit. Draw each as plain ASCII in a monospace box.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            ascii: { type: 'string', description: 'A simple boxed diagram using only + - | > < v ^ and letters. No unicode box art.' },
            readSteps: { type: 'array', items: { type: 'string' }, description: 'Numbered steps on how to read the diagram' },
            redraw: { type: 'string', description: 'How to redraw it in an exam, and what the marker looks for' },
          },
          required: ['title', 'ascii', 'readSteps', 'redraw'],
        },
      },
      memorySheet: {
        type: 'array',
        description: 'About 20 rows for a normal unit, more for a large one. Definitions, defaults, differences, acronyms, likely exam facts. One line each.',
        items: {
          type: 'object',
          properties: {
            remember: { type: 'string' },
            answer: { type: 'string' },
          },
          required: ['remember', 'answer'],
        },
      },
      revision: {
        type: 'object',
        properties: {
          mcq: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                q: { type: 'string' },
                choices: { type: 'array', items: { type: 'string' }, description: 'Exactly 4' },
                answer: { type: 'string', description: 'The letter' },
                reason: { type: 'string', description: 'One line' },
              },
              required: ['q', 'choices', 'answer', 'reason'],
            },
          },
          trueFalse: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                statement: { type: 'string' },
                answer: { type: 'string', description: '"True" or "False"' },
                reason: { type: 'string' },
              },
              required: ['statement', 'answer', 'reason'],
            },
          },
          scenario: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                q: { type: 'string', description: 'A realistic workplace situation testing judgement, not recall' },
                answer: { type: 'string' },
                reason: { type: 'string' },
              },
              required: ['q', 'answer', 'reason'],
            },
          },
          extraPractice: {
            type: 'array',
            description: "Answers to the notes' own end-of-unit exercises, worked through question by question.",
            items: {
              type: 'object',
              properties: {
                reference: { type: 'string', description: 'e.g. "Part II, question 7"' },
                answer: { type: 'string' },
                reason: { type: 'string' },
              },
              required: ['reference', 'answer', 'reason'],
            },
          },
        },
      },
      practical: {
        type: 'object',
        properties: {
          scenario: { type: 'string', description: 'The practical scenario from the notes, restated. Invent one in the same style only if the notes have none.' },
          steps: { type: 'array', items: { type: 'string' } },
          assessor: { type: 'array', items: { type: 'string' }, description: 'Checklist items. Each must be specific and testable - "Uses a parameterised query", never "understands security".' },
          report: { type: 'array', items: { type: 'string' }, description: 'What the written submission must contain' },
        },
      },
      studyTips: {
        type: 'array', items: { type: 'string' },
        description: '12 to 15 bullets, each written as "When you see X, think Y". The LAST one must always say that in practical work, explaining WHY earns marks as well as doing the thing, with a concrete example.',
      },
    },
    required: ['unitNumber', 'diagrams', 'memorySheet', 'revision', 'practical', 'studyTips'],
  },
};

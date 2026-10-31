// exam-studio-client.js - Call Exam Studio through tool calling from any OpenAI-compatible model
// (DeepSeek, NVIDIA, OpenRouter, Groq, Ollama, ...)
// Requirements: node-fetch (or native fetch in Node 18+)
// Set EXAM_STUDIO_TOKEN and EXAM_STUDIO_URL environment variables.

const TOKEN = process.env.EXAM_STUDIO_TOKEN;
const BASE = process.env.EXAM_STUDIO_URL || 'https://examstudio.duckdns.org';

if (!TOKEN) {
  console.error('Set EXAM_STUDIO_TOKEN to your Exam Studio PAT (est_... from account settings).');
  process.exit(1);
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'exam_studio_generate_exam',
      description: 'Generate an RTB-style exam paper from course notes.',
      parameters: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', description: 'Course notes text' },
          title: { type: 'string', description: 'Exam / module title' },
          totalMarks: { type: 'integer', default: 100 },
          types: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
];

async function callTool(name, args) {
  const pathMap = {
    exam_studio_generate_exam: '/api/v1/generate/exam',
  };
  const res = await fetch(`${BASE}${pathMap[name]}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  // Example: the model decides to call exam_studio_generate_exam
  const notes = `Unit 1 – Computer hardware.
  The CPU is the brain of the computer. It executes instructions from memory.
  RAM is volatile memory used for active programs. Storage (SSD/HDD) keeps data when powered off.
  Input devices include keyboard and mouse. Output devices include monitor and printer.`;

  const result = await callTool('exam_studio_generate_exam', {
    text: notes,
    title: 'Computer Hardware Fundamentals',
    totalMarks: 40,
    types: ['mcq', 'true_false', 'short_answer'],
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

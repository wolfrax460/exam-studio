---
name: exam-studio
description: Turn course notes into study notes, handouts, exams with separate marking schemes, and flashcards (including trap cards) for Rwanda TVET / RTB modules.
when_to_use: Use when you have course notes, a module manual, or a textbook and need to produce revision materials: structured study notes, a printable study handout (one lesson per indicative content), an exam paper with a marking scheme, or a flashcard deck. Ideal for TVET teachers and students preparing for RTB end-of-module examinations.
version: 0.2.1
---

# Exam Studio Skill

## When to use this skill

Use this skill when you have course notes (pasted text, or a .pdf/.docx/.txt/.md file) and need to generate:

- **Study notes** – structured, topic-by-topic revision notes with key points and examples, in the source's own order.
- **Study handout** – a full student handout with one lesson per indicative content, key terms, worked examples, diagrams, memory sheet, revision questions, a practical task, and study tips.
- **Exam paper** – an RTB-style end-of-module examination (sections A–E) with continuous numbering, plus a separate marking scheme.
- **Flashcards** – a deck of front/back cards including "trap cards" for commonly confused terms.

Do not use this skill for general conversation, coding help, or non-TVET content. It is grounded exclusively in the supplied notes.

## Workflow

1. **Read the notes** – paste the notes text, or point at a file (.pdf, .docx, .txt, .md). For long manuals, the notes are processed in slices so nothing is lost.
2. **Detect units** – Exam Studio identifies modules, learning outcomes, units, and indicative contents from the notes.
3. **Produce materials** – generate study notes, flashcards, an exam, or a handout from the notes.
4. **Check and fix** – run the built-in checker (exam_studio_check_exam / exam_studio_check_handout) and fix every warning before exporting.
5. **Export** – export to Word (.docx), PDF, or CSV (questions/answer key for Google Sheets).

## Marking scheme rules

- Every question has exactly one defensible answer (or a clear marking scheme for essays).
- Marks of all questions must add up to the paper total (e.g. 100 marks).
- Question type mix: sequencing and matching first, then mcq, select_all, true_false, short_answer, then essays.
- MCQ: exactly 4 options, one correct, correct letters spread evenly across A–D, no "all of the above".
- Wrong options must be plausible but clearly wrong according to the notes.
- Essay: lettered parts (a), (b), … whose marks add exactly to the question total; marking points whose marks also add exactly.
- Variants: variant A or B – same coverage, varied scenarios and combinations.
- Level and Trade fields are included on the paper header.
- No question is copied from the notes or any sample paper; all questions are original.
- Avoid duplicated questions: supply previously used questions in `avoid` to prevent near-duplicates.

## Source-grounded answers only

Every question, note, and flashcard must be based only on the supplied notes. Do not test anything the notes do not cover. Rewrite everything in your own words; never copy a sentence from the notes. If you add outside context, mark it clearly as "Extra".

## How to call the Exam Studio tools

Call these MCP tools through the Exam Studio remote MCP server at `https://examstudio.duckdns.org/mcp` (Streamable HTTP) or the local stdio MCP server:

| Tool | Purpose | Key arguments |
|------|---------|---------------|
| `exam_studio_format_guide` | Read the exact JSON format and style rules before generating anything. | (none) |
| `exam_studio_read_notes` | Extract text from a notes file (.pdf/.docx/.txt/.md), in slices with `next_offset`. | `file_path`, `offset`, `max_chars` |
| `exam_studio_generate_exam` | Generate an exam paper with the app's AI. | `text`/`file_path`, `title`, `level`, `total_marks`, `types`, `essay_count`, `meta` |
| `exam_studio_generate_notes` | Generate structured study notes from course notes. | `text`/`file_path`, `title`, `focus` |
| `exam_studio_generate_flashcards` | Generate flashcards including trap cards. | `text`/`file_path`, `title`, `count` |
| `exam_studio_generate_handout` | Generate a full study handout (one lesson per indicative content). | `text`/`file_path`, `title`, `level`, `units`, `include_revision`, `include_practical` |
| `exam_studio_check_exam` | Check an exam for mark totals, answer letters, sequence validity. | `exam`, `target_marks` |
| `exam_studio_check_handout` | Check a handout for completeness (lessons, key terms, diagrams, tips, practical). | `handout` |
| `exam_studio_export_exam` | Export exam to Word/PDF/CSV plus marking scheme. | `exam`, `formats`, `include_marking_scheme`, `output_dir`, `file_name` |
| `exam_studio_export_notes` | Export notes to Word/PDF. | `notes`, `formats`, `output_dir`, `file_name` |
| `exam_studio_export_handout` | Export handout to Word/PDF. | `handout`, `formats`, `output_dir`, `file_name` |
| `exam_studio_library` | List, get, or save items in the Exam Studio library. | `action`, `id`, `kind`, `title`, `data` |

Authentication: pass a Bearer token (PAT `est_...` or session JWT) in the `Authorization` header. Tokens are scoped (`read`, `generate:write`, `library:read`, `library:write`, `export:read`) and revocable from the app's account settings.

## Handling the daily limit

The built-in AI has a daily generation limit. If you receive a `daily_limit_reached` error:

- The error includes `resetsAt` (ISO timestamp) and `Retry-After` seconds.
- Do not retry in a loop. Wait until the reset time, or configure your own model/API key in the Exam Studio Settings screen.
- Users with their own API key are not subject to the daily limit.

## Exporting

After generating and checking, call `exam_studio_export_exam` with `formats: ["docx", "pdf"]` and `include_marking_scheme: true` to get a two-column Word paper, a PDF, and a separate marking scheme. CSV format writes questions and an answer key for Google Sheets.

## Worked examples

### Example 1: Exam from PHP programming notes

Notes: "Unit 4 – Control structures. If-else statements let a program branch. Switch statements are better for many discrete values. Loops: for, while, do-while."

1. `exam_studio_read_notes` (if a file) or paste text.
2. `exam_studio_generate_exam` with `total_marks: 40`, `types: ["mcq", "true_false", "short_answer"]`, `essay_count: 1`, `level: "L3"`, `trade: "ICT"`.
3. `exam_studio_check_exam` with `target_marks: 40` – fix any warnings.
4. `exam_studio_export_exam` with `formats: ["docx", "pdf"]` – returns file paths.

### Example 2: Flashcards with trap cards

Notes: "Encryption is reversible with a key. Hashing is one-way and cannot be reversed."

1. `exam_studio_generate_flashcards` with `count: 20`.
2. Expect about 1 in 5 cards to be type "trap", e.g. front: "Encryption vs hashing", back: "Encryption is reversible with a key; hashing is one-way."

### Example 3: Study handout from a full manual

Notes: a 200-page trainee manual with units, learning outcomes, and indicative contents.

1. `exam_studio_generate_handout` with the full text.
2. `exam_studio_check_handout` – fix every warning.
3. `exam_studio_export_handout` with `formats: ["docx", "pdf"]` – a printable student handout.

/**
 * MockS Mini AI — Question Normalizer
 * Cleans raw scraped or OCR text into standard MCQ JSON format.
 * Handles: Hindi Unicode normalization, option label cleanup, deduplication.
 */

const crypto = require('crypto');

// ─────────────────────────────────────────────
// NORMALIZE A SINGLE RAW MCQ OBJECT
// ─────────────────────────────────────────────
function normalizeQuestion(raw) {
  return {
    id: raw.id || crypto.randomUUID(),
    question_text: cleanText(raw.question_text || raw.question || ''),
    option_a: cleanText(extractOption(raw, 'a')),
    option_b: cleanText(extractOption(raw, 'b')),
    option_c: cleanText(extractOption(raw, 'c')),
    option_d: cleanText(extractOption(raw, 'd')),
    correct_option: normalizeCorrectOption(raw.correct_option || raw.answer || 'A'),
    explanation: cleanText(raw.explanation || raw.solution || ''),
    marks: Number(raw.marks) || 1,
    negative_marks: Number(raw.negative_marks) || 0,
    topic_tag: raw.topic_tag || raw.topic || 'General',
  };
}

// ─────────────────────────────────────────────
// NORMALIZE A FULL TEST OBJECT
// ─────────────────────────────────────────────
function normalizeTest(raw) {
  const questions = (raw.questions || []).map(normalizeQuestion);
  return {
    id: raw.id || crypto.randomUUID(),
    title: cleanText(raw.title || ''),
    description: cleanText(raw.description || ''),
    exam_category: raw.exam_category || 'General',
    subject_name: raw.subject_name || 'General',
    duration_minutes: Number(raw.duration_minutes) || 60,
    total_marks: Number(raw.total_marks) || questions.length,
    questions_count: questions.length,
    difficulty_level: raw.difficulty_level || 'Medium',
    questions,
    is_active: true,
  };
}

// ─────────────────────────────────────────────
// DEDUPLICATION
// ─────────────────────────────────────────────
const _seenHashes = new Set();

function isDuplicate(question) {
  const key = question.question_text.trim().toLowerCase().slice(0, 80);
  const hash = crypto.createHash('md5').update(key).digest('hex');
  if (_seenHashes.has(hash)) return true;
  _seenHashes.add(hash);
  return false;
}

function deduplicateQuestions(questions) {
  return questions.filter(q => !isDuplicate(q));
}

// ─────────────────────────────────────────────
// BATCH NORMALIZE
// ─────────────────────────────────────────────
function normalizeBatch(rawTests) {
  return rawTests.map(normalizeTest).filter(t => t.questions.length >= 5);
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')        // collapse multiple spaces
    .replace(/[""]/g, '"')           // normalize quotes
    .replace(/['']/g, "'")
    .replace(/\u200b/g, '')          // remove zero-width spaces
    .replace(/\ufffd/g, '')          // remove replacement chars
    .trim();
}

function extractOption(raw, letter) {
  const upper = letter.toUpperCase();
  // Try common key patterns: option_a, optionA, a, A, choices.a
  return (
    raw[`option_${letter}`] ||
    raw[`option${upper}`] ||
    raw[letter] ||
    raw[upper] ||
    (raw.choices && (raw.choices[letter] || raw.choices[upper])) ||
    (raw.options && raw.options[letter.charCodeAt(0) - 97]) ||
    ''
  );
}

function normalizeCorrectOption(val) {
  if (!val) return 'A';
  const v = String(val).trim().toUpperCase();
  // Handle: "A", "1", "option_a", "(A)", "a)"
  if (/^[ABCD]$/.test(v)) return v;
  if (v === '1') return 'A';
  if (v === '2') return 'B';
  if (v === '3') return 'C';
  if (v === '4') return 'D';
  const match = v.match(/[ABCD]/);
  return match ? match[0] : 'A';
}

module.exports = { normalizeQuestion, normalizeTest, normalizeBatch, deduplicateQuestions, cleanText };

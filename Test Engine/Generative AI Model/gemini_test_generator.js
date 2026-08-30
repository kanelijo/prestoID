/**
 * MockS Gemini Test Generator
 * Uses Gemini REST API directly to generate unique, authentic MCQ tests
 * for every exam category defined in exam_category_config.js
 */

require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const crypto = require('crypto');

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
if (!API_KEY) throw new Error('EXPO_PUBLIC_GEMINI_API_KEY not found in .env');

const genAI = new GoogleGenerativeAI(API_KEY);
const CANDIDATE_MODELS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash'];

async function callGemini(prompt) {
  let lastError = null;

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.8,
        },
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      if (text) return text;
    } catch (err) {
      lastError = err;
      // If quota/rate limit error (429 or 404), continue to next model
      if (err.message.includes('429') || err.message.includes('quota') || err.message.includes('404')) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('All Gemini candidate models failed.');
}

// ─────────────────────────────────────────────
// BUILD PROMPT
// ─────────────────────────────────────────────
function buildPrompt(config, testIndex, topic) {
  const langInstruction =
    config.language === 'bilingual'
      ? 'Write EACH question in BOTH Hindi and English — Hindi first, then English translation in brackets.'
      : config.language === 'english'
      ? 'Write all questions in English only.'
      : 'Write all questions in Hindi only.';

  return `You are an expert exam paper setter for ${config.exam_category} in India.

Generate EXACTLY ${config.questions_per_test} unique MCQ questions for a mock test.
Topic focus: "${topic}"
Exam: ${config.exam_category} — ${config.subject_name}
Difficulty: ${config.difficulty_level}
${langInstruction}

STRICT RULES:
- Each question must be genuinely different — no repetition, no trivial variants
- All 4 options must be plausible (no obviously wrong options)
- The correct answer must be factually accurate
- Explanation must be 1-2 sentences, informative
- Marks per question: ${config.marks_per_question}, Negative marks: ${config.negative_marks}

Respond with ONLY a valid JSON array (no markdown, no explanation outside JSON):
[
  {
    "question_text": "...",
    "option_a": "...",
    "option_b": "...",
    "option_c": "...",
    "option_d": "...",
    "correct_option": "A" | "B" | "C" | "D",
    "explanation": "...",
    "topic_tag": "${topic}"
  },
  ...
]`;
}

// ─────────────────────────────────────────────
// CALL GEMINI
// ─────────────────────────────────────────────
async function generateQuestionsForTopic(config, testIndex, topic, retries = 3) {
  const prompt = buildPrompt(config, testIndex, topic);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const text = await callGemini(prompt);

      // Strip markdown code fences if present
      const jsonText = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

      const questions = JSON.parse(jsonText);
      if (!Array.isArray(questions)) throw new Error('Response is not an array');

      // Attach IDs and marks
      return questions.map(q => ({
        id: crypto.randomUUID(),
        question_text: q.question_text || '',
        option_a: q.option_a || '',
        option_b: q.option_b || '',
        option_c: q.option_c || '',
        option_d: q.option_d || '',
        correct_option: String(q.correct_option || 'A').toUpperCase().replace(/[^ABCD]/, 'A'),
        explanation: q.explanation || '',
        marks: config.marks_per_question,
        negative_marks: config.negative_marks,
        topic_tag: q.topic_tag || topic,
      }));
    } catch (err) {
      if (attempt === retries) {
        console.error(`    ⚠️  Failed after ${retries} attempts for topic "${topic}": ${err.message}`);
        return null;
      }
      await sleep(2000 * attempt);
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// GENERATE ONE FULL TEST
// ─────────────────────────────────────────────
async function generateTest(config, testIndex) {
  // Pick a topic from the config's topic list (round-robin)
  const topic = config.topics[testIndex % config.topics.length];

  const questions = await generateQuestionsForTopic(config, testIndex, topic);
  if (!questions || questions.length === 0) return null;

  const setLabel = String(testIndex + 1).padStart(2, '0');

  return {
    id: crypto.randomUUID(),
    title: `${config.title_prefix} — Set ${setLabel}`,
    description: `Authentic ${config.exam_category} mock test covering "${topic}". ${config.questions_per_test} questions, ${config.duration_minutes} minutes.`,
    exam_category: config.exam_category,
    subject_name: config.subject_name,
    duration_minutes: config.duration_minutes,
    total_marks: config.total_marks,
    questions_count: questions.length,
    difficulty_level: config.difficulty_level,
    questions,
    is_active: true,
  };
}

// ─────────────────────────────────────────────
// GENERATE N TESTS FOR ONE CATEGORY
// ─────────────────────────────────────────────
async function generateTestsForCategory(config, count = 10) {
  const tests = [];
  for (let i = 0; i < count; i++) {
    process.stdout.write(`  [${i + 1}/${count}] Generating: ${config.title_prefix} Set ${String(i + 1).padStart(2, '0')}... `);
    const test = await generateTest(config, i);
    if (test) {
      tests.push(test);
      process.stdout.write('✅\n');
    } else {
      process.stdout.write('❌ (skipped)\n');
    }
    // Rate limit: 1 call per 2s to stay under Gemini free quota
    if (i < count - 1) await sleep(2000);
  }
  return tests;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { generateTest, generateTestsForCategory };

/**
 * Gemini Multimodal PDF OCR & Full-Length Batching Agent
 * Automatically divides full-length question papers into sequential batches:
 * - JEE Main: Full 75 Questions (3 Batches of 25)
 * - NEET UG: Full 180-200 Questions (6-8 Batches of 25-30)
 * - MPPSC / SSC / UPSC: Full 100 Questions (4 Batches of 25)
 */

const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('./config');

const API_KEY = config.GEMINI_API_KEY;
if (!API_KEY) throw new Error('[GeminiAgent] Missing GEMINI_API_KEY in configuration or .env');

const genAI = new GoogleGenerativeAI(API_KEY);
const CANDIDATE_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.6-flash',
];

/**
 * System Extraction Rules & Protocol for Gemini
 */
const SYSTEM_EXTRACTION_RULES = `
You are an expert Chief Academic Examiner and Multimodal OCR Specialist for Competitive Exams in India (MPPSC, JEE Main, NEET UG, UPSC, SSC).

TASK:
Examine the attached PDF document and extract the specified batch range of Multiple Choice Questions (MCQs) into clean, valid JSON.

STRICT RULES & CONSTRAINTS:
1. BILINGUAL ACCURACY:
   - If questions are printed in both Hindi (Devanagari) and English, preserve both in the question text.
   - Do NOT drop Devanagari Hindi characters or mathematical symbols (use standard LaTeX like \\frac{a}{b}, \\sqrt{x} for formulas).

2. 4 OPTIONS MANDATORY:
   - Extract option_a, option_b, option_c, option_d clearly without prefix letters.
   - Never combine options into question text.

3. ANSWER KEY & VERIFICATION:
   - Look for the official answer key table if present in the document.
   - If an answer key is NOT found, you MUST solve the question accurately as a subject expert and assign correct_option ('A', 'B', 'C', or 'D').
   - Provide a comprehensive, high-yield conceptual explanation.

4. METADATA TAGGING:
   - Tag each question with its academic topic_tag (e.g., 'Modern History', 'Mechanics', 'Electrochemistry', 'Genetics').
   - Assign difficulty_level: 'Easy', 'Medium', or 'Hard'.

5. JSON ONLY & ESCAPING:
   - Your response must be 100% valid JSON matching the exact schema below. No markdown text outside the JSON.
   - All backslashes in mathematical formulas or LaTeX must be properly escaped (\\\\frac, \\\\sqrt, \\\\alpha).

SCHEMA:
{
  "test_title": "string (e.g. JEE Main 2026 Shift 1 Official Paper)",
  "subject_name": "string (e.g. PCM Full Test)",
  "exam_category": "string (e.g. JEE Main, NEET, MPPSC, SSC)",
  "questions": [
    {
      "question_number": 1,
      "question_text": "string",
      "option_a": "string",
      "option_b": "string",
      "option_c": "string",
      "option_d": "string",
      "correct_option": "A | B | C | D",
      "explanation": "string",
      "topic_tag": "string",
      "difficulty_level": "Easy | Medium | Hard"
    }
  ]
}
`;

/**
 * Converts a local file to a GoogleGenerativeAI inline part
 */
function fileToGenerativePart(filePath, mimeType = 'application/pdf') {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(filePath)).toString('base64'),
      mimeType,
    },
  };
}

/**
 * Robust JSON parser with fallback sanitizer for LaTeX and escaped characters
 */
function parseAndSanitizeJson(rawText) {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch (e1) {
    try {
      const sanitized = cleaned.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\');
      return JSON.parse(sanitized);
    } catch (e2) {
      throw e1;
    }
  }
}

/**
 * Calls Gemini with fallback models and automatic 429 rate limit backoff
 */
async function callGeminiWithFallback(prompt, pdfPart) {
  let lastError = null;

  for (const modelName of CANDIDATE_MODELS) {
    try {
      console.log(`   ⚡ Invoking model: ${modelName}...`);
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_EXTRACTION_RULES,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });

      const result = await model.generateContent([prompt, pdfPart]);
      const rawText = result.response.text().trim();
      const parsed = parseAndSanitizeJson(rawText);
      return parsed;
    } catch (err) {
      console.warn(`   ⚠️ Model ${modelName} warning:`, err.message.slice(0, 140));
      lastError = err;

      if (err.message.includes('429') || err.message.includes('quota')) {
        console.log('   ⏳ [RateLimit] Waiting 8s for quota window...');
        await new Promise((r) => setTimeout(r, 8000));
      }
    }
  }

  throw lastError || new Error('All Gemini candidate models failed.');
}

/**
 * Determines expected question count and batch intervals based on the exam category
 */
function getBatchPlanForExam(examCategory) {
  const cat = (examCategory || '').toUpperCase();

  if (cat.includes('JEE') && (cat.includes('MAIN') || cat.includes('PCM'))) {
    // 75 Questions total: 3 batches of 25 (Physics Q1-25, Chem Q26-50, Maths Q51-75)
    return {
      targetTotal: 75,
      batches: [
        { batchNum: 1, start: 1, end: 25, subject: 'Physics' },
        { batchNum: 2, start: 26, end: 50, subject: 'Chemistry' },
        { batchNum: 3, start: 51, end: 75, subject: 'Mathematics' },
      ],
    };
  }

  if (cat.includes('JEE') && (cat.includes('ADV') || cat.includes('ADVANCED'))) {
    // 54 Questions total: 2 batches of 27
    return {
      targetTotal: 54,
      batches: [
        { batchNum: 1, start: 1, end: 27, subject: 'Paper 1 PCM' },
        { batchNum: 2, start: 28, end: 54, subject: 'Paper 2 PCM' },
      ],
    };
  }

  if (cat.includes('NEET')) {
    // 180 Questions total: 6 batches of 30
    return {
      targetTotal: 180,
      batches: [
        { batchNum: 1, start: 1, end: 30, subject: 'Physics' },
        { batchNum: 2, start: 31, end: 60, subject: 'Physics & Chemistry' },
        { batchNum: 3, start: 61, end: 90, subject: 'Chemistry' },
        { batchNum: 4, start: 91, end: 120, subject: 'Botany' },
        { batchNum: 5, start: 121, end: 150, subject: 'Botany & Zoology' },
        { batchNum: 6, start: 151, end: 180, subject: 'Zoology' },
      ],
    };
  }

  if (cat.includes('MPPSC') || cat.includes('SSC') || cat.includes('UPSC')) {
    // 100 Questions total: 4 batches of 25
    return {
      targetTotal: 100,
      batches: [
        { batchNum: 1, start: 1, end: 25, subject: 'Part 1' },
        { batchNum: 2, start: 26, end: 50, subject: 'Part 2' },
        { batchNum: 3, start: 51, end: 75, subject: 'Part 3' },
        { batchNum: 4, start: 76, end: 100, subject: 'Part 4' },
      ],
    };
  }

  // Default: 2 batches of 25 (up to 50 questions)
  return {
    targetTotal: 50,
    batches: [
      { batchNum: 1, start: 1, end: 25, subject: 'Section A' },
      { batchNum: 2, start: 26, end: 50, subject: 'Section B' },
    ],
  };
}

/**
 * Extracts a complete full-length test using sequential batches
 * @param {string} pdfFilePath - Local path to the PDF
 * @param {object} metadata - Exam metadata (examCategory, defaultSubject, etc.)
 */
async function extractQuestionsFromPDF(pdfFilePath, metadata = {}) {
  console.log(`🧠 [GeminiAgent] Analyzing PDF via Full-Length Batch OCR: "${pdfFilePath}"...`);

  if (!fs.existsSync(pdfFilePath)) {
    throw new Error(`File not found: ${pdfFilePath}`);
  }

  const pdfPart = fileToGenerativePart(pdfFilePath, 'application/pdf');
  const plan = getBatchPlanForExam(metadata.examCategory);

  console.log(`📋 [BatchPlan] Target Exam: ${metadata.examCategory} | Target Questions: ${plan.targetTotal} (${plan.batches.length} Batches)`);

  let masterTestTitle = '';
  let masterSubjectName = metadata.defaultSubject || 'General';
  let masterQuestions = [];
  const seenTexts = new Set();

  for (const b of plan.batches) {
    console.log(`\n📦 [Batch ${b.batchNum}/${plan.batches.length}] Extracting Questions ${b.start} to ${b.end} (${b.subject || ''})...`);

    const batchPrompt = `
Exam Target: ${metadata.examCategory || 'Competitive Exam'}
Subject Section: ${b.subject || metadata.defaultSubject || 'General'}

BATCH TASK:
Extract all MCQs in this document that fall in question range: from Question ${b.start} up to Question ${b.end}.
- Do NOT extract questions outside of this range (e.g. do not extract questions below ${b.start} or above ${b.end}).
- If the document does not contain questions up to ${b.end} (e.g. document ends at an earlier question), extract up to the last question available in the document.
- If no questions exist in this number range in the document, return an empty "questions": [] list.

Return valid JSON according to schema.
`;

    try {
      const batchResult = await callGeminiWithFallback(batchPrompt, pdfPart);

      if (batchResult.test_title && !masterTestTitle) {
        masterTestTitle = batchResult.test_title;
      }
      if (batchResult.subject_name && !masterSubjectName) {
        masterSubjectName = batchResult.subject_name;
      }

      const batchQuestions = batchResult.questions || [];
      console.log(`   ✅ Extracted ${batchQuestions.length} question(s) in Batch ${b.batchNum}!`);

      if (batchQuestions.length === 0) {
        console.log(`   ℹ️ No further questions found in range ${b.start}-${b.end}. Concluding batch extraction.`);
        break;
      }

      for (const q of batchQuestions) {
        const textKey = (q.question_text || '').slice(0, 40).toLowerCase();
        if (textKey && !seenTexts.has(textKey)) {
          seenTexts.add(textKey);
          masterQuestions.push(q);
        }
      }

      // Small 2-second pause between batches to prevent API rate spikes
      await new Promise((r) => setTimeout(r, 2000));
    } catch (batchErr) {
      console.error(`   ❌ Failed Batch ${b.batchNum}:`, batchErr.message);
      // Continue to next batch if one fails
    }
  }

  console.log(`\n🏁 [Extraction Complete] Total Unique Questions Collected: ${masterQuestions.length}/${plan.targetTotal}`);

  return {
    test_title: masterTestTitle || `${metadata.examCategory} Full Length Mock (${masterQuestions.length} Qs)`,
    subject_name: masterSubjectName,
    exam_category: metadata.examCategory || 'General',
    questions: masterQuestions,
  };
}

module.exports = { extractQuestionsFromPDF, getBatchPlanForExam };

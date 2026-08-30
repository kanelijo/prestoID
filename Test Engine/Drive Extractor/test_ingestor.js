/**
 * MockS Test Ingestor
 * Formats extracted test JSON into Supabase `public_tests` schema with valid UUIDs and publishes in real-time.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

const BACKUP_DIR = path.join(__dirname, 'extracted_tests');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Validates and ingests an extracted test into Supabase `public_tests`
 * @param {object} rawExtracted - Output from gemini_pdf_ocr_agent
 * @param {object} metadata - Category, marking scheme, etc.
 */
async function ingestExtractedTest(rawExtracted, metadata = {}) {
  const questionsList = (rawExtracted.questions || []).map((q, idx) => ({
    id: crypto.randomUUID(),
    question_text: q.question_text || `Question ${idx + 1}`,
    option_a: q.option_a || 'Option A',
    option_b: q.option_b || 'Option B',
    option_c: q.option_c || 'Option C',
    option_d: q.option_d || 'Option D',
    correct_option: (q.correct_option || 'A').toUpperCase().trim().charAt(0),
    explanation: q.explanation || 'Detailed solution will be available in the post-test analysis.',
    topic_tag: q.topic_tag || metadata.defaultSubject || 'General',
    difficulty_level: q.difficulty_level || 'Medium',
    marks: metadata.markingScheme?.correct || 2,
    negative_marks: metadata.markingScheme?.negative || 0,
  }));

  const questionsCount = questionsList.length;
  let markPerQ = metadata.markingScheme?.correct || 2;
  let totalMarks = questionsCount * markPerQ;
  let durationMinutes = 120;

  const catUpper = (metadata.examCategory || rawExtracted.exam_category || '').toUpperCase();
  if (catUpper.includes('JEE')) {
    durationMinutes = 180; // 3 Hours
    totalMarks = 300;
  } else if (catUpper.includes('NEET')) {
    durationMinutes = 200; // 3 Hours 20 Mins
    totalMarks = 720;
  } else if (catUpper.includes('SSC')) {
    durationMinutes = 60; // 1 Hour
    totalMarks = 200;
  } else if (catUpper.includes('MPPSC') || catUpper.includes('UPSC')) {
    durationMinutes = 120; // 2 Hours
    totalMarks = 200;
  } else {
    durationMinutes = questionsCount > 50 ? 120 : 60;
  }

  const testPayload = {
    id: crypto.randomUUID(),
    title: rawExtracted.test_title || `${metadata.examCategory || 'Exam'} Practice Mock 2026`,
    description: `Extracted from official curriculum/paper. Contains ${questionsCount} MCQs with comprehensive bilingual explanations.`,
    exam_category: metadata.examCategory || rawExtracted.exam_category || 'MPPSC',
    subject_name: rawExtracted.subject_name || metadata.defaultSubject || 'General Studies',
    duration_minutes: durationMinutes,
    total_marks: totalMarks,
    questions_count: questionsCount,
    difficulty_level: 'Medium',
    questions: questionsList,
    is_active: true,
    created_at: new Date().toISOString(),
  };

  // 1. Save backup copy locally
  const backupFileName = `${testPayload.exam_category}_${Date.now()}_test.json`;
  const backupFilePath = path.join(BACKUP_DIR, backupFileName);
  fs.writeFileSync(backupFilePath, JSON.stringify(testPayload, null, 2), 'utf8');
  console.log(`📁 [Ingestor] Saved local backup: "${backupFilePath}"`);

  // 2. Insert into Supabase `public_tests`
  console.log(`⚡ [Ingestor] Inserting into Supabase \`public_tests\`...`);
  const { data, error } = await supabase
    .from('public_tests')
    .insert([testPayload])
    .select('id, title');

  if (error) {
    console.error(`❌ [Ingestor] Supabase error:`, error.message);
    return { success: false, error: error.message, testPayload };
  }

  console.log(`🎉 [Ingestor] Successfully published test: "${testPayload.title}" (ID: ${testPayload.id})`);
  return { success: true, id: testPayload.id, testPayload };
}

module.exports = { ingestExtractedTest };

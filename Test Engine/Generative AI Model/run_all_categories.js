/**
 * MockS — Run All Categories
 * Entry point: generates 10 unique tests per exam category using Gemini AI,
 * then ingests all into Supabase public_tests table.
 *
 * Usage: node "Test Engine/Generative AI Model/run_all_categories.js"
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { EXAM_CONFIGS } = require('./exam_category_config');
const { generateTestsForCategory } = require('./gemini_test_generator');

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://35.234.211.3:8000';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TESTS_PER_CATEGORY = 10;
const OUT_DIR = path.join(__dirname, '..', 'From Repository');
const OUT_FILE = path.join(OUT_DIR, 'ai_generated_tests.json');

// ─────────────────────────────────────────────
// INGEST BATCH INTO SUPABASE
// ─────────────────────────────────────────────
async function ingestToSupabase(tests) {
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < tests.length; i += 5) {
    const batch = tests.slice(i, i + 5);
    const { data, error } = await supabase.from('public_tests').insert(batch).select('id, title');
    if (error) {
      console.error(`  ❌ Batch error: ${error.message}`);
      errorCount += batch.length;
    } else {
      successCount += data ? data.length : batch.length;
      console.log(`  📤 Ingested batch ${Math.floor(i / 5) + 1} → ${successCount} tests in DB`);
    }
    // Small pause between DB batches
    await new Promise(r => setTimeout(r, 300));
  }

  return { successCount, errorCount };
}

// ─────────────────────────────────────────────
// MAIN PIPELINE
// ─────────────────────────────────────────────
async function runPipeline() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   MockS Gemini AI Test Generation Pipeline           ║');
  console.log(`║   ${EXAM_CONFIGS.length} exam categories × ${TESTS_PER_CATEGORY} tests = ${EXAM_CONFIGS.length * TESTS_PER_CATEGORY} total        ║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  const allTests = [];
  let totalSuccess = 0;
  let totalErrors = 0;

  for (let ci = 0; ci < EXAM_CONFIGS.length; ci++) {
    const config = EXAM_CONFIGS[ci];
    console.log(`\n[${ci + 1}/${EXAM_CONFIGS.length}] 📚 Category: ${config.exam_category} — ${config.subject_name}`);
    console.log('─'.repeat(60));

    // Generate tests with Gemini
    const tests = await generateTestsForCategory(config, TESTS_PER_CATEGORY);
    allTests.push(...tests);

    if (tests.length === 0) {
      console.log('  ⚠️  No tests generated for this category, skipping ingestion.');
      continue;
    }

    // Ingest to Supabase immediately after each category
    console.log(`  🚀 Ingesting ${tests.length} tests into Supabase...`);
    const { successCount, errorCount } = await ingestToSupabase(tests);
    totalSuccess += successCount;
    totalErrors += errorCount;

    // Progressively save JSON to disk
    fs.writeFileSync(OUT_FILE, JSON.stringify(allTests, null, 2), 'utf8');

    console.log(`  ✅ Category done: ${successCount} published, ${errorCount} errors`);
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log(`║  🎉 PIPELINE COMPLETE                                 ║`);
  console.log(`║  ✅ Published: ${String(totalSuccess).padEnd(4)} tests                          ║`);
  console.log(`║  ❌ Errors:    ${String(totalErrors).padEnd(4)} tests                          ║`);
  console.log(`║  📁 Saved to:  ai_generated_tests.json               ║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
}

runPipeline().catch(err => {
  console.error('💥 Fatal error:', err.message);
  process.exit(1);
});

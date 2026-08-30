/**
 * MockS Master Drive Extractor & Ingestion Pipeline
 * Connects Google Drive ➔ Gemini Multimodal OCR ➔ Supabase Real-Time Ingestion
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');
const {
  getServiceAccountToken,
  scanAllFoldersRecursively,
  downloadDriveFile,
  markFileAsProcessed,
  getLocalDropFiles,
  LOCAL_DROP_DIR,
} = require('./drive_service');
const { extractQuestionsFromPDF } = require('./gemini_pdf_ocr_agent');
const { ingestExtractedTest } = require('./test_ingestor');

async function processPdfFile(filePath, fileName, metadata, driveFileId = null) {
  console.log('────────────────────────────────────────────────────────');
  console.log(`🚀 [Processing] ${fileName} (${metadata.examCategory})`);
  console.log('────────────────────────────────────────────────────────');

  try {
    // 1. Run Gemini Multimodal Extraction
    const extracted = await extractQuestionsFromPDF(filePath, metadata);

    if (!extracted || !extracted.questions || extracted.questions.length === 0) {
      console.warn(`⚠️ [Warning] No questions were extracted from: ${fileName}`);
      return false;
    }

    // 2. Ingest into Supabase
    const result = await ingestExtractedTest(extracted, metadata);

    // 3. Mark as processed
    if (result.success) {
      if (driveFileId) {
        await markFileAsProcessed(driveFileId, fileName);
      } else {
        // Local drop rename
        const processedPath = path.join(path.dirname(filePath), `[PROCESSED] ${fileName}`);
        fs.renameSync(filePath, processedPath);
        console.log(`🏷️ [LocalDrop] Renamed to: "${processedPath}"`);
      }
      return true;
    }
  } catch (err) {
    console.error(`❌ [Error] Failed processing ${fileName}:`, err.message);
  }
  return false;
}

async function runPipeline() {
  console.log('========================================================');
  console.log('🌟 MOCKS GOOGLE DRIVE & GEMINI AGENT INGESTION PIPELINE 🌟');
  console.log('========================================================');

  // Check if Service Account JSON key is present
  const hasServiceAccount = fs.existsSync(config.SERVICE_ACCOUNT_KEY_PATH);

  if (hasServiceAccount) {
    console.log('🔑 [Auth] Google Service Account key detected!');
    const token = await getServiceAccountToken().catch(() => null);

    if (token) {
      console.log('✅ [Auth] Google Drive API connection authorized!');
      console.log(`\n📂 Scanning entire 5 TB Drive root tree (ID: ${config.ROOT_FOLDER_ID})...`);

      const driveFiles = await scanAllFoldersRecursively(config.ROOT_FOLDER_ID);
      console.log(`📄 Found ${driveFiles.length} new PDF(s) to process across all exam categories.`);

      for (const file of driveFiles) {
        console.log(`⬇️ Downloading "${file.name}" [Category: ${file.metadata.examCategory}]...`);
        const localPath = await downloadDriveFile(file.id, file.name);
        await processPdfFile(localPath, file.name, file.metadata, file.id);
      }
    } else {
      console.warn('⚠️ [Auth] Service Account token generation failed. Checking local drop folder...');
    }
  } else {
    console.log('ℹ️ [Info] No service_account.json found yet.');
    console.log(`📁 Checking local drop folder: "${LOCAL_DROP_DIR}"...`);
  }

  // Check Local Drop Folder (Drop PDFs here anytime for instant processing!)
  const localFiles = getLocalDropFiles();
  if (localFiles.length > 0) {
    console.log(`\n📥 Found ${localFiles.length} local drop PDF(s) to process!`);
    for (const filePath of localFiles) {
      const fileName = path.basename(filePath);
      // Auto-detect exam category from filename
      let matchedCategory = 'MPPSC';
      let defaultSub = 'General Studies';

      const lower = fileName.toLowerCase();
      if (lower.includes('jee') || lower.includes('iit')) {
        matchedCategory = 'JEE Main';
        defaultSub = 'PCM Full Test';
      } else if (lower.includes('neet') || lower.includes('medical') || lower.includes('bio')) {
        matchedCategory = 'NEET';
        defaultSub = 'PCB Full Mock';
      } else if (lower.includes('ssc') || lower.includes('cgl') || lower.includes('rrb')) {
        matchedCategory = 'SSC';
        defaultSub = 'General Awareness';
      }

      await processPdfFile(filePath, fileName, {
        examCategory: matchedCategory,
        defaultSubject: defaultSub,
        markingScheme: { correct: 2, negative: 0 },
      });
    }
  } else {
    console.log('ℹ️ No local files in local_drop folder.');
  }

  console.log('\n========================================================');
  console.log('🏁 Extraction & Ingestion Cycle Completed.');
  console.log('========================================================\n');
}

if (require.main === module) {
  runPipeline().catch(console.error);
}

module.exports = { runPipeline, processPdfFile };

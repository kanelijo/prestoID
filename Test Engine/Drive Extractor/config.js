/**
 * Google Drive ➔ Gemini Agent & OCR Extractor Configuration
 */

require('dotenv').config();
const path = require('path');

module.exports = {
  // Google Drive Credentials
  // Path to Google Cloud Service Account JSON Key
  SERVICE_ACCOUNT_KEY_PATH: path.join(__dirname, 'service_account.json'),

  // Root Google Drive Folder ID
  ROOT_FOLDER_ID: process.env.DRIVE_ROOT_FOLDER_ID || '1meptDSGygpp8bJ3l1sPcc4Qw9953uUgU',

  // Gemini API Key (from .env)
  GEMINI_API_KEY: process.env.EXPO_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY,

  // Supabase Configuration
  SUPABASE_URL: process.env.SUPABASE_URL || 'http://35.234.211.3:8000',
  SUPABASE_ANON_KEY:
    process.env.SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE',

  // Local storage cache folder for downloaded PDFs
  TEMP_DOWNLOAD_DIR: path.join(__dirname, 'temp_downloads'),
};

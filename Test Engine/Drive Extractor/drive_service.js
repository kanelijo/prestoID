/**
 * Google Drive Connection & Scanner Service
 * Connects to Google Drive v3 API using a Service Account JSON key.
 * Can list files in target folders, stream/download PDFs, and mark them as processed.
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');

// Ensure local download and drop directories exist
if (!fs.existsSync(config.TEMP_DOWNLOAD_DIR)) {
  fs.mkdirSync(config.TEMP_DOWNLOAD_DIR, { recursive: true });
}

const LOCAL_DROP_DIR = path.join(__dirname, 'local_drop');
if (!fs.existsSync(LOCAL_DROP_DIR)) {
  fs.mkdirSync(LOCAL_DROP_DIR, { recursive: true });
}

/**
 * Generates an OAuth2 Access Token using the Service Account JSON Key
 */
async function getServiceAccountToken() {
  if (!fs.existsSync(config.SERVICE_ACCOUNT_KEY_PATH)) {
    return null;
  }

  const keyFile = JSON.parse(fs.readFileSync(config.SERVICE_ACCOUNT_KEY_PATH, 'utf8'));
  const clientEmail = keyFile.client_email;
  const privateKey = keyFile.private_key;

  const jsrsasign = require('jsrsasign');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const sHeader = JSON.stringify(header);
  const sPayload = JSON.stringify(payload);
  const sJWT = jsrsasign.jws.JWS.sign('RS256', sHeader, sPayload, privateKey);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: sJWT,
    }),
  });

  const data = await res.json();
  if (data.access_token) {
    return data.access_token;
  }
  throw new Error(`Failed to obtain Google Drive token: ${JSON.stringify(data)}`);
}

/**
 * Exam taxonomy and marking scheme mapping based on folder names
 */
function getMetadataForFolder(folderName) {
  const name = folderName.toUpperCase().replace(/\s+/g, '_');
  if (name.includes('JEE_MAIN')) {
    return { examCategory: 'JEE Main', defaultSubject: 'PCM Full Test', markingScheme: { correct: 4, negative: 1 } };
  }
  if (name.includes('JEE_ADV') || name.includes('ADVANCED')) {
    return { examCategory: 'JEE Advanced', defaultSubject: 'PCM Full Test', markingScheme: { correct: 4, negative: 1 } };
  }
  if (name.includes('NEET_UG') || name.includes('NEET')) {
    return { examCategory: 'NEET', defaultSubject: 'PCB Full Mock', markingScheme: { correct: 4, negative: 1 } };
  }
  if (name.includes('MPPSC')) {
    return { examCategory: 'MPPSC', defaultSubject: 'General Studies', markingScheme: { correct: 2, negative: 0 } };
  }
  if (name.includes('SSC')) {
    return { examCategory: 'SSC', defaultSubject: 'General Awareness', markingScheme: { correct: 2, negative: 0.5 } };
  }
  if (name.includes('RRB') || name.includes('RAILWAY')) {
    return { examCategory: 'Railway', defaultSubject: 'General Science', markingScheme: { correct: 1, negative: 0.33 } };
  }
  if (name.includes('POLICE')) {
    return { examCategory: 'MP Police', defaultSubject: 'General Studies & Logic', markingScheme: { correct: 1, negative: 0 } };
  }
  if (name.includes('UPSC')) {
    return { examCategory: 'UPSC', defaultSubject: 'GS Paper 1', markingScheme: { correct: 2, negative: 0.66 } };
  }
  return { examCategory: folderName.replace(/_/g, ' '), defaultSubject: 'General Studies', markingScheme: { correct: 2, negative: 0 } };
}

/**
 * Recursively scans all subfolders from root and returns all un-processed PDFs
 */
async function scanAllFoldersRecursively(parentFolderId, currentCategory = null) {
  const token = await getServiceAccountToken();
  if (!token) return [];

  let results = [];
  const q = `'${parentFolderId}' in parents and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size)&pageSize=100`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  const items = data.files || [];

  for (const item of items) {
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      // It's a subfolder - recurse into it
      const categoryMetadata = getMetadataForFolder(item.name);
      const subResults = await scanAllFoldersRecursively(item.id, categoryMetadata);
      results = results.concat(subResults);
    } else if (item.mimeType === 'application/pdf' && !item.name.startsWith('[PROCESSED]')) {
      // It's an un-processed PDF!
      results.push({
        id: item.id,
        name: item.name,
        size: item.size,
        metadata: currentCategory || {
          examCategory: 'General',
          defaultSubject: 'General Studies',
          markingScheme: { correct: 2, negative: 0 },
        },
      });
    }
  }

  return results;
}

/**
 * Downloads a file from Google Drive to local temp directory
 * @param {string} fileId - Google Drive File ID
 * @param {string} fileName - Destination filename
 */
async function downloadDriveFile(fileId, fileName) {
  const token = await getServiceAccountToken();
  if (!token) throw new Error('No Google Drive access token available');

  const destPath = path.join(config.TEMP_DOWNLOAD_DIR, fileName);
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to download ${fileName} from Drive: HTTP ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
  return destPath;
}

/**
 * Marks a file as processed in Google Drive by prepending [PROCESSED] to its name
 * @param {string} fileId - Google Drive File ID
 * @param {string} currentName - Current file name
 */
async function markFileAsProcessed(fileId, currentName) {
  const token = await getServiceAccountToken();
  if (!token) return;

  const newName = `[PROCESSED] ${currentName}`;
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;

  await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: newName }),
  });
  console.log(`🏷️ [DriveService] Renamed file in Drive to: "${newName}"`);
}

/**
 * Returns any PDF files dropped locally into `local_drop/`
 */
function getLocalDropFiles() {
  if (!fs.existsSync(LOCAL_DROP_DIR)) return [];
  const files = fs.readdirSync(LOCAL_DROP_DIR);
  return files
    .filter((f) => f.toLowerCase().endsWith('.pdf') && !f.startsWith('[PROCESSED]'))
    .map((f) => path.join(LOCAL_DROP_DIR, f));
}

module.exports = {
  getServiceAccountToken,
  scanAllFoldersRecursively,
  downloadDriveFile,
  markFileAsProcessed,
  getLocalDropFiles,
  LOCAL_DROP_DIR,
};

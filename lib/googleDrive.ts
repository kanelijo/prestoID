import * as FileSystem from 'expo-file-system/legacy';
import { GOOGLE_OAUTH, GOOGLE_DRIVE_FOLDER_ID } from './googleDriveCredentials';

export type GoogleUploadResult = {
  fileUrl: string;
  thumbnailUrl: string | null;
};

// ─── Module-level cache to avoid re-fetching token + folder on every upload ──
let _cachedToken: string | null = null;
let _cachedTokenExpiry: number = 0;                    // epoch ms
const _folderCache: Record<string, string> = {};       // folderName → folderId

// 1. Get OAuth access token — cached for 55 min (token lasts 60 min)
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (_cachedToken && now < _cachedTokenExpiry) {
    return _cachedToken;
  }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `client_id=${GOOGLE_OAUTH.client_id}&client_secret=${GOOGLE_OAUTH.client_secret}&refresh_token=${GOOGLE_OAUTH.refresh_token}&grant_type=refresh_token`,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Google OAuth failed: ${JSON.stringify(data)}`);
  }
  _cachedToken = data.access_token;
  _cachedTokenExpiry = now + 55 * 60 * 1000; // 55 minutes
  return _cachedToken!;
}

// 2. Find or create a subfolder — result is cached in memory for the session
async function findOrCreateSubfolder(accessToken: string, parentFolderId: string, folderName: string): Promise<string> {
  // Return cached folder ID if available
  const cacheKey = `${parentFolderId}::${folderName}`;
  if (_folderCache[cacheKey]) {
    return _folderCache[cacheKey];
  }

  const query = `name = '${folderName}' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const searchData = await searchRes.json();

  if (searchData.files && searchData.files.length > 0) {
    _folderCache[cacheKey] = searchData.files[0].id;
    return _folderCache[cacheKey];
  }

  // Create folder if not found
  const createUrl = 'https://www.googleapis.com/drive/v3/files';
  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    }),
  });
  
  const createData = await createRes.json();
  if (!createRes.ok) {
    throw new Error(`Failed to create subfolder: ${JSON.stringify(createData)}`);
  }
  _folderCache[cacheKey] = createData.id;
  return _folderCache[cacheKey];
}

// 3. Upload file to Google Drive and return direct sharing/thumbnail URLs
export async function uploadFileToGoogleDrive(
  fileUri: string,
  fileName: string,
  coachingCode: string,
  onProgress?: (progress: number) => void
): Promise<GoogleUploadResult> {
  // Step 1: Get Access Token (cached after first call)
  const accessToken = await getAccessToken();

  // Step 2: Get or Create folder (cached after first call)
  const folderId = await findOrCreateSubfolder(accessToken, GOOGLE_DRIVE_FOLDER_ID, coachingCode);

  // Step 3+4 COMBINED: Multipart upload — metadata + file body in a SINGLE request
  // This saves one full round-trip compared to the old create-then-PATCH approach.
  const boundary = `kanelflow_${Date.now()}`;
  const metadataPart = JSON.stringify({ name: fileName, parents: [folderId] });

  // Read file as base64 to construct multipart body
  const fileBase64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Detect MIME type from extension
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    txt: 'text/plain',
    zip: 'application/zip',
  };
  const mimeType = mimeMap[ext] || 'application/octet-stream';

  const multipartBody =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadataPart}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    `${fileBase64}\r\n` +
    `--${boundary}--`;

  // Use XMLHttpRequest so we get upload progress on multipart
  const fileId = await new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id`);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('Content-Type', `multipart/related; boundary=${boundary}`);

    // Progress tracking via XHR upload events
    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          onProgress(Math.min(event.loaded / event.total, 1));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          resolve(res.id);
        } catch {
          reject(new Error('Failed to parse upload response'));
        }
      } else {
        reject(new Error(`Google Drive multipart upload failed: ${xhr.status} ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during Google Drive upload'));
    xhr.send(multipartBody);
  });

  // Step 5 + 6 IN PARALLEL: Set permissions AND fetch file links at the same time
  const [permissionRes, detailsRes] = await Promise.all([
    fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    }),
    fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=webContentLink,thumbnailLink`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  ]);

  if (!permissionRes.ok) {
    const errText = await permissionRes.text();
    throw new Error(`Failed to share Google Drive file: ${errText}`);
  }

  if (!detailsRes.ok) {
    const errText = await detailsRes.text();
    throw new Error(`Failed to fetch file links: ${errText}`);
  }

  const details = await detailsRes.json();

  return {
    fileUrl: details.webContentLink || `https://drive.google.com/uc?export=download&id=${fileId}`,
    thumbnailUrl: details.thumbnailLink || null,
  };
}

// 4. Delete file from Google Drive (used when study material is deleted)
export async function deleteFileFromGoogleDrive(fileUrl: string): Promise<void> {
  try {
    // Extract file ID from Google Drive URL
    let fileId: string | null = null;

    if (fileUrl.includes('id=')) {
      const match = fileUrl.match(/id=([^&]+)/);
      if (match) fileId = match[1];
    } else if (fileUrl.includes('/d/')) {
      const match = fileUrl.match(/\/d\/([^/]+)/);
      if (match) fileId = match[1];
    } else if (fileUrl.includes('file/d/')) {
      const match = fileUrl.match(/file\/d\/([^/]+)/);
      if (match) fileId = match[1];
    }

    if (!fileId) return;

    const accessToken = await getAccessToken();
    const deleteUrl = `https://www.googleapis.com/drive/v3/files/${fileId}`;
    
    await fetch(deleteUrl, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    console.warn('Failed to delete file from Google Drive:', err);
  }
}

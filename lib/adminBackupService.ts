import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { supabase } from './supabase';

const GOOGLE_CONFIG = {
  webClientId: '500087439972-42l1848gjo7lm7du488ui5f44fluup5m.apps.googleusercontent.com',
  offlineAccess: true,
  scopes: [
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/drive.file',
  ],
};

async function getValidAccessToken(): Promise<string | null> {
  try {
    GoogleSignin.configure(GOOGLE_CONFIG);
    await GoogleSignin.hasPlayServices();
    await GoogleSignin.signInSilently();
    const tokens = await GoogleSignin.getTokens();
    return tokens.accessToken;
  } catch (silentError) {
    try {
      GoogleSignin.configure(GOOGLE_CONFIG);
      await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();
      return tokens.accessToken;
    } catch (interactiveError) {
      console.warn('[AdminBackupService] Google Sign-In failed:', interactiveError);
      return null;
    }
  }
}

/**
 * Creates or finds a folder in Google Drive.
 */
async function getOrCreateDriveFolder(folderName: string, accessToken: string): Promise<string> {
  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(folderName)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });
    const folderData = await createRes.json();
    return folderData.id;
  } catch (e) {
    console.warn('[AdminBackupService] Folder lookup error:', e);
    return 'root';
  }
}

/**
 * Uploads a file buffer to Google Drive.
 */
async function uploadFileToDrive(
  fileName: string,
  mimeType: string,
  base64Content: string,
  folderId: string,
  accessToken: string
) {
  const boundary = 'zenza_admin_export_boundary';
  const metadata = {
    name: fileName,
    parents: folderId !== 'root' ? [folderId] : undefined,
    mimeType: mimeType,
  };

  let body = '';
  body += '--' + boundary + '\r\n';
  body += 'Content-Type: application/json; charset=UTF-8\r\n\r\n';
  body += JSON.stringify(metadata) + '\r\n';
  body += '--' + boundary + '\r\n';
  body += 'Content-Transfer-Encoding: base64\r\n';
  body += `Content-Type: ${mimeType}\r\n\r\n`;
  body += base64Content + '\r\n';
  body += '--' + boundary + '--';

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(body.length),
    },
    body: body,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Drive Upload Failed: ${errText}`);
  }

  return response.json();
}

/**
 * Main Admin Export Pipeline (Students, Fees, Attendance -> Excel Sheets in Google Drive)
 */
export async function exportAdminCoachingToDrive(
  businessId: string,
  businessName: string,
  onProgress?: (step: string, detail?: string) => void
): Promise<boolean> {
  try {
    onProgress?.('authorizing', 'Connecting to Google Drive...');
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      throw new Error('Google Sign-In failed or was cancelled.');
    }

    const folderName = `Zenza - ${businessName || 'Coaching Records'}`;
    onProgress?.('preparing', `Locating Drive folder: "${folderName}"...`);
    const folderId = await getOrCreateDriveFolder(folderName, accessToken);

    const nowStr = new Date().toISOString().split('T')[0];

    // 1. Export Students Master List
    onProgress?.('exporting_students', 'Generating Students Master Excel Sheet...');
    const { data: students } = await supabase
      .from('students')
      .select('enrollment_id, name, father_name, phone, parent_phone, email, batch_name, course, duration, fee_amount, fee_cycle, fee_status, valid_from, valid_till, secret_code, created_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (students && students.length > 0) {
      const studentRows = students.map((s, idx) => ({
        'S.No': idx + 1,
        'Enrollment ID': s.enrollment_id,
        'Student Name': s.name,
        'Father Name': s.father_name || 'N/A',
        'Student Phone': s.phone || 'N/A',
        'Parent Phone': s.parent_phone || 'N/A',
        'Email': s.email || 'N/A',
        'Batch': s.batch_name,
        'Course': s.course || 'General Course',
        'Duration': s.duration || '1 Year',
        'Fee Amount (₹)': s.fee_amount || 0,
        'Fee Cycle': s.fee_cycle || 'monthly',
        'Fee Status': (s.fee_status || 'unpaid').toUpperCase(),
        'Validity Start': s.valid_from || 'N/A',
        'Validity End': s.valid_till || 'N/A',
        'Secret Passcode': s.secret_code || 'N/A',
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(studentRows);
      XLSX.utils.book_append_sheet(wb, ws, 'Students');
      const studentBase64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

      await uploadFileToDrive(
        `Students_Directory_${nowStr}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        studentBase64,
        folderId,
        accessToken
      );
    }

    // 2. Export Fees & Payments Ledger
    onProgress?.('exporting_fees', 'Generating Fee Collection Ledger...');
    const { data: payments } = await supabase
      .from('payments')
      .select('id, amount, payment_date, payment_mode, receipt_no, status, remarks, students(name, enrollment_id, batch_name)')
      .eq('business_id', businessId)
      .order('payment_date', { ascending: false });

    if (payments && payments.length > 0) {
      const paymentRows = payments.map((p: any, idx: number) => ({
        'S.No': idx + 1,
        'Receipt No': p.receipt_no || `REC-${idx + 1}`,
        'Student Name': p.students?.name || 'N/A',
        'Enrollment ID': p.students?.enrollment_id || 'N/A',
        'Batch': p.students?.batch_name || 'N/A',
        'Amount Paid (₹)': p.amount,
        'Payment Date': p.payment_date,
        'Payment Mode': (p.payment_mode || 'cash').toUpperCase(),
        'Status': (p.status || 'success').toUpperCase(),
        'Remarks': p.remarks || '',
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(paymentRows);
      XLSX.utils.book_append_sheet(wb, ws, 'Fee Payments');
      const feeBase64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

      await uploadFileToDrive(
        `Fee_Collections_Ledger_${nowStr}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        feeBase64,
        folderId,
        accessToken
      );
    }

    // 3. Export Attendance Register
    onProgress?.('exporting_attendance', 'Generating Attendance Register...');
    const { data: attendance } = await supabase
      .from('attendance')
      .select('date, status, students(name, enrollment_id, batch_name)')
      .eq('business_id', businessId)
      .order('date', { ascending: false })
      .limit(1000);

    if (attendance && attendance.length > 0) {
      const attendanceRows = attendance.map((a: any, idx: number) => ({
        'S.No': idx + 1,
        'Date': a.date,
        'Student Name': a.students?.name || 'N/A',
        'Enrollment ID': a.students?.enrollment_id || 'N/A',
        'Batch': a.students?.batch_name || 'N/A',
        'Status': (a.status || 'present').toUpperCase(),
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(attendanceRows);
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
      const attBase64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

      await uploadFileToDrive(
        `Attendance_Register_${nowStr}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        attBase64,
        folderId,
        accessToken
      );
    }

    onProgress?.('success', `All records successfully exported to Google Drive folder: "${folderName}"`);
    return true;
  } catch (err: any) {
    console.error('[AdminBackupService] Export Error:', err);
    onProgress?.('failed', err.message || 'Failed to export coaching records to Google Drive.');
    return false;
  }
}

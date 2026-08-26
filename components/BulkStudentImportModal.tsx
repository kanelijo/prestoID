import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

interface BulkStudentImportModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export type BulkImportHistoryRecord = {
  id: string;
  date: string;
  studentCount: number;
  fileType: string;
  fileName: string;
  students: any[];
};

export default function BulkStudentImportModal({
  visible,
  onClose,
  onSuccess,
}: BulkStudentImportModalProps) {
  const { businessId, businessCode, businessName } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [parsedStudents, setParsedStudents] = useState<any[]>([]);
  const [importedResults, setImportedResults] = useState<any[]>([]);
  const [importHistory, setImportHistory] = useState<BulkImportHistoryRecord[]>([]);
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<BulkImportHistoryRecord | null>(null);
  const [selectedStudentDetail, setSelectedStudentDetail] = useState<any | null>(null);
  const [showAllPreview, setShowAllPreview] = useState(false);

  // Load persistent import history from AsyncStorage on mount / visible
  useEffect(() => {
    if (visible) {
      loadImportHistory();
    }
  }, [visible, businessId]);

  const loadImportHistory = async () => {
    try {
      const storageKey = `@zenza_bulk_import_history_${businessId || 'default'}`;
      const savedJSON = await AsyncStorage.getItem(storageKey);
      if (savedJSON) {
        const parsed = JSON.parse(savedJSON);
        if (Array.isArray(parsed)) {
          setImportHistory(parsed);
        }
      }
    } catch (e) {
      console.warn('Failed to load bulk import history:', e);
    }
  };

  // Helper to generate 6-character uppercase secret passcode matching add.tsx
  const generatePasscode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let secretCode = '';
    for (let i = 0; i < 6; i++) {
      secretCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secretCode;
  };

  // Helper to extract values by checking all possible key variants (fuzzy matching)
  const getRowVal = (rowObj: any, targetKeys: string[]) => {
    if (!rowObj) return '';
    const objKeys = Object.keys(rowObj);

    for (const targetKey of targetKeys) {
      const targetClean = targetKey.toLowerCase().replace(/[^a-z0-9]/g, '');

      // Direct key match
      if (rowObj[targetKey] !== undefined && rowObj[targetKey] !== null && String(rowObj[targetKey]).trim() !== '') {
        return String(rowObj[targetKey]).trim();
      }

      // Fuzzy key match against all object keys
      for (const k of objKeys) {
        const kClean = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (kClean === targetClean || kClean.includes(targetClean) || targetClean.includes(kClean)) {
          const val = rowObj[k];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            return String(val).trim();
          }
        }
      }
    }
    return '';
  };

  // Helper to pick & parse CSV or Excel (.xlsx / .xls) files
  const handlePickSpreadsheet = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/comma-separated-values',
          'application/csv',
          'text/plain',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const fileAsset = result.assets[0];
      const fileName = fileAsset.name || 'students_file';
      const cleanFileNameLower = fileName.toLowerCase();
      const fileUri = fileAsset.uri;
      setSelectedFileName(fileName);

      // Check file extension: .xlsx, .xls, or .csv
      if (cleanFileNameLower.endsWith('.xlsx') || cleanFileNameLower.endsWith('.xls')) {
        const fileBase64 = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const workbook = XLSX.read(fileBase64, { type: 'base64' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        parseExcelJson(jsonRows);
      } else if (cleanFileNameLower.endsWith('.csv') || cleanFileNameLower.endsWith('.txt')) {
        const fileContent = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        parseCSVContent(fileContent);
      } else {
        Alert.alert(
          'Invalid File Format ❌',
          'Only Excel (.xlsx, .xls) and CSV (.csv) spreadsheet files are allowed for bulk student import. PDF documents and Image files are strictly not permitted.'
        );
      }
    } catch (err: any) {
      console.warn('Failed to pick spreadsheet file:', err);
      Alert.alert('Error', 'Failed to read spreadsheet file. Please select a valid .xlsx, .xls, or .csv file.');
    }
  };

  // Parse JSON data extracted from Excel worksheets (.xlsx / .xls)
  const parseExcelJson = (jsonRows: any[]) => {
    try {
      if (!jsonRows || jsonRows.length === 0) {
        Alert.alert('Empty Excel File', 'The Excel spreadsheet contains no student data rows.');
        return;
      }

      const rows: any[] = [];
      const invalidRows: string[] = [];
      const seenAadhaars = new Set<string>();
      const duplicateAadhaars = new Set<string>();
      const todayDay = String(new Date().getDate());

      jsonRows.forEach((rowObj: any, index: number) => {
        const fullName = getRowVal(rowObj, ['full_name', 'name', 'student_name', 'studentname', 'fullname']) || 'Student';
        const fatherName = getRowVal(rowObj, ['father_name', 'fathers_name', 'fathername', 'fathersname']);
        const phone = getRowVal(rowObj, ['student_phone', 'phone', 'mobile', 'cell', 'studentphone']);
        const parentPhone = getRowVal(rowObj, ['parent_phone', 'parents_phone', 'parentphone', 'parentsphone']);
        const email = getRowVal(rowObj, ['email', 'email_address', 'mail']) || null;
        const dob = getRowVal(rowObj, ['dob', 'date_of_birth', 'birth_date', 'birthdate', 'birthday']) || null;
        const batchName = getRowVal(rowObj, ['batch_name', 'batch', 'batchname']) || 'General';
        const course = getRowVal(rowObj, ['course', 'branch', 'stream']) || (batchName !== 'General' ? batchName : 'Foundation Course');
        const duration = getRowVal(rowObj, ['duration', 'course_duration']) || '1 Year';
        const aadhaar = getRowVal(rowObj, [
          'aadhaar_number',
          'aadhaar',
          'adhar',
          'aadhaarnumber',
          'aadharnumber',
          'aadhaarno',
          'adharcard',
          'aadhaarcard',
          'adharno',
          'aadhar',
        ]);
        const address = getRowVal(rowObj, ['address', 'location']);
        const feeCycle = getRowVal(rowObj, ['fee_cycle', 'feecycle', 'cycle']) || 'monthly';
        const feeDueDate = getRowVal(rowObj, ['fee_due_date', 'feeduedate', 'due_date', 'duedate']) || todayDay;
        const feeAmount = getRowVal(rowObj, ['fee_amount', 'fee', 'feeamount', 'amount']) || '0';
        const validityPeriod = getRowVal(rowObj, ['validity_period', 'validity']) || '1 Year';

        // Skip completely empty rows at the end of Excel worksheets
        if (!fullName && !phone && !aadhaar && !fatherName) return;

        if (aadhaar && seenAadhaars.has(aadhaar)) {
          duplicateAadhaars.add(aadhaar);
        } else if (aadhaar) {
          seenAadhaars.add(aadhaar);
        }

        rows.push({
          full_name: fullName,
          father_name: fatherName,
          phone,
          parent_phone: parentPhone,
          email,
          dob,
          batch_name: batchName,
          course,
          duration,
          aadhaar_number: aadhaar || null,
          address,
          fee_cycle: feeCycle,
          fee_due_date: feeDueDate,
          fee_amount: feeAmount,
          validity_period: validityPeriod,
          isValid: true,
        });
      });

      setParsedStudents(rows);

      if (duplicateAadhaars.size > 0) {
        Alert.alert(
          'Duplicate Aadhaar Warning ⚠️',
          `The Excel spreadsheet contains duplicate Aadhaar numbers within the file: ${Array.from(duplicateAadhaars).join(', ')}.`
        );
      } else {
        Alert.alert('Excel Read Successfully 🎉', `Found ${rows.length} valid student records with mandatory Aadhaar numbers.`);
      }
    } catch (err) {
      console.warn('Failed to parse Excel JSON:', err);
      Alert.alert('Parse Error', 'Could not process Excel file. Please ensure it is a valid .xlsx or .xls file.');
    }
  };

  // Robust CSV Line Parser with Mandatory Aadhaar Validation
  const parseCSVContent = (content: string) => {
    try {
      const lines = content
        .split(/\r\n|\n|\r/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      if (lines.length < 2) {
        Alert.alert('Invalid CSV', 'CSV file must contain a header row and at least 1 student row.');
        return;
      }

      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''));

      const rows: any[] = [];
      const invalidRows: string[] = [];
      const seenAadhaars = new Set<string>();
      const duplicateAadhaars = new Set<string>();

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''));
        if (values.length === 0 || !values[0]) continue;

        const rowObj: any = {};
        headers.forEach((header, index) => {
          rowObj[header] = values[index] || '';
        });

        const todayDay = String(new Date().getDate());
        const fullName = getRowVal(rowObj, ['full_name', 'name', 'student_name', 'studentname', 'fullname']) || 'Student';
        const fatherName = getRowVal(rowObj, ['father_name', 'fathers_name', 'fathername', 'fathersname']);
        const phone = getRowVal(rowObj, ['student_phone', 'phone', 'mobile', 'cell', 'studentphone']);
        const parentPhone = getRowVal(rowObj, ['parent_phone', 'parents_phone', 'parentphone', 'parentsphone']);
        const email = getRowVal(rowObj, ['email', 'email_address', 'mail']) || null;
        const dob = getRowVal(rowObj, ['dob', 'date_of_birth', 'birth_date', 'birthdate', 'birthday']) || null;
        const batchName = getRowVal(rowObj, ['batch_name', 'batch', 'batchname']) || 'General';
        const course = getRowVal(rowObj, ['course', 'branch', 'stream']) || (batchName !== 'General' ? batchName : 'Foundation Course');
        const duration = getRowVal(rowObj, ['duration', 'course_duration']) || '1 Year';
        const aadhaar = getRowVal(rowObj, [
          'aadhaar_number',
          'aadhaar',
          'adhar',
          'aadhaarnumber',
          'aadharnumber',
          'aadhaarno',
          'adharcard',
          'aadhaarcard',
          'adharno',
          'aadhar',
        ]);
        const address = getRowVal(rowObj, ['address', 'location']);
        const feeCycle = getRowVal(rowObj, ['fee_cycle', 'feecycle', 'cycle']) || 'monthly';
        const feeDueDate = getRowVal(rowObj, ['fee_due_date', 'feeduedate', 'due_date', 'duedate']) || todayDay;
        const feeAmount = getRowVal(rowObj, ['fee_amount', 'fee', 'feeamount', 'amount']) || '0';
        const validityPeriod = getRowVal(rowObj, ['validity_period', 'validity']) || '1 Year';

        if (!fullName && !phone && !aadhaar && !fatherName) continue;

        if (aadhaar && seenAadhaars.has(aadhaar)) {
          duplicateAadhaars.add(aadhaar);
        } else if (aadhaar) {
          seenAadhaars.add(aadhaar);
        }

        rows.push({
          full_name: fullName,
          father_name: fatherName,
          phone,
          parent_phone: parentPhone,
          email,
          dob,
          batch_name: batchName,
          course,
          duration,
          aadhaar_number: aadhaar || null,
          address,
          fee_cycle: feeCycle,
          fee_due_date: feeDueDate,
          fee_amount: feeAmount,
          validity_period: validityPeriod,
          isValid: true,
        });
      }

      setParsedStudents(rows);

      if (duplicateAadhaars.size > 0) {
        Alert.alert(
          'Duplicate Aadhaar Warning ⚠️',
          `The CSV contains duplicate Aadhaar numbers within the file: ${Array.from(duplicateAadhaars).join(', ')}.`
        );
      } else {
        Alert.alert('CSV Read Successfully', `Found ${rows.length} student records.`);
      }
    } catch (err) {
      console.warn('Failed to parse CSV string:', err);
      Alert.alert('Parse Error', 'Could not parse CSV formatting. Ensure standard comma-separated values.');
    }
  };

  // Perform Batch Insert to Supabase with Mandatory Aadhaar Enforcement & History Save
  const handleExecuteImport = async () => {
    if (parsedStudents.length === 0) {
      Alert.alert('No Records', 'Please pick a CSV or Excel file first.');
      return;
    }

    // 1. Strict Check: Every student MUST have an Aadhaar number
    const missingAadhaarRows = parsedStudents.filter((st) => !st.aadhaar_number || String(st.aadhaar_number).trim().length === 0);
    if (missingAadhaarRows.length > 0) {
      Alert.alert(
        'Aadhaar Detail Mandatory ❌',
        `Import blocked: ${missingAadhaarRows.length} student row(s) are missing mandatory Aadhaar numbers. Every student row must have a valid Aadhaar number before importing.`
      );
      return;
    }

    setIsProcessing(true);
    try {
      const coachingCode = businessCode || 'ZENZA';
      const cId = businessId || null;

      // 2. Database Pre-Check: Check for existing duplicate Aadhaar numbers in Supabase
      const csvAadhaars = parsedStudents.map((st) => String(st.aadhaar_number).trim());
      const { data: existingStudents } = await supabase
        .from('students')
        .select('name, aadhaar_number')
        .in('aadhaar_number', csvAadhaars);

      if (existingStudents && existingStudents.length > 0) {
        const dupListStr = existingStudents.map((s) => `• ${s.name} (${s.aadhaar_number})`).slice(0, 5).join('\n');
        Alert.alert(
          'Duplicate Aadhaar Numbers Found ❌',
          `The following Aadhaar numbers are already registered to active students in your database:\n\n${dupListStr}\n\nEach student must have a unique Aadhaar number.`
        );
        setIsProcessing(false);
        return;
      }

      // Fetch max student count for sequential ID generation (e.g. UCI-G4CO0015)
      let baseIndex = 1;
      const { count } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true });
      if (count) baseIndex = count + 1;

      const profileInserts: any[] = [];
      const studentInserts: any[] = [];
      const finalResultList: any[] = [];

      parsedStudents.forEach((st, idx) => {
        const formattedNum = String(baseIndex + idx).padStart(4, '0');
        const enrollId = `${coachingCode}${formattedNum}`;
        const secretPasscode = generatePasscode();
        const parseNumeric = (val: any): number => {
          if (val === null || val === undefined || val === '') return 0;
          const cleaned = String(val).replace(/[^0-9.-]+/g, '');
          const parsed = parseFloat(cleaned);
          return isNaN(parsed) ? 0 : parsed;
        };

        const studentRecord = {
          business_id: cId,
          name: st.full_name,
          father_name: st.father_name || null,
          phone: st.phone || null,
          parent_phone: st.parent_phone || null,
          email: st.email || null,
          batch_name: st.batch_name,
          course: st.course,
          duration: st.duration,
          dob: st.dob || null,
          aadhaar_number: st.aadhaar_number ? String(st.aadhaar_number).trim() : null,
          address: st.address || null,
          fee_cycle: st.fee_cycle,
          fee_due_date: st.fee_due_date,
          fee_amount: parseNumeric(st.fee_amount),
          validity_period: st.validity_period,
          enrollment_id: enrollId,
          unique_passcode: secretPasscode,
          secret_code: secretPasscode,
          is_claimed: false,
        };

        studentInserts.push(studentRecord);

        profileInserts.push({
          full_name: st.full_name,
          role: 'student',
          coaching_id: cId,
          unique_passcode: secretPasscode,
          claimed: false,
        });

        finalResultList.push({
          ...studentRecord,
          coaching_code: coachingCode,
          coaching_name: businessName || 'ZenZa Academy',
        });
      });

      // Insert students in batch chunks of 50
      const chunkSize = 50;
      for (let i = 0; i < studentInserts.length; i += chunkSize) {
        const chunk = studentInserts.slice(i, i + chunkSize);
        const { error: sErr } = await supabase.from('students').insert(chunk);
        if (sErr) throw sErr;
      }

      setImportedResults(finalResultList);
      setParsedStudents([]);

      // Save to persistent import history
      const nowStr = new Date().toLocaleString('en-US', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const fileExt = selectedFileName.toLowerCase().endsWith('.xlsx') || selectedFileName.toLowerCase().endsWith('.xls') ? '.xlsx' : '.csv';

      const newHistoryRecord: BulkImportHistoryRecord = {
        id: Date.now().toString(),
        date: nowStr,
        studentCount: finalResultList.length,
        fileType: fileExt,
        fileName: selectedFileName || `students_import_${fileExt}`,
        students: finalResultList,
      };

      const updatedHistory = [newHistoryRecord, ...importHistory];
      setImportHistory(updatedHistory);
      const storageKey = `@zenza_bulk_import_history_${businessId || 'default'}`;
      AsyncStorage.setItem(storageKey, JSON.stringify(updatedHistory)).catch(() => {});

      onSuccess();
      Alert.alert(
        'Bulk Import Successful! 🎉',
        `Successfully imported ${finalResultList.length} students with generated Enrollment IDs and Passcodes.`
      );
    } catch (err: any) {
      console.warn('Bulk import failed:', err);
      Alert.alert('Import Failed', err.message || 'An error occurred during database batch insertion.');
    } finally {
      setIsProcessing(false);
    }
  };

  // 💬 Share Credentials via WhatsApp
  const handleShareWhatsApp = (student: any) => {
    const targetPhone = student.phone || student.parent_phone;
    const msg = `Hello ${student.name},\nWelcome to ${student.coaching_name || 'ZenZa Coaching'}! 🎓\n\nYour Account Credentials:\n- Enrollment ID: ${student.enrollment_id}\n- Organization ID: ${student.coaching_code || businessCode}\n- Secret Passcode: ${student.unique_passcode}\n\nDownload the ZenZa App to claim your profile!`;
    const url = `whatsapp://send?text=${encodeURIComponent(msg)}${targetPhone ? `&phone=+91${targetPhone}` : ''}`;

    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Alert.alert('WhatsApp Not Installed', 'WhatsApp is not installed on this device.');
        }
      })
      .catch((err) => console.warn('WhatsApp launch error:', err));
  };

  // 📄 Generate Printable PDF Credential Sheet for a target batch
  const handleDownloadPDFForList = async (studentsList: any[]) => {
    if (!studentsList || studentsList.length === 0) {
      Alert.alert('No Data', 'No student records to download.');
      return;
    }

    try {
      const coachingNameStr = businessName || 'ZenZa Coaching Institute';
      const coachingCodeStr = businessCode || 'ZENZA';

      const tableRowsHTML = studentsList
        .map(
          (st, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${st.name}</strong></td>
          <td>${st.father_name || '-'}</td>
          <td>${st.course || st.batch_name}</td>
          <td><code>${st.enrollment_id}</code></td>
          <td><code>${coachingCodeStr}</code></td>
          <td><strong><code>${st.unique_passcode}</code></strong></td>
        </tr>
      `
        )
        .join('');

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #281713; background: #FFF; }
            .header { text-align: center; border-bottom: 3px solid #AF2800; padding-bottom: 12px; margin-bottom: 20px; }
            .title { font-size: 24px; font-weight: bold; color: #AF2800; margin: 0; }
            .subtitle { font-size: 14px; color: #5C4039; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
            th { background-color: #AF2800; color: #FFF; text-align: left; padding: 8px; font-size: 11px; text-transform: uppercase; }
            td { border-bottom: 1px solid #E6BEB4; padding: 8px; color: #281713; }
            tr:nth-child(even) { background-color: #FFF8F6; }
            code { background: #FFF1ED; color: #AF2800; padding: 2px 5px; border-radius: 3px; font-family: monospace; font-size: 12px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">${coachingNameStr}</div>
            <div class="subtitle">Bulk Student Credentials & Passcode Sheet &middot; ZenZa Engine</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Student Name</th>
                <th>Father's Name</th>
                <th>Course / Batch</th>
                <th>Enrollment ID</th>
                <th>Organization ID</th>
                <th>Secret Passcode</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHTML}
            </tbody>
          </table>
        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Share ZenZa Student Passcode Sheet',
      });
    } catch (err: any) {
      console.warn('PDF export failed:', err);
      Alert.alert('PDF Export Failed', err.message || 'Could not generate PDF sheet.');
    }
  };

  const currentDisplayList = selectedHistoryRecord ? selectedHistoryRecord.students : importedResults;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={Colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>ZenZa Bulk Student Factory</Text>
          {currentDisplayList.length > 0 ? (
            <TouchableOpacity
              onPress={() => handleDownloadPDFForList(currentDisplayList)}
              style={styles.pdfHeaderBtn}
            >
              <Ionicons name="document-text-outline" size={18} color="#FFF" />
              <Text style={styles.pdfHeaderBtnText}>PDF</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {/* Top Tab Bar Navigation */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'upload' && styles.tabBtnActive]}
            onPress={() => {
              setSelectedHistoryRecord(null);
              setActiveTab('upload');
            }}
          >
            <Ionicons name="cloud-upload-outline" size={18} color={activeTab === 'upload' ? '#FFF' : Colors.text.secondary} />
            <Text style={[styles.tabBtnText, activeTab === 'upload' && styles.tabBtnTextActive]}>
              New Upload
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'history' && styles.tabBtnActive]}
            onPress={() => {
              setSelectedHistoryRecord(null);
              setActiveTab('history');
            }}
          >
            <Ionicons name="time-outline" size={18} color={activeTab === 'history' ? '#FFF' : Colors.text.secondary} />
            <Text style={[styles.tabBtnText, activeTab === 'history' && styles.tabBtnTextActive]}>
              Import History ({importHistory.length})
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
          {selectedHistoryRecord ? (
            /* Historical Batch Detailed Student List View */
            <View>
              <TouchableOpacity
                style={styles.backToHistoryBtn}
                onPress={() => setSelectedHistoryRecord(null)}
              >
                <Ionicons name="arrow-back" size={18} color={Colors.accent.primary} />
                <Text style={styles.backToHistoryText}>Back to Import History</Text>
              </TouchableOpacity>

              <View style={styles.batchDetailBanner}>
                <Text style={styles.batchDetailTitle}>{selectedHistoryRecord.studentCount} Students Added</Text>
                <Text style={styles.batchDetailSub}>
                  {selectedHistoryRecord.date} &middot; File: {selectedHistoryRecord.fileName} ({selectedHistoryRecord.fileType})
                </Text>

                <TouchableOpacity
                  style={styles.downloadPdfCardBtn}
                  onPress={() => handleDownloadPDFForList(selectedHistoryRecord.students)}
                >
                  <Ionicons name="download-outline" size={20} color="#FFF" />
                  <Text style={styles.downloadPdfCardBtnText}>Download Passcode PDF Sheet</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionHeader}>Students in this Batch ({selectedHistoryRecord.students.length})</Text>
              {selectedHistoryRecord.students.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.studentCard}
                  onPress={() => setSelectedStudentDetail(item)}
                >
                  <View style={styles.studentInfoLeft}>
                    <Text style={styles.studentName}>{item.name}</Text>
                    {item.father_name ? <Text style={styles.studentSub}>Father: {item.father_name}</Text> : null}
                    <Text style={styles.studentSub}>
                      {item.course || item.batch_name} &middot; ID: {item.enrollment_id}
                    </Text>
                    <View style={styles.passcodeBadge}>
                      <Text style={styles.passcodeBadgeText}>Passcode: {item.unique_passcode}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.whatsappBtn}
                    onPress={() => handleShareWhatsApp(item)}
                  >
                    <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          ) : activeTab === 'history' ? (
            /* Import History List Tab View */
            <View>
              <Text style={styles.sectionHeader}>Past Bulk Import Batches ({importHistory.length})</Text>
              {importHistory.length === 0 ? (
                <View style={styles.emptyHistoryContainer}>
                  <Ionicons name="file-tray-outline" size={48} color={Colors.text.tertiary} />
                  <Text style={styles.emptyHistoryTitle}>No Past Imports Found</Text>
                  <Text style={styles.emptyHistorySub}>
                    When you import students via Excel or CSV, your past import batches will appear here.
                  </Text>
                </View>
              ) : (
                importHistory.map((batch) => (
                  <TouchableOpacity
                    key={batch.id}
                    style={styles.historyBatchCard}
                    onPress={() => setSelectedHistoryRecord(batch)}
                  >
                    <View style={styles.historyCardIconContainer}>
                      <Ionicons
                        name={batch.fileType === '.xlsx' ? 'stats-chart-outline' : 'document-text-outline'}
                        size={24}
                        color={Colors.accent.primary}
                      />
                    </View>

                    <View style={styles.historyCardContent}>
                      <Text style={styles.historyCardTitle}>{batch.studentCount} Students Added</Text>
                      <Text style={styles.historyCardMeta}>
                        {batch.date} &middot; {batch.fileType} ({batch.fileName})
                      </Text>
                    </View>

                    <Ionicons name="chevron-forward" size={20} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                ))
              )}
            </View>
          ) : importedResults.length > 0 ? (
            /* Active Import Results View */
            <View>
              <View style={styles.successBanner}>
                <Ionicons name="checkmark-circle" size={36} color={Colors.status.success} />
                <Text style={styles.successTitle}>Import Complete!</Text>
                <Text style={styles.successSub}>
                  Imported {importedResults.length} student profiles with generated credentials.
                </Text>

                <TouchableOpacity
                  style={styles.downloadPdfCardBtn}
                  onPress={() => handleDownloadPDFForList(importedResults)}
                >
                  <Ionicons name="download-outline" size={20} color="#FFF" />
                  <Text style={styles.downloadPdfCardBtnText}>Download Passcode PDF Sheet</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionHeader}>Imported Student List ({importedResults.length})</Text>
              {importedResults.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.studentCard}
                  onPress={() => setSelectedStudentDetail(item)}
                >
                  <View style={styles.studentInfoLeft}>
                    <Text style={styles.studentName}>{item.name}</Text>
                    {item.father_name ? <Text style={styles.studentSub}>Father: {item.father_name}</Text> : null}
                    <Text style={styles.studentSub}>
                      {item.course || item.batch_name} &middot; ID: {item.enrollment_id}
                    </Text>
                    <View style={styles.passcodeBadge}>
                      <Text style={styles.passcodeBadgeText}>Passcode: {item.unique_passcode}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.whatsappBtn}
                    onPress={() => handleShareWhatsApp(item)}
                  >
                    <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            /* Upload & Preview View */
            <View>
              <View style={styles.instructionCard}>
                <Text style={styles.instructionTitle}>📊 ZenZa Bulk Student Import Factory</Text>
                <Text style={styles.instructionBody}>
                  Upload an Excel spreadsheet (.xlsx, .xls) or CSV (.csv) containing columns:{'\n'}
                  <Text style={styles.boldText}>
                    full_name, father_name, phone, parent_phone, email, batch_name, course, fee_amount, fee_due_date, aadhaar_number
                  </Text>
                  {'\n\n'}ZenZa will automatically generate unique Enrollment IDs & Secret Passcodes for each student.
                </Text>
              </View>

              <TouchableOpacity style={styles.uploadPickBtn} onPress={handlePickSpreadsheet}>
                <Ionicons name="cloud-upload-outline" size={32} color={Colors.accent.primary} />
                <Text style={styles.uploadPickBtnTitle}>
                  {parsedStudents.length > 0 ? 'Change Spreadsheet File' : 'Select Excel (.XLSX) or CSV File'}
                </Text>
                <Text style={styles.uploadPickBtnSub}>Supports .XLSX, .XLS & .CSV files (PDFs/Images restricted)</Text>
              </TouchableOpacity>

              {parsedStudents.length > 0 ? (
                <View style={styles.previewSection}>
                  <Text style={styles.sectionHeader}>
                    Preview Spreadsheet Rows ({parsedStudents.length})
                  </Text>
                  {parsedStudents
                    .slice(0, showAllPreview ? parsedStudents.length : 5)
                    .map((st, idx) => (
                      <View key={idx} style={styles.previewRow}>
                        <Text style={styles.previewName}>
                          {idx + 1}. {st.full_name}
                        </Text>
                        <Text style={styles.previewSub}>
                          {st.father_name ? `Father: ${st.father_name} · ` : ''}Batch: {st.batch_name} · Aadhaar: {st.aadhaar_number}
                        </Text>
                      </View>
                    ))}
                  {parsedStudents.length > 5 ? (
                    <TouchableOpacity
                      style={styles.moreBtnClickable}
                      activeOpacity={0.7}
                      onPress={() => setShowAllPreview((prev) => !prev)}
                    >
                      <Text style={styles.moreTextClickable}>
                        {showAllPreview
                          ? `▲ Collapse preview list (Showing all ${parsedStudents.length} records)`
                          : `▼ + ${parsedStudents.length - 5} more records (Tap to view full list)`}
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.executeBtn, isProcessing && { opacity: 0.7 }]}
                    onPress={handleExecuteImport}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <>
                        <Ionicons name="play-outline" size={20} color="#FFF" />
                        <Text style={styles.executeBtnText}>Import {parsedStudents.length} Students Now</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>
      </View>

      {/* Student Profile Detail Modal (Matching Screenshot 2) */}
      <Modal
        visible={!!selectedStudentDetail}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setSelectedStudentDetail(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.detailCard}>
            <View style={styles.detailCardHeader}>
              <Text style={styles.detailTitle}>{selectedStudentDetail?.name}</Text>
              <TouchableOpacity onPress={() => setSelectedStudentDetail(null)}>
                <Ionicons name="close" size={22} color={Colors.text.secondary} />
              </TouchableOpacity>
            </View>

            {/* Academic Information */}
            <Text style={styles.detailSectionHeader}>🎓 Academic Information</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailRowLabel}>Course</Text>
              <Text style={styles.detailRowVal}>{selectedStudentDetail?.course || selectedStudentDetail?.batch_name || 'Not Set'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailRowLabel}>Enrollment ID</Text>
              <Text style={[styles.detailRowVal, { fontWeight: 'bold', color: Colors.accent.primary }]}>
                {selectedStudentDetail?.enrollment_id}
              </Text>
            </View>

            {/* Login Credentials Box (Matching Screenshot 2) */}
            <Text style={[styles.detailSectionHeader, { marginTop: 14 }]}>🔑 Login Credentials</Text>
            <View style={styles.credentialsBox}>
              <View style={styles.credentialRow}>
                <Text style={styles.credentialLabel}>Organization ID</Text>
                <Text style={styles.credentialValue}>
                  {selectedStudentDetail?.coaching_code || businessCode || 'ZENZA'}
                </Text>
              </View>
              <View style={styles.credentialRow}>
                <Text style={styles.credentialLabel}>Secret Passcode</Text>
                <Text style={[styles.credentialValue, { color: Colors.accent.primary, fontWeight: 'bold' }]}>
                  {selectedStudentDetail?.unique_passcode}
                </Text>
              </View>
            </View>

            {/* WhatsApp Share Button */}
            <TouchableOpacity
              style={styles.modalWhatsappBtnLarge}
              onPress={() => {
                handleShareWhatsApp(selectedStudentDetail);
                setSelectedStudentDetail(null);
              }}
            >
              <Ionicons name="logo-whatsapp" size={20} color="#FFF" />
              <Text style={styles.modalWhatsappBtnText}>Share Credentials via WhatsApp</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
    backgroundColor: Colors.bg.secondary,
  },
  closeBtn: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text.primary,
  },
  pdfHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  pdfHeaderBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.bg.secondary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
    gap: 10,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.bg.tertiary,
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: Colors.accent.primary,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: Colors.text.secondary,
  },
  tabBtnTextActive: {
    color: '#FFF',
  },
  content: {
    padding: 16,
  },
  instructionCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.card.border,
    ...Shadows.sm,
  },
  instructionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  instructionBody: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  boldText: {
    color: Colors.accent.primary,
    fontWeight: '700',
  },
  uploadPickBtn: {
    borderWidth: 2,
    borderColor: Colors.accent.primary,
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 20,
    backgroundColor: Colors.bg.tertiary,
  },
  uploadPickBtnTitle: {
    color: Colors.accent.primary,
    fontWeight: 'bold',
    fontSize: 16,
  },
  uploadPickBtnSub: {
    color: Colors.text.tertiary,
    fontSize: 11,
    fontWeight: '500',
  },
  previewSection: {
    marginTop: 10,
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.text.primary,
    marginBottom: 12,
  },
  previewRow: {
    backgroundColor: Colors.bg.secondary,
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  previewName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.text.primary,
  },
  previewSub: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  moreBtnClickable: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 10,
    alignItems: 'center',
    marginVertical: 10,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  moreTextClickable: {
    color: Colors.accent.primary,
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  executeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent.primary,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginTop: 16,
    ...Shadows.md,
  },
  executeBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  successBanner: {
    backgroundColor: '#E6F4EA',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#34C75940',
  },
  successTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#137333',
    marginTop: 8,
  },
  successSub: {
    fontSize: 13,
    color: '#137333',
    textAlign: 'center',
    marginTop: 4,
  },
  downloadPdfCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 14,
    gap: 6,
    ...Shadows.sm,
  },
  downloadPdfCardBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bg.secondary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.card.border,
    ...Shadows.sm,
  },
  studentInfoLeft: {
    flex: 1,
  },
  studentName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.text.primary,
  },
  studentSub: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  passcodeBadge: {
    backgroundColor: Colors.bg.tertiary,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 6,
  },
  passcodeBadgeText: {
    fontSize: 11,
    color: Colors.accent.primary,
    fontWeight: '700',
  },
  whatsappBtn: {
    padding: 10,
    backgroundColor: '#25D36615',
    borderRadius: 10,
  },
  // Import History Styles
  historyBatchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.card.border,
    ...Shadows.sm,
  },
  historyCardIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.bg.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  historyCardContent: {
    flex: 1,
  },
  historyCardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: Colors.text.primary,
  },
  historyCardMeta: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 3,
  },
  emptyHistoryContainer: {
    alignItems: 'center',
    paddingTop: 40,
    gap: 10,
  },
  emptyHistoryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text.primary,
  },
  emptyHistorySub: {
    fontSize: 13,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  backToHistoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  backToHistoryText: {
    color: Colors.accent.primary,
    fontWeight: 'bold',
    fontSize: 14,
  },
  batchDetailBanner: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.card.border,
    ...Shadows.sm,
  },
  batchDetailTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text.primary,
  },
  batchDetailSub: {
    fontSize: 13,
    color: Colors.text.secondary,
    marginTop: 4,
  },
  // Modal Overlay Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(40, 23, 19, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  detailCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 18,
    padding: 20,
    width: '100%',
    ...Shadows.lg,
  },
  detailCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text.primary,
  },
  detailSectionHeader: {
    fontSize: 13,
    fontWeight: 'bold',
    color: Colors.text.secondary,
    marginBottom: 6,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.bg.tertiary,
  },
  detailRowLabel: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  detailRowVal: {
    fontSize: 13,
    color: Colors.text.primary,
  },
  credentialsBox: {
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 12,
    padding: 14,
    marginTop: 6,
    marginBottom: 16,
    gap: 8,
  },
  credentialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  credentialLabel: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  credentialValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.text.primary,
  },
  modalWhatsappBtnLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#25D366',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    ...Shadows.sm,
  },
  modalWhatsappBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
});

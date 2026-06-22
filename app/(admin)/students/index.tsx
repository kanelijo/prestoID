import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors, Gradients, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { useOfflineQueue } from '@/stores/useOfflineQueue';
import { registerForPushNotificationsAsync, sendPushNotification } from '@/lib/notifications';

const BATCHES = ['All', 'MPPSC', 'SSC', 'VYAPAM', 'Railway', 'Banking', 'UPSC'];

export const DEMO_STUDENTS = [
  { id: 'demo-1', name: 'Amit Sharma', batch_name: 'MPPSC', enrollment_id: 'UCI-2026-001', phone: '9876543210', parent_phone: '9876543211', email: 'amit@email.com', course: 'MPPSC Prelims', fee_amount: 2500, fee_status: 'paid', dob: '15 Mar 2001', address: 'Indore, MP', joinDate: '15 Jan 2026', validTill: '15 Jan 2027', father_name: 'Rajesh Sharma', whatsapp: '9876543210', blood_group: 'O+', duration: '1 Year', batch_timing: '10:00 AM - 01:00 PM' },
  { id: 'demo-2', name: 'Priya Patel', batch_name: 'SSC', enrollment_id: 'UCI-2026-002', phone: '8765432109', parent_phone: '8765432110', email: 'priya@email.com', course: 'SSC CGL', fee_amount: 2000, fee_status: 'unpaid', dob: '22 Jul 2002', address: 'Bhopal, MP', joinDate: '01 Feb 2026', validTill: '01 Feb 2027', father_name: 'Suresh Patel', whatsapp: '8765432109', blood_group: 'B+', duration: '1 Year', batch_timing: '10:00 AM - 01:00 PM' },
  { id: 'demo-3', name: 'Rahul Verma', batch_name: 'VYAPAM', enrollment_id: 'UCI-2026-003', phone: '7654321098', parent_phone: '7654321099', email: 'rahul@email.com', course: 'VYAPAM Group D', fee_amount: 1800, fee_status: 'overdue', dob: '10 Jan 2000', address: 'Jabalpur, MP', joinDate: '10 Dec 2025', validTill: '10 Dec 2026', father_name: 'Manoj Verma', whatsapp: '7654321098', blood_group: 'A+', duration: '1 Year', batch_timing: '10:00 AM - 01:00 PM' },
  { id: 'demo-4', name: 'Sneha Gupta', batch_name: 'Railway', enrollment_id: 'UCI-2026-004', phone: '6543210987', parent_phone: '6543210988', email: 'sneha@email.com', course: 'Railway NTPC', fee_amount: 2200, fee_status: 'paid', dob: '05 Sep 2001', address: 'Ujjain, MP', joinDate: '20 Jan 2026', validTill: '20 Jan 2027', father_name: 'Ankit Gupta', whatsapp: '6543210987', blood_group: 'AB+', duration: '1 Year', batch_timing: '10:00 AM - 01:00 PM' },
  { id: 'demo-5', name: 'Vikram Singh', batch_name: 'MPPSC', enrollment_id: 'UCI-2026-005', phone: '5432109876', parent_phone: '5432109877', email: 'vikram@email.com', course: 'MPPSC Mains', fee_amount: 3000, fee_status: 'paid', dob: '18 Nov 1999', address: 'Gwalior, MP', joinDate: '05 Jan 2026', validTill: '05 Jan 2027', father_name: 'Raj Singh', whatsapp: '5432109876', blood_group: 'O-', duration: '1 Year', batch_timing: '10:00 AM - 01:00 PM' },
  { id: 'demo-6', name: 'Anita Jain', batch_name: 'Banking', enrollment_id: 'UCI-2026-006', phone: '4321098765', parent_phone: '4321098766', email: 'anita@email.com', course: 'IBPS PO', fee_amount: 2500, fee_status: 'unpaid', dob: '28 Feb 2002', address: 'Rewa, MP', joinDate: '15 Feb 2026', validTill: '15 Feb 2027', father_name: 'Rakesh Jain', whatsapp: '4321098765', blood_group: 'B-', duration: '1 Year', batch_timing: '10:00 AM - 01:00 PM' },
  { id: 'demo-7', name: 'Deepak Kumar', batch_name: 'SSC', enrollment_id: 'UCI-2026-007', phone: '3210987654', parent_phone: '3210987655', email: 'deepak@email.com', course: 'SSC CHSL', fee_amount: 2000, fee_status: 'paid', dob: '12 Jun 2001', address: 'Sagar, MP', joinDate: '01 Mar 2026', validTill: '01 Mar 2027', father_name: 'Sunil Kumar', whatsapp: '3210987654', blood_group: 'A-', duration: '1 Year', batch_timing: '10:00 AM - 01:00 PM' },
  { id: 'demo-8', name: 'Kavita Yadav', batch_name: 'UPSC', enrollment_id: 'UCI-2026-008', phone: '2109876543', parent_phone: '2109876544', email: 'kavita@email.com', course: 'UPSC CSE', fee_amount: 5000, fee_status: 'overdue', dob: '04 Apr 2000', address: 'Satna, MP', joinDate: '10 Jan 2026', validTill: '10 Jan 2027', father_name: 'Ramesh Yadav', whatsapp: '2109876543', blood_group: 'O+', duration: '1 Year', batch_timing: '10:00 AM - 01:00 PM' },
];

export default function StudentsListScreen() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<'students' | 'fees'>('students');
  const [search, setSearch] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('All');
  const [feeFilter, setFeeFilter] = useState<'All' | 'Paid' | 'Unpaid' | 'Overdue'>('All');
  const [students, setStudents] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalStudents: 0, presentToday: 0, feeCollected: '₹0' });
  const [isLoading, setIsLoading] = useState(true);
  const [adminName, setAdminName] = useState('Admin');
  const { user, verified, businessId, businessName } = useAuthStore();
  const { adminUnreadCount } = useNotificationStore();
  const logoUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
  const [isSendingReminders, setIsSendingReminders] = useState(false);
  const { attendanceQueue, addAttendance, syncAttendance, loadQueue, clearQueue } = useOfflineQueue();

  // Scanner states
  const [permission, requestPermission] = useCameraPermissions();
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const [scanned, setScanned] = useState(false);

  const fetchStudentsAndStats = async () => {
    setIsLoading(true);
    if (!verified) {
      // Test Mode (Sandbox)
      setStudents(DEMO_STUDENTS);
      setAdminName('Upendra Sir');
      setStats({
        totalStudents: DEMO_STUDENTS.length,
        presentToday: 6,
        feeCollected: '₹1.25L',
      });
      setIsLoading(false);
      return;
    }

    try {
      if (businessName) {
        setAdminName(businessName);
      } else if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', user.id)
          .maybeSingle();

        if (profile?.name) {
          setAdminName(profile.name);
        }
      }
      // 1. Fetch students list — scoped to this business only
      const query = supabase
        .from('students')
        .select('*')
        .order('name');
      
      if (businessId) {
        query.eq('business_id', businessId);
      }
      
      const { data: list, error: listError } = await query;

      if (listError) throw listError;
      setStudents(list || []);

      // 2. Fetch today's attendance count
      const todayStr = new Date().toISOString().split('T')[0];
      const { count: presentCount, error: attError } = await supabase
        .from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('date', todayStr)
        .eq('status', 'present');

      // 3. Fetch monthly collections
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      
      let paymentsQuery = supabase
        .from('payments')
        .select('amount')
        .eq('status', 'success')
        .gte('payment_date', firstDay.toISOString())
        .lte('payment_date', lastDay.toISOString());

      if (businessId) {
        paymentsQuery = paymentsQuery.eq('business_id', businessId);
      }
      
      const { data: payments, error: paymentsError } = await paymentsQuery;

      const sumCollected = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
      let feeCollectedStr = '₹0';
      if (sumCollected >= 100000) {
        feeCollectedStr = `₹${(sumCollected / 100000).toFixed(2)}L`;
      } else {
        feeCollectedStr = `₹${sumCollected.toLocaleString()}`;
      }

      setStats({
        totalStudents: list?.length || 0,
        presentToday: presentCount || 0,
        feeCollected: feeCollectedStr,
      });
    } catch (err) {
      console.warn('Failed to load admin students roster:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchStudentsAndStats();
      loadQueue().then(() => syncAttendance());
    }, [verified])
  );

  useEffect(() => {
    if (user) {
      registerForPushNotificationsAsync(user.id);
    }
    
    // Set up postgres realtime subscription for auto-syncing updates
    const channel = supabase
      .channel('admin-students-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'students',
        },
        (payload) => {
          console.log('Realtime student change detected by Admin:', payload);
          fetchStudentsAndStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const startScanner = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert('Permission Denied', 'Camera permission is required to scan QR codes.');
        return;
      }
    }
    setScanned(false);
    setIsScannerVisible(true);
  };

  const sendStudentAttendanceNotification = async (studentId: string, timestamp: string) => {
    try {
      const { data: studentData } = await supabase
        .from('students')
        .select('name, user_id')
        .eq('id', studentId)
        .maybeSingle();

      if (studentData && studentData.user_id) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('push_token')
          .eq('id', studentData.user_id)
          .maybeSingle();

        if (profileData && profileData.push_token) {
          const scanTime = new Date(timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          });
          await sendPushNotification(
            [profileData.push_token],
            'Attendance Marked',
            `Hi ${studentData.name}, your attendance was marked PRESENT today at ${scanTime}.`,
            { screen: 'id-card' }
          );
        }
      }
    } catch (pushErr) {
      console.warn('Failed to send attendance push notification:', pushErr);
    }
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    setIsScannerVisible(false);

    let studentIdOrEnrollment = data;
    if (data.startsWith('KF-')) {
      // KF-studentId-enrollmentId (UUID is 36 characters, starting at index 3)
      studentIdOrEnrollment = data.substring(3, 39);
    }

    // 1. Check if we are in Test Mode (Sandbox)
    if (!verified) {
      const matchedDemo = DEMO_STUDENTS.find(
        (s) => s.id === studentIdOrEnrollment || s.enrollment_id === studentIdOrEnrollment
      );

      if (matchedDemo) {
        Alert.alert(
          'Attendance Marked (Test Mode)',
          `Hi ${matchedDemo.name}, your attendance was marked PRESENT today.`
        );
        // Optimistically increment present count
        setStats(prev => ({
          ...prev,
          presentToday: Math.min(prev.presentToday + 1, DEMO_STUDENTS.length)
        }));
      } else {
        Alert.alert('Scan Result (Test Mode)', `Scanned ID: ${studentIdOrEnrollment} (No matching demo student found)`);
      }
      return;
    }

    // 2. Production Mode (Verified)
    // If the student list is loaded, validate that this student is registered here
    if (students && students.length > 0) {
      const matchedStudent = students.find(
        (s) => s.id === studentIdOrEnrollment || s.enrollment_id === studentIdOrEnrollment
      );
      if (!matchedStudent) {
        Alert.alert('Invalid Card', 'This QR code does not match any registered student in this coaching center.');
        return;
      }
      // Use the verified UUID for insertion/queuing
      studentIdOrEnrollment = matchedStudent.id;
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timestamp = now.toISOString();

    try {
      // Try to record attendance directly online first
      const { error: onlineError } = await supabase
        .from('attendance')
        .insert({
          student_id: studentIdOrEnrollment,
          business_id: businessId,
          date: dateStr,
          status: 'present',
          created_at: timestamp,
        });

      if (!onlineError) {
        Alert.alert('Attendance Marked', 'Attendance marked successfully!');
        // Trigger push notification to student in the background
        sendStudentAttendanceNotification(studentIdOrEnrollment, timestamp);
      } else {
        // Handle specific error codes if any
        if (onlineError.code === '23505') {
          Alert.alert('Already Scanned', 'This student is already marked present for today.');
        } else {
          // Fall back to offline queue on any database write failure (e.g. network timeout/offline)
          console.warn('Online insert failed, falling back to offline queue:', onlineError);
          await addAttendance(studentIdOrEnrollment, studentIdOrEnrollment);
          Alert.alert('Offline Mode', 'Attendance saved to offline queue. Will sync automatically.');
        }
      }
    } catch (err: any) {
      console.warn('Network or unexpected error, falling back to offline queue:', err);
      try {
        await addAttendance(studentIdOrEnrollment, studentIdOrEnrollment);
        Alert.alert('Offline Mode', 'Attendance saved to offline queue. Will sync automatically.');
      } catch (queueErr: any) {
        Alert.alert('Scan Result', queueErr.message);
      }
    } finally {
      fetchStudentsAndStats();
    }
  };

  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.enrollment_id.toLowerCase().includes(search.toLowerCase()) ||
      (s.phone && s.phone.includes(search));
    const matchesBatch =
      selectedBatch === 'All' || s.batch_name.startsWith(selectedBatch);
    const matchesFee = feeFilter === 'All' || s.fee_status.toLowerCase() === feeFilter.toLowerCase();
    
    if (viewMode === 'fees') {
      return matchesSearch && matchesFee;
    }
    return matchesSearch && matchesBatch;
  });

  const totalExpected = students.reduce((sum, s) => sum + Number(s.fee_amount || 0), 0);
  const totalCollected = students.filter(s => s.fee_status === 'paid').reduce((sum, s) => sum + Number(s.fee_amount || 0), 0);
  const totalPending = totalExpected - totalCollected;
  const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

  const handleRemindAll = () => {
    if (isSendingReminders) return;

    Alert.alert(
      'Remind All',
      'Send fee reminder push notifications to all students with unpaid or overdue fees?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Now',
          onPress: async () => {
            setIsSendingReminders(true);
            try {
              if (!verified) {
                // Sandbox (Test Mode)
                const unpaidDemo = DEMO_STUDENTS.filter(
                  (s) => s.fee_status === 'unpaid' || s.fee_status === 'overdue'
                );
                
                // Simulate sending push notifications
                unpaidDemo.forEach((student) => {
                  console.log(`Sending simulated push reminder to ${student.name}`);
                });

                // Simulate delay
                await new Promise((resolve) => setTimeout(resolve, 1000));
                
                Alert.alert(
                  'Success (Test Mode)',
                  `Simulated push reminders sent to ${unpaidDemo.length} demo students:\n` +
                    unpaidDemo.map((s) => `• ${s.name} (₹${s.fee_amount})`).join('\n')
                );
                return;
              }

              // Production Mode: Fetch students with unpaid/overdue fees
              const { data: unpaidStudents, error: fetchErr } = await supabase
                .from('students')
                .select('id, user_id, name, fee_amount, fee_status')
                .in('fee_status', ['unpaid', 'overdue']);

              if (fetchErr) throw fetchErr;

              if (!unpaidStudents || unpaidStudents.length === 0) {
                Alert.alert('No Due Fees', 'There are no students with unpaid or overdue fees.');
                return;
              }

              // Filter students who have a claimed account (user_id is not null)
              const claimedStudents = unpaidStudents.filter((s) => s.user_id);
              const unclaimedStudents = unpaidStudents.filter((s) => !s.user_id);

              if (claimedStudents.length === 0) {
                Alert.alert(
                  'Reminders Skipped',
                  'None of the unpaid students have claimed accounts (registered profiles) yet. They must be reminded via WhatsApp/phone.'
                );
                return;
              }

              // Fetch push tokens for claimed students
              const userIds = claimedStudents.map((s) => s.user_id);
              const { data: profiles, error: profileErr } = await supabase
                .from('profiles')
                .select('id, push_token')
                .in('id', userIds);

              if (profileErr) throw profileErr;

              const tokenMap = new Map<string, string>();
              profiles?.forEach((p) => {
                if (p.push_token) {
                  tokenMap.set(p.id, p.push_token);
                }
              });

              // Track who we could and couldn't notify
              const notifiedNames: string[] = [];
              const noTokenNames: string[] = [];

              // Prepare push notification promises
              const pushPromises = claimedStudents.map(async (student) => {
                const token = tokenMap.get(student.user_id);
                if (token) {
                  notifiedNames.push(student.name);
                  return sendPushNotification(
                    [token],
                    'Fee Reminder - PrestoID',
                    `Hi ${student.name}, your monthly fee of ₹${student.fee_amount} is due. Please clear it at the earliest.`,
                    { screen: 'fees' }
                  );
                } else {
                  noTokenNames.push(student.name);
                }
              });

              await Promise.all(pushPromises);

              // Prepare summary message
              let summaryMsg = `Successfully sent push reminders to ${notifiedNames.length} student(s).`;
              
              if (notifiedNames.length > 0) {
                summaryMsg += `\n\nSent to: ${notifiedNames.join(', ')}`;
              }

              const skippedCount = unclaimedStudents.length + noTokenNames.length;
              if (skippedCount > 0) {
                summaryMsg += `\n\nSkipped ${skippedCount} student(s) without push notifications:`;
                if (unclaimedStudents.length > 0) {
                  summaryMsg += `\n• Unregistered/Unclaimed: ${unclaimedStudents.map(s => s.name).join(', ')}`;
                }
                if (noTokenNames.length > 0) {
                  summaryMsg += `\n• No registered push token: ${noTokenNames.join(', ')}`;
                }
                summaryMsg += `\n\n(Please remind these students manually or via WhatsApp from their profiles).`;
              }

              Alert.alert('Reminders Sent', summaryMsg);

            } catch (err: any) {
              console.warn('Failed to send bulk reminders:', err);
              Alert.alert('Error', err.message || 'Failed to send bulk reminders.');
            } finally {
              setIsSendingReminders(false);
            }
          },
        },
      ]
    );
  };

  const handleExport = () => {
    Alert.alert('Export Report', 'Fee report will be downloaded as a CSV file.');
  };

  const getFeeStatusStyle = (status: string) => {
    switch (status) {
      case 'paid':
        return { label: 'PAID', color: Colors.status.success };
      case 'unpaid':
        return { label: 'DUE', color: Colors.status.warning };
      case 'overdue':
        return { label: 'OVERDUE', color: Colors.status.danger };
      default:
        return { label: (status || 'unpaid').toUpperCase(), color: Colors.text.secondary };
    }
  };

  const getInitials = (name: string) => {
    const parts = name.split(' ').filter(Boolean);
    return parts.length >= 2
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : name.substring(0, 2).toUpperCase();
  };

  const renderStudent = ({ item }: { item: any }) => {
    const fee = getFeeStatusStyle(item.fee_status);
    return (
      <TouchableOpacity
        style={styles.studentCard}
        activeOpacity={0.7}
        onPress={() =>
          router.push({
            pathname: '/(admin)/students/[id]',
            params: { id: item.id },
          })
        }
      >
        {item.photo_url ? (
          <Image source={{ uri: item.photo_url }} style={styles.studentAvatarImage} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
          </View>
        )}
        <View style={styles.studentInfo}>
          <Text style={styles.studentName}>{item.name}</Text>
          <Text style={styles.studentMeta}>
            {item.batch_name} • {item.enrollment_id}
          </Text>
        </View>
        <View style={[styles.feeBadge, { backgroundColor: fee.color + '15' }]}>
          <Text style={[styles.feeBadgeText, { color: fee.color }]}>
            {fee.label}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const ListHeaderComponent = () => (
    <>
      {/* Header Bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          style={styles.headerAvatar}
          onPress={() => router.push('/(admin)/profile')}
        >
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.headerAvatarImage} />
          ) : (
            <Text style={styles.headerAvatarText}>{getInitials(adminName)}</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.headerTitle}>PrestoID</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Test Mode Banner */}
      {!verified && (
        <View style={styles.testModeBanner}>
          <Ionicons name="construct-outline" size={16} color="#FFF" />
          <Text style={styles.testModeText}>Test Mode (Awaiting Verification)</Text>
        </View>
      )}

      {/* View Toggle */}
      <View style={styles.viewToggleContainer}>
        <TouchableOpacity
          style={[styles.viewToggleBtn, viewMode === 'students' && styles.viewToggleBtnActive]}
          onPress={() => setViewMode('students')}
        >
          <Text style={[styles.viewToggleText, viewMode === 'students' && styles.viewToggleTextActive]}>
            Directory
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewToggleBtn, viewMode === 'fees' && styles.viewToggleBtnActive]}
          onPress={() => setViewMode('fees')}
        >
          <Text style={[styles.viewToggleText, viewMode === 'fees' && styles.viewToggleTextActive]}>
            Fee Overview
          </Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'students' ? (
        <>
          {/* Dashboard Stats Row */}

      {/* Dashboard Stats Row */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: Colors.status.info + '08' }]}>
          <Ionicons
            name="people-outline"
            size={20}
            color={Colors.status.info}
            style={{ marginBottom: 4 }}
          />
          <Text style={styles.statNumber}>{stats.totalStudents}</Text>
          <Text style={styles.statLabel}>Total Students</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: Colors.status.success + '08' }]}>
          <Ionicons
            name="checkmark-circle-outline"
            size={20}
            color={Colors.status.success}
            style={{ marginBottom: 4 }}
          />
          <Text style={styles.statNumber}>{stats.presentToday}</Text>
          <Text style={styles.statLabel}>Present Today</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: Colors.accent.primary + '08' }]}>
          <Ionicons
            name="wallet-outline"
            size={20}
            color={Colors.accent.primary}
            style={{ marginBottom: 4 }}
          />
          <Text style={styles.statNumber}>{stats.feeCollected}</Text>
          <Text style={styles.statLabel}>Fee Collected</Text>
        </View>
      </View>

      {/* QR Scanner Block */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={startScanner}
        style={styles.scanBlock}
      >
        <Ionicons name="scan" size={32} color="#FFFFFF" />
        <View style={{ flex: 1 }}>
          <Text style={styles.scanTitle}>Scan QR Code</Text>
          <Text style={styles.scanSubtitle}>Quick attendance marking (Offline Supported)</Text>
        </View>
        {attendanceQueue.length > 0 && (
          <TouchableOpacity 
            style={styles.offlineBadge}
            activeOpacity={0.8}
            onPress={(e) => {
              e.stopPropagation();
              Alert.alert(
                'Offline Attendance Queue',
                `You have ${attendanceQueue.length} unsynced attendance record(s).`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Clear Queue',
                    style: 'destructive',
                    onPress: () => {
                      Alert.alert(
                        'Clear Queue',
                        'Are you sure you want to clear all records from the offline queue? These records will NOT be synced.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Clear Now',
                            style: 'destructive',
                            onPress: async () => {
                              await clearQueue();
                              Alert.alert('Queue Cleared', 'The offline queue has been cleared.');
                            }
                          }
                        ]
                      );
                    }
                  },
                  {
                    text: 'Sync Now',
                    onPress: async () => {
                      const res = await syncAttendance();
                      if (res) {
                        if (res.failed > 0) {
                          Alert.alert(
                            'Sync Complete',
                            `Successfully synced ${res.success} record(s).\n\n${res.failed} record(s) failed to sync (possibly due to invalid or duplicate attendance records). You can clear the queue if they keep failing.`
                          );
                        } else {
                          Alert.alert('Sync Success', `Successfully synced all ${res.success} record(s)!`);
                        }
                      } else {
                        Alert.alert('Sync Result', 'No records to sync or synchronization already in progress.');
                      }
                      fetchStudentsAndStats();
                    }
                  }
                ]
              );
            }}
          >
            <Ionicons name="cloud-offline-outline" size={14} color={Colors.accent.primary} />
            <Text style={styles.offlineBadgeText}>{attendanceQueue.length}</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons
          name="search-outline"
          size={18}
          color={Colors.text.tertiary}
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search students..."
          placeholderTextColor={Colors.text.tertiary}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons
              name="close-circle"
              size={18}
              color={Colors.text.tertiary}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Batch Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.batchContainer}
      >
        {BATCHES.map((batch) => (
          <TouchableOpacity
            key={batch}
            style={[
              styles.batchChip,
              selectedBatch === batch && styles.batchChipActive,
            ]}
            onPress={() => setSelectedBatch(batch)}
          >
            <Text
              style={[
                styles.batchChipText,
                selectedBatch === batch && styles.batchChipTextActive,
              ]}
            >
              {batch}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      </>
      ) : (
        <>
          {/* Fee Dashboard Row */}
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: Colors.status.success + '08' }]}>
              <Text style={[styles.statNumber, { color: Colors.status.success }]}>{collectionRate}%</Text>
              <Text style={styles.statLabel}>Collection Rate</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: Colors.status.warning + '08' }]}>
              <Text style={[styles.statNumber, { color: Colors.status.warning }]}>₹{(totalPending / 1000).toFixed(1)}k</Text>
              <Text style={styles.statLabel}>Total Pending</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: Colors.accent.primary + '08' }]}>
              <Text style={[styles.statNumber, { color: Colors.accent.primary }]}>₹{(totalCollected / 1000).toFixed(1)}k</Text>
              <Text style={styles.statLabel}>Total Collected</Text>
            </View>
          </View>

          {/* Quick Actions */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 20, marginBottom: 16, gap: 10 }}>
            <TouchableOpacity 
              style={[styles.actionBtnPrimary, isSendingReminders && { opacity: 0.7 }]} 
              onPress={handleRemindAll}
              disabled={isSendingReminders}
            >
              {isSendingReminders ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="notifications-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.actionBtnTextPrimary}>Remind All Unpaid</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtnSecondary} onPress={handleExport}>
              <Ionicons name="download-outline" size={18} color={Colors.accent.primary} />
            </TouchableOpacity>
          </View>

          {/* Fee Filters */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.batchContainer}>
            {['All', 'Paid', 'Unpaid', 'Overdue'].map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[styles.batchChip, feeFilter === filter && styles.batchChipActive]}
                onPress={() => setFeeFilter(filter as any)}
              >
                <Text style={[styles.batchChipText, feeFilter === filter && styles.batchChipTextActive]}>
                  {filter}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}
    </>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]} edges={['top']}>
        <ActivityIndicator size="large" color={Colors.accent.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={filteredStudents}
        renderItem={renderStudent}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons
              name="search-outline"
              size={40}
              color={Colors.text.tertiary}
            />
            <Text style={styles.emptyText}>No students found</Text>
          </View>
        }
      />

      {/* FAB — Add Student (Only in Directory view) */}
      {viewMode === 'students' && (
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => router.push('/(admin)/students/add')}
      >
        <LinearGradient
          colors={Gradients.primary as [string, string]}
          style={styles.fabGradient}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </LinearGradient>
      </TouchableOpacity>
      )}

      {/* Scanner Modal */}
      <Modal
        visible={isScannerVisible}
        animationType="slide"
        onRequestClose={() => setIsScannerVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ flex: 1 }}>
            <CameraView
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            />
            <TouchableOpacity
              style={{
                position: 'absolute',
                top: 40,
                left: 20,
                backgroundColor: 'rgba(0,0,0,0.5)',
                padding: 10,
                borderRadius: 20,
              }}
              onPress={() => setIsScannerVisible(false)}
            >
              <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>
            <View
              style={{
                position: 'absolute',
                bottom: 60,
                left: 0,
                right: 0,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 16 }}>
                Align QR Code within frame to scan
              </Text>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },

  // Test Mode Banner
  testModeBanner: {
    backgroundColor: Colors.status.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
    marginBottom: 4,
    gap: 6,
    ...Shadows.sm,
  },
  testModeText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 12,
  },

  // Header Bar
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.stitch.primaryFixed,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.accent.primary,
  },
  headerAvatarImage: {
    width: 38,
    height: 38,
    borderRadius: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.accent.primary,
  },
  bellButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.bg.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  bellBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.status.danger,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFF',
  },

  // View Toggle
  viewToggleContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.bg.secondary,
    padding: 4,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  viewToggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  viewToggleBtnActive: {
    backgroundColor: Colors.accent.primary,
  },
  viewToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  viewToggleTextActive: {
    color: '#FFFFFF',
  },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.card.border,
    backgroundColor: Colors.bg.secondary,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.text.secondary,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },

  // QR Scanner Block
  scanBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent.primary,
    padding: 16,
    borderRadius: 16,
    gap: 14,
    marginBottom: 16,
    ...Shadows.lg,
  },
  scanTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  scanSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
    fontWeight: '500',
  },
  offlineBadge: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  offlineBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.accent.primary,
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 48,
    borderWidth: 1,
    borderColor: Colors.card.border,
    gap: 8,
    marginBottom: 4,
  },
  searchIcon: {
    marginRight: 4,
  },
  searchInput: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '500',
  },

  // Batch Chips
  batchContainer: {
    paddingVertical: 10,
    gap: 8,
  },
  batchChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.bg.tertiary,
    marginRight: 8,
  },
  batchChipActive: {
    backgroundColor: Colors.accent.primary,
  },
  batchChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  batchChipTextActive: {
    color: '#FFFFFF',
  },

  // Student Card
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.card.border,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.stitch.primaryFixed,
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 14,
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.accent.primary,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  studentMeta: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginTop: 2,
    fontWeight: '500',
  },
  feeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  feeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.text.secondary,
    fontWeight: '500',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    ...Shadows.lg,
  },
  fabGradient: {
    width: 54,
    height: 54,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Actions
  actionBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent.primary,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  actionBtnTextPrimary: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  actionBtnSecondary: {
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.card.border,
    borderRadius: 12,
  },
});

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform, Clipboard, FlatList } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { DEMO_STUDENTS } from './index';
import { sendPushNotification } from '@/lib/notifications';

// ─── Student Test Analysis Component ─────────────────────────────────────────
function StudentTestAnalysis({ studentId, businessId, router }: { studentId: string; businessId: string; router: any }) {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!studentId) { setIsLoading(false); return; }
    (async () => {
      try {
        const { data, error } = await supabase
          .from('test_submissions')
          .select('*, tests(title, duration_minutes, total_questions)')
          .eq('student_id', studentId)
          .order('submitted_at', { ascending: false });
        if (!error) setSubmissions(data || []);
      } catch (e) {
        console.warn('Failed to load student tests:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [studentId]);

  if (isLoading) return (
    <View style={{ padding: 24, alignItems: 'center' }}>
      <ActivityIndicator color={Colors.accent.primary} />
    </View>
  );

  if (submissions.length === 0) return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Ionicons name="analytics-outline" size={18} color={Colors.accent.primary} />
        <Text style={styles.sectionTitle}>Test Analysis</Text>
      </View>
      <View style={{ paddingVertical: 20, alignItems: 'center' }}>
        <Ionicons name="document-text-outline" size={36} color={Colors.text.tertiary} />
        <Text style={{ fontSize: 13, color: Colors.text.tertiary, fontWeight: '500', marginTop: 8 }}>No tests taken yet</Text>
      </View>
    </View>
  );

  const avgScore = Math.round(submissions.reduce((s, sub) => s + (sub.score ?? 0), 0) / submissions.length);

  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Ionicons name="analytics-outline" size={18} color={Colors.accent.primary} />
        <Text style={styles.sectionTitle}>Test Analysis</Text>
        <View style={{ marginLeft: 'auto', backgroundColor: Colors.accent.primary + '15', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: Colors.accent.primary }}>Avg {avgScore}%</Text>
        </View>
      </View>

      {submissions.map((sub: any) => {
        const score = sub.score ?? 0;
        const totalQ = sub.total_questions || sub.tests?.total_questions || 0;
        const correct = Math.round((score / 100) * totalQ);
        const wrong = totalQ - correct;
        const scoreColor = score >= 75 ? Colors.status.success : score >= 40 ? Colors.status.warning : Colors.status.danger;

        return (
          <View key={sub.id} style={{ backgroundColor: Colors.bg.tertiary, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.card.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {/* Score ring */}
              <View style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 3, borderColor: scoreColor, justifyContent: 'center', alignItems: 'center', backgroundColor: scoreColor + '10' }}>
                <Text style={{ fontSize: 14, fontWeight: '900', color: scoreColor }}>{score}%</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text.primary }} numberOfLines={1}>{sub.tests?.title || 'Test'}</Text>
                <Text style={{ fontSize: 11, color: Colors.text.tertiary, marginTop: 2 }}>
                  {new Date(sub.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
                {/* Correct / Wrong row */}
                {totalQ > 0 && (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                    <Text style={{ fontSize: 11, color: Colors.status.success, fontWeight: '700' }}>✓ {correct} correct</Text>
                    <Text style={{ fontSize: 11, color: Colors.status.danger, fontWeight: '700' }}>✗ {wrong} wrong</Text>
                    <Text style={{ fontSize: 11, color: Colors.text.tertiary, fontWeight: '600' }}>{totalQ} total</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}


export default function StudentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [student, setStudent] = useState<any>(null);
  const [attendanceRate, setAttendanceRate] = useState(0);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { verified } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'fees' | 'attendance' | 'tests'>('profile');

  // Credentials states
  const [inviteCode, setInviteCode] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [secretCode, setSecretCode] = useState('');

  // Edit form states
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    parent_phone: '',
    batch_name: '',
    fee_amount: '',
    dob: '',
    address: ''
  });

  const loadStudentData = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      if (!verified || id.startsWith('demo-')) {
        const demoSt = DEMO_STUDENTS.find(s => s.id === id);
        if (demoSt) {
          setStudent(demoSt);
          setAttendanceRate(92);
          setPayments([
            { id: 'demo-p1', month: 'June 2026', status: demoSt.fee_status, amount: demoSt.fee_amount },
            { id: 'demo-p2', month: 'May 2026', status: 'paid', amount: demoSt.fee_amount },
            { id: 'demo-p3', month: 'April 2026', status: 'paid', amount: demoSt.fee_amount },
          ]);
          setInviteCode('DEMO123');
          setSecretCode('123456');
          setBusinessName('Demo Competition Institute');
        } else {
          Alert.alert('Not Found', 'Demo student not found.');
        }
        setIsLoading(false);
        return;
      }

      // Fetch student details
      const { data: st, error: stError } = await supabase
        .from('students')
        .select('*')
        .eq('id', id)
        .single();

      if (stError) throw stError;
      setStudent(st);

      // Fetch business details for invite code
      if (st.business_id) {
        const { data: inst, error: instError } = await supabase
          .from('businesses')
          .select('id, business_name, organization_id')
          .eq('id', st.business_id)
          .maybeSingle();
        if (!instError && inst) {
          setInviteCode(inst.organization_id);
          setBusinessName(inst.business_name);
        } else {
          setInviteCode('N/A');
          setBusinessName('N/A');
        }
      } else {
        setInviteCode('N/A');
        setBusinessName('N/A');
      }

      // Fetch attendance logs for rate
      const { data: attLogs, error: attError } = await supabase
        .from('attendance')
        .select('id, date, status, created_at')
        .eq('student_id', id)
        .order('date', { ascending: false });

      if (!attError && attLogs) {
        setAttendanceLogs(attLogs);
        if (attLogs.length > 0) {
          const presentOrLate = attLogs.filter((a: any) => a.status === 'present' || a.status === 'late').length;
          setAttendanceRate(Math.round((presentOrLate / attLogs.length) * 100));
        } else {
          setAttendanceRate(0);
        }
      } else {
        setAttendanceRate(0);
      }

      // Fetch payment receipts
      const { data: payLogs, error: payError } = await supabase
        .from('payments')
        .select('*')
        .eq('student_id', id)
        .order('payment_date', { ascending: false });

      if (!payError) {
        setPayments(payLogs || []);
      }
    } catch (err) {
      console.warn('Failed to load student details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStudentData();
  }, [id]);


  const getInitials = (name: string) => {
    const parts = name.split(' ').filter(Boolean);
    return parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : name.substring(0, 2).toUpperCase();
  };

  const getFeeStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return Colors.status.success;
      case 'unpaid': return Colors.status.warning;
      case 'overdue': return Colors.status.danger;
      default: return Colors.text.secondary;
    }
  };

  const getFeeStatusLabel = (status: string) => {
    switch (status) {
      case 'paid': return 'PAID';
      case 'unpaid': return 'DUE';
      case 'overdue': return 'OVERDUE';
      default: return (status || 'unpaid').toUpperCase();
    }
  };

  const handleCall = (phoneNum: string) => {
    if (!phoneNum) return;
    Linking.openURL(`tel:${phoneNum.replace(/\s/g, '')}`);
  };

  const handleWhatsApp = () => {
    if (!student?.phone) return;
    Linking.openURL(`https://wa.me/91${student.phone.replace(/\s/g, '')}`);
  };

  const handleWhatsAppParent = () => {
    if (!student?.parent_phone) return;
    Linking.openURL(`https://wa.me/91${student.parent_phone.replace(/\s/g, '')}`);
  };

  const handleSendReminder = async () => {
    const parentPhone = student?.parent_phone || student?.phone;
    if (!parentPhone) {
      Alert.alert('No Phone', 'No contact phone available for this student.');
      return;
    }
    const message = `Hello, this is a reminder from UCI Competition Institute. The monthly fee of ₹${student.fee_amount} for ${student.name} is due. Please clear it at the earliest. Thank you!`;
    const encodedMsg = encodeURIComponent(message);
    Linking.openURL(`https://wa.me/91${parentPhone.replace(/\s/g, '')}?text=${encodedMsg}`);

    // Fetch and send push notification to student's mobile device
    try {
      if (!verified || id.startsWith('demo-')) {
        Alert.alert('Success (Test Mode)', 'Mobile push fee reminder sent successfully to student.');
        return;
      }

      const targetUserId = student.user_id || student.id;
      if (!targetUserId) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('push_token')
        .eq('id', targetUserId)
        .single();

      if (profile && profile.push_token) {
        await sendPushNotification(
          [profile.push_token],
          'Fee Reminder - PrestoID',
          `Hi ${student.name}, your monthly fee of ₹${student.fee_amount} is due. Please clear it at the earliest.`,
          { screen: 'fees' }
        );
        Alert.alert('Success', 'Mobile push fee reminder sent successfully.');
      } else {
        console.log('Student does not have a registered push token yet');
      }
    } catch (pushErr) {
      console.warn('Failed to send push fee reminder:', pushErr);
    }
  };

  const handleRecordPayment = async () => {
    const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    Alert.alert(
      'Record Payment',
      `Record fee payment of ₹${student.fee_amount} for ${student.name} for ${currentMonth}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            if (!verified || id.startsWith('demo-')) {
              // Test/Demo mode
              setPayments([
                { id: 'demo-p_new', payment_date: new Date().toISOString(), status: 'success', amount: student.fee_amount },
                ...payments
              ]);
              setStudent({ ...student, fee_status: 'paid' });
              Alert.alert('Success (Test Mode)', 'Payment recorded successfully.');
              return;
            }

            setIsLoading(true);
            try {
              // 1. Insert row into payments
              const transactionId = `TXN-${Date.now().toString().slice(-6).toUpperCase()}`;
              const { data: newPayment, error: insertError } = await supabase
                .from('payments')
                .insert({
                  student_id: id,
                  business_id: student.business_id,
                  amount: student.fee_amount,
                  status: 'success',
                  transaction_id: transactionId,
                  payment_date: new Date().toISOString()
                })
                .select()
                .single();

              if (insertError) throw insertError;

              // 2. Update student fee status to paid
              const { error: updateError } = await supabase
                .from('students')
                .update({ fee_status: 'paid' })
                .eq('id', id);

              if (updateError) throw updateError;

              // Update local state
              setStudent({ ...student, fee_status: 'paid' });
              
              // Refresh payment logs
              await loadStudentData();

              Alert.alert('Success', 'Payment recorded successfully.');

              // 3. Send Push Notification to student
              const targetUserId = student.user_id;
              if (targetUserId) {
                const { data: profile, error: profileError } = await supabase
                  .from('profiles')
                  .select('push_token')
                  .eq('id', targetUserId)
                  .single();

                if (!profileError && profile && profile.push_token) {
                  await sendPushNotification(
                    [profile.push_token],
                    'Fee Payment Received',
                    `Your payment of ₹${Number(student.fee_amount).toLocaleString()} for ${currentMonth} has been verified. Transaction ID: ${transactionId}`,
                    { screen: 'fees' }
                  );
                }
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to record payment.');
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleShareCredentials = () => {
    const phone = student?.phone || student?.parent_phone;
    const finalInviteCode = inviteCode || 'Not Set';
    const finalSecretCode = student?.secret_code || secretCode || 'N/A';
    const instName = businessName || 'our center';

    if (!phone) {
      Alert.alert('No Phone', 'No contact phone available for this student.');
      return;
    }

    const shareText = `Dear parent/student, *${student.name}* has been registered at *${instName}*.\n\nPlease download the PrestoID app and claim your digital card.\n\n🔑 *Organization ID*: ${finalInviteCode}\n🔐 *Secret Code*: ${finalSecretCode}\n\nUse these details to access your Virtual ID Card and tracking dashboard.`;
    const url = `https://wa.me/91${phone.replace(/\s/g, '')}?text=${encodeURIComponent(shareText)}`;
    Linking.openURL(url);
  };

  const handleCopyText = (text: string, label: string) => {
    Clipboard.setString(text);
    Alert.alert('Copied!', `${label} copied to clipboard.`);
  };

  const handleDelete = () => {
    Alert.alert('Delete Student', `Are you sure you want to delete ${student?.name}? This action cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!verified || id.startsWith('demo-')) {
            Alert.alert('Deleted (Test Mode)', 'Student record deleted successfully.');
            router.back();
            return;
          }
          setIsLoading(true);
          try {
            const { error } = await supabase
              .from('students')
              .delete()
              .eq('id', id);

            if (error) throw error;
            
            // Delete corresponding profile row if exists
            await supabase.from('profiles').delete().eq('id', id);

            Alert.alert('Deleted', 'Student record deleted successfully.');
            router.back();
          } catch (err: any) {
            Alert.alert('Delete Failed', err.message || 'Something went wrong.');
            setIsLoading(false);
          }
        }
      }
    ]);
  };

  const handleResetDeviceLock = () => {
    Alert.alert(
      'Reset Device Lock',
      `Are you sure you want to reset the device lock for ${student?.name}? They will be able to log in from a new device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            if (!verified || id.startsWith('demo-')) {
              Alert.alert('Reset', 'Device lock reset successfully (Demo).');
              return;
            }
            setIsLoading(true);
            try {
              // Reset device_id in students
              const { error: studentError } = await supabase
                .from('students')
                .update({ device_id: null })
                .eq('id', student.id);

              if (studentError) throw studentError;

              Alert.alert('Reset', 'Device lock reset successfully.');
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to reset device lock.');
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  const openEditModal = () => {
    setEditForm({
      name: student.name,
      phone: student.phone || '',
      parent_phone: student.parent_phone || '',
      batch_name: student.batch_name || '',
      fee_amount: String(student.fee_amount || 2500),
      dob: student.dob || '',
      address: student.address || ''
    });
    setIsEditModalVisible(true);
  };

  const handleUpdate = async () => {
    if (!editForm.name || !editForm.phone || !editForm.parent_phone || !editForm.batch_name || !editForm.fee_amount) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }
    if (editForm.phone.length !== 10 || editForm.parent_phone.length !== 10) {
      Alert.alert('Invalid Phone', 'Phone numbers must be exactly 10 digits.');
      return;
    }

    if (!verified || id.startsWith('demo-')) {
      setStudent({
        ...student,
        name: editForm.name,
        phone: editForm.phone,
        parent_phone: editForm.parent_phone,
        batch_name: editForm.batch_name,
        fee_amount: Number(editForm.fee_amount),
        dob: editForm.dob,
        address: editForm.address
      });
      setIsEditModalVisible(false);
      Alert.alert('Updated (Test Mode)', 'Student details updated successfully.');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('students')
        .update({
          name: editForm.name,
          phone: editForm.phone,
          parent_phone: editForm.parent_phone,
          batch_name: editForm.batch_name,
          fee_amount: Number(editForm.fee_amount),
          dob: editForm.dob,
          address: editForm.address
        })
        .eq('id', id);

      if (error) throw error;

      // Update matching profile name
      await supabase.from('profiles').update({ name: editForm.name }).eq('id', id);

      setStudent({ ...student, ...editForm, fee_amount: Number(editForm.fee_amount) });
      setIsEditModalVisible(false);
      Alert.alert('Updated', 'Student details updated successfully.');
    } catch (err: any) {
      Alert.alert('Update Failed', err.message || 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !student) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.accent.primary} />
      </SafeAreaView>
    );
  }

  if (!student) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.text.tertiary} />
          <Text style={styles.errorText}>Student not found</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.errorLink}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }


  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{student.name}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Test Mode Banner */}
        {!verified && (
          <View style={styles.testModeBanner}>
            <Ionicons name="construct-outline" size={16} color="#FFF" />
            <Text style={styles.testModeText}>Test Mode (Awaiting Verification)</Text>
          </View>
        )}

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>{getInitials(student.name)}</Text>
          </View>
          <Text style={styles.profileName}>{student.name}</Text>
          <Text style={styles.profileEnrollment}>{student.enrollment_id}</Text>
          <View style={styles.batchBadge}>
            <Text style={styles.batchBadgeText}>{student.batch_name}</Text>
          </View>
        </View>

        {/* Pill Tabs */}
        <View style={styles.pillContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillScroll}>
            <TouchableOpacity style={[styles.pill, activeTab === 'profile' && styles.pillActive]} onPress={() => setActiveTab('profile')}>
              <Text style={[styles.pillText, activeTab === 'profile' && styles.pillTextActive]}>Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.pill, activeTab === 'fees' && styles.pillActive]} onPress={() => setActiveTab('fees')}>
              <Text style={[styles.pillText, activeTab === 'fees' && styles.pillTextActive]}>Fees</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.pill, activeTab === 'attendance' && styles.pillActive]} onPress={() => setActiveTab('attendance')}>
              <Text style={[styles.pillText, activeTab === 'attendance' && styles.pillTextActive]}>Attendance</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.pill, activeTab === 'tests' && styles.pillActive]} onPress={() => setActiveTab('tests')}>
              <Text style={[styles.pillText, activeTab === 'tests' && styles.pillTextActive]}>Test Analysis</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {activeTab === 'profile' && (
          <View>

        {/* Personal Information */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="person-outline" size={18} color={Colors.accent.primary} />
            <Text style={styles.sectionTitle}>Personal Information</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Date of Birth</Text>
            <Text style={styles.infoValue}>{student.dob || 'Not Set'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phone</Text>
            <View style={styles.infoValueRow}>
              <Text style={styles.infoValue}>{student.phone}</Text>
              <TouchableOpacity onPress={() => handleCall(student.phone)}>
                <Ionicons name="call-outline" size={18} color={Colors.accent.primary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Parent / Guardian</Text>
            <View>
              <Text style={styles.infoValue}>{student.parent_name || 'Not Set'}</Text>
              <View style={styles.infoValueRow}>
                <Text style={[styles.infoValue, { fontSize: 12, color: Colors.text.tertiary }]}>
                  {student.parent_phone}
                </Text>
                <TouchableOpacity onPress={() => handleCall(student.parent_phone)}>
                  <Ionicons name="call-outline" size={16} color={Colors.accent.primary} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{student.email || 'Not Set'}</Text>
          </View>

          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.infoLabel}>Address</Text>
            <Text style={[styles.infoValue, { flex: 1, textAlign: 'right' }]}>{student.address || 'Not Set'}</Text>
          </View>
        </View>

        {/* Academic Information */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="school-outline" size={18} color={Colors.accent.primary} />
            <Text style={styles.sectionTitle}>Academic Information</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Course</Text>
            <Text style={styles.infoValue}>{student.course || 'Not Set'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Join Date</Text>
            <Text style={styles.infoValue}>{student.admission_date ? new Date(student.admission_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not Set'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Valid Till</Text>
            <Text style={styles.infoValue}>{student.valid_till || 'Not Set'}</Text>
          </View>

          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.infoLabel}>Attendance Rate</Text>
            <Text style={[styles.infoValue, { color: Colors.status.success, fontWeight: '700' }]}>{attendanceRate}%</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${attendanceRate}%` }]} />
          </View>
        </View>

        {/* Login Credentials */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="key-outline" size={18} color={Colors.accent.primary} />
            <Text style={styles.sectionTitle}>Login Credentials</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Organization ID</Text>
            <View style={styles.infoValueRow}>
              <Text style={styles.infoValue}>{inviteCode || 'Loading...'}</Text>
              {inviteCode ? (
                <TouchableOpacity onPress={() => handleCopyText(inviteCode, 'Organization ID')} style={{ padding: 2 }}>
                  <Ionicons name="copy-outline" size={16} color={Colors.accent.primary} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Secret Passcode</Text>
            <View style={styles.infoValueRow}>
              <Text style={[styles.infoValue, styles.highlightCode, { color: Colors.accent.primary }]}>
                {student.secret_code || secretCode || 'N/A'}
              </Text>
              {student.secret_code || secretCode ? (
                <TouchableOpacity onPress={() => handleCopyText(student.secret_code || secretCode, 'Secret Passcode')} style={{ padding: 2 }}>
                  <Ionicons name="copy-outline" size={16} color={Colors.accent.primary} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

            <TouchableOpacity
              style={styles.shareCredsButton}
              activeOpacity={0.8}
              onPress={handleShareCredentials}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" />
              <Text style={styles.shareCredsButtonText}>Share Credentials via WhatsApp</Text>
            </TouchableOpacity>
          </View>
        </View>
        )}

        {activeTab === 'fees' && (
          <View>
        {/* Fee History */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="wallet-outline" size={18} color={Colors.accent.primary} />
            <Text style={styles.sectionTitle}>Fee History</Text>
          </View>

          <View style={styles.feeCurrentRow}>
            <View>
              <Text style={styles.feeCurrentLabel}>Current Status</Text>
              <Text style={styles.feeCurrentMonth}>{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
            </View>
            <View style={[styles.feeStatusBadge, { backgroundColor: getFeeStatusColor(student.fee_status) + '15' }]}>
              <Text style={[styles.feeStatusText, { color: getFeeStatusColor(student.fee_status) }]}>
                {getFeeStatusLabel(student.fee_status)}
              </Text>
            </View>
          </View>

          <View style={styles.monthlyFeeRow}>
            <Text style={styles.monthlyFeeLabel}>Monthly Fee</Text>
            <Text style={styles.monthlyFeeAmount}>₹{Number(student.fee_amount || 0).toLocaleString()}</Text>
          </View>

          <View style={styles.feeHistoryDivider} />

          {payments && payments.length > 0 ? (
            payments.map((item, index) => {
              const formattedMonth = item.payment_date
                ? new Date(item.payment_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                : (item.month || 'Current Month');
              const isPaid = item.status === 'success' || item.status === 'paid';
              return (
                <View
                  key={item.id || index}
                  style={[
                    styles.feeHistoryRow,
                    index === payments.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <Text style={styles.feeHistoryMonth}>{formattedMonth}</Text>
                  <View style={[styles.feeHistoryBadge, { backgroundColor: getFeeStatusColor(isPaid ? 'paid' : 'unpaid') + '15' }]}>
                    <Ionicons
                      name={isPaid ? 'checkmark-circle' : 'close-circle'}
                      size={14}
                      color={getFeeStatusColor(isPaid ? 'paid' : 'unpaid')}
                    />
                    <Text style={[styles.feeHistoryStatus, { color: getFeeStatusColor(isPaid ? 'paid' : 'unpaid') }]}>
                      {isPaid ? 'Paid' : 'Unpaid'}
                    </Text>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={{ paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: Colors.text.tertiary, fontWeight: '500' }}>
                No payment receipts found
              </Text>
            </View>
          )}

          {student.fee_status !== 'paid' && (
            <TouchableOpacity
              style={[styles.reminderButton, { backgroundColor: Colors.status.success, marginBottom: 10 }]}
              activeOpacity={0.8}
              onPress={handleRecordPayment}
            >
              <Ionicons name="cash-outline" size={18} color="#FFFFFF" />
              <Text style={styles.reminderButtonText}>Record Fee Payment</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.reminderButton}
            activeOpacity={0.8}
            onPress={handleSendReminder}
          >
            <Ionicons name="notifications-outline" size={18} color="#FFFFFF" />
            <Text style={styles.reminderButtonText}>Send Fee Reminder</Text>
          </TouchableOpacity>
          </View>
        </View>
        )}

        {activeTab === 'attendance' && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="calendar-outline" size={18} color={Colors.accent.primary} />
              <Text style={styles.sectionTitle}>Attendance Records</Text>
            </View>
            <View style={{ paddingVertical: 8 }}>
              {attendanceLogs && attendanceLogs.length > 0 ? (
                attendanceLogs.map((log: any, index: number) => {
                  const dateStr = log.date 
                    ? new Date(log.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                    : 'N/A';
                  const timeStr = log.created_at
                    ? new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
                    : '';
                  const isPresent = log.status === 'present';
                  const isLate = log.status === 'late';
                  const isAbsent = log.status === 'absent';
                  
                  let statusColor = Colors.status.success;
                  let statusText = 'Present';
                  if (isLate) {
                    statusColor = Colors.status.warning;
                    statusText = 'Late';
                  } else if (isAbsent) {
                    statusColor = Colors.status.danger;
                    statusText = 'Absent';
                  }
                  
                  return (
                    <View 
                      key={log.id || index} 
                      style={[
                        styles.feeHistoryRow,
                        index === attendanceLogs.length - 1 && { borderBottomWidth: 0 }
                      ]}
                    >
                      <View>
                        <Text style={styles.feeHistoryMonth}>{dateStr}</Text>
                        {timeStr ? <Text style={{ fontSize: 11, color: Colors.text.tertiary, marginTop: 2 }}>Check-in: {timeStr}</Text> : null}
                      </View>
                      <View style={[styles.feeHistoryBadge, { backgroundColor: statusColor + '15' }]}>
                        <Ionicons 
                          name={isPresent ? 'checkmark-circle' : isLate ? 'time' : 'close-circle'} 
                          size={14} 
                          color={statusColor} 
                        />
                        <Text style={[styles.feeHistoryStatus, { color: statusColor }]}>
                          {statusText}
                        </Text>
                      </View>
                    </View>
                  );
                })
              ) : (
                <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: Colors.text.tertiary, fontWeight: '500' }}>
                    No check-in records found
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {activeTab === 'tests' && (
          <StudentTestAnalysis studentId={student?.id} businessId={student?.business_id} router={router} />
        )}

        {/* Quick Actions */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="flash-outline" size={18} color={Colors.accent.primary} />
            <Text style={styles.sectionTitle}>Quick Actions</Text>
          </View>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleCall(student.phone)}
            >
              <View style={[styles.actionIcon, { backgroundColor: Colors.status.success + '12' }]}>
                <Ionicons name="call-outline" size={22} color={Colors.status.success} />
              </View>
              <Text style={styles.actionLabel}>Call</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={handleWhatsApp}>
              <View style={[styles.actionIcon, { backgroundColor: Colors.status.success + '12' }]}>
                <Ionicons name="logo-whatsapp" size={22} color={Colors.status.success} />
              </View>
              <Text style={styles.actionLabel}>WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={openEditModal}
            >
              <View style={[styles.actionIcon, { backgroundColor: Colors.status.info + '12' }]}>
                <Ionicons name="create-outline" size={22} color={Colors.status.info} />
              </View>
              <Text style={styles.actionLabel}>Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleDelete}
            >
              <View style={[styles.actionIcon, { backgroundColor: Colors.status.danger + '12' }]}>
                <Ionicons name="trash-outline" size={22} color={Colors.status.danger} />
              </View>
              <Text style={[styles.actionLabel, { color: Colors.status.danger }]}>Remove</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.deviceResetBtn}
            onPress={handleResetDeviceLock}
            activeOpacity={0.8}
          >
            <Ionicons name="lock-open-outline" size={18} color={Colors.status.danger} />
            <Text style={styles.deviceResetText}>Reset Device Lock</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Edit Student Modal */}
      <Modal
        visible={isEditModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalContainer}
          >
            <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Student Details</Text>
                <TouchableOpacity onPress={() => setIsEditModalVisible(false)}>
                  <Ionicons name="close" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalForm}>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Full Name *</Text>
                  <TextInput
                    style={styles.input}
                    value={editForm.name}
                    onChangeText={(text) => setEditForm({ ...editForm, name: text })}
                    placeholder="Enter student name"
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Phone Number *</Text>
                  <TextInput
                    style={styles.input}
                    value={editForm.phone}
                    onChangeText={(text) => setEditForm({ ...editForm, phone: text.replace(/[^0-9]/g, '').slice(0, 10) })}
                    placeholder="10 digit phone number"
                    keyboardType="phone-pad"
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Parent Phone Number *</Text>
                  <TextInput
                    style={styles.input}
                    value={editForm.parent_phone}
                    onChangeText={(text) => setEditForm({ ...editForm, parent_phone: text.replace(/[^0-9]/g, '').slice(0, 10) })}
                    placeholder="10 digit parent phone"
                    keyboardType="phone-pad"
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Batch Name *</Text>
                  <TextInput
                    style={styles.input}
                    value={editForm.batch_name}
                    onChangeText={(text) => setEditForm({ ...editForm, batch_name: text })}
                    placeholder="e.g. MPPSC"
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Monthly Fee (₹) *</Text>
                  <TextInput
                    style={styles.input}
                    value={editForm.fee_amount}
                    onChangeText={(text) => setEditForm({ ...editForm, fee_amount: text.replace(/[^0-9]/g, '') })}
                    placeholder="e.g. 2500"
                    keyboardType="numeric"
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Date of Birth</Text>
                  <TextInput
                    style={styles.input}
                    value={editForm.dob}
                    onChangeText={(text) => setEditForm({ ...editForm, dob: text })}
                    placeholder="e.g. 15 Mar 2001"
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Address</Text>
                  <TextInput
                    style={[styles.input, { height: 80 }]}
                    value={editForm.address}
                    onChangeText={(text) => setEditForm({ ...editForm, address: text })}
                    placeholder="Enter home address"
                    multiline={true}
                    numberOfLines={3}
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsEditModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleUpdate}>
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  errorLink: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.accent.primary,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.bg.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },

  // Pill Tabs
  pillContainer: {
    marginTop: 16,
    marginBottom: 16,
    marginHorizontal: -20,
  },
  pillScroll: {
    paddingHorizontal: 20,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  pillActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  pillTextActive: {
    color: '#FFFFFF',
  },

  // Profile Card
  profileCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.card.border,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    ...Shadows.sm,
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.stitch.primaryFixed,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileAvatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.accent.primary,
  },
  profileName: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  profileEnrollment: {
    fontSize: 13,
    color: Colors.text.secondary,
    fontWeight: '500',
    marginBottom: 10,
  },
  batchBadge: {
    backgroundColor: Colors.accent.primary + '12',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
  },
  batchBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.accent.primary,
  },

  // Section Card
  sectionCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.card.border,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },

  // Info Row
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border + '60',
  },
  infoLabel: {
    fontSize: 13,
    color: Colors.text.tertiary,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 13,
    color: Colors.text.primary,
    fontWeight: '600',
  },
  infoValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // Progress Bar
  progressBarBg: {
    height: 6,
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 3,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 6,
    backgroundColor: Colors.status.success,
    borderRadius: 3,
  },

  // Fee Section
  feeCurrentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border + '60',
  },
  feeCurrentLabel: {
    fontSize: 12,
    color: Colors.text.tertiary,
    fontWeight: '500',
  },
  feeCurrentMonth: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 2,
  },
  feeStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  feeStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  monthlyFeeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  monthlyFeeLabel: {
    fontSize: 13,
    color: Colors.text.tertiary,
    fontWeight: '500',
  },
  monthlyFeeAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  feeHistoryDivider: {
    height: 1,
    backgroundColor: Colors.card.border + '60',
    marginBottom: 4,
  },
  feeHistoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border + '40',
  },
  feeHistoryMonth: {
    fontSize: 13,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  feeHistoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  feeHistoryStatus: {
    fontSize: 11,
    fontWeight: '600',
  },
  reminderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent.primary,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 14,
    gap: 8,
  },
  reminderButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Quick Actions
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  actionButton: {
    alignItems: 'center',
    gap: 6,
  },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  deviceResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: Colors.status.danger + '12',
    borderWidth: 1,
    borderColor: Colors.status.danger + '30',
    gap: 8,
  },
  deviceResetText: {
    color: Colors.status.danger,
    fontSize: 14,
    fontWeight: '700',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
  },
  modalContent: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.card.border,
    maxHeight: '100%',
    flexShrink: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  modalForm: {
    gap: 14,
    paddingBottom: 10,
  },
  inputContainer: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  input: {
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.card.border,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: Colors.text.primary,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.card.border,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  saveBtn: {
    backgroundColor: Colors.accent.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
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
  highlightCode: {
    letterSpacing: 1,
    fontWeight: '700',
  },
  shareCredsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#25D366',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 14,
    gap: 8,
  },
  shareCredsButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

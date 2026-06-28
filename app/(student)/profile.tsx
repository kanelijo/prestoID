import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Shadows } from '@/constants/colors';
import { useAuthStore } from '@/stores/useAuthStore';
import { supabase, signOutAll } from '@/lib/supabase';

const HELP_TOPICS = [
  { q: 'How is attendance marked?', a: 'Your attendance is registered instantly when your virtual ID Card QR code is scanned by your organization staff.' },
  { q: 'Where do I view my fee receipts?', a: 'All past payments and generated digital receipts can be reviewed under the Fees tab in the bottom bar.' },
  { q: 'How do I change my batch details?', a: 'Only organization administrators can assign or transfer you to different groups. Please contact your admin desk.' },
];

export default function StudentSettingsScreen() {
  const router = useRouter();
  const { user, reset } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [studentName, setStudentName] = useState('Student User');
  const [studentDetails, setStudentDetails] = useState<any>(null);


  // Dynamic DB states
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
  const [attendanceRate, setAttendanceRate] = useState(0);
  const [payments, setPayments] = useState<any[]>([]);

  // Modal visibility states
  const [isChangePasswordVisible, setIsChangePasswordVisible] = useState(false);
  const [isTermsVisible, setIsTermsVisible] = useState(false);
  const [isHelpVisible, setIsHelpVisible] = useState(false);
  
  // Settings switches
  const [attendanceAlerts, setAttendanceAlerts] = useState(true);
  const [feeReminders, setFeeReminders] = useState(true);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const attVal = await AsyncStorage.getItem('@presto_student_settings_attendance_alerts');
        const feeVal = await AsyncStorage.getItem('@presto_student_settings_fee_reminders');
        if (attVal !== null) setAttendanceAlerts(attVal === 'true');
        if (feeVal !== null) setFeeReminders(feeVal === 'true');
      } catch (e) {
        console.warn('Failed to load settings from storage:', e);
      }
    };
    loadSettings();
  }, []);

  const handleToggleAttendanceAlerts = async (value: boolean) => {
    setAttendanceAlerts(value);
    try {
      await AsyncStorage.setItem('@presto_student_settings_attendance_alerts', String(value));
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  };

  const handleToggleFeeReminders = async (value: boolean) => {
    setFeeReminders(value);
    try {
      await AsyncStorage.setItem('@presto_student_settings_fee_reminders', String(value));
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  };
  const [expandedHelpIndex, setExpandedHelpIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'attendance' | 'fees'>('profile');

  // Change Password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStudentData = async (silent = false) => {
    if (!user) return;
    if (!silent) setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!error && data) {
        setStudentName(data.name);
        setStudentDetails(data);
        


        // Fetch attendance logs & calculate rate
        const { data: attLogs, error: attError } = await supabase
          .from('attendance')
          .select('id, date, status, created_at')
          .eq('student_id', data.id)
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

        // Fetch payments history
        const { data: payLogs, error: payError } = await supabase
          .from('payments')
          .select('*')
          .eq('student_id', data.id)
          .order('payment_date', { ascending: false });

        if (!payError && payLogs) {
          setPayments(payLogs);
        }
      } else {
        setStudentName(user.user_metadata?.name || 'Student User');
      }
    } catch (err) {
      setStudentName(user.user_metadata?.name || 'Student User');
    } finally {
      if (!silent) setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStudentData();
  }, [user]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await fetchStudentData(true);
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill in both password fields.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }
    const hasLetter = /[A-Za-z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    if (!hasLetter || !hasNumber) {
      Alert.alert('Weak Password', 'Password must contain both letters and numbers.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }

    setIsSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      Alert.alert('Success', 'Password changed successfully.');
      setIsChangePasswordVisible(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to change password.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout of PrestoID?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              await signOutAll();
              reset();
              router.replace('/(auth)/login');
            } catch (err) {
              Alert.alert('Error', 'Failed to log out.');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? Tapping yes will queue your account for permanent deletion in 7 days and restrict active ID card usage.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Confirmation Required',
              'This is your last warning. Tapping confirm will immediately log you out and send the deletion request to your organization admin. You will have 7 days to cancel this request.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Confirm Deletion',
                  style: 'destructive',
                  onPress: submitDeletionRequest,
                }
              ]
            );
          }
        }
      ]
    );
  };

  const submitDeletionRequest = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      // Create request in DB
      const { error } = await supabase
        .from('account_deletion_requests')
        .insert({
          user_id: user.id,
          user_name: studentName,
          user_email: user.email,
          status: 'pending'
        });

      if (error) {
        // Handle constraint violation (already requested)
        if (error.code === '23505') {
          Alert.alert('Request Already Sent', 'You have already submitted an account deletion request. Please wait for the admin to approve or deny.');
          return;
        }
        throw error;
      }

      // Log out
      await signOutAll();
      Alert.alert(
        'Request Sent Successfully',
        'Your deletion request is now pending admin approval. You have been logged out. If you wish to recover your account, log in again within 7 days.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/(auth)/login')
          }
        ]
      );
    } catch (err: any) {
      Alert.alert('Request Failed', err.message || 'Failed to submit deletion request.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]} edges={['top']}>
        <ActivityIndicator size="large" color={Colors.accent.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[Colors.accent.primary]} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
          <Text style={styles.subtitle}>Your account and records</Text>
          
          <View style={styles.pillContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillScroll}>
              <TouchableOpacity
                style={[styles.pill, activeTab === 'profile' && styles.pillActive]}
                onPress={() => setActiveTab('profile')}
              >
                <Text style={[styles.pillText, activeTab === 'profile' && styles.pillTextActive]}>Personal Details</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pill, activeTab === 'attendance' && styles.pillActive]}
                onPress={() => setActiveTab('attendance')}
              >
                <Text style={[styles.pillText, activeTab === 'attendance' && styles.pillTextActive]}>Attendance</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pill, activeTab === 'fees' && styles.pillActive]}
                onPress={() => setActiveTab('fees')}
              >
                <Text style={[styles.pillText, activeTab === 'fees' && styles.pillTextActive]}>Fees</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>

        {activeTab === 'profile' && (
          <View>
        {/* Notification Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Attendance Alerts</Text>
                <Text style={styles.settingDesc}>Get notified instantly on daily check-ins</Text>
              </View>
              <Switch
                value={attendanceAlerts}
                onValueChange={handleToggleAttendanceAlerts}
                trackColor={{ false: Colors.bg.tertiary, true: Colors.accent.primary + '30' }}
                thumbColor={attendanceAlerts ? Colors.accent.primary : Colors.text.tertiary}
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Fee Reminders</Text>
                <Text style={styles.settingDesc}>Get notified about pending fee due dates</Text>
              </View>
              <Switch
                value={feeReminders}
                onValueChange={handleToggleFeeReminders}
                trackColor={{ false: Colors.bg.tertiary, true: Colors.accent.primary + '30' }}
                thumbColor={feeReminders ? Colors.accent.primary : Colors.text.tertiary}
              />
            </View>
          </View>
        </View>

        {/* Account Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account & Privacy</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.menuRow} onPress={() => setIsChangePasswordVisible(true)}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.text.secondary} style={{ marginRight: 12 }} />
              <Text style={styles.menuLabel}>Change Password</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.text.tertiary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuRow} onPress={() => setIsHelpVisible(true)}>
              <Ionicons name="help-circle-outline" size={20} color={Colors.text.secondary} style={{ marginRight: 12 }} />
              <Text style={styles.menuLabel}>Help & Support</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.text.tertiary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuRow} onPress={() => setIsTermsVisible(true)}>
              <Ionicons name="document-text-outline" size={20} color={Colors.text.secondary} style={{ marginRight: 12 }} />
              <Text style={styles.menuLabel}>Terms & Privacy Policy</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.text.tertiary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.status.danger }]}>Danger Zone</Text>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={Colors.status.danger} style={{ marginRight: 8 }} />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
            <Text style={styles.deleteText}>Delete Account</Text>
          </TouchableOpacity>
        </View>
        </View>
        )}

        {activeTab === 'attendance' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Attendance Overview</Text>
            <View style={styles.card}>
              <View style={styles.feeHeaderRow}>
                <View>
                  <Text style={styles.feeLabel}>Attendance Rate</Text>
                  <Text style={[styles.feeAmount, { color: attendanceRate >= 75 ? Colors.status.success : Colors.status.danger }]}>
                    {attendanceRate}%
                  </Text>
                </View>
                <View style={[styles.feeStatusBadge, { backgroundColor: (attendanceRate >= 75 ? Colors.status.success : Colors.status.danger) + '15' }]}>
                  <Text style={[styles.feeStatusText, { color: attendanceRate >= 75 ? Colors.status.success : Colors.status.danger }]}>
                    {attendanceRate >= 75 ? 'GOOD' : 'LOW'}
                  </Text>
                </View>
              </View>
              <View style={styles.divider} />
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Total Classes Logged</Text>
                  <Text style={styles.settingDesc}>{attendanceLogs.length} days</Text>
                </View>
              </View>
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Attendance Logs</Text>
            <View style={styles.card}>
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
                        styles.settingRow,
                        { paddingVertical: 12, borderBottomWidth: index === attendanceLogs.length - 1 ? 0 : 1, borderBottomColor: Colors.card.border }
                      ]}
                    >
                      <View style={styles.settingInfo}>
                        <Text style={styles.settingLabel}>{dateStr}</Text>
                        {timeStr ? <Text style={styles.settingDesc}>Check-in: {timeStr}</Text> : null}
                      </View>
                      <View style={[styles.feeStatusBadge, { backgroundColor: statusColor + '15' }]}>
                        <Text style={[styles.feeStatusText, { color: statusColor, fontSize: 11 }]}>
                          {statusText.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  );
                })
              ) : (
                <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={styles.settingLabel}>No check-in records found</Text>
                  <Text style={styles.settingDesc}>Scan your ID Card QR code at your organization to mark presence.</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {activeTab === 'fees' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Current Fee Status</Text>
            <View style={styles.card}>
              <View style={styles.feeHeaderRow}>
                <View>
                  <Text style={styles.feeLabel}>Amount Due</Text>
                  <Text style={styles.feeAmount}>₹{studentDetails?.fee_amount || '0'}</Text>
                </View>
                <View style={[styles.feeStatusBadge, studentDetails?.fee_status === 'paid' ? styles.feeStatusPaid : styles.feeStatusPending]}>
                  <Text style={[styles.feeStatusText, studentDetails?.fee_status === 'paid' ? styles.feeStatusTextPaid : styles.feeStatusTextPending]}>
                    {(studentDetails?.fee_status || 'Pending').toUpperCase()}
                  </Text>
                </View>
              </View>
              <View style={styles.divider} />
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Next Due Date</Text>
                  <Text style={styles.settingDesc}>
                    {studentDetails?.next_due_date ? new Date(studentDetails.next_due_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'}
                  </Text>
                </View>
                <Ionicons name="calendar-outline" size={24} color={Colors.accent.primary} />
              </View>
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Fee History</Text>
            <View style={styles.card}>
              {payments && payments.length > 0 ? (
                payments.map((item: any, index: number) => {
                  const formattedMonth = item.payment_date
                    ? new Date(item.payment_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                    : (item.month || 'Current Month');
                  const dateStr = item.payment_date
                    ? new Date(item.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                    : 'N/A';
                  const isSuccess = item.status === 'success' || item.status === 'paid';
                  
                  return (
                    <View 
                      key={item.id || index} 
                      style={[
                        styles.settingRow,
                        { paddingVertical: 12, borderBottomWidth: index === payments.length - 1 ? 0 : 1, borderBottomColor: Colors.card.border }
                      ]}
                    >
                      <View style={styles.settingInfo}>
                        <Text style={styles.settingLabel}>{formattedMonth}</Text>
                        <Text style={styles.settingDesc}>Amount: ₹{Number(item.amount || 0).toLocaleString()} • Paid on: {dateStr}</Text>
                        {item.transaction_id ? <Text style={[styles.settingDesc, { fontSize: 10 }]}>Txn ID: {item.transaction_id}</Text> : null}
                      </View>
                      <View style={[styles.feeStatusBadge, { backgroundColor: (isSuccess ? Colors.status.success : Colors.status.danger) + '15' }]}>
                        <Text style={[styles.feeStatusText, { color: isSuccess ? Colors.status.success : Colors.status.danger, fontSize: 11 }]}>
                          {isSuccess ? 'PAID' : 'FAILED'}
                        </Text>
                      </View>
                    </View>
                  );
                })
              ) : (
                <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={styles.settingLabel}>No payments recorded yet</Text>
                  <Text style={styles.settingDesc}>All verified receipts will appear in this list.</Text>
                </View>
              )}
            </View>
          </View>
        )}

        <Text style={styles.versionText}>PrestoID v1.0.0 • by Team43</Text>
      </ScrollView>

      {/* Change Password Modal */}
      <Modal
        visible={isChangePasswordVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsChangePasswordVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
            style={styles.modalContent}
          >
            <Text style={styles.modalTitle}>Change Password</Text>
            <TextInput
              style={styles.modalInput}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New password (min. 6 chars)"
              placeholderTextColor={Colors.text.tertiary}
              secureTextEntry={true}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.modalInput}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
              placeholderTextColor={Colors.text.tertiary}
              secureTextEntry={true}
              autoCapitalize="none"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.modalCancelBtn} 
                onPress={() => setIsChangePasswordVisible(false)}
                disabled={isSavingPassword}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.modalSaveBtn} 
                onPress={handleChangePassword}
                disabled={isSavingPassword}
              >
                {isSavingPassword ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Help & Support Modal */}
      <Modal visible={isHelpVisible} animationType="slide" transparent={true} onRequestClose={() => setIsHelpVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 450, width: '90%' }]}>
            <Text style={styles.modalTitle}>Help & Support</Text>
            <ScrollView style={{ maxHeight: 300, marginBottom: 15 }} showsVerticalScrollIndicator={false}>
              {HELP_TOPICS.map((topic, index) => {
                const isExpanded = expandedHelpIndex === index;
                return (
                  <TouchableOpacity 
                    key={index} 
                    style={styles.helpTopicBox}
                    onPress={() => setExpandedHelpIndex(isExpanded ? null : index)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.helpTopicHeader}>
                      <Text style={styles.helpQuestion}>{topic.q}</Text>
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.text.secondary} />
                    </View>
                    {isExpanded && <Text style={styles.helpAnswer}>{topic.a}</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setIsHelpVisible(false)}>
              <Text style={styles.modalCancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Terms & Privacy Modal */}
      <Modal visible={isTermsVisible} animationType="slide" transparent={true} onRequestClose={() => setIsTermsVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 450, width: '90%' }]}>
            <Text style={styles.modalTitle}>Terms & Privacy Policy</Text>
            <ScrollView style={{ maxHeight: 300, marginBottom: 15 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.documentHeader}>1. Information We Collect</Text>
              <Text style={styles.documentBody}>
                PrestoID collects minimal student profile data (name, DOB, email, batch information) and avatar photos to verify your ID card status and record school attendance securely.
              </Text>
              <Text style={styles.documentHeader}>2. Usage of Data</Text>
              <Text style={styles.documentBody}>
                Your data is stored securely in Supabase and only accessible by yourself and verified organization administrators. We do not sell or share your information with third-party advertising companies.
              </Text>
              <Text style={styles.documentHeader}>3. Deletion Policy</Text>
              <Text style={styles.documentBody}>
                If you request account deletion, your profile remains hidden and is queued for permanent cleanup after 7 days. You can reactivate your profile anytime during this recovery period.
              </Text>
            </ScrollView>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setIsTermsVisible(false)}>
              <Text style={styles.modalCancelText}>Close</Text>
            </TouchableOpacity>
          </View>
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
  scrollContent: {
    paddingTop: 12,
    paddingBottom: 100,
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.text.secondary,
    marginTop: 4,
    fontWeight: '500',
  },
  pillContainer: {
    marginTop: 16,
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.secondary,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.card.border,
    ...Shadows.sm,
  },
  divider: {
    height: 0.5,
    backgroundColor: Colors.card.border,
    marginVertical: 12,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingInfo: {
    flex: 1,
    marginRight: 10,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  settingDesc: {
    fontSize: 12,
    color: Colors.text.tertiary,
    marginTop: 2,
    fontWeight: '500',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  menuLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
    flex: 1,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.status.danger + '10',
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.status.danger + '20',
    marginBottom: 14,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.status.danger,
  },
  deleteButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  deleteText: {
    fontSize: 12,
    color: Colors.text.tertiary,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  versionText: {
    fontSize: 11,
    color: Colors.text.tertiary,
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '500',
  },

  // Fees UI
  feeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  feeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.tertiary,
    marginBottom: 4,
  },
  feeAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  feeStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  feeStatusPaid: {
    backgroundColor: Colors.status.success + '20',
    borderColor: Colors.status.success + '40',
  },
  feeStatusPending: {
    backgroundColor: Colors.status.danger + '20',
    borderColor: Colors.status.danger + '40',
  },
  feeStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  feeStatusTextPaid: {
    color: Colors.status.success,
  },
  feeStatusTextPending: {
    color: Colors.status.danger,
  },

  // Modals Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '90%',
    maxWidth: 340,
    backgroundColor: Colors.bg.secondary,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.card.border,
    ...Shadows.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.card.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    fontSize: 14,
    backgroundColor: Colors.bg.primary,
    color: Colors.text.primary,
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  modalCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.card.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  modalSaveBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: Colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSaveText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Help Modal Items
  helpTopicBox: {
    backgroundColor: Colors.bg.primary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 0.5,
    borderColor: Colors.card.border,
  },
  helpTopicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  helpQuestion: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
    flex: 1,
    marginRight: 10,
  },
  helpAnswer: {
    fontSize: 12,
    color: Colors.text.secondary,
    lineHeight: 18,
    marginTop: 10,
    fontWeight: '500',
  },

  // Document Modal Text
  documentHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 14,
    marginBottom: 4,
  },
  documentBody: {
    fontSize: 12,
    color: Colors.text.secondary,
    lineHeight: 18,
    fontWeight: '500',
    marginBottom: 10,
  },
});

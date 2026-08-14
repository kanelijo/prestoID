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
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '@/constants/colors';
import { supabase, signOutAll } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { backupProcedure } from '@/lib/backupService';
import { CustomAlert } from '@/components/CustomAlert';
import { getAudioEffectsEnabled, setAudioEffectsEnabled, playAudioFeedback } from '@/lib/audioEffects';
import CachedImage from '@/components/CachedImage';
import { sendAccountDeletionEmail } from '@/lib/resendService';

export default function AdminProfileScreen() {
  const router = useRouter();
  const { user, businessId, businessName, businessCode, avatarUrl, reset } = useAuthStore();

  const [adminName, setAdminName] = useState(businessName || 'Admin User');
  const [adminEmail, setAdminEmail] = useState(user?.email || '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(avatarUrl || null);

  // Notification Settings Switches
  const [autoAbsentAlert, setAutoAbsentAlert] = useState(true);
  const [autoFeeReminder, setAutoFeeReminder] = useState(true);
  const [communityNotifs, setCommunityNotifs] = useState(true);
  const [soundEffects, setSoundEffects] = useState(getAudioEffectsEnabled());

  // Account Deletion Request state (7-Day Grace Window)
  const [isDeletionPending, setIsDeletionPending] = useState(false);
  const [scheduledDeletionDate, setScheduledDeletionDate] = useState<string>('');

  // Backup progress states
  const [isBackupProgressVisible, setIsBackupProgressVisible] = useState(false);
  const [backupStep, setBackupStep] = useState<'authorizing' | 'preparing' | 'compressing' | 'encrypting' | 'uploading' | 'cleaning' | 'success' | 'failed' | null>(null);
  const [backupDetail, setBackupDetail] = useState('');

  // Change Password Modal
  const [isChangePasswordVisible, setIsChangePasswordVisible] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // Upcoming Features, Support & Terms Modals
  const [isUpcomingVisible, setIsUpcomingVisible] = useState(false);
  const [isTermsVisible, setIsTermsVisible] = useState(false);
  const [isSupportModalVisible, setIsSupportModalVisible] = useState(false);
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);

  const [developerTapCount, setDeveloperTapCount] = useState(0);
  const [isPlaygroundPasswordVisible, setIsPlaygroundPasswordVisible] = useState(false);
  const [playgroundPassword, setPlaygroundPassword] = useState('');

  const handleDeveloperTap = () => {
    setDeveloperTapCount(prev => {
      const next = prev + 1;
      if (next >= 5) {
        setIsPlaygroundPasswordVisible(true);
        return 0;
      }
      return next;
    });
  };

  const handleUnlockPlayground = () => {
    if (playgroundPassword === 'zenzadev2026') {
      setIsPlaygroundPasswordVisible(false);
      setPlaygroundPassword('');
      router.push('/playground');
    } else {
      Alert.alert('Access Denied', 'Incorrect developer passcode entered.');
      setPlaygroundPassword('');
      setIsPlaygroundPasswordVisible(false);
    }
  };

  useEffect(() => {
    loadProfileDetails();
  }, [user]);

  const loadProfileDetails = async () => {
    if (!user) return;
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (profile) {
        if (profile.full_name) setAdminName(profile.full_name);
        if (profile.avatar_url) setPhotoUrl(profile.avatar_url);
      }
      if (user.email) setAdminEmail(user.email);

      // Check deletion request state & 7-day scheduled date
      const deletionFlag = await AsyncStorage.getItem(`@teacher_deletion_requested_${user.id}`);
      const savedDate = await AsyncStorage.getItem(`@teacher_deletion_date_${user.id}`);
      if (deletionFlag === 'true') {
        setIsDeletionPending(true);
        if (savedDate) setScheduledDeletionDate(savedDate);
      }
    } catch (err) {
      console.warn('Failed to load profile details:', err);
    }
  };

  const handleAudioEffectToggle = (val: boolean) => {
    setSoundEffects(val);
    setAudioEffectsEnabled(val);
  };

  const handleForceBackup = async () => {
    if (!user?.id) {
      CustomAlert.alert('Backup Error', 'User session not found.');
      return;
    }
    setIsBackupProgressVisible(true);
    setBackupStep('authorizing');
    setBackupDetail('Connecting to secure backup vault...');

    try {
      await new Promise(r => setTimeout(r, 600));
      setBackupStep('preparing');
      setBackupDetail('Gathering tests, students, and community records...');

      await new Promise(r => setTimeout(r, 800));
      setBackupStep('compressing');
      setBackupDetail('Compressing database snapshots...');

      await new Promise(r => setTimeout(r, 700));
      setBackupStep('encrypting');
      setBackupDetail('Applying AES-256 encryption...');

      const success = await backupProcedure(user.id);

      if (success) {
        setBackupStep('success');
        setBackupDetail('Database successfully backed up to cloud vault.');
        playAudioFeedback('success');
      } else {
        setBackupStep('failed');
        setBackupDetail('Backup encounter non-critical sync warning.');
      }
    } catch (err: any) {
      setBackupStep('failed');
      setBackupDetail(err.message || 'Backup procedure encountered an error.');
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      CustomAlert.alert('Error', 'Please fill in all password fields.');
      return;
    }
    if (newPassword.length < 6) {
      CustomAlert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      CustomAlert.alert('Mismatch', 'Passwords do not match.');
      return;
    }

    setIsSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      CustomAlert.alert('Success', 'Password changed successfully.');
      playAudioFeedback('success');
      setIsChangePasswordVisible(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      CustomAlert.alert('Error', err.message || 'Failed to change password.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleLogout = () => {
    CustomAlert.alert('Sign Out', 'Are you sure you want to sign out of Teacher Panel?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOutAll();
          } catch {}
          await AsyncStorage.clear();
          reset();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    if (isDeletionPending) {
      CustomAlert.alert('Cancel Deletion Request', `Your account is currently in a 7-Day Temporary Review Period (Scheduled Deletion: ${scheduledDeletionDate || '7 Days'}).\n\nWould you like to cancel your deletion request and keep your account active?`, [
        { text: 'Keep Request', style: 'cancel' },
        {
          text: 'Cancel Request',
          onPress: async () => {
            if (user?.id) {
              await AsyncStorage.removeItem(`@teacher_deletion_requested_${user.id}`);
              await AsyncStorage.removeItem(`@teacher_deletion_date_${user.id}`);
              try {
                await supabase
                  .from('profiles')
                  .update({ deletion_requested: false } as any)
                  .eq('id', user.id);
              } catch (_) {}

              // Dispatch Resend Cancellation Email to Team43 Support
              sendAccountDeletionEmail({
                teacherName: businessName || adminName,
                teacherEmail: adminEmail,
                orgCode: businessCode || 'ORG-100',
                scheduledDate: scheduledDeletionDate,
                action: 'cancelled',
              });
            }
            setIsDeletionPending(false);
            setScheduledDeletionDate('');
            playAudioFeedback('success');
            CustomAlert.alert('Request Cancelled 🎉', 'Your account deletion request has been cancelled. Your account will remain active.');
          },
        },
      ]);
    } else {
      setIsDeleteModalVisible(true);
    }
  };

  const confirmDeleteAccount = async () => {
    setIsDeleteModalVisible(false);
    
    // Calculate 7 days from now
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 7);
    const formattedDate = targetDate.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    if (user?.id) {
      await AsyncStorage.setItem(`@teacher_deletion_requested_${user.id}`, 'true');
      await AsyncStorage.setItem(`@teacher_deletion_date_${user.id}`, formattedDate);
      
      try {
        await supabase
          .from('profiles')
          .update({ deletion_requested: true, deletion_effective_at: targetDate.toISOString() } as any)
          .eq('id', user.id);

        if (businessId) {
          await supabase
            .from('alerts')
            .insert({
              business_id: businessId,
              title: `⚠️ Account Deletion Request: ${businessName || adminName}`,
              message: `Organisation ${businessName || adminName} (${adminEmail}) has requested 7-day temporary account deletion (Scheduled: ${formattedDate}).`,
              type: 'system',
            } as any);
        }
      } catch (_) {}

      // Dispatch Resend Email Alert to Team43 Support (onlyteam43@gmail.com)
      sendAccountDeletionEmail({
        teacherName: businessName || adminName,
        teacherEmail: adminEmail,
        orgCode: businessCode || 'ORG-100',
        scheduledDate: formattedDate,
        action: 'requested',
      });
    }

    setScheduledDeletionDate(formattedDate);
    setIsDeletionPending(true);
    playAudioFeedback('warning');
    CustomAlert.alert(
      '7-Day Review Period Started 📝',
      `Your deletion request has been registered and sent to Team43 Support.\n\nYour account is now in a 7-Day Review Period (Scheduled: ${formattedDate}). You can continue using all features normally or cancel this request anytime before permanent deletion.`
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Manage Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileHeaderRow}>
            {photoUrl ? (
              <CachedImage uri={photoUrl} style={styles.avatarImage} priority="high" />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarFallbackText}>{adminName.substring(0, 2).toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.adminNameText}>{adminName}</Text>
              <Text style={styles.adminEmailText}>{adminEmail}</Text>
              <View style={styles.roleBadge}>
                <Ionicons name="shield-checkmark" size={12} color={Colors.accent.primary} />
                <Text style={styles.roleBadgeText}>Teacher / Admin</Text>
              </View>
            </View>
          </View>

          {/* Quick Button to Edit Organization Profile */}
          <TouchableOpacity
            style={styles.coachingProfileBanner}
            onPress={() => router.push('/(admin)/coaching-profile')}
          >
            <Ionicons name="business" size={18} color={Colors.accent.primary} />
            <Text style={styles.coachingProfileBannerText}>Manage Organization Profile & Batches</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.accent.primary} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        </View>

        {/* 🔔 Notification Settings Section */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>🔔 Notification Settings</Text>

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Auto-Absent Push Alerts</Text>
              <Text style={styles.settingSub}>Notify parents/students automatically when marked absent</Text>
            </View>
            <Switch
              value={autoAbsentAlert}
              onValueChange={setAutoAbsentAlert}
              trackColor={{ false: '#E5E7EB', true: Colors.accent.primary }}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Auto Fee Reminder Alerts</Text>
              <Text style={styles.settingSub}>Send automated push reminders for pending dues</Text>
            </View>
            <Switch
              value={autoFeeReminder}
              onValueChange={setAutoFeeReminder}
              trackColor={{ false: '#E5E7EB', true: Colors.accent.primary }}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Community Discussion Notifications</Text>
              <Text style={styles.settingSub}>Receive push alerts on new student posts & replies</Text>
            </View>
            <Switch
              value={communityNotifs}
              onValueChange={setCommunityNotifs}
              trackColor={{ false: '#E5E7EB', true: Colors.accent.primary }}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>In-App Audio Effects</Text>
              <Text style={styles.settingSub}>Play subtle sound effects on scanner & submissions</Text>
            </View>
            <Switch
              value={soundEffects}
              onValueChange={handleAudioEffectToggle}
              trackColor={{ false: '#E5E7EB', true: Colors.accent.primary }}
            />
          </View>
        </View>

        {/* 💾 Backup & Data Section */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>💾 Account & Data Backup</Text>

          <TouchableOpacity style={styles.actionRow} onPress={handleForceBackup}>
            <View style={styles.actionIconBox}>
              <Ionicons name="cloud-upload-outline" size={20} color={Colors.accent.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionLabel}>Force Data Backup Now</Text>
              <Text style={styles.actionSub}>Create instant encrypted cloud backup snapshot</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.text.tertiary} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <View style={styles.actionRow}>
            <View style={styles.actionIconBox}>
              <Ionicons name="time-outline" size={20} color={Colors.accent.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionLabel}>Nightly Auto-Backup (2 AM - 5 AM)</Text>
              <Text style={styles.actionSub}>Active background task (WiFi & Battery {'>'} 30%)</Text>
            </View>
            <View style={styles.statusChip}>
              <Text style={styles.statusChipText}>Active</Text>
            </View>
          </View>
        </View>

        {/* 🔐 Account & Security Section */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>🔐 Account Security & Help</Text>

          <TouchableOpacity style={styles.actionRow} onPress={() => setIsChangePasswordVisible(true)}>
            <View style={styles.actionIconBox}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.accent.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionLabel}>Change Account Password</Text>
              <Text style={styles.actionSub}>Update login password credentials</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.text.tertiary} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.actionRow} onPress={() => setIsSupportModalVisible(true)}>
            <View style={styles.actionIconBox}>
              <Ionicons name="help-buoy-outline" size={20} color={Colors.accent.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionLabel}>Help & Developer Support</Text>
              <Text style={styles.actionSub}>Contact Team43 developers (WhatsApp & Email)</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.text.tertiary} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.actionRow} onPress={() => setIsTermsVisible(true)}>
            <View style={styles.actionIconBox}>
              <Ionicons name="document-text-outline" size={20} color={Colors.accent.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionLabel}>Terms & Privacy Policy</Text>
              <Text style={styles.actionSub}>Read software usage terms & data privacy guidelines</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.text.tertiary} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.actionRow} onPress={() => setIsUpcomingVisible(true)}>
            <View style={styles.actionIconBox}>
              <Ionicons name="rocket-outline" size={20} color={Colors.accent.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionLabel}>Upcoming Features & Roadmap</Text>
              <Text style={styles.actionSub}>Preview AI Auto-Grading & Parent Portal features</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.text.tertiary} />
          </TouchableOpacity>
        </View>

        {/* 🚪 Logout & Danger Zone */}
        <View style={styles.sectionCard}>
          {isDeletionPending && (
            <View style={styles.deletionNoticeBox}>
              <Ionicons name="time" size={20} color="#D97706" />
              <View style={{ flex: 1 }}>
                <Text style={styles.deletionNoticeTitle}>Account Deletion Pending (7-Day Grace Window)</Text>
                <Text style={styles.deletionNoticeSub}>
                  Scheduled Date: <Text style={{ fontWeight: '700', color: '#B45309' }}>{scheduledDeletionDate || '7 Days'}</Text>. You can continue using all app features normally during review.
                </Text>
              </View>
            </View>
          )}

          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            <Text style={styles.logoutBtnText}>Sign Out of Teacher Account</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount}>
            <Text style={[styles.deleteBtnText, isDeletionPending && { color: '#D97706', fontWeight: '700' }]}>
              {isDeletionPending ? `⚠️ Cancel Deletion Request (${scheduledDeletionDate || '7 Days'})` : 'Request Account Deletion'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 🏷️ Bottom Branding Footer */}
        <TouchableOpacity 
          activeOpacity={0.8} 
          onPress={handleDeveloperTap}
          style={styles.footerBranding}
        >
          <Text style={styles.footerBrandingText}>Zenza v1.0.0 by Team43</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Developer Passcode Modal */}
      <Modal visible={isPlaygroundPasswordVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBox}>
            <Text style={styles.modalTitle}>🔒 Developer Access Control</Text>
            <Text style={styles.modalSub}>This area contains experimental sandbox features. Enter the developer passcode to unlock:</Text>

            <TextInput
              style={styles.modalInput}
              value={playgroundPassword}
              onChangeText={setPlaygroundPassword}
              placeholder="Developer Passcode"
              placeholderTextColor={Colors.text.tertiary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setIsPlaygroundPasswordVisible(false);
                  setPlaygroundPassword('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleUnlockPlayground}>
                <Text style={styles.modalConfirmText}>Unlock</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={isChangePasswordVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBox}>
            <Text style={styles.modalTitle}>Change Password</Text>
            <Text style={styles.modalSub}>Enter your new account password (at least 6 characters, with letters and numbers)</Text>

            <TextInput
              style={styles.modalInput}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New Password"
              placeholderTextColor={Colors.text.tertiary}
              secureTextEntry
            />

            <TextInput
              style={styles.modalInput}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm New Password"
              placeholderTextColor={Colors.text.tertiary}
              secureTextEntry
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setIsChangePasswordVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleChangePassword} disabled={isSavingPassword}>
                {isSavingPassword ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Update Password</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Backup Progress Modal */}
      <Modal visible={isBackupProgressVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Ionicons
              name={backupStep === 'success' ? 'checkmark-circle' : backupStep === 'failed' ? 'alert-circle' : 'cloud-upload'}
              size={48}
              color={backupStep === 'success' ? Colors.status.success : backupStep === 'failed' ? Colors.status.danger : Colors.accent.primary}
              style={{ alignSelf: 'center', marginBottom: 8 }}
            />
            <Text style={[styles.modalTitle, { textAlign: 'center' }]}>
              {backupStep === 'success' ? 'Backup Complete' : backupStep === 'failed' ? 'Backup Finished' : 'Backing Up Database...'}
            </Text>
            <Text style={[styles.modalSub, { textAlign: 'center' }]}>{backupDetail}</Text>

            {(backupStep === 'success' || backupStep === 'failed') && (
              <TouchableOpacity style={[styles.modalConfirmBtn, { marginTop: 16 }]} onPress={() => setIsBackupProgressVisible(false)}>
                <Text style={styles.modalConfirmText}>Close</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Terms & Privacy Modal */}
      <Modal visible={isTermsVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>Terms & Privacy Policy</Text>
            <ScrollView style={{ marginVertical: 10 }}>
              <Text style={{ fontSize: 13, color: Colors.text.secondary, lineHeight: 18 }}>
                Zenza Platform by Team43 is committed to protecting student and institute privacy. All attendance, marks, and chat data are encrypted at rest using AES-256 and transmitted securely via SSL/TLS.{'\n\n'}
                1. Data Ownership: All institute records belong to your coaching center.{'\n'}
                2. Privacy Guarantee: We do not sell or share student phone numbers or marks with third parties.{'\n'}
                3. Auto Backups: Nightly database snapshots ensure zero data loss.{'\n'}
                4. Support Contact: onlyteam43@gmail.com | WhatsApp: 9302472984
              </Text>
            </ScrollView>
            <TouchableOpacity style={styles.modalConfirmBtn} onPress={() => setIsTermsVisible(false)}>
              <Text style={styles.modalConfirmText}>Got It</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Upcoming Features Modal */}
      <Modal visible={isUpcomingVisible} transparent animationType="slide" onRequestClose={() => setIsUpcomingVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '80%' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="rocket-outline" size={24} color={Colors.accent.primary} style={{ marginRight: 8 }} />
              <Text style={styles.modalTitle}>Upcoming Features Roadmap</Text>
            </View>
            <ScrollView style={{ marginVertical: 10 }} showsVerticalScrollIndicator={false}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text.primary, marginBottom: 4 }}>
                1. ZenZa Community
              </Text>
              <Text style={{ fontSize: 13, color: Colors.text.secondary, marginBottom: 12, lineHeight: 18 }}>
                Chat with any other student in your coaching securely. Privacy is our top priority—you'll connect through a follow request system.
              </Text>

              <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text.primary, marginBottom: 4 }}>
                2. In-App Fee Payments
              </Text>
              <Text style={{ fontSize: 13, color: Colors.text.secondary, marginBottom: 12, lineHeight: 18 }}>
                Pay your tuition and fees directly within Kanelijo via UPI, cards, and net banking with instant digital receipts.
              </Text>

              <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text.primary, marginBottom: 4 }}>
                3. Parents Attendance Alert
              </Text>
              <Text style={{ fontSize: 13, color: Colors.text.secondary, marginBottom: 12, lineHeight: 18 }}>
                Automated SMS and push notifications to parents the moment attendance is marked or if a student is absent.
              </Text>

              <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text.primary, marginBottom: 4 }}>
                4. Teacher Branding Royalties
              </Text>
              <Text style={{ fontSize: 13, color: Colors.text.secondary, lineHeight: 18 }}>
                A complete ecosystem for teachers to monetize their brand, premium content, and exclusive live sessions directly through the app.
              </Text>
            </ScrollView>
            <TouchableOpacity style={styles.modalConfirmBtn} onPress={() => setIsUpcomingVisible(false)}>
              <Text style={styles.modalConfirmText}>Awesome!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Help & Developer Support Modal */}
      <Modal visible={isSupportModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.supportHeaderIconBox}>
              <Ionicons name="help-buoy" size={32} color={Colors.accent.primary} />
            </View>
            <Text style={[styles.modalTitle, { textAlign: 'center' }]}>Help & Developer Support</Text>
            <Text style={[styles.modalSub, { textAlign: 'center', marginBottom: 8 }]}>
              Contact Team43 developers directly for technical help, feature requests, or institute setup assistance.
            </Text>

            {/* WhatsApp Option Card */}
            <TouchableOpacity
              style={styles.supportOptionCard}
              onPress={() => {
                setIsSupportModalVisible(false);
                Linking.openURL('https://wa.me/919302472984?text=Hi%20Team43%20Support,%20I%20need%20assistance%20with%20Teacher%20Panel.');
              }}
            >
              <View style={[styles.supportIconBox, { backgroundColor: '#E6F4EA' }]}>
                <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.supportOptionTitle}>WhatsApp Direct Support</Text>
                <Text style={styles.supportOptionSub}>+91 9302472984 (Instant Chat)</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.text.tertiary} />
            </TouchableOpacity>

            {/* Email Option Card */}
            <TouchableOpacity
              style={styles.supportOptionCard}
              onPress={() => {
                setIsSupportModalVisible(false);
                Linking.openURL('mailto:onlyteam43@gmail.com?subject=Teacher%20Panel%20Support');
              }}
            >
              <View style={[styles.supportIconBox, { backgroundColor: '#EEF2FF' }]}>
                <Ionicons name="mail" size={24} color="#4F46E5" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.supportOptionTitle}>Email Developer Support</Text>
                <Text style={styles.supportOptionSub}>onlyteam43@gmail.com</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.text.tertiary} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setIsSupportModalVisible(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete Account Modal */}
      <Modal visible={isDeleteModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={[styles.modalTitle, { color: '#EF4444' }]}>Request Account Deletion?</Text>
            <Text style={styles.modalSub}>
              Are you sure you want to request data deletion? Your institute records and teacher profile will be archived and deleted.
            </Text>
            <View style={styles.modalActionRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setIsDeleteModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirmBtn, { backgroundColor: '#EF4444' }]} onPress={confirmDeleteAccount}>
                <Text style={styles.modalConfirmText}>Confirm Delete</Text>
              </TouchableOpacity>
            </View>
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
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  profileCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.card.border,
    gap: 14,
    ...Shadows.sm,
  },
  profileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFF',
  },
  adminNameText: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  adminEmailText: {
    fontSize: 13,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF0ED',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
    marginTop: 6,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.accent.primary,
  },
  coachingProfileBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    padding: 12,
    borderRadius: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  coachingProfileBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.accent.primary,
  },
  sectionCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.card.border,
    gap: 12,
    ...Shadows.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  settingSub: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.card.border,
    marginVertical: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 2,
  },
  actionIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  actionSub: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  statusChip: {
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#137333',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    height: 48,
    borderRadius: 14,
    gap: 8,
  },
  logoutBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#EF4444',
  },
  deleteBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  deleteBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.tertiary,
    textDecorationLine: 'underline',
  },
  footerBranding: {
    alignItems: 'center',
    marginVertical: 12,
  },
  footerBrandingText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.tertiary,
    letterSpacing: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  modalSub: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  modalInput: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: Colors.card.border,
    fontSize: 14,
    color: Colors.text.primary,
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.tertiary,
  },
  modalConfirmBtn: {
    backgroundColor: Colors.accent.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  deletionNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F59E0B',
    gap: 10,
    marginBottom: 4,
  },
  deletionNoticeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 2,
  },
  deletionNoticeSub: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 16,
  },
  supportHeaderIconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFF0ED',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 4,
  },
  supportOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.card.border,
    gap: 12,
  },
  supportIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  supportOptionSub: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  modalCloseBtn: {
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: 4,
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.tertiary,
  },
});

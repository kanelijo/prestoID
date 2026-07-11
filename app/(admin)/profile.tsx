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
  Image,
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
import { APP_CONFIG } from '@/constants/config';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase, signOutAll } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { backupProcedure } from '@/lib/backupService';

const ACCOUNT_ITEMS: { label: string; icon: keyof typeof Ionicons.glyphMap; action?: string }[] = [
  { label: 'Change Password', icon: 'lock-closed-outline', action: 'change_password' },
  { label: 'Force Data Backup', icon: 'cloud-upload-outline', action: 'force_backup' },
  { label: 'Help & Support', icon: 'help-circle-outline', action: 'help_support' },
  { label: 'Terms & Privacy', icon: 'document-text-outline', action: 'terms_privacy' },
  { label: 'About PrestoID', icon: 'information-circle-outline', action: 'about_prestoid' },
];

export default function AdminProfileScreen() {
  const router = useRouter();
  const { user, session, reset, businessId } = useAuthStore();
  const [adminName, setAdminName] = useState('Coaching Center');
  const [adminEmail, setAdminEmail] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [batches, setBatches] = useState<string[]>([]);
  
  // Dynamic Business details
  const [businessName, setBusinessName] = useState('Business Name');
  const [businessCode, setBusinessCode] = useState('ORG-100');
  const [location, setLocation] = useState('Indore, Madhya Pradesh');

  // Settings switches
  const [autoAbsentAlert, setAutoAbsentAlert] = useState(true);
  const [autoFeeReminder, setAutoFeeReminder] = useState(true);
  const [communityNotifs, setCommunityNotifs] = useState(true);

  // Loading & Edit Modals states
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // Collapsible Accordion states
  const [isBusinessExpanded, setIsBusinessExpanded] = useState(false);
  const [isNotificationsExpanded, setIsNotificationsExpanded] = useState(false);
  const [isAccountExpanded, setIsAccountExpanded] = useState(false);
  
  const [isUpcomingVisible, setIsUpcomingVisible] = useState(false);
  
  // Backup progress states
  const [isBackupProgressVisible, setIsBackupProgressVisible] = useState(false);
  const [backupStep, setBackupStep] = useState<'authorizing' | 'preparing' | 'compressing' | 'encrypting' | 'uploading' | 'cleaning' | 'success' | 'failed' | null>(null);
  const [backupDetail, setBackupDetail] = useState('');
  
  // Edit Profile Modal
  const [isEditProfileVisible, setIsEditProfileVisible] = useState(false);
  const [editName, setEditName] = useState('');
  
  // Add Batch Modal
  const [isAddBatchVisible, setIsAddBatchVisible] = useState(false);
  const [newBatchName, setNewBatchName] = useState('');

  // Change Password Modal
  const [isChangePasswordVisible, setIsChangePasswordVisible] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all password fields.');
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

  const loadAdminProfile = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      // 1. Fetch Business Details
      const { data: inst, error: instError } = await supabase
        .from('businesses')
        .select('*')
        .eq('admin_id', user.id)
        .maybeSingle();

      let profileAvatar = null;
      // Fetch profile to get custom avatar_url
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (profile) {
        profileAvatar = profile.avatar_url;
        // Sync custom avatarUrl in store
        useAuthStore.getState().setAvatarUrl(profile.avatar_url || null);
      }

      if (!instError && inst) {
        setAdminName(inst.business_name);
        setBusinessName(inst.business_name);
        setBusinessCode(inst.organization_id);
        setLocation('Indore, Madhya Pradesh');
      } else if (profile) {
        // Fallback to profile table if no institute exists yet
        setAdminName(profile.name || 'Admin User');
        setBusinessName(profile.name || 'Admin User');
      }

      setPhotoUrl(profileAvatar || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null);
      setAdminEmail(user.email || '');

      // 2. Fetch Batches list from database
      const { data: batchList, error: batchError } = await supabase
        .from('batches')
        .select('name')
        .eq('business_id', inst?.id || businessId)
        .order('name');

      if (!batchError && batchList) {
        setBatches(batchList.map((b) => b.name));
      } else {
        setBatches(['MPPSC', 'SSC', 'VYAPAM', 'Railway', 'Banking', 'UPSC']);
      }
    } catch (err) {
      console.warn('Failed to load admin profile:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAdminProfile();
  }, [user]);

  const handleCopyInviteCode = () => {
    Alert.alert('Copied!', `Organization ID "${businessCode}" copied to clipboard.`);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Error', 'Name cannot be empty.');
      return;
    }
    setIsLoading(true);
    try {
      // 1. Update DB Businesses Table
      const { error: instError } = await supabase
        .from('businesses')
        .update({ business_name: editName.trim() })
        .eq('admin_id', user.id);

      if (instError) throw instError;

      // 2. Update DB Profiles Table
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ name: editName.trim() })
        .eq('id', user.id);

      if (dbError) throw dbError;

      // 3. Update Auth user metadata
      const { error: authError } = await supabase.auth.updateUser({
        data: { name: editName.trim() },
      });

      if (authError) throw authError;

      setAdminName(editName.trim());
      setBusinessName(editName.trim());
      setIsEditProfileVisible(false);
      Alert.alert('Success', 'Business name updated successfully.');
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'Failed to save changes.');
    } finally {
      setIsLoading(false);
    }
  };

  const uploadPhoto = async (uri: string) => {
    if (!user) return;
    setIsUploading(true);
    try {
      const fileExt = uri.split('.').pop() || 'jpg';
      const fileName = `admin-${user.id}-${Math.floor(Date.now() / 1000)}.${fileExt}`;
      const filePath = `${fileName}`;

      const token = session?.access_token || APP_CONFIG.supabaseAnonKey;
      const uploadResult = await FileSystem.uploadAsync(
        `${APP_CONFIG.supabaseUrl}/storage/v1/object/avatars/${filePath}`,
        uri,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: APP_CONFIG.supabaseAnonKey,
            'Content-Type': `image/${fileExt === 'png' ? 'png' : 'jpeg'}`,
          },
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        }
      );

      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(`Upload failed with status ${uploadResult.status}: ${uploadResult.body}`);
      }

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Update Auth Metadata for admin user avatar
      const { data: updateData, error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl },
      });

      if (updateError) throw updateError;

      // Update Profiles table for public queries
      await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      useAuthStore.getState().setAvatarUrl(publicUrl);

      if (updateData?.user) {
        useAuthStore.getState().setUser(updateData.user);
      }

      // Update local cache
      try {
        const cachedProfileStr = await AsyncStorage.getItem('@user_profile');
        if (cachedProfileStr) {
          const cachedProfile = JSON.parse(cachedProfileStr);
          cachedProfile.avatarUrl = publicUrl;
          await AsyncStorage.setItem('@user_profile', JSON.stringify(cachedProfile));
        }
      } catch (cacheErr) {
        console.warn('Failed to update profile cache with new avatar:', cacheErr);
      }

      setPhotoUrl(publicUrl);
      Alert.alert('Success', 'Profile picture updated successfully.');
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Failed to upload photo.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleChangePhoto = async () => {
    Alert.alert('Change Profile Picture', 'Select source', [
      {
        text: 'Camera',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission Denied', 'Camera permissions are required.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.6,
          });
          if (!result.canceled && result.assets[0]) {
            uploadPhoto(result.assets[0].uri);
          }
        },
      },
      {
        text: 'Gallery',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission Denied', 'Gallery permissions are required.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.6,
          });
          if (!result.canceled && result.assets[0]) {
            uploadPhoto(result.assets[0].uri);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleAddBatch = async () => {
    if (!newBatchName.trim()) {
      Alert.alert('Error', 'Batch name cannot be empty.');
      return;
    }
    setIsLoading(true);
    try {
      let targetBusinessId = businessId;
      if (!targetBusinessId && user) {
        const { data: inst } = await supabase
          .from('businesses')
          .select('id')
          .eq('admin_id', user.id)
          .maybeSingle();
        if (inst) {
          targetBusinessId = inst.id;
        }
      }

      if (!targetBusinessId) {
        throw new Error('Business details not found. Please reload profile.');
      }

      const { error } = await supabase
        .from('batches')
        .insert({ 
          name: newBatchName.trim().toUpperCase(),
          business_id: targetBusinessId
        });

      if (error) {
        if (error.code === '23505') {
          Alert.alert('Duplicate Batch', 'This batch name already exists.');
        } else {
          throw error;
        }
      } else {
        setBatches([...batches, newBatchName.trim().toUpperCase()].sort());
        setNewBatchName('');
        setIsAddBatchVisible(false);
        Alert.alert('Success', `Batch "${newBatchName.trim().toUpperCase()}" created.`);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add batch.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out of PrestoID?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          setIsLoading(true);
          try {
            await signOutAll();
            router.replace('/(auth)/login');
          } catch (err) {
            Alert.alert('Error', 'Failed to log out.');
          } finally {
            setIsLoading(false);
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'To delete your account, please contact the admin at support@prestoid.com.',
      [{ text: 'OK' }]
    );
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading && batches.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]} edges={['top']}>
        <ActivityIndicator size="large" color={Colors.accent.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Header Card */}
        <View style={styles.profileCard}>
          <TouchableOpacity onPress={handleChangePhoto} activeOpacity={0.8} disabled={isUploading}>
            {isUploading ? (
              <View style={[styles.avatarLarge, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator color="#FFFFFF" />
              </View>
            ) : photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatarLargeImage} />
            ) : (
              <View style={styles.avatarLarge}>
                <Text style={styles.avatarLargeText}>{getInitials(adminName)}</Text>
              </View>
            )}
          </TouchableOpacity>
          
          <Text style={styles.profileName}>{adminName}</Text>
          <Text style={styles.profileEmail}>{adminEmail}</Text>
          
          <TouchableOpacity
            style={styles.editProfileButton}
            onPress={() => {
              setEditName(adminName);
              setIsEditProfileVisible(true);
            }}
          >
            <Ionicons name="create-outline" size={16} color={Colors.accent.primary} style={{ marginRight: 6 }} />
            <Text style={styles.editProfileText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Study Material / NoteBank Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Study Material & Notes</Text>
          <TouchableOpacity
            style={styles.notebankCard}
            activeOpacity={0.8}
            onPress={() => router.push('/(admin)/notebank')}
          >
            <View style={styles.notebankCardContent}>
              <View style={styles.notebankIconContainer}>
                <Ionicons name="folder-open" size={22} color="#FFF" />
              </View>
              <View style={{ flex: 1, paddingLeft: 12 }}>
                <Text style={styles.notebankTitle}>NoteBank</Text>
                <Text style={styles.notebankSubtitle}>Upload and manage Syllabus, Notes, E-books, Docs</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.text.tertiary} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Collapsible Business Details Section */}
        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.accordionHeader} 
            activeOpacity={0.7}
            onPress={() => setIsBusinessExpanded(!isBusinessExpanded)}
          >
            <View style={styles.accordionHeaderLeft}>
              <Ionicons name="business" size={20} color={Colors.accent.primary} />
              <Text style={styles.accordionTitle}>Business Details</Text>
            </View>
            <Ionicons 
              name={isBusinessExpanded ? "chevron-up" : "chevron-down"} 
              size={18} 
              color={Colors.text.secondary} 
            />
          </TouchableOpacity>

          {isBusinessExpanded && (
            <View style={styles.card}>
              <View style={styles.infoRow}>
                <Ionicons name="business-outline" size={18} color={Colors.text.tertiary} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Organization Name</Text>
                  <Text style={styles.infoValue}>{businessName}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Ionicons name="key-outline" size={18} color={Colors.text.tertiary} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Organization ID</Text>
                  <View style={styles.inviteCodeRow}>
                    <Text style={styles.inviteCodeValue}>{businessCode}</Text>
                    <TouchableOpacity onPress={handleCopyInviteCode} style={styles.copyIcon}>
                      <Ionicons name="copy-outline" size={16} color={Colors.accent.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Ionicons name="location-outline" size={18} color={Colors.text.tertiary} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Location</Text>
                  <Text style={styles.infoValue}>{location}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Ionicons name="layers-outline" size={18} color={Colors.text.tertiary} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Batches</Text>
                  <View style={[styles.batchGrid, { marginTop: 8 }]}>
                    {batches.map((batch) => (
                      <View key={batch} style={styles.batchChip}>
                        <Text style={styles.batchChipText}>{batch}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Collapsible Notification Settings */}
        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.accordionHeader} 
            activeOpacity={0.7}
            onPress={() => setIsNotificationsExpanded(!isNotificationsExpanded)}
          >
            <View style={styles.accordionHeaderLeft}>
              <Ionicons name="notifications" size={20} color={Colors.accent.primary} />
              <Text style={styles.accordionTitle}>Notification Settings</Text>
            </View>
            <Ionicons 
              name={isNotificationsExpanded ? "chevron-up" : "chevron-down"} 
              size={18} 
              color={Colors.text.secondary} 
            />
          </TouchableOpacity>

          {isNotificationsExpanded && (
            <View style={styles.card}>
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Auto Absent Alert</Text>
                  <Text style={styles.settingDesc}>Send WhatsApp to parents at 8 PM daily</Text>
                </View>
                <Switch
                  value={autoAbsentAlert}
                  onValueChange={setAutoAbsentAlert}
                  trackColor={{ false: Colors.bg.tertiary, true: Colors.accent.primary + '30' }}
                  thumbColor={autoAbsentAlert ? Colors.accent.primary : Colors.text.tertiary}
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Auto Fee Reminder</Text>
                  <Text style={styles.settingDesc}>WhatsApp on 15th & last day of month</Text>
                </View>
                <Switch
                  value={autoFeeReminder}
                  onValueChange={setAutoFeeReminder}
                  trackColor={{ false: Colors.bg.tertiary, true: Colors.accent.primary + '30' }}
                  thumbColor={autoFeeReminder ? Colors.accent.primary : Colors.text.tertiary}
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Community Notifications</Text>
                  <Text style={styles.settingDesc}>Get notified about community activity</Text>
                </View>
                <Switch
                  value={communityNotifs}
                  onValueChange={setCommunityNotifs}
                  trackColor={{ false: Colors.bg.tertiary, true: Colors.accent.primary + '30' }}
                  thumbColor={communityNotifs ? Colors.accent.primary : Colors.text.tertiary}
                />
              </View>
            </View>
          )}
        </View>

        {/* Collapsible Account Section */}
        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.accordionHeader} 
            activeOpacity={0.7}
            onPress={() => setIsAccountExpanded(!isAccountExpanded)}
          >
            <View style={styles.accordionHeaderLeft}>
              <Ionicons name="person" size={20} color={Colors.accent.primary} />
              <Text style={styles.accordionTitle}>Account</Text>
            </View>
            <Ionicons 
              name={isAccountExpanded ? "chevron-up" : "chevron-down"} 
              size={18} 
              color={Colors.text.secondary} 
            />
          </TouchableOpacity>

          {isAccountExpanded && (
            <View style={styles.card}>
              {ACCOUNT_ITEMS.map((item, index) => (
                <View key={item.label}>
                  {index > 0 && <View style={styles.divider} />}
                  <TouchableOpacity
                    style={styles.menuRow}
                    onPress={() => {
                      if (item.action === 'change_password') {
                        setIsChangePasswordVisible(true);
                      } else if (item.action === 'force_backup') {
                        if (!user?.id) {
                           Alert.alert('Error', 'User ID not found');
                           return;
                        }
                        setIsBackupProgressVisible(true);
                        setBackupStep('authorizing');
                        setBackupDetail('Connecting to Google Drive...');
                        
                        setTimeout(async () => {
                           try {
                             await backupProcedure(user.id, (step, detail) => {
                               setBackupStep(step);
                               if (detail) {
                                 setBackupDetail(detail);
                               }
                             });
                           } catch (err: any) {
                             setBackupStep('failed');
                             setBackupDetail(err.message || 'Backup failed.');
                           }
                        }, 100);
                      } else if (item.action === 'help_support') {
                        Alert.alert(
                          'Help & Support',
                          'For any queries, verification issues, or custom requests, please email our team at support@prestoid.com. We are active 24/7.',
                          [
                            { text: 'Email Support', onPress: () => Linking.openURL('mailto:support@prestoid.com').catch(() => {}) },
                            { text: 'Close', style: 'cancel' }
                          ]
                        );
                      } else if (item.action === 'terms_privacy') {
                        Alert.alert(
                          'Terms & Privacy Policy',
                          'PrestoID securely manages student roster check-ins and fee receipts. All data, including Aadhaar inputs and attendance logs, is fully encrypted and never shared with third parties.',
                          [{ text: 'OK', style: 'cancel' }]
                        );
                      } else if (item.action === 'about_prestoid') {
                        Alert.alert(
                          'About PrestoID',
                          'PrestoID v1.0.0\n\nSmart student attendance tracking, offline-first barcode scanning, automated push alerts, and fee receipt management.\n\nDeveloped with ❤️ by Kanelijo.',
                          [{ text: 'OK', style: 'cancel' }]
                        );
                      }
                    }}
                  >
                    <Ionicons name={item.icon} size={20} color={Colors.text.secondary} style={{ marginRight: 12 }} />
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    <Ionicons name="chevron-forward" size={18} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Lab Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Experimental</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.menuRow} onPress={() => router.push('/(admin)/lab')}>
              <Ionicons name="beaker-outline" size={20} color={Colors.text.secondary} style={{ marginRight: 12 }} />
              <Text style={styles.menuLabel}>UI Design Lab</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.text.tertiary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuRow} onPress={() => setIsUpcomingVisible(true)}>
              <Ionicons name="rocket-outline" size={20} color={Colors.text.secondary} style={{ marginRight: 12 }} />
              <Text style={styles.menuLabel}>Upcoming Features</Text>
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

        <Text style={styles.versionText}>PrestoID v1.0.0 • by Kanelijo</Text>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal
        visible={isEditProfileVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsEditProfileVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Profile Name</Text>
            <TextInput
              style={styles.modalInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Enter your name"
              placeholderTextColor={Colors.text.tertiary}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setIsEditProfileVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveProfile}>
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>



      {/* Change Password Modal */}
      <Modal
        visible={isChangePasswordVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsChangePasswordVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
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
          </View>
        </View>
      </Modal>

      {/* Upcoming Features Modal */}
      <Modal visible={isUpcomingVisible} animationType="slide" transparent={true} onRequestClose={() => setIsUpcomingVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 450, width: '90%' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
              <Ionicons name="rocket" size={24} color={Colors.accent.primary} style={{ marginRight: 8 }} />
              <Text style={styles.modalTitle}>Upcoming Features</Text>
            </View>
            <ScrollView style={{ maxHeight: 350, marginBottom: 15 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.documentHeader}>1. ZenZa Community</Text>
              <Text style={styles.documentBody}>
                Chat with any other student in your coaching securely. Privacy is our top priority—you'll connect through a follow request system.
              </Text>

              <Text style={styles.documentHeader}>2. In-App Fee Payments</Text>
              <Text style={styles.documentBody}>
                Pay your tuition and fees directly within Kanelijo via UPI, cards, and net banking with instant digital receipts.
              </Text>

              <Text style={styles.documentHeader}>3. Parents Attendance Alert</Text>
              <Text style={styles.documentBody}>
                Automated SMS and push notifications to parents the moment attendance is marked or if a student is absent.
              </Text>

              <Text style={styles.documentHeader}>4. Teacher Branding Royalties</Text>
              <Text style={styles.documentBody}>
                A complete ecosystem for teachers to monetize their brand, premium content, and exclusive live sessions directly through the app.
              </Text>
            </ScrollView>
            <TouchableOpacity style={styles.modalSaveBtn} onPress={() => setIsUpcomingVisible(false)}>
              <Text style={styles.modalSaveText}>Awesome!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Backup Progress Modal */}
      <Modal visible={isBackupProgressVisible} transparent animationType="fade" onRequestClose={() => {
        if (backupStep === 'success' || backupStep === 'failed') {
          setIsBackupProgressVisible(false);
        }
      }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: Colors.bg.primary, borderRadius: 20, padding: 24, width: '100%', maxWidth: 340, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5, borderWidth: 1, borderColor: Colors.card.border }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.text.primary, marginBottom: 8, textAlign: 'center' }}>Google Drive Backup</Text>
            <Text style={{ fontSize: 13, color: Colors.text.tertiary, textAlign: 'center', marginBottom: 24 }}>{backupDetail}</Text>

            {/* Steps List */}
            <View style={{ gap: 14, marginBottom: 24 }}>
              {[
                { key: 'authorizing', label: 'Google Account Authorization' },
                { key: 'preparing', label: 'Database Snapshot' },
                { key: 'compressing', label: 'ZIP Compression' },
                { key: 'encrypting', label: 'AES-256 Encryption' },
                { key: 'uploading', label: 'Upload Payload to Drive' },
                { key: 'cleaning', label: 'Workspace Cleanup' },
              ].map((stepItem, idx, arr) => {
                const stepKeys = arr.map(x => x.key);
                const currentIdx = stepKeys.indexOf(backupStep || 'authorizing');
                const selfIdx = idx;

                let iconName: any = 'ellipse-outline';
                let iconColor = Colors.text.tertiary;
                let isCurrent = false;

                if (backupStep === 'success') {
                  iconName = 'checkmark-circle';
                  iconColor = Colors.status.success;
                } else if (backupStep === 'failed') {
                  if (selfIdx < currentIdx) {
                    iconName = 'checkmark-circle';
                    iconColor = Colors.status.success;
                  } else if (selfIdx === currentIdx) {
                    iconName = 'close-circle';
                    iconColor = Colors.status.danger;
                  } else {
                    iconName = 'ellipse-outline';
                    iconColor = Colors.text.tertiary;
                  }
                } else {
                  if (selfIdx < currentIdx) {
                    iconName = 'checkmark-circle';
                    iconColor = Colors.status.success;
                  } else if (selfIdx === currentIdx) {
                    isCurrent = true;
                  } else {
                    iconName = 'ellipse-outline';
                    iconColor = Colors.text.tertiary;
                  }
                }

                return (
                  <View key={stepItem.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {isCurrent ? (
                      <ActivityIndicator size="small" color={Colors.accent.primary} style={{ width: 20, height: 20 }} />
                    ) : (
                      <Ionicons name={iconName} size={20} color={iconColor} />
                    )}
                    <Text style={{ fontSize: 13, fontWeight: isCurrent ? '700' : '500', color: isCurrent ? Colors.accent.primary : (selfIdx < currentIdx || backupStep === 'success' ? Colors.text.primary : Colors.text.secondary) }}>
                      {stepItem.label}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Bottom Button */}
            {(backupStep === 'success' || backupStep === 'failed') && (
              <TouchableOpacity
                style={{ backgroundColor: backupStep === 'success' ? Colors.status.success : Colors.status.danger, paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
                onPress={() => setIsBackupProgressVisible(false)}
              >
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                  {backupStep === 'success' ? 'Finished' : 'Close'}
                </Text>
              </TouchableOpacity>
            )}
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

  // Profile Header
  profileCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.card.border,
    marginBottom: 24,
    ...Shadows.sm,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  avatarLargeImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: Colors.accent.primary,
    marginBottom: 14,
  },
  avatarLargeText: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text.inverse,
  },
  profileName: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: Colors.text.tertiary,
    fontWeight: '500',
    marginBottom: 16,
  },
  editProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.accent.primary,
  },
  editProfileText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.accent.primary,
  },

  // Section
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

  // Card
  card: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },

  // Info Rows (Business Details)
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 4,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.tertiary,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  inviteCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inviteCodeValue: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.accent.primary,
    letterSpacing: 1,
  },
  copyIcon: {
    padding: 4,
  },

  // Divider
  divider: {
    height: 0.5,
    backgroundColor: Colors.card.border,
    marginVertical: 12,
  },

  // Batches
  batchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  batchChip: {
    backgroundColor: Colors.bg.tertiary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: Colors.card.border,
  },
  batchChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  addBatchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.accent.primary + '30',
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  addBatchText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.accent.primary,
  },

  // Toggle Settings
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  settingDesc: {
    fontSize: 12,
    color: Colors.text.tertiary,
    marginTop: 2,
    fontWeight: '500',
  },

  // Account Menu
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text.primary,
  },

  // Danger Zone
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg.secondary,
    padding: 15,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.status.danger + '30',
    marginBottom: 12,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.status.danger,
  },
  deleteButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  deleteText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.status.danger,
  },

  // Version
  versionText: {
    textAlign: 'center',
    color: Colors.text.tertiary,
    fontSize: 11,
    marginBottom: 20,
    fontWeight: '500',
  },

  // Accordion Styles
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bg.secondary,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.card.border,
    marginBottom: 12,
    ...Shadows.sm,
  },
  accordionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accordionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '90%',
    maxWidth: 320,
    backgroundColor: Colors.bg.secondary,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.card.border,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
    marginBottom: 16,
  },
  modalInput: {
    width: '100%',
    height: 48,
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.card.border,
    paddingHorizontal: 16,
    fontSize: 15,
    color: Colors.text.primary,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.bg.tertiary,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  modalSaveBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.accent.primary,
  },
  modalSaveText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  documentHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 10,
    marginBottom: 4,
  },
  documentBody: {
    fontSize: 14,
    color: Colors.text.secondary,
    lineHeight: 20,
    marginBottom: 10,
  },
  notebankCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.card.border,
    padding: 16,
    ...Shadows.sm,
  },
  notebankCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notebankIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.glow,
  },
  notebankTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  notebankSubtitle: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 2,
    fontWeight: '500',
  },
});

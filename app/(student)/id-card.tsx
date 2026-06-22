import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Dimensions, 
  Modal, 
  Image, 
  Animated, 
  Alert, 
  ActivityIndicator, 
  TextInput, 
  KeyboardAvoidingView, 
  Platform 
} from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import VirtualIDCard from '@/components/VirtualIDCard';
import QRCode from 'react-native-qrcode-svg';
import { Colors, Shadows, Gradients } from '@/constants/colors';
import { APP_CONFIG } from '@/constants/config';
import { useAuthStore } from '@/stores/useAuthStore';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { supabase, signOutAll } from '@/lib/supabase';
import { useRouter, useFocusEffect } from 'expo-router';
import { registerForPushNotificationsAsync } from '@/lib/notifications';

const { width } = Dimensions.get('window');

export default function StudentStudentIDCardScreen() {
  const router = useRouter();
  const [showFullQR, setShowFullQR] = useState(false);
  const [studentData, setStudentData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);
  const { user, session, businessName } = useAuthStore();
  const { studentCommunityUnreadCount } = useNotificationStore();
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        useNotificationStore.getState().fetchStudentUnreadCounts(user.id);
      }
    }, [user])
  );

  // Claim Profile Form States
  const [claimVerificationMode, setClaimVerificationMode] = useState<'aadhaar' | 'secret_code'>('secret_code');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [claimVerificationInput, setClaimVerificationInput] = useState('');
  const [hasShownCongrats, setHasShownCongrats] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  // Profile Edit Form States
  const [editName, setEditName] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editFatherName, setEditFatherName] = useState('');
  const [editParentPhone, setEditParentPhone] = useState('');
  const [editBloodGroup, setEditBloodGroup] = useState('');
  const [editAadhaar, setEditAadhaar] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Pulsing animation for the live indicator dot
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  const fetchStudent = async () => {
    if (!user) return;
    try {
      let { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      // Fallback: If no student record exists with this user_id, check if there's one with this email
      if (!data && user.email) {
        const { data: emailData, error: emailError } = await supabase
          .from('students')
          .select('*')
          .eq('email', user.email)
          .maybeSingle();

        if (!emailError && emailData) {
          // Link the student record to the current auth user ID
          const { data: linkedData, error: linkError } = await supabase
            .from('students')
            .update({ user_id: user.id })
            .eq('id', emailData.id)
            .select()
            .single();

          if (!linkError && linkedData) {
            data = linkedData;
          }
        }
      }

      setStudentData(data);
    } catch (err: any) {
      console.warn('Failed to fetch student:', err);
    }
  };

  useEffect(() => {
    const initFetch = async () => {
      setIsLoading(true);
      await fetchStudent();
      if (user) {
        registerForPushNotificationsAsync(user.id);
      }
      setIsLoading(false);
    };
    initFetch();

    if (!user) return;

    // Realtime subscription for students table
    const channel = supabase
      .channel('student_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'students',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Realtime student changes received:', payload);
          setStudentData(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Congratulation popup and forceful profile completion trigger
  useEffect(() => {
    if (studentData) {
      const isComplete = !!(
        studentData.photo_url &&
        !studentData.photo_url.includes('placeholder') &&
        studentData.dob &&
        studentData.dob.trim() !== '' &&
        studentData.address &&
        studentData.address.trim() !== ''
      );
      if (!isComplete) {
        if (!hasShownCongrats) {
          setHasShownCongrats(true);
          Alert.alert(
            'Congratulations! 🎉',
            'Your student profile has been claimed successfully!\n\nTo activate your Virtual ID Card, please complete your profile by providing your photo, date of birth, and home address.',
            [
              {
                text: 'Complete Profile Now',
                onPress: () => setIsProfileModalVisible(true),
              },
            ],
            { cancelable: false }
          );
        } else {
          setIsProfileModalVisible(true);
        }
      }
    }
  }, [studentData]);

  // Load state when Modal opens
  useEffect(() => {
    if (isProfileModalVisible && studentData) {
      setEditName(studentData.name || '');
      setEditDob(studentData.dob || '');
      setEditPhone(studentData.phone || '');
      setEditWhatsapp(studentData.whatsapp || '');
      setEditAddress(studentData.address || '');
      setEditFatherName(studentData.father_name || '');
      setEditParentPhone(studentData.parent_phone || '');
      setEditBloodGroup(studentData.blood_group || '');
      setEditAadhaar(studentData.aadhaar_number || '');
    }
  }, [isProfileModalVisible, studentData]);

  // Fallback if no student data exists yet
  const activeStudent = studentData || {
    name: 'Student User',
    father_name: '',
    batch_name: 'Other',
    course: 'General',
    enrollment_id: 'UCI-PENDING',
    phone: '',
    id: user?.id,
    fee_amount: 2500,
    fee_status: 'unpaid',
    next_due_date: 'N/A',
    admission_date: 'N/A',
    photo_url: '',
    valid_from: '01/26',
    valid_till: '01/27',
    dob: '',
    address: '',
    whatsapp: '',
    blood_group: '',
    duration: '1 Year',
    batch_timing: '10:00 AM - 01:00 PM'
  };

  const calculateCompletion = (student: any) => {
    if (!student) return 0;
    let score = 0;
    if (student.name && student.name.trim() !== '' && student.name !== 'Student User') score += 10;
    if (student.dob && student.dob.trim() !== '') score += 10;
    if (student.phone && student.phone.trim() !== '') score += 10;
    if (student.whatsapp && student.whatsapp.trim() !== '') score += 10;
    if (student.address && student.address.trim() !== '') score += 10;
    if (student.father_name && student.father_name.trim() !== '') score += 10;
    if (student.parent_phone && student.parent_phone.trim() !== '') score += 10;
    if (student.blood_group && student.blood_group.trim() !== '') score += 10;
    
    // Photo score (20%)
    if (student.photo_url && student.photo_url.trim() !== '' && !student.photo_url.includes('placeholder') && !student.photo_url.includes('unsplash.com')) {
      score += 20;
    }
    return score;
  };

  const completionPercentage = calculateCompletion(activeStudent);

  const isProfileComplete = !!(
    activeStudent.photo_url &&
    !activeStudent.photo_url.includes('placeholder') &&
    activeStudent.dob &&
    activeStudent.dob.trim() !== '' &&
    activeStudent.address &&
    activeStudent.address.trim() !== ''
  );

  const cardData = {
    studentName: activeStudent.name,
    fatherName: activeStudent.father_name || 'Not Set',
    batch: activeStudent.batch_name,
    course: activeStudent.course || 'General',
    enrollmentId: activeStudent.enrollment_id,
    phone: activeStudent.phone || 'Not Set',
    coachingName: businessName || 'PrestoID Coaching',
    qrValue: `KF-${activeStudent.id}-${activeStudent.enrollment_id}`,
    feeAmount: Number(activeStudent.fee_amount || 0),
    feeStatus: (activeStudent.fee_status || 'unpaid') as 'paid' | 'unpaid' | 'overdue',
    nextDueDate: activeStudent.next_due_date || 'N/A',
    admissionDate: activeStudent.admission_date || 'N/A',
    photoUrl: activeStudent.photo_url || '',
    validFrom: activeStudent.valid_from || '01/26',
    validTill: activeStudent.valid_till || '01/27',
    dob: activeStudent.dob || 'Not Set',
    address: activeStudent.address || 'Not Set',
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

  const uploadPhoto = async (uri: string) => {
    if (!user) return;
    setIsUploadingPhoto(true);
    try {
      const fileExt = uri.split('.').pop() || 'jpg';
      const fileName = `student-${user.id}-${Math.floor(Date.now() / 1000)}.${fileExt}`;
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

      if (!studentData) {
        Alert.alert('Error', 'No claimed student profile to update.');
        setIsUploadingPhoto(false);
        return;
      }

      const { error: updateError } = await supabase
        .from('students')
        .update({ photo_url: publicUrl })
        .eq('id', studentData.id);

      if (updateError) throw updateError;

      await fetchStudent();
      Alert.alert('Success', 'Profile picture uploaded successfully.');
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Failed to upload photo.');
    } finally {
      setIsUploadingPhoto(false);
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
        }
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
        }
      },
      { text: 'Cancel', style: 'cancel' }
    ]);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim() || !editPhone.trim() || !editParentPhone.trim() || !editAadhaar.trim() || !editDob.trim() || !editAddress.trim()) {
      Alert.alert('Error', 'Name, Date of Birth, Phone, Parent Phone, Aadhaar, and Address are required.');
      return;
    }
    if (!studentData?.photo_url || studentData.photo_url.includes('placeholder')) {
      Alert.alert('Photo Required', 'Please upload or capture your profile photo before saving.');
      return;
    }
    if (editPhone.trim().length !== 10 || isNaN(Number(editPhone)) || editParentPhone.trim().length !== 10 || isNaN(Number(editParentPhone))) {
      Alert.alert('Invalid Phone', 'Phone numbers must be exactly 10 digits.');
      return;
    }
    if (editAadhaar.trim().length !== 12 || isNaN(Number(editAadhaar.trim()))) {
      Alert.alert('Invalid Aadhaar', 'Aadhaar number must be exactly 12 digits.');
      return;
    }

    setIsSavingProfile(true);
    try {
      // 1. Update profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ name: editName.trim() })
        .eq('id', user.id);

      if (profileError) throw profileError;

      if (!studentData) {
        Alert.alert('Error', 'No claimed student profile to update.');
        setIsSavingProfile(false);
        return;
      }

      // 2. Update students table
      const { error: studentError } = await supabase
        .from('students')
        .update({
          name: editName.trim(),
          dob: editDob.trim(),
          phone: editPhone.trim(),
          whatsapp: editWhatsapp.trim(),
          address: editAddress.trim(),
          father_name: editFatherName.trim(),
          parent_phone: editParentPhone.trim(),
          blood_group: editBloodGroup.trim().toUpperCase(),
          aadhaar_number: editAadhaar.trim() || null,
        })
        .eq('id', studentData.id);

      if (studentError) throw studentError;

      await fetchStudent();
      Alert.alert('Success', 'Profile details updated successfully.');
      setIsProfileModalVisible(false);
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'Failed to save profile changes.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleClaimProfile = async () => {
    if (claimVerificationMode === 'secret_code') {
      if (!inviteCodeInput.trim()) {
        Alert.alert('Required', 'Please enter the organization invite code.');
        return;
      }
      if (!claimVerificationInput.trim()) {
        Alert.alert('Required', 'Please enter your secret passcode.');
        return;
      }
    } else {
      if (!claimVerificationInput.trim()) {
        Alert.alert('Required', 'Please enter your Aadhaar number.');
        return;
      }
      if (claimVerificationInput.trim().length !== 12) {
        Alert.alert('Required', 'Aadhaar number must be exactly 12 digits.');
        return;
      }
    }

    setIsClaiming(true);
    try {
      let matchedStudentId = null;

      if (claimVerificationMode === 'secret_code') {
        // 1. Fetch business first using organization_id
        const { data: business, error: instError } = await supabase
          .from('businesses')
          .select('id')
          .eq('organization_id', inviteCodeInput.trim().toUpperCase())
          .maybeSingle();

        if (instError || !business) {
          throw new Error('Invalid organization invite code. Please verify and try again.');
        }

        // 2. Query student record using secret_code and business_id
        const { data: student, error: searchError } = await supabase
          .from('students')
          .select('id, user_id')
          .eq('secret_code', claimVerificationInput.trim().toUpperCase())
          .eq('business_id', business.id)
          .is('user_id', null)
          .maybeSingle();

        if (searchError || !student) {
          throw new Error('Invalid secret passcode or profile not found for this organization.');
        }

        matchedStudentId = student.id;
      } else {
        // Aadhaar verification
        const { data: student, error: searchError } = await supabase
          .from('students')
          .select('id, user_id')
          .eq('aadhaar_number', claimVerificationInput.trim())
          .is('user_id', null)
          .maybeSingle();

        if (searchError || !student) {
          throw new Error('Invalid Aadhaar number or profile not found.');
        }

        matchedStudentId = student.id;
      }

      // 3. Link student profile by setting user_id
      const { data: updatedRecord, error: linkError } = await supabase
        .from('students')
        .update({ user_id: user?.id })
        .eq('id', matchedStudentId)
        .select()
        .maybeSingle();

      if (linkError) throw linkError;
      if (!updatedRecord) {
        throw new Error('Claim update failed. The record might have already been claimed or RLS permission was denied.');
      }

      // 4. Update the name in profiles table if it is currently 'Student User'
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', user.id)
          .single();
        if (profile && (profile.name === 'Student User' || !profile.name)) {
          await supabase
            .from('profiles')
            .update({ name: updatedRecord.name })
            .eq('id', user.id);
        }
      }

      Alert.alert('Profile Linked!', `Successfully linked to student profile: ${updatedRecord.name}`);
      setInviteCodeInput('');
      setClaimVerificationInput('');
      await fetchStudent(); // re-fetch to update state
    } catch (err: any) {
      Alert.alert('Claim Failed', err.message || 'Failed to claim profile. Try again.');
    } finally {
      setIsClaiming(false);
    }
  };

  const getRealtimeCompletion = () => {
    const items = [
      { key: 'name', label: 'Name', complete: !!editName.trim() && editName.trim() !== 'Student User' },
      { key: 'dob', label: 'DOB', complete: !!editDob.trim() },
      { key: 'phone', label: 'Phone', complete: !!editPhone.trim() && editPhone.trim().length === 10 },
      { key: 'whatsapp', label: 'WhatsApp', complete: !!editWhatsapp.trim() && editWhatsapp.trim().length === 10 },
      { key: 'father', label: 'Father', complete: !!editFatherName.trim() },
      { key: 'parentPhone', label: 'Parent Phone', complete: !!editParentPhone.trim() && editParentPhone.trim().length === 10 },
      { key: 'blood', label: 'Blood Group', complete: !!editBloodGroup.trim() },
      { key: 'address', label: 'Address', complete: !!editAddress.trim() },
      { key: 'aadhaar', label: 'Aadhaar', complete: !!editAadhaar.trim() && editAadhaar.trim().length === 12 },
      { key: 'photo', label: 'Photo', complete: !!studentData?.photo_url && !studentData.photo_url.includes('placeholder') },
    ];

    const pctPerItem = 10;
    const completedCount = items.filter(i => i.complete).length;
    const pct = completedCount * pctPerItem;

    return { pct, items };
  };

  const { pct: realtimePct, items: realtimeItems } = getRealtimeCompletion();



  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.accent.primary} />
      </SafeAreaView>
    );
  }

  if (!studentData) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.responsiveContent}>
          {/* Top Header Bar */}
          <View style={styles.header}>
            <View style={{ width: 42 }} />
            <Text style={styles.headerTitle}>PrestoID</Text>
            <TouchableOpacity 
              style={styles.bellButton} 
              activeOpacity={0.7}
              onPress={async () => {
                await signOutAll();
                router.replace('/(auth)/login');
              }}
            >
              <Ionicons name="log-out-outline" size={22} color={Colors.text.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView 
            contentContainerStyle={[styles.scrollContent, { justifyContent: 'center', flexGrow: 1 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.claimCard}>
              <View style={styles.claimIconCircle}>
                <Ionicons name="card-outline" size={32} color={Colors.accent.primary} />
              </View>
              <Text style={styles.claimCardTitle}>Claim Your ID Card</Text>
              <Text style={styles.claimCardSubtitle}>
                Enter your verification passcode or Aadhaar number to link and activate your digital card.
              </Text>

              {/* Verification Method Selector */}
              <View style={styles.claimInputBox}>
                <Text style={styles.claimInputLabel}>Verification Method</Text>
                <View style={styles.modeTabsRow}>
                  <TouchableOpacity
                    style={[styles.modeTab, claimVerificationMode === 'secret_code' && styles.modeTabActive]}
                    onPress={() => {
                      setClaimVerificationMode('secret_code');
                      setClaimVerificationInput('');
                    }}
                  >
                    <Text style={[styles.modeTabText, claimVerificationMode === 'secret_code' && styles.modeTabTextActive]}>
                      Secret Code
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modeTab, claimVerificationMode === 'aadhaar' && styles.modeTabActive]}
                    onPress={() => {
                      setClaimVerificationMode('aadhaar');
                      setClaimVerificationInput('');
                    }}
                  >
                    <Text style={[styles.modeTabText, claimVerificationMode === 'aadhaar' && styles.modeTabTextActive]}>
                      Aadhaar Card
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Verification Input */}
              {claimVerificationMode === 'secret_code' ? (
                <View style={{ gap: 12, width: '100%' }}>
                  <View style={styles.claimInputBox}>
                    <Text style={styles.claimInputLabel}>Organization ID</Text>
                    <TextInput
                      style={styles.claimInput}
                      placeholder="e.g. INST-100"
                      placeholderTextColor={Colors.text.tertiary}
                      value={inviteCodeInput}
                      onChangeText={setInviteCodeInput}
                      autoCapitalize="characters"
                      autoCorrect={false}
                    />
                  </View>
                  <View style={styles.claimInputBox}>
                    <Text style={styles.claimInputLabel}>Secret Passcode</Text>
                    <TextInput
                      style={styles.claimInput}
                      placeholder="e.g. A3K9ZP"
                      placeholderTextColor={Colors.text.tertiary}
                      value={claimVerificationInput}
                      onChangeText={setClaimVerificationInput}
                      autoCapitalize="characters"
                      autoCorrect={false}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.claimInputBox}>
                  <Text style={styles.claimInputLabel}>12-Digit Aadhaar Number</Text>
                  <TextInput
                    style={styles.claimInput}
                    placeholder="0000 0000 0000"
                    placeholderTextColor={Colors.text.tertiary}
                    value={claimVerificationInput}
                    onChangeText={(v) => setClaimVerificationInput(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    maxLength={12}
                  />
                </View>
              )}

              {/* Claim Button */}
              <TouchableOpacity
                style={{ marginTop: 16, width: '100%' }}
                onPress={handleClaimProfile}
                disabled={isClaiming}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={Gradients.primary as [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.claimButton, isClaiming && { opacity: 0.7 }]}
                >
                  {isClaiming ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.claimButtonText}>Get Virtual ID Card</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.responsiveContent}>
        {/* Top Header Bar */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.avatarWrapper} 
            activeOpacity={0.8}
            onPress={() => setIsProfileModalVisible(true)}
          >
            {cardData.photoUrl ? (
              <Image source={{ uri: cardData.photoUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarPlaceholderText}>{getInitials(cardData.studentName)}</Text>
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.headerTitle}>PrestoID</Text>
          <View style={{ width: 42 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* Profile Completion Progress Banner (If Incomplete) */}
          {completionPercentage < 100 && (
            <TouchableOpacity 
              style={styles.completionBanner} 
              activeOpacity={0.9}
              onPress={() => setIsProfileModalVisible(true)}
            >
              <View style={styles.completionHeader}>
                <Text style={styles.completionTitle}>Complete Your Profile</Text>
                <Text style={styles.completionPercentageText}>{completionPercentage}%</Text>
              </View>
              <View style={styles.progressContainer}>
                <View style={[styles.progressBar, { width: `${completionPercentage}%` }]} />
              </View>
              <Text style={styles.completionSubtitle}>Fill in all details to activate your digital card.</Text>
            </TouchableOpacity>
          )}

          {/* Aadhaar Verification Pending Banner */}
          {studentData && !studentData.aadhaar_number && (
            <TouchableOpacity 
              style={styles.aadhaarWarningBanner} 
              activeOpacity={0.9}
              onPress={() => setIsProfileModalVisible(true)}
            >
              <View style={styles.warningRow}>
                <Ionicons name="warning-outline" size={18} color="#FF9500" style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.warningTitle}>Aadhaar Verification Pending</Text>
                  <Text style={styles.warningSubtitle}>
                    Aadhaar card details are missing. Tap here to verify.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color="#FF9500" />
              </View>
            </TouchableOpacity>
          )}

          {/* Context Title & Subtitle */}
          <View style={styles.titleSection}>
            <Text style={styles.pageTitle}>Virtual ID Card</Text>
            <Text style={styles.pageSubtitle}>
              Present this code for campus access and attendance.
            </Text>
          </View>

          {/* Live Activity Widget */}
          <View style={styles.liveActivityWrapper}>
            <LinearGradient
              colors={['#1E1B4B', '#312E81']}
              style={styles.liveActivityGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <View style={styles.liveHeader}>
                <View style={styles.liveStatusRow}>
                  <Animated.View style={[styles.pulseDot, { opacity: pulseAnim }]} />
                  <Text style={styles.liveStatusText}>LIVE AT UCI</Text>
                </View>
                <View style={styles.liveTimeBadge}>
                  <Text style={styles.liveTimeText}>{activeStudent.batch_timing || '10:00 AM - 1:00 PM'}</Text>
                </View>
              </View>

              <Text style={styles.liveTitle}>{activeStudent.course || 'General Coaching'}</Text>
              <Text style={styles.liveDetail}>
                Batch: {activeStudent.batch_name} • Duration: {activeStudent.duration || '1 Year'}
              </Text>

              <View style={styles.liveDivider} />

              <View style={styles.liveFooter}>
                <View style={styles.liveRoomInfo}>
                  <Ionicons name="location" size={13} color="#FFF" style={{ marginRight: 4 }} />
                  <Text style={styles.liveRoomText}>Room 3 (First Floor)</Text>
                </View>
                <TouchableOpacity
                  style={styles.liveActionButton}
                  activeOpacity={0.85}
                  onPress={() => Alert.alert('Class Notes', 'Loading class notes...')}
                >
                  <Text style={styles.liveActionText}>Get Notes</Text>
                  <Ionicons name="arrow-forward" size={12} color={Colors.accent.primary} />
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>

          {/* Virtual ID Card Container */}
          <View style={styles.cardSection}>
            <VirtualIDCard
              {...cardData}
              onQRPress={() => setShowFullQR(true)}
            />
          </View>

          {/* Action Button Section */}
          <View style={styles.actionSection}>
            <TouchableOpacity
              style={styles.flashButton}
              onPress={() => setShowFullQR(true)}
              activeOpacity={0.9}
            >
              <Ionicons name="qr-code-outline" size={20} color="#FFFFFF" style={styles.flashIcon} />
              <Text style={styles.flashButtonText}>Flash for Attendance</Text>
            </TouchableOpacity>

            <View style={styles.secureNoteRow}>
              <Ionicons name="lock-closed-outline" size={13} color={Colors.text.tertiary} style={styles.lockIcon} />
              <Text style={styles.secureNoteText}>Secure NFC & QR enabled</Text>
            </View>
          </View>
        </ScrollView>
      </View>

      {/* Fullscreen QR Modal */}
      <Modal visible={showFullQR} animationType="fade" transparent={false}>
        <SafeAreaView style={styles.fullQRContainer} edges={['top']}>
          <View style={styles.responsiveModalContent}>
            <TouchableOpacity style={styles.backButton} onPress={() => setShowFullQR(false)}>
              <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
            </TouchableOpacity>

            <View style={styles.fullQRContent}>
              <View style={styles.fullQRCard}>
                <QRCode
                  value={cardData.qrValue}
                  size={Math.min(width * 0.7, 300)}
                  backgroundColor="white"
                  color={Colors.text.primary}
                />
              </View>
              <Text style={styles.fullQRName}>{cardData.studentName}</Text>
              <Text style={styles.fullQRId}>{cardData.enrollmentId}</Text>
              <Text style={styles.fullQRHint}>Present this to the scanner for registration</Text>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Fullscreen Profile CRUD Modal */}
      <Modal visible={isProfileModalVisible} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.modalContainer} edges={['top']}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.modalHeader}>
              {isProfileComplete ? (
                <TouchableOpacity onPress={() => setIsProfileModalVisible(false)} style={styles.modalCloseButton}>
                  <Ionicons name="close-outline" size={28} color={Colors.text.primary} />
                </TouchableOpacity>
              ) : (
                <View style={{ width: 40 }} />
              )}
              <Text style={styles.modalHeaderTitle}>My Profile</Text>
              <TouchableOpacity onPress={handleSaveProfile} style={styles.modalSaveButton} disabled={isSavingProfile}>
                {isSavingProfile ? (
                  <ActivityIndicator size="small" color={Colors.accent.primary} />
                ) : (
                  <Text style={styles.modalSaveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false}>
              
              {/* Profile Completion percentage on Edit screen */}
              <View style={styles.modalProgressSection}>
                <View style={styles.modalProgressHeader}>
                  <Text style={styles.modalProgressTitle}>Profile Completion</Text>
                  <Text style={[styles.modalProgressText, { color: '#34C759' }]}>{realtimePct}% Complete</Text>
                </View>
                <View style={styles.progressContainer}>
                  <View style={[styles.progressBar, { width: `${realtimePct}%`, backgroundColor: '#34C759' }]} />
                </View>

                {/* Real-time Percentage Grid */}
                <View style={styles.completionGrid}>
                  {realtimeItems.map((item) => (
                    <View 
                      key={item.key} 
                      style={[
                        styles.completionGridCell, 
                        item.complete ? styles.completionGridCellComplete : styles.completionGridCellIncomplete
                      ]}
                    >
                      <Ionicons 
                        name={item.complete ? "checkmark-circle" : "ellipse-outline"} 
                        size={11} 
                        color={item.complete ? "#34C759" : Colors.text.tertiary} 
                        style={{ marginRight: 4 }}
                      />
                      <Text 
                        style={[
                          styles.completionGridCellText, 
                          item.complete ? styles.completionGridCellTextComplete : styles.completionGridCellTextIncomplete
                        ]}
                      >
                        {item.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Edit Photo */}
              <View style={styles.photoContainer}>
                <TouchableOpacity onPress={handleChangePhoto} activeOpacity={0.8} disabled={isUploadingPhoto}>
                  {isUploadingPhoto ? (
                    <View style={[styles.photoAvatar, { justifyContent: 'center', alignItems: 'center' }]}>
                      <ActivityIndicator color="#FFF" />
                    </View>
                  ) : cardData.photoUrl ? (
                    <Image source={{ uri: cardData.photoUrl }} style={styles.photoAvatar} />
                  ) : (
                    <View style={[styles.photoAvatar, styles.photoAvatarPlaceholder]}>
                      <Text style={styles.photoAvatarInitials}>{getInitials(cardData.studentName)}</Text>
                    </View>
                  )}
                  <View style={styles.cameraBadge}>
                    <Ionicons name="camera" size={16} color="#FFF" />
                  </View>
                </TouchableOpacity>
                <Text style={styles.photoLabel}>{isUploadingPhoto ? 'Uploading photo...' : 'Tap to change photo'}</Text>
              </View>

              {/* Personal Details */}
              <Text style={styles.modalSectionLabel}>Personal Details</Text>
              <View style={styles.formCard}>
                <View style={styles.inputBox}>
                  <Text style={styles.inputLabel}>Full Name *</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Enter full name"
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>

                <View style={styles.inputBox}>
                  <Text style={styles.inputLabel}>Date of Birth (e.g. 15 Mar 2001)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editDob}
                    onChangeText={setEditDob}
                    placeholder="15 Mar 2001"
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>

                <View style={styles.inputBox}>
                  <Text style={styles.inputLabel}>Contact Phone *</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editPhone}
                    onChangeText={setEditPhone}
                    keyboardType="phone-pad"
                    maxLength={10}
                    placeholder="10-digit number"
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>

                <View style={styles.inputBox}>
                  <Text style={styles.inputLabel}>WhatsApp Number</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editWhatsapp}
                    onChangeText={setEditWhatsapp}
                    keyboardType="phone-pad"
                    maxLength={10}
                    placeholder="WhatsApp number"
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>

                <View style={styles.inputBox}>
                  <Text style={styles.inputLabel}>Aadhaar Number *</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editAadhaar}
                    onChangeText={(v) => setEditAadhaar(v.replace(/[^0-9]/g, '').slice(0, 12))}
                    keyboardType="number-pad"
                    maxLength={12}
                    placeholder="12-digit Aadhaar number"
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>

                <View style={styles.inputBox}>
                  <Text style={styles.inputLabel}>Blood Group (e.g. O+, A-)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editBloodGroup}
                    onChangeText={setEditBloodGroup}
                    placeholder="O+"
                    placeholderTextColor={Colors.text.tertiary}
                    autoCapitalize="characters"
                  />
                </View>

                <View style={styles.inputBox}>
                  <Text style={styles.inputLabel}>Father's Name</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editFatherName}
                    onChangeText={setEditFatherName}
                    placeholder="Father's full name"
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>

                <View style={styles.inputBox}>
                  <Text style={styles.inputLabel}>Father's Phone *</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editParentPhone}
                    onChangeText={setEditParentPhone}
                    keyboardType="phone-pad"
                    maxLength={10}
                    placeholder="Father's phone"
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>

                <View style={styles.inputBox}>
                  <Text style={styles.inputLabel}>Home Address</Text>
                  <TextInput
                    style={[styles.textInput, { height: 70, textAlignVertical: 'top' }]}
                    value={editAddress}
                    onChangeText={setEditAddress}
                    multiline={true}
                    placeholder="Full residential address"
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>
              </View>

              {/* Academic Details (Read Only) */}
              <Text style={styles.modalSectionLabel}>Academic Details (Verified)</Text>
              <View style={styles.formCard}>
                <View style={styles.readOnlyRow}>
                  <Text style={styles.readOnlyLabel}>Enrollment ID</Text>
                  <Text style={styles.readOnlyValue}>{activeStudent.enrollment_id}</Text>
                </View>
                <View style={styles.readOnlyDivider} />

                <View style={styles.readOnlyRow}>
                  <Text style={styles.readOnlyLabel}>Batch Name</Text>
                  <Text style={styles.readOnlyValue}>{activeStudent.batch_name}</Text>
                </View>
                <View style={styles.readOnlyDivider} />

                <View style={styles.readOnlyRow}>
                  <Text style={styles.readOnlyLabel}>Batch Timing</Text>
                  <Text style={styles.readOnlyValue}>{activeStudent.batch_timing || '10:00 AM - 01:00 PM'}</Text>
                </View>
                <View style={styles.readOnlyDivider} />

                <View style={styles.readOnlyRow}>
                  <Text style={styles.readOnlyLabel}>Course Enrolled</Text>
                  <Text style={styles.readOnlyValue}>{activeStudent.course || 'General Coaching'}</Text>
                </View>
                <View style={styles.readOnlyDivider} />

                <View style={styles.readOnlyRow}>
                  <Text style={styles.readOnlyLabel}>Course Duration</Text>
                  <Text style={styles.readOnlyValue}>{activeStudent.duration || '1 Year'}</Text>
                </View>
                <View style={styles.readOnlyDivider} />

                <View style={styles.readOnlyRow}>
                  <Text style={styles.readOnlyLabel}>Valid From/Till</Text>
                  <Text style={styles.readOnlyValue}>{activeStudent.valid_from} to {activeStudent.valid_till}</Text>
                </View>
              </View>

            </ScrollView>
          </KeyboardAvoidingView>
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
  responsiveContent: {
    flex: 1,
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
    backgroundColor: Colors.bg.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: Colors.bg.primary,
  },
  avatarWrapper: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 2,
    borderColor: '#E6BEB4',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: Colors.accent.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFF',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.accent.primary,
    letterSpacing: -0.5,
  },
  bellButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  
  // Profile Completion Banner
  completionBanner: {
    backgroundColor: Colors.status.success + '12',
    borderWidth: 1,
    borderColor: Colors.status.success + '30',
    borderRadius: 16,
    marginHorizontal: 20,
    marginTop: 10,
    padding: 16,
  },
  completionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  completionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.status.success,
  },
  completionPercentageText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.status.success,
  },
  progressContainer: {
    height: 6,
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.status.success,
    borderRadius: 3,
  },
  completionSubtitle: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginTop: 6,
    fontWeight: '500',
  },
  completionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  completionGridCell: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  completionGridCellComplete: {
    backgroundColor: '#34C75910',
    borderColor: '#34C75930',
  },
  completionGridCellIncomplete: {
    backgroundColor: Colors.bg.tertiary,
    borderColor: Colors.card.border,
  },
  completionGridCellText: {
    fontSize: 10,
    fontWeight: '600',
  },
  completionGridCellTextComplete: {
    color: '#34C759',
  },
  completionGridCellTextIncomplete: {
    color: Colors.text.tertiary,
  },

  titleSection: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text.primary,
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 13,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    fontWeight: '500',
    paddingHorizontal: 20,
  },
  
  // Live Activity Styles
  liveActivityWrapper: {
    paddingHorizontal: 20,
    marginBottom: 20,
    width: '100%',
  },
  liveActivityGradient: {
    borderRadius: 16,
    padding: 16,
    ...Shadows.md,
  },
  liveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  liveStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.status.danger,
    marginRight: 6,
  },
  liveStatusText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  liveTimeBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  liveTimeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFF1ED',
  },
  liveTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  liveDetail: {
    fontSize: 12,
    color: '#ECECF1',
    fontWeight: '500',
    lineHeight: 16,
  },
  liveDivider: {
    height: 0.5,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginVertical: 12,
  },
  liveFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  liveRoomInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveRoomText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFF1ED',
  },
  liveActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  liveActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.accent.primary,
  },
  cardSection: {
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  actionSection: {
    paddingHorizontal: 20,
    alignItems: 'center',
    width: '100%',
  },
  flashButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent.primary,
    borderRadius: 14,
    width: '100%',
    paddingVertical: 14,
    ...Shadows.md,
  },
  flashIcon: {
    marginRight: 8,
  },
  flashButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  secureNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  lockIcon: {
    marginRight: 4,
  },
  secureNoteText: {
    fontSize: 12,
    color: Colors.text.tertiary,
    fontWeight: '600',
  },
  fullQRContainer: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  responsiveModalContent: {
    flex: 1,
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  fullQRContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  fullQRCard: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: Colors.card.border,
    ...Shadows.md,
  },
  fullQRName: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text.primary,
    marginTop: 24,
  },
  fullQRId: {
    fontSize: 15,
    color: Colors.text.secondary,
    marginTop: 4,
    fontWeight: '600',
  },
  fullQRHint: {
    fontSize: 13,
    color: Colors.text.tertiary,
    marginTop: 12,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Profile Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
    backgroundColor: Colors.bg.secondary,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  modalSaveButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.accent.primary + '12',
  },
  modalSaveButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.accent.primary,
  },
  modalScroll: {
    paddingTop: 16,
    paddingBottom: 60,
    paddingHorizontal: 20,
  },
  modalProgressSection: {
    marginBottom: 20,
  },
  modalProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modalProgressTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  modalProgressText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.status.success,
  },
  
  // Photo Editor Styles
  photoContainer: {
    alignItems: 'center',
    marginBottom: 24,
    position: 'relative',
  },
  photoAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: Colors.accent.primary,
  },
  photoAvatarPlaceholder: {
    backgroundColor: Colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoAvatarInitials: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFF',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Colors.accent.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.bg.secondary,
  },
  photoLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 8,
    fontWeight: '600',
  },

  modalSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.secondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 12,
  },
  formCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.card.border,
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  inputBox: {
    gap: 4,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.tertiary,
    textTransform: 'uppercase',
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.card.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: Colors.text.primary,
    backgroundColor: Colors.bg.primary,
    fontWeight: '600',
  },

  // Read Only styles
  readOnlyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  readOnlyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  readOnlyValue: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  readOnlyDivider: {
    height: 0.5,
    backgroundColor: Colors.card.border,
    marginVertical: 4,
  },
  // Claim Screen Styles
  claimCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.card.border,
    alignItems: 'center',
    marginHorizontal: 16,
    ...Shadows.md,
  },
  claimIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.accent.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  claimCardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  claimCardSubtitle: {
    fontSize: 13,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  claimInputBox: {
    width: '100%',
    marginBottom: 16,
    gap: 6,
  },
  claimInputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  claimInput: {
    backgroundColor: Colors.bg.primary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.card.border,
    paddingHorizontal: 14,
    height: 48,
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  modeTabsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.bg.primary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.card.border,
    padding: 4,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTabActive: {
    backgroundColor: Colors.bg.secondary,
    ...Shadows.sm,
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  modeTabTextActive: {
    color: Colors.accent.primary,
    fontWeight: '700',
  },
  claimButton: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.accent.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
    paddingHorizontal: 24,
  },
  claimButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  selectedInstCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bg.primary,
    borderColor: Colors.card.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
  },
  selectedInstInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedInstBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.accent.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedInstName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  selectedInstCode: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.tertiary,
    marginTop: 2,
  },
  changeInstBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  changeInstBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.accent.primary,
  },
  searchSection: {
    width: '100%',
    marginBottom: 16,
  },
  claimSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.primary,
    borderColor: Colors.card.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 10,
  },
  claimSearchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.text.primary,
    fontWeight: '500',
  },
  categoryChipsScroll: {
    paddingVertical: 4,
    marginBottom: 12,
    gap: 6,
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.bg.primary,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  catChipActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  catChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  catChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  institutesListContainer: {
    gap: 8,
  },
  emptyInstitutes: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyInstitutesText: {
    fontSize: 12,
    color: Colors.text.tertiary,
    fontWeight: '500',
  },
  instituteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    backgroundColor: Colors.bg.primary,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  instItemIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  instItemIconText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.accent.primary,
  },
  instItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  instItemSub: {
    fontSize: 11,
    color: Colors.text.tertiary,
    fontWeight: '500',
    marginTop: 2,
  },
  // Aadhaar Warning Banner Styles
  aadhaarWarningBanner: {
    backgroundColor: '#FF950012',
    borderColor: '#FF950030',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FF9500',
    marginBottom: 2,
  },
  warningSubtitle: {
    fontSize: 11,
    color: Colors.text.secondary,
    fontWeight: '500',
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
});

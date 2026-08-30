import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Platform,
  Alert,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors, Gradients, Shadows } from '@/constants/colors';
import { APP_CONFIG } from '@/constants/config';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '@/stores/useAuthStore';
import { supabase } from '@/lib/supabase';
import { signOutAll } from '@/lib/authActions';

const EXAM_CATEGORIES: Record<string, string[]> = {
  'Govt': [
    'MPPSC',
    'MP POLICE',
    'MP PATWARI',
    'SSC CGL/CHSL',
    'RAILWAY [NTPC/GROUP D]',
    'BANKING [IBPS/SBI]',
    'UPSC',
  ],
  'Engineering Entrance': ['JEE Main', 'JEE Advanced', 'GATE', 'BITSAT'],
  'Medical Entrance': ['NEET UG', 'NEET PG', 'AIIMS'],
  'Central & Law': ['CUET [UG/PG]', 'CLAT', 'CAT'],
  'Boards Exam': [
    'Class 12th PCM',
    'Class 12th PCB',
    'Class 12th Commerce',
    'Class 12th Arts',
    'Class 10th Board',
  ],
};

const INDIAN_STATES = [
  'Madhya Pradesh',
  'Uttar Pradesh',
  'Rajasthan',
  'Bihar',
  'Delhi',
  'Maharashtra',
  'Chhattisgarh',
  'Gujarat',
  'Haryana',
  'Other State',
];

export default function StudentProfileScreen() {
  const router = useRouter();
  const { user, reset, activeEnvironment, setActiveEnvironment, businessId, businessName } = useAuthStore();

  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Student details
  const [studentName, setStudentName] = useState('Public Aspirant');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isExternal, setIsExternal] = useState(true);
  const [hasCoachingLinked, setHasCoachingLinked] = useState(false);
  const [coachingTitle, setCoachingTitle] = useState('My Coaching');

  // Gate of Target Exam Settings
  const [targetExam, setTargetExam] = useState('MPPSC');
  const [selectedState, setSelectedState] = useState('Madhya Pradesh');
  const [isExamModalVisible, setIsExamModalVisible] = useState(false);
  const [isStateModalVisible, setIsStateModalVisible] = useState(false);
  const [activeCategory, setActiveCategory] = useState('Govt');

  // Stats
  const [testsAttemptedCount, setTestsAttemptedCount] = useState(4);
  const [averageScore, setAverageScore] = useState(154);
  const [currentRank, setCurrentRank] = useState('#24');

  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    try {
      setIsLoading(true);

      // Check if student has a linked coaching profile
      const { data: linkedStudent } = await supabase
        .from('students')
        .select('id, business_id, businesses(business_name)')
        .eq('user_id', user.id)
        .maybeSingle();

      if (linkedStudent && linkedStudent.business_id) {
        setHasCoachingLinked(true);
        setCoachingTitle((linkedStudent.businesses as any)?.business_name || businessName || 'My Coaching');
      } else if (businessId) {
        setHasCoachingLinked(true);
        setCoachingTitle(businessName || 'My Coaching');
      } else {
        setHasCoachingLinked(false);
      }

      // Check public_students table first
      const { data: pubData } = await supabase
        .from('public_students')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (pubData) {
        setStudentName(pubData.name || 'Public Aspirant');
        setEmail(pubData.email || user.email || '');
        setPhone(pubData.phone || '');
        setTargetExam(pubData.target_exam || 'MPPSC');
        setSelectedState(pubData.state || 'Madhya Pradesh');
        if (pubData.avatar_url) setAvatarUrl(pubData.avatar_url);
        setIsExternal(true);
      } else {
        // Fallback to profiles table
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (prof) {
          setStudentName(prof.name || prof.full_name || 'Public Aspirant');
          setEmail(prof.email || user.email || '');
          setPhone(prof.phone || '');
          setTargetExam(prof.target_exam || 'MPPSC');
          setSelectedState(prof.address || 'Madhya Pradesh');
          if (prof.avatar_url) setAvatarUrl(prof.avatar_url);
          setIsExternal(prof.is_external === true || !prof.business_id);
        }
      }
    } catch (e) {
      console.log('[Profile] Load profile fallback:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [user, businessId, businessName]);

  const handlePickProfilePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Gallery access is needed to select a profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        const localUri = result.assets[0].uri;
        // 1. INSTANT OPTIMISTIC UI: User sees their picture change immediately!
        setAvatarUrl(localUri);
        useAuthStore.getState().setAvatarUrl(localUri);
        Alert.alert('Upload Successful 🎉', 'Your profile picture has been updated.');

        // 2. Background async upload to Supabase Storage & DB sync
        (async () => {
          try {
            let fileExt = 'jpg';
            const cleanUri = localUri.split('?')[0].split('#')[0];
            const parts = cleanUri.split('.');
            if (parts.length > 1) {
              const ext = parts.pop()?.toLowerCase() || 'jpg';
              if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) fileExt = ext;
            }
            const fileName = `student-${user?.id || 'temp'}-${Date.now()}.${fileExt}`;
            const token = useAuthStore.getState().session?.access_token || APP_CONFIG.supabaseAnonKey;

            const uploadRes = await FileSystem.uploadAsync(
              `${APP_CONFIG.supabaseUrl}/storage/v1/object/avatars/${fileName}`,
              localUri,
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

            if (uploadRes.status >= 200 && uploadRes.status < 300 && user?.id) {
              const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
              if (publicUrl) {
                setAvatarUrl(publicUrl);
                useAuthStore.getState().setAvatarUrl(publicUrl);

                // Sync across all tables
                await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
                await supabase.from('public_students').upsert({ user_id: user.id, avatar_url: publicUrl, name: studentName }, { onConflict: 'user_id' });
                await supabase.from('students').update({ photo_url: publicUrl }).eq('user_id', user.id);

                const cache = await AsyncStorage.getItem('@user_profile');
                if (cache) {
                  const parsed = JSON.parse(cache);
                  parsed.avatarUrl = publicUrl;
                  await AsyncStorage.setItem('@user_profile', JSON.stringify(parsed));
                }
              }
            }
          } catch (bgErr) {
            console.log('[ProfilePhoto] Background upload sync notice:', bgErr);
          }
        })();
      }
    } catch (err: any) {
      console.warn('Image picker notice:', err);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSelectExam = async (exam: string) => {
    setTargetExam(exam);
    setIsExamModalVisible(false);

    try {
      if (user?.id) {
        // Update both tables for complete synchronization
        await supabase
          .from('public_students')
          .upsert({ user_id: user.id, target_exam: exam, name: studentName }, { onConflict: 'user_id' });

        await supabase
          .from('profiles')
          .update({ target_exam: exam })
          .eq('id', user.id);
      }

      await AsyncStorage.setItem('@student_target_exam', exam);
      Alert.alert('Target Exam Updated 🎉', `Your workspace is now tailored for ${exam}.`);
    } catch (e) {
      console.log('[Profile] Update exam notice:', e);
    }
  };

  const handleSelectState = async (stateName: string) => {
    setSelectedState(stateName);
    setIsStateModalVisible(false);

    try {
      if (user?.id) {
        await supabase
          .from('public_students')
          .upsert({ user_id: user.id, state: stateName, name: studentName }, { onConflict: 'user_id' });

        await supabase
          .from('profiles')
          .update({ address: stateName })
          .eq('id', user.id);
      }
      await AsyncStorage.setItem('@student_state', stateName);
    } catch (e) {
      console.log('[Profile] Update state notice:', e);
    }
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to sign out of your account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOutAll();
          reset();
          router.replace('/onboarding');
        },
      },
    ]);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadProfile();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top Header */}
      <View style={styles.header}>
        {router.canGoBack() ? (
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color="#111827" />
          </TouchableOpacity>
        ) : null}

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Student Profile & Goals</Text>
          <Text style={styles.headerSubtitle}>Personal settings & target exam hub</Text>
        </View>

        <TouchableOpacity onPress={handleLogout} style={styles.logoutHeaderBtn} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent.primary} />}
        contentContainerStyle={styles.scrollBody}
      >
        {/* Profile Hero Card */}
        <View style={styles.heroCard}>
          <TouchableOpacity
            style={styles.avatarWrap}
            activeOpacity={0.85}
            onPress={handlePickProfilePhoto}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.heroAvatarImage} />
            ) : (
              <LinearGradient
                colors={['#AF2800', '#D9480F']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarGradient}
              >
                <Text style={styles.avatarLetter}>{studentName.charAt(0).toUpperCase()}</Text>
              </LinearGradient>
            )}
            <View style={styles.cameraIconBadge}>
              <Ionicons name="camera" size={12} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          <View style={styles.heroInfo}>
            <Text style={styles.heroName}>{studentName}</Text>
            <Text style={styles.heroEmail}>{email || phone || 'Aspirant Account'}</Text>

            <View style={styles.badgeRow}>
              <View style={styles.roleBadge}>
                <Ionicons name={isExternal ? 'planet' : 'business'} size={12} color="#AF2800" />
                <Text style={styles.roleBadgeText}>
                  {isExternal ? 'Independent Public Aspirant' : 'Institute Enrolled'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ─── GATE OF TARGET EXAM SETTINGS (CORE FEATURE) ────────────────── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeading}>TARGET EXAM SETTINGS</Text>
          <Text style={styles.sectionBadge}>CORE GATEWAY</Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setIsExamModalVisible(true)}
          style={styles.targetExamCard}
        >
          <LinearGradient
            colors={['#AF2800', '#D9480F']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.targetExamGradient}
          >
            <View style={styles.targetExamTopRow}>
              <View style={styles.targetExamPill}>
                <Ionicons name="flag" size={12} color="#FFFFFF" />
                <Text style={styles.targetExamPillText}>ACTIVE TARGET GOAL</Text>
              </View>
              <View style={styles.changeBtnPill}>
                <Text style={styles.changeBtnText}>Change Exam</Text>
                <Ionicons name="chevron-forward" size={14} color="#AF2800" />
              </View>
            </View>

            <Text style={styles.targetExamTitle}>{targetExam}</Text>
            <Text style={styles.targetExamDescription}>
              Your Test Hub drills, All-India Leaderboard rankings, and Vacancy Feed will be dynamically tailored for this exam.
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Aspirant Details (State & Location) */}
        <View style={styles.cardSection}>
          <Text style={styles.sectionHeading}>ASPIRANT BENCHMARKS</Text>

          <TouchableOpacity
            style={styles.rowItem}
            activeOpacity={0.7}
            onPress={() => setIsStateModalVisible(true)}
          >
            <View style={styles.rowIconBox}>
              <Ionicons name="location-outline" size={20} color="#AF2800" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Home State / Region</Text>
              <Text style={styles.rowValue}>{selectedState}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>

          <View style={styles.statsSummaryRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{testsAttemptedCount}</Text>
              <Text style={styles.statLabel}>Tests Done</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{averageScore} pts</Text>
              <Text style={styles.statLabel}>Avg Score</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, { color: '#16A34A' }]}>{currentRank}</Text>
              <Text style={styles.statLabel}>State Rank</Text>
            </View>
          </View>
        </View>

        {/* Local Storage Info Card (Mocks Folder) */}
        <View style={styles.cardSection}>
          <Text style={styles.sectionHeading}>DEVICE STORAGE VAULT</Text>

          <View style={styles.storageCard}>
            <View style={styles.storageHeaderRow}>
              <View style={styles.storageIconBox}>
                <Ionicons name="folder-open" size={20} color="#AF2800" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.storageTitle}>Main Internal Storage / Mocks</Text>
                <Text style={styles.storageSubtitle}>Offline question papers and PDF sheets are saved here.</Text>
              </View>
            </View>

            <View style={styles.statusPillRow}>
              <View style={styles.greenDot} />
              <Text style={styles.statusPillText}>Ready & Indexed by Phone File Manager</Text>
            </View>
          </View>
        </View>

        {/* Workspace Switcher Card */}
        {hasCoachingLinked ? (
          <TouchableOpacity
            style={[
              styles.coachingSwitchCard,
              { borderColor: activeEnvironment === 'enrolled' ? '#C7D2FE' : '#FEE2E2' },
            ]}
            activeOpacity={0.85}
            onPress={() => {
              if (activeEnvironment === 'enrolled') {
                setActiveEnvironment('public');
                router.replace('/(student)/public-tests');
              } else {
                setActiveEnvironment('enrolled');
                router.replace('/(student)/id-card');
              }
            }}
          >
            <View
              style={[
                styles.coachingIconWrap,
                { backgroundColor: activeEnvironment === 'enrolled' ? '#EEF2FF' : '#FFF1F2' },
              ]}
            >
              <Ionicons
                name={activeEnvironment === 'enrolled' ? 'rocket' : 'business'}
                size={22}
                color={activeEnvironment === 'enrolled' ? '#4F46E5' : '#AF2800'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.coachingCardTitle}>
                {activeEnvironment === 'enrolled'
                  ? 'Switch to Public Test Practice 🎯'
                  : `Switch to ${coachingTitle} 🏛️`}
              </Text>
              <Text style={styles.coachingCardDesc}>
                {activeEnvironment === 'enrolled'
                  ? 'Access All-India open mocks, nationwide leaderboards & vacancy feed.'
                  : 'Return to your Virtual ID Card, batch tests, attendance & coaching notes.'}
              </Text>
            </View>
            <Ionicons
              name="swap-horizontal"
              size={20}
              color={activeEnvironment === 'enrolled' ? '#4F46E5' : '#AF2800'}
            />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.coachingSwitchCard}
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: '/(auth)/claim-profile',
                params: { directMode: 'credentials' },
              })
            }
          >
            <View style={styles.coachingIconWrap}>
              <Ionicons name="business" size={22} color="#AF2800" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.coachingCardTitle}>Joined a Coaching Institute?</Text>
              <Text style={styles.coachingCardDesc}>
                Enter your Organization Code & Passcode to link your Institute ID Card & batch tests.
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color="#AF2800" />
          </TouchableOpacity>
        )}

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.signOutBtn} activeOpacity={0.8} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={18} color="#EF4444" style={{ marginRight: 6 }} />
          <Text style={styles.signOutText}>Sign Out of Account</Text>
        </TouchableOpacity>

        <Text style={styles.appFooterText}>Mocks • Student Experience v3.0</Text>
      </ScrollView>

      {/* ─── TARGET EXAM PICKER MODAL ────────────────────────────────────── */}
      <Modal
        visible={isExamModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsExamModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandleBar}>
              <View style={styles.modalHandle} />
            </View>

            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Select Your Target Exam</Text>
                <Text style={styles.modalSubtitle}>Tests and leaderboards will adapt to this goal</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsExamModalVisible(false)}
              >
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Category Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.modalCatScroll}>
              {Object.keys(EXAM_CATEGORIES).map((cat) => {
                const isCatActive = activeCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.modalCatChip, isCatActive && styles.modalCatChipActive]}
                    onPress={() => setActiveCategory(cat)}
                  >
                    <Text style={[styles.modalCatText, isCatActive && styles.modalCatTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Exam Options List */}
            <ScrollView style={styles.examListScroll} showsVerticalScrollIndicator={false}>
              {(EXAM_CATEGORIES[activeCategory] || []).map((exam) => {
                const isSelected = targetExam === exam;
                return (
                  <TouchableOpacity
                    key={exam}
                    style={[styles.examRow, isSelected && styles.examRowSelected]}
                    onPress={() => handleSelectExam(exam)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.examRowLeft}>
                      <View style={[styles.examRadio, isSelected && styles.examRadioSelected]}>
                        {isSelected ? <View style={styles.examRadioInner} /> : null}
                      </View>
                      <Text style={[styles.examRowName, isSelected && styles.examRowNameSelected]}>
                        {exam}
                      </Text>
                    </View>

                    {isSelected ? (
                      <View style={styles.activeCheckBadge}>
                        <Ionicons name="checkmark" size={14} color="#AF2800" />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── STATE PICKER MODAL ─────────────────────────────────────────── */}
      <Modal
        visible={isStateModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsStateModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandleBar}>
              <View style={styles.modalHandle} />
            </View>

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Your State</Text>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsStateModalVisible(false)}
              >
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.examListScroll} showsVerticalScrollIndicator={false}>
              {INDIAN_STATES.map((st) => {
                const isSelected = selectedState === st;
                return (
                  <TouchableOpacity
                    key={st}
                    style={[styles.examRow, isSelected && styles.examRowSelected]}
                    onPress={() => handleSelectState(st)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.examRowName, isSelected && styles.examRowNameSelected]}>
                      {st}
                    </Text>
                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={18} color="#AF2800" />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#4B5563',
    fontWeight: '500',
    marginTop: 1,
  },
  logoutHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollBody: {
    padding: 16,
    paddingBottom: 40,
  },

  // Hero Card
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
    ...Shadows.sm,
  },
  avatarWrap: {
    marginRight: 14,
    position: 'relative',
  },
  heroAvatarImage: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  cameraIconBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#AF2800',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarGradient: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  heroInfo: {
    flex: 1,
  },
  heroName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 2,
  },
  heroEmail: {
    fontSize: 12,
    color: '#4B5563',
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFE2DB',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#AF2800',
  },

  // Section Headers
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.8,
  },
  sectionBadge: {
    fontSize: 9,
    fontWeight: '900',
    color: '#AF2800',
    backgroundColor: '#FFE2DB',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },

  // Target Exam Card
  targetExamCard: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 20,
    ...Shadows.md,
  },
  targetExamGradient: {
    padding: 18,
  },
  targetExamTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  targetExamPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 5,
  },
  targetExamPillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  changeBtnPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 4,
  },
  changeBtnText: {
    color: '#AF2800',
    fontSize: 11,
    fontWeight: '800',
  },
  targetExamTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 6,
  },
  targetExamDescription: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    lineHeight: 17,
  },

  // Card Section
  cardSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
    ...Shadows.sm,
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 6,
  },
  rowIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFE2DB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginTop: 2,
  },
  statsSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 14,
  },
  statBox: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  statLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E5E7EB',
  },

  // Storage Card
  storageCard: {
    marginTop: 6,
  },
  storageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  storageIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFE2DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  storageTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  storageSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  statusPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 12,
  },
  greenDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#16A34A',
  },
  statusPillText: {
    fontSize: 11,
    color: '#16A34A',
    fontWeight: '700',
  },

  // Coaching Switch Card
  coachingSwitchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#FEE2E2',
    marginBottom: 16,
    gap: 12,
    ...Shadows.sm,
  },
  coachingIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FFF1F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coachingCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 3,
  },
  coachingCardDesc: {
    fontSize: 11,
    color: '#6B7280',
    lineHeight: 15,
  },

  // Sign out
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 16,
  },
  signOutText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '800',
  },
  appFooterText: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  modalHandleBar: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCatScroll: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  modalCatChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  modalCatChipActive: {
    backgroundColor: '#FFE2DB',
  },
  modalCatText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  modalCatTextActive: {
    color: '#AF2800',
    fontWeight: '800',
  },
  examListScroll: {
    paddingHorizontal: 16,
    maxHeight: 340,
  },
  examRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: '#FAFAFA',
  },
  examRowSelected: {
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  examRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  examRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  examRadioSelected: {
    borderColor: '#AF2800',
  },
  examRadioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#AF2800',
  },
  examRowName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  examRowNameSelected: {
    color: '#AF2800',
    fontWeight: '800',
  },
  activeCheckBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFE2DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

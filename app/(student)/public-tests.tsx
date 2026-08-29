import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Colors, Gradients, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import PublicHeaderProfileModal from '@/components/PublicHeaderProfileModal';
import { cacheTestForOffline } from '@/lib/offlineTestStorage';

const EXAM_CHIPS = [
  'ALL',
  'MPPSC',
  'MP Police (SI/Constable)',
  'SSC CGL',
  'Railway',
  'Banking',
  'UPSC',
];

const INITIAL_PUBLIC_TESTS = [
  {
    id: 'pub-mock-1',
    title: 'MPPSC Prelims Paper 1 — Full Length Mock 2026',
    description: 'Comprehensive 100 question mock test covering MP GK, Indian Polity, History, and Geography.',
    exam_category: 'MPPSC',
    subject_name: 'General Studies',
    duration_minutes: 120,
    total_marks: 200,
    questions_count: 100,
    difficulty_level: 'Medium',
  },
  {
    id: 'pub-mock-2',
    title: 'MP Police SI & Constable — Reasoning & Math Speed Drill',
    description: 'High-yield numerical ability, non-verbal reasoning, and state aptitude practice.',
    exam_category: 'MP Police (SI/Constable)',
    subject_name: 'Aptitude & Reasoning',
    duration_minutes: 45,
    total_marks: 50,
    questions_count: 50,
    difficulty_level: 'Easy',
  },
  {
    id: 'pub-mock-3',
    title: 'SSC CGL Tier-1 — General Awareness Master Drill',
    description: 'Curated MCQs on Indian Economy, History, Science & Current Affairs.',
    exam_category: 'SSC CGL',
    subject_name: 'General Awareness',
    duration_minutes: 30,
    total_marks: 50,
    questions_count: 25,
    difficulty_level: 'Hard',
  },
  {
    id: 'pub-mock-4',
    title: 'Railway NTPC & Group D — General Science Practice',
    description: 'High-frequency Physics, Chemistry, and Biology questions with bilingual explanations.',
    exam_category: 'Railway',
    subject_name: 'General Science',
    duration_minutes: 40,
    total_marks: 60,
    questions_count: 40,
    difficulty_level: 'Medium',
  },
];

export default function PublicTestsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [profile, setProfile] = useState<any>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);

  const [selectedExam, setSelectedExam] = useState('ALL');
  const [testsList, setTestsList] = useState<any[]>(INITIAL_PUBLIC_TESTS);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      if (user?.id) {
        // Try public_students first, fallback to profiles
        const { data: pubStudent } = await supabase
          .from('public_students')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (pubStudent) {
          setProfile(pubStudent);
        } else {
          const { data: prof } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();
          if (prof) setProfile(prof);
        }
      }

      // Try fetching from public_tests table first
      let { data: pubTests, error: pubErr } = await supabase
        .from('public_tests')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (pubErr || !pubTests || pubTests.length === 0) {
        // Fallback to tests table with is_public = true or null business_id
        const { data: fallbackTests } = await supabase
          .from('tests')
          .select('*')
          .or('is_public.eq.true,business_id.is.null')
          .order('created_at', { ascending: false });

        if (fallbackTests && fallbackTests.length > 0) {
          pubTests = fallbackTests;
        }
      }

      if (pubTests && pubTests.length > 0) {
        setTestsList(pubTests);
      } else {
        setTestsList(INITIAL_PUBLIC_TESTS);
      }
    } catch (e) {
      console.log('[PublicTests] Using local mock fallback:', e);
      setTestsList(INITIAL_PUBLIC_TESTS);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStartTest = async (item: any) => {
    await cacheTestForOffline(item.id, item);
    router.push({ pathname: '/(student)/test/engine/[id]', params: { id: item.id } });
  };

  const filteredTests = selectedExam === 'ALL'
    ? testsList
    : testsList.filter((t) => t.exam_category?.toLowerCase().includes(selectedExam.toLowerCase()));

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.profileAvatarBtn}
          onPress={() => setProfileModalVisible(true)}
          activeOpacity={0.8}
        >
          <View style={styles.avatarPill}>
            <Text style={styles.avatarLetter}>
              {profile?.name ? profile.name.charAt(0).toUpperCase() : 'P'}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Public Test Hub</Text>
          <Text style={styles.headerSubtitle}>All-India Open Mock Tests & Drills</Text>
        </View>

        <View style={styles.badgeOpenAccess}>
          <Ionicons name="sparkles" size={13} color="#AF2800" />
          <Text style={styles.badgeOpenAccessText}>Open Access</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.accent.primary}
          />
        }
        contentContainerStyle={styles.scrollBody}
      >
        {/* Featured Live Test Banner */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => handleStartTest(INITIAL_PUBLIC_TESTS[0])}
          style={styles.featuredCard}
        >
          <LinearGradient
            colors={['#AF2800', '#D9480F']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.featuredGradient}
          >
            <View style={styles.featuredBadgeRow}>
              <View style={styles.liveIndicatorPill}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>FEATURED MOCK</Text>
              </View>
              <Text style={styles.featuredMarks}>🎯 200 Marks • 120 Mins</Text>
            </View>

            <Text style={styles.featuredTitle}>MPPSC Prelims Paper 1 — Full Length Mock 2026</Text>
            <Text style={styles.featuredSubtitle}>
              Bilingual (Hindi/English) • Complete MP GK, Polity & History Syllabus
            </Text>

            <View style={styles.featuredBtnRow}>
              <View style={styles.featuredAttemptBtn}>
                <Ionicons name="play" size={16} color="#AF2800" style={{ marginRight: 6 }} />
                <Text style={styles.featuredAttemptText}>Attempt Live Mock</Text>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Exam Category Filter Chips */}
        <View style={styles.chipSection}>
          <Text style={styles.sectionHeading}>TARGET EXAM</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipScroll}
          >
            {EXAM_CHIPS.map((chip) => {
              const isSelected = selectedExam === chip;
              return (
                <TouchableOpacity
                  key={chip}
                  onPress={() => setSelectedExam(chip)}
                  activeOpacity={0.7}
                  style={[styles.chip, isSelected && styles.chipActive]}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                    {chip}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Tests List Header */}
        <View style={styles.listHeaderRow}>
          <Text style={styles.sectionHeading}>AVAILABLE TESTS ({filteredTests.length})</Text>
        </View>

        {/* Tests Cards */}
        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.accent.primary} style={{ marginVertical: 30 }} />
        ) : filteredTests.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No tests found for {selectedExam}</Text>
            <Text style={styles.emptySubtitle}>Try selecting 'ALL' to see all public exams.</Text>
          </View>
        ) : (
          filteredTests.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.testCard}
              activeOpacity={0.9}
              onPress={() => handleStartTest(item)}
            >
              <View style={styles.testHeaderRow}>
                <View style={styles.examTag}>
                  <Text style={styles.examTagText}>{item.exam_category || 'General'}</Text>
                </View>
                <Text style={styles.testMarks}>
                  ⏱️ {item.duration_minutes || 60}m • 🎯 {item.total_marks || 100} M
                </Text>
              </View>

              <Text style={styles.testTitle}>{item.title}</Text>
              <Text style={styles.testDescription} numberOfLines={2}>
                {item.description || 'High-yield practice test with instant scorecard and analytics.'}
              </Text>

              <View style={styles.testFooterRow}>
                <View style={styles.testMetaPill}>
                  <Ionicons name="help-circle-outline" size={14} color="#6B7280" />
                  <Text style={styles.testMetaText}>{item.questions_count || 50} Qs</Text>
                </View>

                <TouchableOpacity
                  style={styles.startBtn}
                  onPress={() => handleStartTest(item)}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={['#AF2800', '#D9480F']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.startGradient}
                  >
                    <Ionicons name="play" size={14} color="#FFFFFF" style={{ marginRight: 5 }} />
                    <Text style={styles.startBtnText}>Start Test</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <PublicHeaderProfileModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
        profile={profile}
        onProfileUpdated={loadData}
      />
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
  profileAvatarBtn: {
    marginRight: 12,
  },
  avatarPill: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFE2DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    color: '#AF2800',
    fontSize: 16,
    fontWeight: '800',
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
  badgeOpenAccess: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFE2DB',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  badgeOpenAccessText: {
    fontSize: 11,
    color: '#AF2800',
    fontWeight: '800',
  },
  scrollBody: {
    padding: 16,
    paddingBottom: 40,
  },

  // Featured Live Card
  featuredCard: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 20,
    ...Shadows.md,
  },
  featuredGradient: {
    padding: 18,
  },
  featuredBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  liveIndicatorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FFFFFF',
  },
  liveText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  featuredMarks: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  featuredTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
    marginBottom: 6,
  },
  featuredSubtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 16,
  },
  featuredBtnRow: {
    flexDirection: 'row',
  },
  featuredAttemptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
  },
  featuredAttemptText: {
    color: '#AF2800',
    fontSize: 13,
    fontWeight: '800',
  },

  // Chips
  chipSection: {
    marginBottom: 18,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  chipScroll: {
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipActive: {
    backgroundColor: '#FFE2DB',
    borderColor: '#AF2800',
  },
  chipText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#AF2800',
    fontWeight: '800',
  },

  listHeaderRow: {
    marginBottom: 10,
  },

  // Test Cards
  testCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Shadows.sm,
  },
  testHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  examTag: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  examTagText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#374151',
  },
  testMarks: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
  },
  testTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
    lineHeight: 20,
  },
  testDescription: {
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 16,
    marginBottom: 14,
  },
  testFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  testMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  testMetaText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  startBtn: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  startGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  startBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#374151',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
});

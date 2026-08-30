import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import PagerView from 'react-native-pager-view';
import { Colors, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { usePublicTabStore } from '@/stores/usePublicTabStore';
import PublicHeaderProfileModal from '@/components/PublicHeaderProfileModal';
import PublicLeaderboardScreen from './public-leaderboard';
import PublicFeedScreen from './public-feed';
import { getCategoryForExam, EXAM_TAXONOMY } from '@/constants/examCategories';
import {
  cacheTestForOffline,
  cacheAllPublicTestsLocally,
  getCachedPublicTests,
  syncOfflineResultsToSupabase,
} from '@/lib/offlineTestStorage';

const PYQ_MASTER_TESTS: any[] = require('../../Test Engine/From Repository/all_100_pyq_tests.json');

function PublicTestsTab() {
  const router = useRouter();
  const { user, studentData } = useAuthStore();
  const [profile, setProfile] = useState<any>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);

  const [selectedExam, setSelectedExam] = useState<string>('ALL');
  const [testsList, setTestsList] = useState<any[]>(PYQ_MASTER_TESTS);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      if (testsList.length === 0) {
        setIsLoading(true);
      }
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
          if (prof) {
            setProfile(prof);
          }
        }
      }

      // Sync pending offline test submissions when connection is active
      syncOfflineResultsToSupabase().catch(() => {});

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
        // Cache tests locally for 100% offline attempt
        cacheAllPublicTestsLocally(pubTests);
      } else {
        const cachedOffline = await getCachedPublicTests();
        if (cachedOffline && cachedOffline.length > 0) {
          setTestsList(cachedOffline);
        } else {
          setTestsList(PYQ_MASTER_TESTS);
        }
      }
    } catch (e) {
      console.log('[PublicTests] Using local offline test cache / fallback:', e);
      const cachedOffline = await getCachedPublicTests();
      if (cachedOffline && cachedOffline.length > 0) {
        setTestsList(cachedOffline);
      } else {
        setTestsList(PYQ_MASTER_TESTS);
      }
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const userTargetExam = profile?.target_exam || studentData?.target_exam || 'MPPSC';
  const userCategory = getCategoryForExam(userTargetExam);

  // Dynamic chips derived from Category Taxonomy & Available Tests
  const dynamicChips = useMemo(() => {
    const taxonomy = EXAM_TAXONOMY[userCategory];
    if (taxonomy && taxonomy.exams && taxonomy.exams.length > 0) {
      return taxonomy.exams;
    }
    const uniqueCategories = Array.from(
      new Set(testsList.map((t) => t.exam_category).filter(Boolean))
    );
    return ['ALL', ...uniqueCategories];
  }, [userCategory, testsList]);

  // Featured test picked strictly from testsList matching user target or stream
  const featuredMock = useMemo(() => {
    if (!testsList || testsList.length === 0) return null;
    const exactMatch = testsList.find((t) =>
      (t.exam_category || '').toLowerCase().includes(userTargetExam.toLowerCase()) ||
      userTargetExam.toLowerCase().includes((t.exam_category || '').toLowerCase())
    );
    if (exactMatch) return exactMatch;

    const catMatch = testsList.find((t) =>
      getCategoryForExam(t.exam_category) === userCategory
    );
    if (catMatch) return catMatch;

    return testsList[0] || null;
  }, [testsList, userTargetExam, userCategory]);

  const handleStartTest = async (item: any) => {
    if (!item || !item.id) return;
    await cacheTestForOffline(item.id, item);
    router.push({ pathname: '/(student)/test/engine/[id]', params: { id: item.id } });
  };

  const filteredTests = useMemo(() => {
    if (!testsList || testsList.length === 0) return [];
    if (selectedExam === 'ALL') {
      const categoryTests = testsList.filter((t) => getCategoryForExam(t.exam_category) === userCategory);
      return categoryTests.length > 0 ? categoryTests : testsList;
    }
    return testsList.filter((t) =>
      (t.exam_category || '').toLowerCase().includes(selectedExam.toLowerCase()) ||
      (t.title || '').toLowerCase().includes(selectedExam.toLowerCase()) ||
      selectedExam.toLowerCase().includes((t.exam_category || '').toLowerCase())
    );
  }, [testsList, selectedExam, userCategory]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={{ flex: 1 }}>
        {/* Top Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.profileAvatarBtn}
            onPress={() => router.push('/(student)/profile')}
            activeOpacity={0.8}
          >
            <View style={styles.avatarPill}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarLetter}>
                  {profile?.name ? profile.name.charAt(0).toUpperCase() : 'P'}
                </Text>
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerTitleWrap}
            activeOpacity={0.7}
            onPress={() => setProfileModalVisible(true)}
          >
            <Text style={styles.headerTitle}>Public Test Hub</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.headerSubtitle}>
                Target: <Text style={{ color: '#AF2800', fontWeight: '800' }}>{userTargetExam}</Text>
              </Text>
              <Ionicons name="chevron-down-circle" size={13} color="#AF2800" />
            </View>
          </TouchableOpacity>

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
          {/* Featured Live Test Banner Tailored for Target Exam */}
          {featuredMock && (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => handleStartTest(featuredMock)}
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
                    <Text style={styles.liveText}>{featuredMock.exam_category?.toUpperCase() || 'OFFICIAL'} FEATURED MOCK</Text>
                  </View>
                  <Text style={styles.featuredMarks}>
                    🎯 {featuredMock.total_marks || 200} Marks • {featuredMock.duration_minutes || 120} Mins
                  </Text>
                </View>

                <Text style={styles.featuredTitle}>{featuredMock.title}</Text>
                <Text style={styles.featuredSubtitle} numberOfLines={2}>
                  {featuredMock.description || 'Complete official mock test with bilingual questions and instant scorecard.'}
                </Text>

                <View style={styles.featuredBtnRow}>
                  <View style={styles.featuredAttemptBtn}>
                    <Ionicons name="play" size={16} color="#AF2800" style={{ marginRight: 6 }} />
                    <Text style={styles.featuredAttemptText}>Attempt Mock Test</Text>
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {/* Exam Category Filter Chips Tailored for Active Tests */}
          <View style={styles.chipSection}>
            <Text style={styles.sectionHeading}>EXAM STREAMS ({dynamicChips.length - 1})</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipScroll}
            >
              {dynamicChips.map((chip) => {
                const isSelected = selectedExam === chip;
                const isUserGoal = chip === userTargetExam && chip !== 'ALL';
                return (
                  <TouchableOpacity
                    key={chip}
                    onPress={() => setSelectedExam(chip)}
                    activeOpacity={0.7}
                    style={[styles.chip, isSelected && styles.chipActive, isUserGoal && styles.chipGoal]}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextActive, isUserGoal && styles.chipTextGoal]}>
                      {chip}{isUserGoal ? ' ★' : ''}
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
              <TouchableOpacity
                style={styles.resetFilterBtn}
                onPress={() => setSelectedExam('ALL')}
                activeOpacity={0.8}
              >
                <Text style={styles.resetFilterText}>Show All Tests</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredTests.map((item, index) => (
              <TouchableOpacity
                key={item?.id || `pub-test-${index}`}
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
                    <Text style={styles.testMetaText}>{item.questions_count || (item.questions ? item.questions.length : 20)} Qs</Text>
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
          onSaved={loadData}
        />
      </View>
    </SafeAreaView>
  );
}

export default function PublicTestsScreen() {
  const pagerRef = useRef<PagerView>(null);
  const { targetPage, setTargetPage } = usePublicTabStore();
  const { setActiveTab } = usePublicTabStore();
  const activeTabRef = useRef(0);

  // Sync PagerView when tab is tapped in bottom navigation bar
  useEffect(() => {
    if (targetPage !== null && targetPage !== undefined) {
      pagerRef.current?.setPage(targetPage);
      setTargetPage(null);
    }
  }, [targetPage, setTargetPage]);

  // Real-time finger drag tracking with native 60fps physics
  const handlePageSelected = useCallback(
    (e: any) => {
      const pos = e.nativeEvent.position;
      if (pos >= 0 && pos <= 2) {
        activeTabRef.current = pos;
        setActiveTab(pos);
      }
    },
    [setActiveTab]
  );

  return (
    <PagerView
      ref={pagerRef}
      style={{ flex: 1 }}
      initialPage={0}
      onPageSelected={handlePageSelected}
    >
      <View key="0" style={{ flex: 1 }}>
        <PublicTestsTab />
      </View>
      <View key="1" style={{ flex: 1 }}>
        <PublicLeaderboardScreen />
      </View>
      <View key="2" style={{ flex: 1 }}>
        <PublicFeedScreen />
      </View>
    </PagerView>
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
    overflow: 'hidden',
  },
  avatarImage: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarLetter: {
    fontSize: 16,
    fontWeight: '800',
    color: '#AF2800',
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 1,
  },
  badgeOpenAccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFE2DB',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeOpenAccessText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#AF2800',
  },
  scrollBody: {
    padding: 16,
    paddingBottom: 40,
  },
  featuredCard: {
    marginBottom: 20,
    borderRadius: 18,
    overflow: 'hidden',
    ...Shadows.md,
  },
  featuredGradient: {
    padding: 18,
  },
  featuredBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  liveIndicatorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ADE80',
  },
  liveText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  featuredMarks: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '700',
  },
  featuredTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
    lineHeight: 22,
  },
  featuredSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 14,
  },
  featuredBtnRow: {
    flexDirection: 'row',
  },
  featuredAttemptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    ...Shadows.sm,
  },
  featuredAttemptText: {
    color: '#AF2800',
    fontSize: 12,
    fontWeight: '800',
  },

  chipSection: {
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  chipScroll: {
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipActive: {
    backgroundColor: '#FFE2DB',
    borderColor: '#AF2800',
  },
  chipGoal: {
    borderColor: '#AF2800',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  chipTextActive: {
    color: '#AF2800',
    fontWeight: '800',
  },
  chipTextGoal: {
    color: '#AF2800',
  },

  listHeaderRow: {
    marginBottom: 10,
  },

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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  examTag: {
    backgroundColor: '#FFE2DB',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  examTagText: {
    color: '#AF2800',
    fontSize: 10,
    fontWeight: '800',
  },
  testMarks: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
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
    color: '#6B7280',
    lineHeight: 17,
    marginBottom: 12,
  },
  testFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  testMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  testMetaText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
  },
  startBtn: {
    borderRadius: 10,
    overflow: 'hidden',
    ...Shadows.sm,
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
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginTop: 12,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  resetFilterBtn: {
    backgroundColor: '#AF2800',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  resetFilterText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});

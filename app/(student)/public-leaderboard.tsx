import React, { useState, useEffect, useCallback } from 'react';
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
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { EXAM_TAXONOMY, getCategoryForExam } from '@/constants/examCategories';

export default function PublicLeaderboardScreen() {
  const router = useRouter();
  const { user, studentData } = useAuthStore();
  const [profile, setProfile] = useState<any>(null);

  const initialExam = studentData?.target_exam || user?.user_metadata?.target_exam || 'MPPSC';
  const [userTargetExam, setUserTargetExam] = useState<string>(initialExam);
  const [selectedExam, setSelectedExam] = useState<string>('ALL');
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const categoryKey = getCategoryForExam(userTargetExam);
  const categoryConfig = EXAM_TAXONOMY[categoryKey] || EXAM_TAXONOMY.Government;

  // Load cached exam & cached leaderboard data on mount
  useEffect(() => {
    AsyncStorage.getItem('@student_target_exam').then((stored) => {
      if (stored && stored !== userTargetExam) {
        setUserTargetExam(stored);
      }
    });
    AsyncStorage.getItem('@student_leaderboard_data').then((cached) => {
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setLeaderboardData(parsed);
          }
        } catch {}
      }
    });
  }, []);

  const fetchLeaderboard = useCallback(async () => {
    try {
      if (leaderboardData.length === 0) {
        setIsLoading(true);
      }
      // Refresh user profile to verify target_exam
      let currentExam = userTargetExam;
      if (user?.id) {
        const { data: pub } = await supabase.from('public_students').select('*').eq('user_id', user.id).maybeSingle();
        if (pub?.target_exam) {
          currentExam = pub.target_exam;
          setUserTargetExam(pub.target_exam);
          setProfile(pub);
          await AsyncStorage.setItem('@student_target_exam', pub.target_exam);
        } else {
          const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
          if (prof?.target_exam) {
            currentExam = prof.target_exam;
            setUserTargetExam(prof.target_exam);
            setProfile(prof);
            await AsyncStorage.setItem('@student_target_exam', prof.target_exam);
          }
        }
      }

      // Query real public_test_submissions
      const { data: pubSubs, error } = await supabase
        .from('public_test_submissions')
        .select('*')
        .order('score', { ascending: false })
        .limit(50);

      if (error || !pubSubs || pubSubs.length === 0) {
        setLeaderboardData([]);
        await AsyncStorage.removeItem('@student_leaderboard_data');
      } else {
        const formatted = pubSubs.map((item: any, idx: number) => ({
          id: item.id || `rank-${idx}`,
          rank: idx + 1,
          name: item.student_name || item.name || 'Aspirant',
          target_exam: item.target_exam || item.exam_category || currentExam,
          score: Math.round(item.score || 0),
          accuracy: item.accuracy ? (String(item.accuracy).includes('%') ? item.accuracy : `${item.accuracy}%`) : '100%',
          state: item.state || 'Madhya Pradesh',
          city: item.city || '',
          avatar_url: item.avatar_url || null,
        }));
        setLeaderboardData(formatted);
        await AsyncStorage.setItem('@student_leaderboard_data', JSON.stringify(formatted));
      }
    } catch (e) {
      console.log('[Leaderboard] Fetch error:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, userTargetExam]);

  useFocusEffect(
    useCallback(() => {
      fetchLeaderboard();
    }, [fetchLeaderboard])
  );

  // Dynamic filter tabs: based on available categories in submissions or categoryConfig
  const availableExams = Array.from(
    new Set([
      'ALL',
      userTargetExam,
      ...leaderboardData.map((d) => d.target_exam),
      ...categoryConfig.exams,
    ])
  ).filter(Boolean);

  const filteredData = selectedExam === 'ALL'
    ? leaderboardData
    : leaderboardData.filter((d) => (d.target_exam || '').toLowerCase().includes(selectedExam.toLowerCase()));

  const hasPodium = filteredData.length >= 3;
  const top1 = hasPodium ? filteredData[0] : null;
  const top2 = hasPodium ? filteredData[1] : null;
  const top3 = hasPodium ? filteredData[2] : null;
  const restList = hasPodium ? filteredData.slice(3) : filteredData;

  const onRefresh = () => {
    setRefreshing(true);
    fetchLeaderboard();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity
              style={styles.profileAvatarBtn}
              onPress={() => router.push('/(student)/profile')}
              activeOpacity={0.7}
            >
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.headerAvatarImg} />
              ) : (
                <View style={styles.avatarPill}>
                  <Text style={styles.avatarPillText}>
                    {(profile?.name || user?.email || 'M').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Text style={styles.headerTitle}>All-India Leaderboard</Text>
              <Text style={styles.headerSubtitle}>
                Target Goal: <Text style={{ color: '#AF2800', fontWeight: '800' }}>{userTargetExam}</Text>
              </Text>
            </View>
          </View>

          {/* Filter Pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabScroll}
          >
            {availableExams.map((ex) => {
              const isSelected = selectedExam === ex;
              const isUserGoal = ex === userTargetExam && ex !== 'ALL';
              return (
                <TouchableOpacity
                  key={ex}
                  style={[styles.tab, isSelected && styles.tabActive]}
                  onPress={() => setSelectedExam(ex)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabText, isSelected && styles.tabTextActive]}>
                    {ex}{isUserGoal ? ' ★' : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
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
          {isLoading ? (
            <ActivityIndicator size="large" color={Colors.accent.primary} style={{ marginVertical: 40 }} />
          ) : filteredData.length === 0 ? (
            /* Clean Empty State when no submissions exist */
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="trophy-outline" size={44} color="#AF2800" />
              </View>
              <Text style={styles.emptyTitle}>No Rankings Yet</Text>
              <Text style={styles.emptySubtitle}>
                Be the first aspirant to complete a mock test for {selectedExam === 'ALL' ? userTargetExam : selectedExam} and claim <Text style={{ fontWeight: '700', color: '#AF2800' }}>Rank #1</Text> on the leaderboard!
              </Text>
              <TouchableOpacity
                style={styles.emptyActionBtn}
                onPress={() => router.replace('/(student)/public-tests')}
                activeOpacity={0.8}
              >
                <Ionicons name="play" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.emptyActionBtnText}>Take a Mock Test</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Top 3 Podium (Shown only when 3 or more real students have submitted) */}
              {hasPodium && (
                <View style={styles.podiumContainer}>
                  {/* Rank 2 (Silver) */}
                  <View style={[styles.podiumColumn, { marginTop: 24 }]}>
                    <View style={[styles.podiumAvatar, styles.silverRing]}>
                      {top2?.avatar_url ? (
                        <Image source={{ uri: top2.avatar_url }} style={styles.podiumAvatarImg} />
                      ) : (
                        <Text style={styles.avatarText}>{top2?.name?.charAt(0) || '2'}</Text>
                      )}
                      <View style={[styles.rankBadgeSmall, { backgroundColor: '#94A3B8' }]}>
                        <Text style={styles.rankBadgeText}>2</Text>
                      </View>
                    </View>
                    <Text style={styles.podiumName} numberOfLines={1}>{top2?.name || 'Aspirant'}</Text>
                    <Text style={styles.podiumScore}>{top2?.score || 0} pts</Text>
                    <View style={[styles.podiumStep, styles.silverStep]}>
                      <Ionicons name="medal" size={20} color="#64748B" />
                    </View>
                  </View>

                  {/* Rank 1 (Gold - Center) */}
                  <View style={styles.podiumColumn}>
                    <View style={[styles.podiumAvatar, styles.goldRing]}>
                      {top1?.avatar_url ? (
                        <Image source={{ uri: top1.avatar_url }} style={styles.podiumAvatarImg} />
                      ) : (
                        <Text style={styles.avatarText}>{top1?.name?.charAt(0) || '1'}</Text>
                      )}
                      <View style={[styles.rankBadgeSmall, { backgroundColor: '#EAB308' }]}>
                        <Ionicons name="trophy" size={10} color="#FFFFFF" />
                      </View>
                    </View>
                    <Text style={styles.podiumName} numberOfLines={1}>{top1?.name || 'Aspirant'}</Text>
                    <Text style={styles.podiumScoreGold}>{top1?.score || 0} pts</Text>
                    <View style={[styles.podiumStep, styles.goldStep]}>
                      <Ionicons name="trophy" size={24} color="#B45309" />
                    </View>
                  </View>

                  {/* Rank 3 (Bronze) */}
                  <View style={[styles.podiumColumn, { marginTop: 32 }]}>
                    <View style={[styles.podiumAvatar, styles.bronzeRing]}>
                      {top3?.avatar_url ? (
                        <Image source={{ uri: top3.avatar_url }} style={styles.podiumAvatarImg} />
                      ) : (
                        <Text style={styles.avatarText}>{top3?.name?.charAt(0) || '3'}</Text>
                      )}
                      <View style={[styles.rankBadgeSmall, { backgroundColor: '#F97316' }]}>
                        <Text style={styles.rankBadgeText}>3</Text>
                      </View>
                    </View>
                    <Text style={styles.podiumName} numberOfLines={1}>{top3?.name || 'Aspirant'}</Text>
                    <Text style={styles.podiumScore}>{top3?.score || 0} pts</Text>
                    <View style={[styles.podiumStep, styles.bronzeStep]}>
                      <Ionicons name="medal" size={20} color="#C2410C" />
                    </View>
                  </View>
                </View>
              )}

              {/* Section Title */}
              <View style={styles.rankListHeader}>
                <Text style={styles.sectionHeading}>
                  {hasPodium ? `ALL RANKINGS (${filteredData.length})` : `RANKINGS (${filteredData.length})`}
                </Text>
              </View>

              {/* List of ranks */}
              {restList.map((item) => (
                <View key={item.id} style={styles.rankCard}>
                  <View style={styles.rankNumCircle}>
                    <Text style={styles.rankNumText}>{item.rank}</Text>
                  </View>

                  {/* Profile Image */}
                  <View style={styles.rankAvatarContainer}>
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={styles.rankAvatarImg} />
                    ) : (
                      <View style={styles.rankAvatarInitial}>
                        <Text style={styles.rankAvatarInitialText}>{item.name.charAt(0)}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.rankInfoWrap}>
                    <Text style={styles.rankName}>{item.name}</Text>
                    <View style={styles.metaRow}>
                      <Text style={styles.examTagBadge}>{item.target_exam}</Text>
                      {item.state ? (
                        <Text style={styles.stateText}>• {item.city ? `${item.city}, ` : ''}{item.state}</Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.scoreWrap}>
                    <Text style={styles.scoreText}>{item.score} pts</Text>
                    <Text style={styles.accuracyText}>{item.accuracy} acc</Text>
                  </View>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileAvatarBtn: {
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPill: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFE2DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: '#AF2800',
  },
  avatarPillText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#AF2800',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: 0.2,
    lineHeight: 21,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#4B5563',
    fontWeight: '500',
    marginTop: 2,
    lineHeight: 15,
    marginBottom: 0,
  },
  tabScroll: {
    gap: 8,
    paddingBottom: 4,
  },
  tab: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tabActive: {
    backgroundColor: '#FFE2DB',
    borderColor: '#AF2800',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  tabTextActive: {
    color: '#AF2800',
    fontWeight: '800',
  },

  scrollBody: {
    padding: 16,
    paddingBottom: 40,
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    paddingHorizontal: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 10,
    ...Shadows.sm,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFE2DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#AF2800',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    ...Shadows.sm,
  },
  emptyActionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // Podium
  podiumContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
    ...Shadows.sm,
  },
  podiumColumn: {
    flex: 1,
    alignItems: 'center',
  },
  podiumAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginBottom: 6,
  },
  goldRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2.5,
    borderColor: '#EAB308',
    backgroundColor: '#FEF9C3',
  },
  silverRing: {
    borderWidth: 2,
    borderColor: '#94A3B8',
    backgroundColor: '#F1F5F9',
  },
  bronzeRing: {
    borderWidth: 2,
    borderColor: '#F97316',
    backgroundColor: '#FFEDD5',
  },
  podiumAvatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 29,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4B5563',
  },
  rankBadgeSmall: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  rankBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  podiumName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F2937',
    maxWidth: 80,
    textAlign: 'center',
    marginBottom: 2,
  },
  podiumScore: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
  },
  podiumScoreGold: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
    marginBottom: 8,
  },
  podiumStep: {
    width: '90%',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  goldStep: {
    height: 70,
    backgroundColor: '#FEF08A',
    borderTopWidth: 2,
    borderTopColor: '#EAB308',
  },
  silverStep: {
    height: 50,
    backgroundColor: '#E2E8F0',
    borderTopWidth: 2,
    borderTopColor: '#94A3B8',
  },
  bronzeStep: {
    height: 35,
    backgroundColor: '#FFEDD5',
    borderTopWidth: 2,
    borderTopColor: '#F97316',
  },

  // Rank List
  rankListHeader: {
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.5,
  },
  rankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Shadows.sm,
  },
  rankNumCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  rankNumText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
  },
  rankAvatarContainer: {
    marginRight: 10,
  },
  rankAvatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  rankAvatarInitial: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankAvatarInitialText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4338CA',
  },
  rankInfoWrap: {
    flex: 1,
  },
  rankName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  examTagBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#AF2800',
    backgroundColor: '#FFE2DB',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  stateText: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '500',
  },
  scoreWrap: {
    alignItems: 'flex-end',
    paddingLeft: 6,
  },
  scoreText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  accuracyText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#059669',
    marginTop: 1,
  },
});

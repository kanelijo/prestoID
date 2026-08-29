import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Gradients, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

const EXAM_TABS = ['ALL', 'MPPSC', 'MP Police', 'SSC CGL', 'Banking', 'Railway'];

const SAMPLE_LEADERBOARD = [
  { id: '1', rank: 1, name: 'Ananya Sharma', target_exam: 'MPPSC', score: 192, accuracy: '96%', state: 'Bhopal, MP' },
  { id: '2', rank: 2, name: 'Rohit Verma', target_exam: 'MPPSC', score: 186, accuracy: '93%', state: 'Indore, MP' },
  { id: '3', rank: 3, name: 'Pooja Tiwari', target_exam: 'SSC CGL', score: 182, accuracy: '91%', state: 'Jabalpur, MP' },
  { id: '4', rank: 4, name: 'Vikram Singh', target_exam: 'MP Police', score: 178, accuracy: '89%', state: 'Gwalior, MP' },
  { id: '5', rank: 5, name: 'Deepak Patel', target_exam: 'Railway', score: 174, accuracy: '87%', state: 'Ujjain, MP' },
  { id: '6', rank: 6, name: 'Sneha Mishra', target_exam: 'Banking', score: 170, accuracy: '85%', state: 'Rewa, MP' },
  { id: '7', rank: 7, name: 'Manish Soni', target_exam: 'MPPSC', score: 168, accuracy: '84%', state: 'Sagar, MP' },
];

export default function PublicLeaderboardScreen() {
  const { user } = useAuthStore();
  const [selectedExam, setSelectedExam] = useState('ALL');
  const [leaderboardData, setLeaderboardData] = useState<any[]>(SAMPLE_LEADERBOARD);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    try {
      setIsLoading(true);
      // Try querying public_test_submissions first
      let { data: pubSubs, error } = await supabase
        .from('public_test_submissions')
        .select('*')
        .order('score', { ascending: false })
        .limit(30);

      if (error || !pubSubs || pubSubs.length === 0) {
        // Fallback to test_submissions or sample data
        const { data: generalSubs } = await supabase
          .from('test_submissions')
          .select('*, students(name, state)')
          .order('score', { ascending: false })
          .limit(30);

        if (generalSubs && generalSubs.length > 0) {
          pubSubs = generalSubs.map((sub: any, idx: number) => ({
            id: sub.id,
            rank: idx + 1,
            name: sub.students?.name || 'Public Aspirant',
            target_exam: 'MPPSC',
            score: Math.round(sub.score || 0),
            accuracy: `${Math.round(sub.accuracy_percentage || 85)}%`,
            state: sub.students?.state || 'Madhya Pradesh',
          }));
        }
      }

      if (pubSubs && pubSubs.length > 0) {
        const formatted = pubSubs.map((item: any, idx: number) => ({
          id: item.id || `rank-${idx}`,
          rank: idx + 1,
          name: item.student_name || item.name || 'Public Aspirant',
          target_exam: item.target_exam || 'MPPSC',
          score: Math.round(item.score || 0),
          accuracy: item.accuracy ? `${item.accuracy}%` : '90%',
          state: item.state || 'Madhya Pradesh',
        }));
        setLeaderboardData(formatted);
      } else {
        setLeaderboardData(SAMPLE_LEADERBOARD);
      }
    } catch (e) {
      console.log('[Leaderboard] Using fallback:', e);
      setLeaderboardData(SAMPLE_LEADERBOARD);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const filteredData = selectedExam === 'ALL'
    ? leaderboardData
    : leaderboardData.filter((d) => d.target_exam?.toLowerCase().includes(selectedExam.toLowerCase()));

  const top1 = filteredData[0] || SAMPLE_LEADERBOARD[0];
  const top2 = filteredData[1] || SAMPLE_LEADERBOARD[1];
  const top3 = filteredData[2] || SAMPLE_LEADERBOARD[2];
  const restList = filteredData.slice(3);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLeaderboard();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>All-India Leaderboard</Text>
          <Text style={styles.headerSubtitle}>Live competitive rankings across aspirants</Text>
        </View>

        {/* Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScroll}
        >
          {EXAM_TABS.map((ex) => {
            const isSelected = selectedExam === ex;
            return (
              <TouchableOpacity
                key={ex}
                style={[styles.tab, isSelected && styles.tabActive]}
                onPress={() => setSelectedExam(ex)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, isSelected && styles.tabTextActive]}>
                  {ex}
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
        {/* Top 3 Podium */}
        <View style={styles.podiumContainer}>
          {/* Rank 2 (Silver) */}
          <View style={[styles.podiumColumn, { marginTop: 24 }]}>
            <View style={[styles.podiumAvatar, styles.silverRing]}>
              <Text style={styles.avatarText}>{top2?.name?.charAt(0) || '2'}</Text>
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
              <Text style={styles.avatarText}>{top1?.name?.charAt(0) || '1'}</Text>
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
              <Text style={styles.avatarText}>{top3?.name?.charAt(0) || '3'}</Text>
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

        {/* Section Title */}
        <View style={styles.rankListHeader}>
          <Text style={styles.sectionHeading}>RANKINGS ({filteredData.length})</Text>
        </View>

        {/* List of remaining ranks */}
        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.accent.primary} style={{ marginVertical: 30 }} />
        ) : restList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No rankings found for this category yet.</Text>
          </View>
        ) : (
          restList.map((item) => (
            <View key={item.id} style={styles.rankCard}>
              <View style={styles.rankNumCircle}>
                <Text style={styles.rankNumText}>{item.rank}</Text>
              </View>

              <View style={styles.rankInfoWrap}>
                <Text style={styles.rankName}>{item.name}</Text>
                <View style={styles.metaRow}>
                  <Text style={styles.examTagBadge}>{item.target_exam}</Text>
                  <Text style={styles.stateText}>• {item.state}</Text>
                </View>
              </View>

              <View style={styles.scoreWrap}>
                <Text style={styles.scoreText}>{item.score} pts</Text>
                <Text style={styles.accuracyText}>{item.accuracy} acc</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
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
    marginTop: 2,
    marginBottom: 12,
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
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  rankBadgeSmall: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankBadgeText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  podiumName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
    maxWidth: 90,
    textAlign: 'center',
    marginBottom: 2,
  },
  podiumScore: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
    marginBottom: 8,
  },
  podiumScoreGold: {
    fontSize: 12,
    color: '#AF2800',
    fontWeight: '800',
    marginBottom: 8,
  },
  podiumStep: {
    width: '85%',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  goldStep: {
    height: 52,
    backgroundColor: '#FEF08A',
  },
  silverStep: {
    height: 38,
    backgroundColor: '#E2E8F0',
  },
  bronzeStep: {
    height: 28,
    backgroundColor: '#FED7AA',
  },

  rankListHeader: {
    marginBottom: 10,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.8,
  },

  // Rank Cards
  rankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  rankNumCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankNumText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#374151',
  },
  rankInfoWrap: {
    flex: 1,
  },
  rankName: {
    fontSize: 14,
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
    color: '#AF2800',
    fontWeight: '700',
  },
  stateText: {
    fontSize: 10,
    color: '#6B7280',
  },
  scoreWrap: {
    alignItems: 'flex-end',
  },
  scoreText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  accuracyText: {
    fontSize: 10,
    color: '#16A34A',
    fontWeight: '600',
  },

  emptyContainer: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
});

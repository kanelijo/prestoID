import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Image, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

export default function StudentLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'live' | 'local'>('live');
  const user = useAuthStore((state) => state.user);

  useFocusEffect(
    useCallback(() => {
      fetchLeaderboard();
    }, [activeTab])
  );

  const fetchLeaderboard = async () => {
    try {
      const { data, error } = await supabase.rpc('get_leaderboard', { p_mode: activeTab });
      if (error || !data || data.length === 0) {
        // Fallback: Query test_submissions directly if RPC returns empty
        const { data: subs } = await supabase
          .from('test_submissions')
          .select('id, score, student_id, students(id, name, photo_url), tests(id, description)');
        
        if (subs && subs.length > 0) {
          const map: Record<string, { student_id: string; student_name: string; avatar_url: string; total_score: number; tests_taken: number }> = {};
          subs.forEach((s: any) => {
            const isAi = s.tests?.description && s.tests.description.startsWith('AI_Practice_Test:');
            if ((activeTab === 'local' && isAi) || (activeTab === 'live' && !isAi)) {
              const stId = s.students?.id || s.student_id;
              if (!stId) return;
              if (!map[stId]) {
                map[stId] = {
                  student_id: stId,
                  student_name: s.students?.name || 'Student',
                  avatar_url: s.students?.photo_url || '',
                  total_score: 0,
                  tests_taken: 0,
                };
              }
              map[stId].total_score += (Number(s.score) || 0) + 1; // 1 pt per test + score
              map[stId].tests_taken += 1;
            }
          });

          const fallbackList = Object.values(map).sort((a, b) => b.total_score - a.total_score || b.tests_taken - a.tests_taken);
          setLeaderboard(fallbackList);
          return;
        }
      }
      setLeaderboard(data || []);
    } catch (err) {
      console.error('Leaderboard error', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchLeaderboard();
  };

  const renderItem = ({ item, index }: { item: any, index: number }) => {
    const isMe = item.student_name === user?.full_name; // basic check, ideally use ID

    return (
      <View style={[styles.card, isMe && styles.cardActive]}>
        <View style={styles.rankContainer}>
          <Text style={[styles.rankText, isMe && { color: Colors.accent.primary }]}>#{index + 1}</Text>
        </View>
        <Image 
          source={{ uri: item.avatar_url || 'https://via.placeholder.com/150' }} 
          style={styles.avatar} 
        />
        <View style={styles.info}>
          <Text style={[styles.name, isMe && { color: Colors.accent.primary }]}>{item.student_name} {isMe ? '(You)' : ''}</Text>
          <Text style={styles.stats}>{item.tests_taken} Tests Taken</Text>
        </View>
        <View style={styles.scoreContainer}>
          <Text style={[styles.score, isMe && { color: Colors.accent.primary }]}>{item.total_score}</Text>
          <Text style={styles.scoreLabel}>PTS</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Global Ranking</Text>
        <Text style={styles.headerSubtitle}>See where you stand among your peers</Text>
      </View>
      
      <View style={styles.viewToggleContainer}>
        <TouchableOpacity 
          style={[styles.viewToggleBtn, activeTab === 'live' && styles.viewToggleBtnActive]} 
          onPress={() => setActiveTab('live')}
        >
          <Text style={[styles.viewToggleText, activeTab === 'live' && styles.viewToggleTextActive]}>Live Exams</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.viewToggleBtn, activeTab === 'local' && styles.viewToggleBtnActive]} 
          onPress={() => setActiveTab('local')}
        >
          <Text style={[styles.viewToggleText, activeTab === 'local' && styles.viewToggleTextActive]}>Local Exams</Text>
        </TouchableOpacity>
      </View>
      
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.accent.primary} />
        </View>
      ) : (
        <FlatList
          data={leaderboard}
          keyExtractor={(item) => item.student_id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[Colors.accent.primary]} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          ListEmptyComponent={() => (
            <View style={styles.center}>
              <Text style={{ color: Colors.text.secondary }}>No rankings available yet.</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  header: { 
    padding: 20, 
    backgroundColor: Colors.bg.secondary, 
    borderBottomWidth: 1, 
    borderBottomColor: Colors.card?.border || '#E5E5E5'
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: Colors.text.primary },
  headerSubtitle: { fontSize: 14, color: Colors.text.secondary, marginTop: 4 },
  viewToggleContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.bg.secondary,
    padding: 4,
    borderRadius: 12,
    marginBottom: 16,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.card?.border || '#E5E5E5',
  },
  viewToggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  viewToggleBtnActive: {
    backgroundColor: Colors.accent.primary,
  },
  viewToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  viewToggleTextActive: {
    color: '#FFFFFF',
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 40 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.card?.border || '#E5E5E5'
  },
  cardActive: {
    borderColor: Colors.accent.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.05)'
  },
  rankContainer: {
    width: 40,
    alignItems: 'center'
  },
  rankText: { fontSize: 18, fontWeight: '800', color: Colors.text.tertiary },
  avatar: { width: 48, height: 48, borderRadius: 24, marginHorizontal: 12 },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: Colors.text.primary, marginBottom: 2 },
  stats: { fontSize: 12, color: Colors.text.secondary },
  scoreContainer: { alignItems: 'flex-end' },
  score: { fontSize: 20, fontWeight: '900', color: Colors.text.primary },
  scoreLabel: { fontSize: 10, fontWeight: '700', color: Colors.text.tertiary }
});

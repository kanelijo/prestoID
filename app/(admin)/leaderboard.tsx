import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';

export default function AdminLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const { data, error } = await supabase.rpc('get_leaderboard');
      if (error) throw error;
      setLeaderboard(data || []);
    } catch (err) {
      console.error('Leaderboard error', err);
    } finally {
      setIsLoading(false);
    }
  };

  const renderItem = ({ item, index }: { item: any, index: number }) => (
    <View style={styles.card}>
      <View style={styles.rankContainer}>
        <Text style={styles.rankText}>#{index + 1}</Text>
      </View>
      <Image 
        source={{ uri: item.avatar_url || 'https://via.placeholder.com/150' }} 
        style={styles.avatar} 
      />
      <View style={styles.info}>
        <Text style={styles.name}>{item.student_name}</Text>
        <Text style={styles.stats}>{item.tests_taken} Tests Taken</Text>
      </View>
      <View style={styles.scoreContainer}>
        <Text style={styles.score}>{item.total_score}</Text>
        <Text style={styles.scoreLabel}>PTS</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Institute Rankings</Text>
        <Text style={styles.headerSubtitle}>Master List</Text>
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
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          ListEmptyComponent={() => (
            <View style={styles.center}>
              <Text style={{ color: Colors.text.secondary }}>No test submissions yet.</Text>
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
  score: { fontSize: 20, fontWeight: '900', color: Colors.accent.primary },
  scoreLabel: { fontSize: 10, fontWeight: '700', color: Colors.text.tertiary }
});

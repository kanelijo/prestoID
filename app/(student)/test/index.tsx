import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

import { useNotificationStore } from '@/stores/useNotificationStore';

export default function StudentTestScreen() {
  const router = useRouter();
  const { verified, user } = useAuthStore();
  const { fetchStudentPendingTestCount } = useNotificationStore();
  const activeStudentId = user?.id;
  
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  const [pendingTests, setPendingTests] = useState<any[]>([]);
  const [completedTests, setCompletedTests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchTests = async (silent = false) => {
    if (!silent) setIsLoading(true);
    if (!verified || !activeStudentId) {
      setPendingTests([]);
      setCompletedTests([]);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    try {
      // Get student details to match batch
      const { data: studentsList, error: stErr } = await supabase
        .from('students')
        .select('id, batch_name, business_id')
        .eq('user_id', activeStudentId)
        .limit(1);
        
      if (stErr) throw stErr;
      if (!studentsList || studentsList.length === 0) throw new Error("Student not found");
      
      const student = studentsList[0];

      // Get ALL published tests for this institute
      const { data: allTests, error: testErr } = await supabase
        .from('tests')
        .select('*')
        .eq('business_id', student.business_id)
        .eq('status', 'published')
        .neq('is_deleted', true)
        .order('created_at', { ascending: false });

      if (testErr) throw testErr;

      // Filter by batch match (tests that match the student's batch, or are set to null / 'All')
      const applicableTests = (allTests || []).filter((t: any) => {
        if (!t.batch_name || t.batch_name === 'All') return true;
        const testBatch = Array.isArray(t.batch_name) ? t.batch_name[0] : String(t.batch_name);
        return testBatch.toLowerCase().trim() === String(student.batch_name || '').toLowerCase().trim();
      });

      // Get submissions to see what is already taken
      const { data: submissions, error: subErr } = await supabase
        .from('test_submissions')
        .select('*, tests(*)')
        .eq('student_id', student.id);

      // If tests(*) fails due to FK issues, just fetch submissions normally
      let safeSubmissions = submissions;
      if (subErr) {
        console.warn('Submissions fetch with tests(*) failed, trying fallback:', subErr);
        const { data: fallbackSubs, error: fbErr } = await supabase
          .from('test_submissions')
          .select('*')
          .eq('student_id', student.id);
        if (fbErr) throw fbErr;
        safeSubmissions = fallbackSubs;
      }

      const takenTestIds = new Set((safeSubmissions || []).map((s: any) => s.test_id));
      
      const pending = applicableTests.filter((t: any) => !takenTestIds.has(t.id));
      
      setPendingTests(pending);
      setCompletedTests(safeSubmissions || []);
    } catch (err) {
      console.warn(err);
      setPendingTests([]);
      setCompletedTests([]);
    } finally {
      if (!silent) setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchTests();
      if (activeStudentId) {
        fetchStudentPendingTestCount(activeStudentId);
      }
    }, [verified, activeStudentId])
  );

  // Fallback for initial boot when auth state resolves while already focused
  useEffect(() => {
    if (verified && activeStudentId) {
      fetchTests(true);
    }
  }, [verified, activeStudentId]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await fetchTests(true);
  };

  const renderPending = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.testCard}
      activeOpacity={0.8}
      onPress={() => router.push(`/(student)/test/engine/${item.id}`)}
    >
      <View style={styles.cardHeader}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>PENDING</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.text.tertiary} />
      </View>
      <Text style={styles.testTitle}>{item.title}</Text>
      
      <View style={styles.cardFooter}>
        <View style={styles.footerItem}>
          <Ionicons name="time-outline" size={16} color={Colors.text.secondary} />
          <Text style={styles.footerText}>{item.duration_minutes} mins</Text>
        </View>
        <View style={styles.footerItem}>
          <Ionicons name="calendar-outline" size={16} color={Colors.text.secondary} />
          <Text style={styles.footerText}>
            {item.scheduled_at ? new Date(item.scheduled_at).toLocaleDateString() : 'Available Now'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderCompleted = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={[styles.testCard, { borderColor: Colors.card.border }]}
      activeOpacity={0.8}
      onPress={() => router.push(`/(student)/test/result/${item.id}`)}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: Colors.status.success + '15' }]}>
          <Text style={[styles.badgeText, { color: Colors.status.success }]}>COMPLETED</Text>
        </View>
        <Text style={styles.scoreText}>{item.score !== null ? `${item.score}%` : 'Grading'}</Text>
      </View>
      <Text style={styles.testTitle}>{item.tests?.title || 'Unknown Test'}</Text>
      
      <View style={styles.cardFooter}>
        <Text style={styles.footerText}>
          Submitted {new Date(item.submitted_at || item.created_at).toLocaleDateString()}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="analytics-outline" size={13} color={Colors.accent.primary} />
          <Text style={{ fontSize: 11, color: Colors.accent.primary, fontWeight: '700' }}>View Analysis</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.accent.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tests</Text>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'pending' && styles.tabActive]}
          onPress={() => setActiveTab('pending')}
        >
          <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>Pending ({pendingTests.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'completed' && styles.tabActive]}
          onPress={() => setActiveTab('completed')}
        >
          <Text style={[styles.tabText, activeTab === 'completed' && styles.tabTextActive]}>Completed ({completedTests.length})</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={activeTab === 'pending' ? pendingTests : completedTests}
        renderItem={activeTab === 'pending' ? renderPending : renderCompleted}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[Colors.accent.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color={Colors.text.tertiary} />
            <Text style={styles.emptyTitle}>
              {activeTab === 'pending' ? 'No Pending Tests' : 'No Completed Tests'}
            </Text>
            <Text style={styles.emptyDesc}>
              {activeTab === 'pending' ? "You're all caught up! Check back later." : "Take a test to see your results here."}
            </Text>
          </View>
        }
      />
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
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
  },
  tab: {
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.accent.primary,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.tertiary,
  },
  tabTextActive: {
    color: Colors.accent.primary,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  testCard: {
    backgroundColor: Colors.bg.secondary,
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.accent.primary + '30',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  badge: {
    backgroundColor: Colors.accent.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.accent.primary,
  },
  testTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    fontSize: 13,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  scoreText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  emptyState: {
    paddingTop: 80,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 16,
  },
  emptyDesc: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginTop: 8,
  },
});

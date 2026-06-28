import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Shadows, Gradients } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

// Temporary mock data for UI
const MOCK_TESTS = [
  { id: '1', title: 'MPPSC Prelims Mock 1', batch_name: 'MPPSC', duration_minutes: 60, status: 'published', scheduled_at: new Date(Date.now() + 86400000).toISOString(), created_at: new Date().toISOString() },
  { id: '2', title: 'SSC CGL Tier 1', batch_name: 'SSC', duration_minutes: 60, status: 'draft', scheduled_at: null, created_at: new Date(Date.now() - 10000).toISOString() },
  { id: '3', title: 'Weekly Current Affairs', batch_name: 'All', duration_minutes: 30, status: 'completed', scheduled_at: new Date(Date.now() - 86400000).toISOString(), created_at: new Date(Date.now() - 100000).toISOString() },
];

export default function AdminTestScreen() {
  const router = useRouter();
  const { verified, businessId } = useAuthStore();
  const [tests, setTests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchTests = async (silent = false) => {
    if (!silent) setIsLoading(true);
    if (!verified || !businessId) {
      setTests(MOCK_TESTS);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('tests')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTests(data || []);
    } catch (err: any) {
      console.warn('Failed to load tests:', err);
      // Fallback to mock data if table doesn't exist yet
      setTests(MOCK_TESTS);
    } finally {
      if (!silent) setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchTests();
    }, [verified, businessId])
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    await fetchTests(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return Colors.status.info;
      case 'completed': return Colors.status.success;
      case 'draft': return Colors.text.secondary;
      default: return Colors.text.secondary;
    }
  };

  const deleteTest = async (testId: string, title: string) => {
    Alert.alert(
      'Delete Test',
      `Delete "${title}"? This will permanently remove all questions and student submissions.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete questions and submissions first (cascade)
              await supabase.from('test_questions').delete().eq('test_id', testId);
              await supabase.from('test_submissions').delete().eq('test_id', testId);
              const { error } = await supabase.from('tests').delete().eq('id', testId);
              if (error) throw error;
              // Remove from local state immediately
              setTests(prev => prev.filter(t => t.id !== testId));
            } catch (err: any) {
              Alert.alert('Error', 'Failed to delete test. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleLongPress = (item: any) => {
    const options: any[] = [
      { text: 'Cancel', style: 'cancel' },
      {
        text: '🗑️ Delete Test',
        style: 'destructive',
        onPress: () => deleteTest(item.id, item.title),
      },
    ];

    // Extra option for drafts: publish
    if (item.status === 'draft') {
      options.splice(1, 0, {
        text: '🚀 Publish Test',
        onPress: async () => {
          try {
            await supabase.from('tests').update({ status: 'published' }).eq('id', item.id);
            setTests(prev => prev.map(t => t.id === item.id ? { ...t, status: 'published' } : t));
          } catch (err) {
            Alert.alert('Error', 'Failed to publish test.');
          }
        },
      });
    }

    // Extra option for published: mark completed
    if (item.status === 'published') {
      options.splice(1, 0, {
        text: '✅ Mark as Completed',
        onPress: async () => {
          try {
            await supabase.from('tests').update({ status: 'completed' }).eq('id', item.id);
            setTests(prev => prev.map(t => t.id === item.id ? { ...t, status: 'completed' } : t));
          } catch (err) {
            Alert.alert('Error', 'Failed to update test status.');
          }
        },
      });
    }

    Alert.alert(item.title, 'Choose an action', options);
  };

  const renderTest = ({ item }: { item: any }) => {
    const statusColor = getStatusColor(item.status);
    
    return (
      <TouchableOpacity 
        style={styles.testCard}
        activeOpacity={0.7}
        onPress={() => {
          if (item.status === 'draft') {
            router.push(`/(admin)/test/review/${item.id}`);
          } else {
            router.push(`/(admin)/test/analytics/${item.id}`);
          }
        }}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={400}
      >
        <View style={styles.cardHeader}>
          <View style={styles.batchBadge}>
            <Text style={styles.batchText}>{item.batch_name || 'All'}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '15' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{item.status.toUpperCase()}</Text>
          </View>
        </View>
        
        <Text style={styles.testTitle}>{item.title}</Text>
        
        <View style={styles.cardFooter}>
          <View style={styles.footerItem}>
            <Ionicons name="time-outline" size={14} color={Colors.text.tertiary} />
            <Text style={styles.footerText}>{item.duration_minutes} mins</Text>
          </View>
          {item.scheduled_at && (
            <View style={styles.footerItem}>
              <Ionicons name="calendar-outline" size={14} color={Colors.text.tertiary} />
              <Text style={styles.footerText}>
                {new Date(item.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          )}
          {item.status !== 'draft' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', gap: 4 }}>
              <Ionicons name="bar-chart-outline" size={13} color={Colors.accent.primary} />
              <Text style={{ fontSize: 11, color: Colors.accent.primary, fontWeight: '700' }}>View Analytics</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]} edges={['top']}>
        <ActivityIndicator size="large" color={Colors.accent.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>AI Test Engine</Text>
          <Text style={styles.subtitle}>Generate and manage tests</Text>
        </View>
        <TouchableOpacity style={styles.bankButton} onPress={() => router.push('/(admin)/test/banks')}>
          <Ionicons name="library-outline" size={20} color={Colors.accent.primary} />
        </TouchableOpacity>
      </View>

      {!verified && (
        <View style={styles.testModeBanner}>
          <Ionicons name="construct-outline" size={16} color="#FFF" />
          <Text style={styles.testModeText}>Test Mode (Awaiting Verification)</Text>
        </View>
      )}

      {/* Tests List */}
      <FlatList
        data={tests}
        renderItem={renderTest}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[Colors.accent.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color={Colors.text.tertiary} />
            <Text style={styles.emptyTitle}>No Tests Yet</Text>
            <Text style={styles.emptyDesc}>Tap the + button to create an AI-generated test.</Text>
          </View>
        }
      />

      {/* FAB: Create New Test */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => router.push('/(admin)/test/create')}
      >
        <LinearGradient
          colors={Gradients.primary as [string, string]}
          style={styles.fabGradient}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </LinearGradient>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    marginBottom: 10,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.text.secondary,
    marginTop: 4,
    fontWeight: '500',
  },
  bankButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.card.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  testModeBanner: {
    backgroundColor: Colors.status.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    marginHorizontal: 20,
    marginBottom: 16,
    gap: 6,
    ...Shadows.sm,
  },
  testModeText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 12,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  testCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  batchBadge: {
    backgroundColor: Colors.bg.tertiary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  batchText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  testTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    fontSize: 12,
    color: Colors.text.tertiary,
    fontWeight: '500',
  },
  emptyState: {
    paddingTop: 80,
    justifyContent: 'center',
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
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    ...Shadows.lg,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

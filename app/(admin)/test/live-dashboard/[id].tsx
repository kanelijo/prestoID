import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, Alert, Modal, TextInput, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import DateTimePickerBottomSheet from '@/components/DateTimePickerBottomSheet';

export default function LiveDashboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { businessId } = useAuthStore();
  
  const [testDetails, setTestDetails] = useState<any>(null);
  const [activeStudents, setActiveStudents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [completedSubmissions, setCompletedSubmissions] = useState<any[]>([]);

  // Edit Time Modal
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editDate, setEditDate] = useState<Date | null>(null);
  const [isSavingTime, setIsSavingTime] = useState(false);

  const openEditModal = () => {
    setEditDate(testDetails?.start_time ? new Date(testDetails.start_time) : new Date());
    setIsEditModalVisible(true);
  };

  const saveNewTime = async (newDate: Date) => {
    try {
      setIsSavingTime(true);
      const { error } = await supabase
        .from('tests')
        .update({ start_time: newDate.toISOString() })
        .eq('id', id);
      if (error) throw error;
      setTestDetails((prev: any) => ({ ...prev, start_time: newDate.toISOString() }));
      setIsEditModalVisible(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setIsSavingTime(false);
    }
  };

  useEffect(() => {
    fetchTestDetails();

    let isMounted = true;
    const topicName = `public:tests:id=eq.${id}`;

    const setupRealtime = async () => {
      const existing = supabase.getChannels().find(ch => ch.topic === `realtime:${topicName}` || ch.topic === topicName);
      if (existing) {
        await supabase.removeChannel(existing);
      }
      if (!isMounted) return;

      const channel = supabase.channel(topicName);

      channel
        .on('presence', { event: 'sync' }, () => {
          const newState = channel.presenceState();
          const active: any[] = [];
          for (const key in newState) {
            const presences = newState[key];
            if (presences.length > 0) {
              active.push(presences[0]);
            }
          }
          if (isMounted) setActiveStudents(active);
        })
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'test_submissions', filter: `test_id=eq.${id}` },
          () => {
            if (isMounted) fetchTestDetails();
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'tests', filter: `id=eq.${id}` },
          (payload) => {
            if (payload.new && isMounted) {
              setTestDetails((prev: any) => ({ ...prev, ...payload.new }));
            }
          }
        )
        .subscribe();
    };

    setupRealtime();

    return () => {
      isMounted = false;
      const ch = supabase.getChannels().find(c => c.topic === topicName || c.topic === `realtime:${topicName}`);
      if (ch) supabase.removeChannel(ch);
    };
  }, [id]);

  const fetchTestDetails = async () => {
    try {
      const { data, error } = await supabase.from('tests').select('*').eq('id', id).single();
      if (error) throw error;
      setTestDetails(data);

      const { data: subs } = await supabase
        .from('test_submissions')
        .select('*, students(name, photo_url)')
        .eq('test_id', id);

      if (subs) {
        setCompletedSubmissions(subs);
      }
    } catch (e) {
      console.warn('Failed to fetch test details', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (testDetails?.status === 'live' && testDetails?.start_time && testDetails?.duration_minutes) {
      const updateTimer = () => {
        const endTime = new Date(testDetails.start_time).getTime() + (testDetails.duration_minutes * 60 * 1000);
        const rem = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
        setRemainingSeconds(rem);
        if (rem <= 0) {
          handleEndTest(true);
        }
      };

      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    } else {
      setRemainingSeconds(null);
    }
  }, [testDetails]);

  const formatTimer = (secs: number | null) => {
    if (secs === null) return '';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Combine presence active students with DB completed submissions
  const allDisplayStudents = () => {
    const list: any[] = [];
    const seenUserIds = new Set<string>();

    // 1. Add DB Submissions (Completed)
    completedSubmissions.forEach(sub => {
      const uId = sub.student_id;
      seenUserIds.add(uId);
      list.push({
        user_id: uId,
        name: sub.students?.name || 'Student',
        avatar: sub.students?.photo_url || null,
        status: 'submitted',
        score: sub.score,
      });
    });

    // 2. Add Active Presence (Waiting or Writing)
    activeStudents.forEach(pres => {
      const uId = pres.user_id;
      if (uId && !seenUserIds.has(uId)) {
        list.push(pres);
      }
    });

    return list;
  };



  const handleStartTest = async () => {
    Alert.alert('Start Test', 'Are you sure you want to start this test now? Students will be able to enter immediately.', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Start Now', 
        style: 'destructive',
        onPress: async () => {
          setIsStarting(true);
          try {
            const { error } = await supabase
              .from('tests')
              .update({ 
                status: 'live',
                start_time: new Date().toISOString()
              })
              .eq('id', id);
            
            if (error) throw error;
            
            fetchTestDetails(); // refresh status
          } catch (e: any) {
            Alert.alert('Error', e.message);
          } finally {
            setIsStarting(false);
          }
        }
      }
    ]);
  };

  const handleEndTest = async (auto = false) => {
    if (!auto) {
      Alert.alert('End Exam', 'Are you sure you want to end this live exam early? All active students will be forced to submit.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End Now', style: 'destructive', onPress: performEndTest }
      ]);
    } else {
      performEndTest();
    }
  };

  const performEndTest = async () => {
    try {
      const { error } = await supabase
        .from('tests')
        .update({ status: 'completed' })
        .eq('id', id);
      if (error) throw error;
      fetchTestDetails();
    } catch (e: any) {
      console.warn('Failed to end test:', e);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.accent.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{testDetails?.title}</Text>
          <Text style={styles.headerSubtitle}>Live Monitoring Dashboard</Text>
        </View>
        <View>
          {testDetails?.status === 'scheduled' ? (
            <View style={{ backgroundColor: '#F2F2F7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.text.secondary }}>WAITING</Text>
            </View>
          ) : (
            <View style={{ backgroundColor: '#FF3B3015', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#FF3B3030' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#FF3B30' }}>LIVE NOW</Text>
            </View>
          )}
        </View>
      </View>

      <View style={{ padding: 20 }}>
        {/* Controls Card */}
        <View style={styles.controlsCard}>
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, color: Colors.text.secondary, marginBottom: 4 }}>Scheduled Start Time</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: Colors.text.primary }}>
                {testDetails?.start_time ? new Date(testDetails.start_time).toLocaleString() : 'Not Set'}
              </Text>
              <TouchableOpacity onPress={openEditModal} style={{ padding: 6, backgroundColor: Colors.bg.secondary, borderRadius: 6 }}>
                <Ionicons name="create-outline" size={20} color={Colors.accent.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {testDetails?.status === 'scheduled' && (
            <TouchableOpacity 
              style={styles.startBtn} 
              onPress={handleStartTest}
              disabled={isStarting}
            >
              {isStarting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="play" size={20} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.startBtnText}>Start Test Now</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {testDetails?.status === 'live' && (
            <TouchableOpacity 
              style={[styles.startBtn, { backgroundColor: '#FF3B30' }]} 
              onPress={() => handleEndTest()}
            >
              <Ionicons name="stop" size={20} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.startBtnText}>
                End Exam Now {remainingSeconds !== null ? `(${formatTimer(remainingSeconds)})` : ''}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={{ fontSize: 18, fontWeight: '700', color: Colors.text.primary, marginTop: 24, marginBottom: 12 }}>
          Active Students ({allDisplayStudents().length})
        </Text>
      </View>

      <FlatList
        data={allDisplayStudents()}
        keyExtractor={item => item.user_id || item.name || Math.random().toString()}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <Ionicons name="people-outline" size={48} color={Colors.text.tertiary} />
            <Text style={{ color: Colors.text.secondary, marginTop: 12 }}>No students have joined yet.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const st = String(item.status || '').toLowerCase();
          let statusText = 'WAITING IN LOBBY';
          let statusColor = '#FF9500';

          if (st === 'completed' || st === 'submitted') {
            statusText = 'SUBMITTED';
            statusColor = '#007AFF';
          } else if (testDetails?.status === 'live' && (st === 'writing' || st === 'in_progress' || st === 'active')) {
            statusText = 'WRITING EXAM';
            statusColor = '#34C759';
          } else {
            statusText = 'WAITING IN LOBBY';
            statusColor = '#FF9500';
          }

          return (
            <View style={styles.studentCard}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bg.secondary, justifyContent: 'center', alignItems: 'center', marginRight: 12, overflow: 'hidden' }}>
                {item.avatar ? (
                  <Image source={{ uri: item.avatar }} style={{ width: '100%', height: '100%' }} />
                ) : (
                  <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.accent.primary }}>{item.name?.charAt(0) || 'A'}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.text.primary }}>{item.name || 'Anonymous Student'}</Text>
                <Text style={{ fontSize: 12, color: Colors.text.secondary }}>
                  Status: <Text style={{ color: statusColor, fontWeight: '700' }}>{statusText}</Text>
                </Text>
              </View>
              {(st === 'completed' || st === 'submitted') && item.score !== undefined && (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 12, color: Colors.text.secondary }}>Score</Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.text.primary }}>{item.score}</Text>
                </View>
              )}
            </View>
          );
        }}
      />

      {/* Edit Time Modal */}
      <DateTimePickerBottomSheet
        visible={isEditModalVisible}
        onClose={() => setIsEditModalVisible(false)}
        currentDate={editDate}
        onSave={saveNewTime}
        title="Edit Schedule Time"
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  header: { 
    flexDirection: 'row', alignItems: 'center', padding: 20, 
    backgroundColor: Colors.bg.secondary, 
    borderBottomWidth: 1, borderBottomColor: Colors.card?.border || '#E5E5E5' 
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.text.primary },
  headerSubtitle: { fontSize: 13, color: Colors.text.secondary },
  controlsCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.card?.border || '#E5E5E5',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  startBtn: {
    backgroundColor: Colors.status?.success || '#34C759',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  startBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.card?.border || '#E5E5E5',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.card?.border || '#E5E5E5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text.primary,
    fontSize: 16,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.accent.primary,
    alignItems: 'center',
  }
});

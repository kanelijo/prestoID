import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, Alert, Modal, TextInput } from 'react-native';
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

  // Edit Time Modal
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editDate, setEditDate] = useState<Date | null>(null);
  const [isSavingTime, setIsSavingTime] = useState(false);

  useEffect(() => {
    fetchTestDetails();
    fetchActiveStudents();

    // Subscribe to real-time student submissions joining the test
    const sub = supabase.channel('live-dashboard')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'test_submissions',
        filter: `test_id=eq.${id}`
      }, (payload) => {
        fetchActiveStudents(); // Refresh list on any submission change
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, [id]);

  const fetchTestDetails = async () => {
    try {
      const { data, error } = await supabase.from('tests').select('*').eq('id', id).single();
      if (error) throw error;
      setTestDetails(data);
    } catch (e) {
      console.warn('Failed to fetch test details', e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchActiveStudents = async () => {
    try {
      const { data, error } = await supabase
        .from('test_submissions')
        .select(`
          id,
          student_id,
          status,
          score,
          profiles:student_id (name, avatar_url)
        `)
        .eq('test_id', id);
      
      if (error) throw error;
      
      // Transform data to make it flat
      const formatted = (data || []).map(sub => ({
        id: sub.id,
        student_id: sub.student_id,
        status: sub.status,
        score: sub.score,
        name: Array.isArray(sub.profiles) ? sub.profiles[0]?.name : sub.profiles?.name || 'Unknown Student',
        avatar_url: Array.isArray(sub.profiles) ? sub.profiles[0]?.avatar_url : sub.profiles?.avatar_url,
      }));
      
      setActiveStudents(formatted);
    } catch (e) {
      console.warn('Failed to fetch active students', e);
    }
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
              .update({ status: 'live' })
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

  const openEditModal = () => {
    if (!testDetails?.start_time) return;
    setEditDate(new Date(testDetails.start_time));
    setIsEditModalVisible(true);
  };

  const saveNewTime = async (newDate: Date) => {
    setIsSavingTime(true);
    try {
      const newIsoDate = newDate.toISOString();
      const { error } = await supabase
        .from('tests')
        .update({ start_time: newIsoDate })
        .eq('id', id);
      
      if (error) throw error;
      
      setIsEditModalVisible(false);
      fetchTestDetails();
      Alert.alert('Success', 'Schedule updated successfully.');
    } catch (e: any) {
      Alert.alert('Error', 'Invalid Date/Time format or network error.');
    } finally {
      setIsSavingTime(false);
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
        </View>

        <Text style={{ fontSize: 18, fontWeight: '700', color: Colors.text.primary, marginTop: 24, marginBottom: 12 }}>
          Active Students ({activeStudents.length})
        </Text>
      </View>

      <FlatList
        data={activeStudents}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <Ionicons name="people-outline" size={48} color={Colors.text.tertiary} />
            <Text style={{ color: Colors.text.secondary, marginTop: 12 }}>No students have joined yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.studentCard}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bg.secondary, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.accent.primary }}>{item.name.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.text.primary }}>{item.name}</Text>
              <Text style={{ fontSize: 12, color: Colors.text.secondary }}>
                Status: <Text style={{ color: item.status === 'completed' ? '#34C759' : '#FF9500' }}>{item.status.toUpperCase()}</Text>
              </Text>
            </View>
            {item.status === 'completed' && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 12, color: Colors.text.secondary }}>Score</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.text.primary }}>{item.score}</Text>
              </View>
            )}
          </View>
        )}
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

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { sendPushNotification } from '@/lib/notifications';
import { useAuthStore } from '@/stores/useAuthStore';

interface QueuedAttendance {
  id: string;
  studentId: string;
  enrollmentId: string;
  timestamp: string;
  date: string;
}

interface OfflineQueueState {
  attendanceQueue: QueuedAttendance[];
  isSyncing: boolean;
  addAttendance: (studentId: string, enrollmentId: string) => Promise<void>;
  syncAttendance: () => Promise<{ success: number; failed: number } | null>;
  loadQueue: () => Promise<void>;
  clearQueue: () => Promise<void>;
}

export const useOfflineQueue = create<OfflineQueueState>((set, get) => ({
  attendanceQueue: [],
  isSyncing: false,

  loadQueue: async () => {
    try {
      const stored = await AsyncStorage.getItem('attendance_queue');
      if (stored) {
        set({ attendanceQueue: JSON.parse(stored) });
      }
    } catch (e) {
      console.warn('Failed to load attendance queue', e);
    }
  },

  addAttendance: async (studentId, enrollmentId) => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    
    const newRecord: QueuedAttendance = {
      id: Math.random().toString(36).substring(7),
      studentId,
      enrollmentId,
      timestamp: now.toISOString(),
      date: dateStr,
    };

    const currentQueue = get().attendanceQueue;
    const isAlreadyQueued = currentQueue.some(
      (q) => q.studentId === studentId && q.date === dateStr
    );

    if (isAlreadyQueued) {
      throw new Error('Already scanned today (in offline queue)');
    }

    const newQueue = [...currentQueue, newRecord];
    set({ attendanceQueue: newQueue });
    
    await AsyncStorage.setItem('attendance_queue', JSON.stringify(newQueue));
    
    // Attempt background sync immediately if online
    get().syncAttendance();
  },

  syncAttendance: async () => {
    const { attendanceQueue, isSyncing } = get();
    if (attendanceQueue.length === 0 || isSyncing) return null;

    set({ isSyncing: true });
    let successCount = 0;
    const failedQueue: QueuedAttendance[] = [];

    const businessId = useAuthStore.getState().businessId;

    try {
      for (const record of attendanceQueue) {
        const { error } = await supabase
          .from('attendance')
          .insert({
            student_id: record.studentId,
            business_id: businessId,
            date: record.date,
            status: 'present',
            created_at: record.timestamp,
          });

        if (error) {
          // If already exists, treat as success (we remove it from queue)
          if (error.code === '23505') {
            successCount++;
          } else {
            failedQueue.push(record);
          }
        } else {
          successCount++;
          // Attendance record successfully created! Send push notification to the student.
          try {
            const { data: studentData } = await supabase
              .from('students')
              .select('name, user_id')
              .eq('id', record.studentId)
              .maybeSingle();

            if (studentData && studentData.user_id) {
              const { data: profileData } = await supabase
                .from('profiles')
                .select('push_token')
                .eq('id', studentData.user_id)
                .maybeSingle();

              if (profileData && profileData.push_token) {
                const scanTime = new Date(record.timestamp).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                await sendPushNotification(
                  [profileData.push_token],
                  'Attendance Marked',
                  `Hi ${studentData.name}, your attendance was marked PRESENT today at ${scanTime}.`,
                  { screen: 'id-card' }
                );
              }
            }
          } catch (pushErr) {
            console.warn('Failed to send attendance push notification:', pushErr);
          }
        }
      }

      set({ attendanceQueue: failedQueue });
      await AsyncStorage.setItem('attendance_queue', JSON.stringify(failedQueue));
      return { success: successCount, failed: failedQueue.length };
    } catch (e) {
      console.warn('Sync failed:', e);
      return { success: successCount, failed: attendanceQueue.length - successCount };
    } finally {
      set({ isSyncing: false });
    }
  },

  clearQueue: async () => {
    set({ attendanceQueue: [] });
    try {
      await AsyncStorage.removeItem('attendance_queue');
    } catch (e) {
      console.warn('Failed to clear attendance queue from storage', e);
    }
  },
}));

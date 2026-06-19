import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

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
  syncAttendance: () => Promise<void>;
  loadQueue: () => Promise<void>;
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
    if (attendanceQueue.length === 0 || isSyncing) return;

    set({ isSyncing: true });

    try {
      const failedQueue: QueuedAttendance[] = [];

      for (const record of attendanceQueue) {
        const { error } = await supabase
          .from('attendance')
          .insert({
            student_id: record.studentId,
            date: record.date,
            status: 'present',
            scanned_at: record.timestamp,
          });

        if (error) {
          // If already exists, ignore the error and remove from queue
          if (error.code !== '23505') {
            failedQueue.push(record);
          }
        }
      }

      set({ attendanceQueue: failedQueue });
      await AsyncStorage.setItem('attendance_queue', JSON.stringify(failedQueue));
    } catch (e) {
      console.warn('Sync failed:', e);
    } finally {
      set({ isSyncing: false });
    }
  },
}));

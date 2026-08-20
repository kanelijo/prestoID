import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

export interface OfflineTestResult {
  id: string;
  test_id: string;
  student_id: string;
  score: number;
  total_marks: number;
  accuracy: string;
  questions_answered: number;
  total_questions: number;
  time_spent_seconds: number;
  answers: Record<string, number>;
  completed_at: string;
  synced: boolean;
}

const OFFLINE_RESULTS_KEY = '@zenza_offline_results';
const TEST_CACHE_PREFIX = '@zenza_test_cache_';

/**
 * Cache test paper and questions for 100% offline attempt
 */
export const cacheTestForOffline = async (testId: string, testData: any) => {
  try {
    const key = `${TEST_CACHE_PREFIX}${testId}`;
    await AsyncStorage.setItem(key, JSON.stringify(testData));
    console.log(`[Offline Engine] Test ${testId} cached for offline execution.`);
  } catch (err) {
    console.warn('[Offline Engine] Failed to cache test data', err);
  }
};

/**
 * Retrieve cached test data when offline
 */
export const getCachedOfflineTest = async (testId: string) => {
  try {
    const key = `${TEST_CACHE_PREFIX}${testId}`;
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('[Offline Engine] Error reading offline test cache', err);
    return null;
  }
};

/**
 * Save student test results locally (100% Offline First)
 */
export const saveOfflineTestResult = async (result: Omit<OfflineTestResult, 'id' | 'synced'>) => {
  try {
    const rawList = await AsyncStorage.getItem(OFFLINE_RESULTS_KEY);
    const resultsList: OfflineTestResult[] = rawList ? JSON.parse(rawList) : [];

    const newResult: OfflineTestResult = {
      ...result,
      id: `off_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      synced: false,
    };

    resultsList.unshift(newResult);
    await AsyncStorage.setItem(OFFLINE_RESULTS_KEY, JSON.stringify(resultsList));
    console.log('[Offline Engine] Test result saved locally to zenza_offline_results.');

    // Attempt background sync if online
    syncOfflineResultsToSupabase();
    return newResult;
  } catch (err) {
    console.warn('[Offline Engine] Failed to save result locally', err);
    return null;
  }
};

/**
 * Sync cached offline results to Supabase DB when connection is available
 */
export const syncOfflineResultsToSupabase = async () => {
  try {
    const rawList = await AsyncStorage.getItem(OFFLINE_RESULTS_KEY);
    if (!rawList) return;

    const resultsList: OfflineTestResult[] = JSON.parse(rawList);
    const unsynced = resultsList.filter((r) => !r.synced);

    if (unsynced.length === 0) return;

    console.log(`[Offline Engine] Syncing ${unsynced.length} offline test results to Supabase...`);

    const updatedList = [...resultsList];

    for (const item of unsynced) {
      const payload = {
        test_id: item.test_id,
        student_id: item.student_id,
        score: item.score,
        total_marks: item.total_marks,
        accuracy: item.accuracy,
        time_spent_seconds: item.time_spent_seconds,
        created_at: item.completed_at,
      };

      const { error } = await supabase.from('test_results').insert(payload);
      if (!error) {
        const target = updatedList.find((r) => r.id === item.id);
        if (target) target.synced = true;
      }
    }

    await AsyncStorage.setItem(OFFLINE_RESULTS_KEY, JSON.stringify(updatedList));
    console.log('[Offline Engine] Background sync completed successfully!');
  } catch (err) {
    console.warn('[Offline Engine] Background sync postponed (network unavailable or DB error).');
  }
};

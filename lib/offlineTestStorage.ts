import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

export interface OfflineTestResult {
  id: string;
  test_id: string;
  user_id?: string;
  student_name?: string;
  score: number;
  total_marks: number;
  accuracy: string;
  questions_answered: number;
  total_questions: number;
  time_spent_seconds: number;
  submitted_answers: Record<string, any>;
  completed_at: string;
  avatar_url?: string;
  state?: string;
  city?: string;
  synced: boolean;
}

const OFFLINE_RESULTS_KEY = '@mocks_offline_results';
const TEST_CACHE_PREFIX = '@mocks_test_cache_';
const PUBLIC_TESTS_INDEX_KEY = '@mocks_cached_public_tests';

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
 * Cache the entire public test list for offline browsing
 */
export const cacheAllPublicTestsLocally = async (tests: any[]) => {
  try {
    if (!tests || tests.length === 0) return;
    await AsyncStorage.setItem(PUBLIC_TESTS_INDEX_KEY, JSON.stringify(tests));
    // Cache individual tests
    for (const test of tests) {
      if (test?.id) {
        await cacheTestForOffline(test.id, test);
      }
    }
    console.log(`[Offline Engine] ${tests.length} public tests cached locally for 100% offline use.`);
  } catch (err) {
    console.warn('[Offline Engine] Error caching public tests', err);
  }
};

/**
 * Get locally cached public tests when offline
 */
export const getCachedPublicTests = async (): Promise<any[] | null> => {
  try {
    const raw = await AsyncStorage.getItem(PUBLIC_TESTS_INDEX_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
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
    console.log('[Offline Engine] Test result saved locally to @mocks_offline_results.');

    // Automatically update @student_leaderboard_data so Leaderboard tab displays attempt immediately
    try {
      const leaderRaw = await AsyncStorage.getItem('@student_leaderboard_data');
      const leaderList = leaderRaw ? JSON.parse(leaderRaw) : [];
      const leaderEntry = {
        id: newResult.id,
        rank: 1,
        name: newResult.student_name || 'Aspirant',
        target_exam: 'MPPSC',
        score: Math.round(newResult.score),
        accuracy: newResult.accuracy,
        state: 'Madhya Pradesh',
        city: '',
        avatar_url: newResult.avatar_url || null,
      };
      const updatedLeader = [leaderEntry, ...leaderList.filter((x: any) => x.id !== newResult.id)];
      updatedLeader.sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
      updatedLeader.forEach((item: any, idx: number) => { item.rank = idx + 1; });
      await AsyncStorage.setItem('@student_leaderboard_data', JSON.stringify(updatedLeader));
    } catch (_) {}

    // Attempt background sync if online
    syncOfflineResultsToSupabase().catch(() => {});
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
      // 1. Try public_test_submissions first
      const publicPayload = {
        test_id: item.test_id,
        user_id: item.user_id,
        student_name: item.student_name || 'Public Aspirant',
        score: item.score,
        total_marks: item.total_marks,
        accuracy_percent: parseFloat(item.accuracy.replace('%', '')) || 0,
        time_taken_seconds: item.time_spent_seconds,
        submitted_answers: item.submitted_answers || {},
        avatar_url: item.avatar_url,
        state: item.state || 'Madhya Pradesh',
        city: item.city || 'Indore',
        created_at: item.completed_at,
      };

      const { error: pubError } = await supabase
        .from('public_test_submissions')
        .insert(publicPayload);

      if (!pubError) {
        const target = updatedList.find((r) => r.id === item.id);
        if (target) target.synced = true;
      } else {
        // Fallback to test_submissions
        const fallbackPayload = {
          test_id: item.test_id,
          user_id: item.user_id,
          score: item.score,
          total_marks: item.total_marks,
          accuracy: item.accuracy,
          time_spent_seconds: item.time_spent_seconds,
          created_at: item.completed_at,
        };
        const { error: testErr } = await supabase.from('test_results').insert(fallbackPayload);
        if (!testErr) {
          const target = updatedList.find((r) => r.id === item.id);
          if (target) target.synced = true;
        }
      }
    }

    await AsyncStorage.setItem(OFFLINE_RESULTS_KEY, JSON.stringify(updatedList));
    console.log('[Offline Engine] Background sync completed successfully!');
  } catch (err) {
    console.warn('[Offline Engine] Background sync postponed (offline or network unavailable).');
  }
};

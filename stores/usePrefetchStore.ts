import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

interface PrefetchState {
  // Tests tab
  pendingTests: any[];
  completedTests: any[];
  testsReady: boolean;

  // Community tab
  communityMessages: any[];
  communityReady: boolean;

  // Setters
  setTests: (pending: any[], completed: any[]) => void;
  setCommunityMessages: (msgs: any[]) => void;
  reset: () => void;

  // Prefetch all data for a student user
  prefetchAll: (userId: string) => Promise<void>;
}

export const usePrefetchStore = create<PrefetchState>((set, get) => ({
  pendingTests: [],
  completedTests: [],
  testsReady: false,
  communityMessages: [],
  communityReady: false,

  setTests: (pending, completed) => set({ pendingTests: pending, completedTests: completed, testsReady: true }),
  setCommunityMessages: (msgs) => set({ communityMessages: msgs, communityReady: true }),
  reset: () => set({ pendingTests: [], completedTests: [], testsReady: false, communityMessages: [], communityReady: false }),

  prefetchAll: async (userId: string) => {
    try {
      // 1. Fetch student profile (stored in authStore by each screen already — skip)

      // 2. Fetch student record to get business_id and batch_name
      const { data: studentsList } = await supabase
        .from('students')
        .select('id, batch_name, business_id')
        .eq('user_id', userId)
        .limit(1);

      if (!studentsList || studentsList.length === 0) return;
      const student = studentsList[0];

      // Fire community + tests in parallel
      await Promise.all([
        // 3. Prefetch community messages (last 60)
        (async () => {
          try {
            const { data: msgs } = await supabase
              .from('community_posts')
              .select('*')
              .eq('business_id', student.business_id)
              .neq('is_deleted', true)
              .order('created_at', { ascending: true })
              .limit(60);
            if (msgs) set({ communityMessages: msgs, communityReady: true });
          } catch (_) {}
        })(),

        // 4. Prefetch tests
        (async () => {
          try {
            const { data: allTests } = await supabase
              .from('tests')
              .select('*')
              .eq('business_id', student.business_id)
              .eq('status', 'published')
              .neq('is_deleted', true)
              .order('created_at', { ascending: false });

            const applicableTests = (allTests || []).filter((t: any) => {
              if (!t.batch_name || t.batch_name === 'All') return true;
              const testBatch = Array.isArray(t.batch_name) ? t.batch_name[0] : String(t.batch_name);
              return testBatch.toLowerCase().trim() === String(student.batch_name || '').toLowerCase().trim();
            });

            const { data: submissions } = await supabase
              .from('test_submissions')
              .select('*')
              .eq('student_id', student.id);

            const takenTestIds = new Set((submissions || []).map((s: any) => s.test_id));
            const pending = applicableTests.filter((t: any) => !takenTestIds.has(t.id));

            set({ pendingTests: pending, completedTests: submissions || [], testsReady: true });
          } catch (_) {}
        })(),
      ]);
    } catch (e) {
      console.warn('[Prefetch] Failed:', e);
    }
  },
}));

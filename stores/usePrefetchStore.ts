import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { saveTestToLocal } from '@/lib/localDb';

interface CoachingMeta {
  name: string;
  logoUrl: string | null;
  memberCount: number;
  memberAvatars: string[];
}

interface PrefetchState {
  pendingTests: any[];
  completedTests: any[];
  adminTests: any[];
  adminStudents: any[];
  testsReady: boolean;
  communityMessages: any[];
  communityReady: boolean;
  coachingMeta: CoachingMeta | null;
  isHydrated: boolean;
  setTests: (pending: any[], completed: any[]) => void;
  setCommunityMessages: (msgs: any[]) => void;
  reset: () => void;
  prefetchAll: (userId: string, role?: string, businessId?: string) => Promise<void>;
}

export const usePrefetchStore = create<PrefetchState>((set, get) => ({
  pendingTests: [],
  completedTests: [],
  adminTests: [],
  adminStudents: [],
  testsReady: false,
  communityMessages: [],
  communityReady: false,
  coachingMeta: null,
  isHydrated: false,

  setTests: (pending, completed) => set({ pendingTests: pending, completedTests: completed, testsReady: true }),
  setCommunityMessages: (msgs) => set({ communityMessages: msgs, communityReady: true }),
  reset: () => set({ pendingTests: [], completedTests: [], adminTests: [], adminStudents: [], testsReady: false, communityMessages: [], communityReady: false, coachingMeta: null, isHydrated: false }),

  prefetchAll: async (userId: string, role?: string, businessId?: string) => {
    try {
      if (role === 'admin' && businessId) {
        // Admin Prefetching Pipeline
        await Promise.all([
          // 1. Admin Community Messages
          (async () => {
            try {
              const { data: msgs } = await supabase
                .from('community_posts')
                .select('*')
                .eq('business_id', businessId)
                .neq('is_deleted', true)
                .order('created_at', { ascending: true })
                .limit(60);
              if (msgs) set({ communityMessages: msgs, communityReady: true });
            } catch (_) {}
          })(),

          // 2. Admin Tests
          (async () => {
            try {
              const { data: allTests } = await supabase
                .from('tests')
                .select('*')
                .eq('business_id', businessId)
                .neq('is_deleted', true)
                .order('created_at', { ascending: false });
              if (allTests) set({ adminTests: allTests, testsReady: true });
            } catch (_) {}
          })(),

          // 3. Admin Students
          (async () => {
            try {
              const { data: students } = await supabase
                .from('students')
                .select('*, profiles(avatar_url)')
                .eq('business_id', businessId)
                .order('created_at', { ascending: false });
              if (students) set({ adminStudents: students });
            } catch (_) {}
          })()
        ]);

        set({ isHydrated: true });
        return;
      }

      // Student Prefetching Pipeline
      const { data: studentsList } = await supabase
        .from('students')
        .select('id, batch_name, business_id, name')
        .eq('user_id', userId)
        .limit(1);

      if (!studentsList || studentsList.length === 0) {
        set({ isHydrated: true });
        return;
      }
      const student = studentsList[0];

      await Promise.all([
        // 1. Prefetch Community Messages
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

        // 2. Prefetch Coaching Metadata
        (async () => {
          try {
            const { data: biz } = await supabase
              .from('businesses')
              .select('business_name, admin_id')
              .eq('id', student.business_id)
              .maybeSingle();
            if (!biz) return;
            const name = biz.business_name || 'Community Chat';
            let logoUrl: string | null = null;
            if (biz.admin_id) {
              const { data: adminProf } = await supabase
                .from('profiles').select('avatar_url').eq('id', biz.admin_id).maybeSingle();
              if (adminProf?.avatar_url) logoUrl = adminProf.avatar_url;
            }
            const { count } = await supabase
              .from('students').select('*', { count: 'exact', head: true }).eq('business_id', student.business_id);
            const { data: memberProfiles } = await supabase
              .from('students').select('profiles(avatar_url)').eq('business_id', student.business_id).limit(8);
            const memberAvatars: string[] = [];
            (memberProfiles || []).forEach((s: any) => {
              const url = s.profiles?.avatar_url;
              if (url) memberAvatars.push(url);
            });
            set({ coachingMeta: { name, logoUrl, memberCount: count || 0, memberAvatars } });
          } catch (_) {}
        })(),

        // 3. Prefetch Tests (Pending & Completed)
        (async () => {
          try {
            const { data: allTests } = await supabase
              .from('tests').select('*').eq('business_id', student.business_id)
              .eq('status', 'published').neq('is_deleted', true).order('created_at', { ascending: false });
            
            const applicableTests = (allTests || []).filter((t: any) => {
              if (!t.batch_name || t.batch_name === 'All') return true;
              const testBatch = Array.isArray(t.batch_name) ? t.batch_name[0] : String(t.batch_name);
              return testBatch.toLowerCase().trim() === String(student.batch_name || '').toLowerCase().trim();
            });

            // Cache tests into local SQLite DB for 0ms engine launches
            applicableTests.forEach((t: any) => saveTestToLocal(t.id, t));

            const { data: submissions } = await supabase
              .from('test_submissions').select('*, tests(*)').eq('student_id', student.id).order('submitted_at', { ascending: false });
            
            const takenTestIds = new Set((submissions || []).map((s: any) => s.test_id));
            const pending = applicableTests.filter((t: any) => !takenTestIds.has(t.id));
            set({ pendingTests: pending, completedTests: submissions || [], testsReady: true });
          } catch (_) {}
        })(),
      ]);

      set({ isHydrated: true });
    } catch (e) {
      console.warn('[Prefetch] Failed:', e);
      set({ isHydrated: true });
    }
  },
}));

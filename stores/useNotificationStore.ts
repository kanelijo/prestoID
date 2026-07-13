import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface NotificationState {
  adminUnreadCount: number;
  studentUnreadCount: number;
  studentCommunityUnreadCount: number;
  studentPendingTestCount: number;
  communityIsOpen: boolean;
  setAdminUnreadCount: (count: number) => void;
  setStudentUnreadCount: (count: number) => void;
  setStudentCommunityUnreadCount: (count: number) => void;
  setStudentPendingTestCount: (count: number) => void;
  setCommunityIsOpen: (open: boolean) => void;
  fetchAdminUnreadCount: (userId: string, businessId: string) => Promise<number>;
  fetchStudentUnreadCounts: (userId: string) => Promise<void>;
  fetchStudentPendingTestCount: (userId: string) => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  adminUnreadCount: 0,
  studentUnreadCount: 0,
  studentCommunityUnreadCount: 0,
  studentPendingTestCount: 0,
  communityIsOpen: false,
  setAdminUnreadCount: (adminUnreadCount) => set({ adminUnreadCount }),
  setStudentUnreadCount: (studentUnreadCount) => set({ studentUnreadCount }),
  setStudentCommunityUnreadCount: (studentCommunityUnreadCount) => set({ studentCommunityUnreadCount }),
  setStudentPendingTestCount: (studentPendingTestCount) => set({ studentPendingTestCount }),
  setCommunityIsOpen: (communityIsOpen) => set({ communityIsOpen }),

  fetchAdminUnreadCount: async (userId: string, businessId: string) => {
    if (!userId || !businessId) return 0;
    try {
      // 1. Fetch deletion requests count
      const { count: deletionCount } = await supabase
        .from('account_deletion_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      // 2. Fetch claim requests count
      const { count: claimCount } = await supabase
        .from('claim_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      const rawAlerts: string[] = [];

      // 3. Fetch recent payments
      const { data: payments } = await supabase
        .from('payments')
        .select(`
          id,
          students!inner (
            business_id
          )
        `)
        .eq('students.business_id', businessId)
        .order('payment_date', { ascending: false })
        .limit(10);

      if (payments) {
        payments.forEach((p: any) => {
          rawAlerts.push(`pay-${p.id}`);
        });
      }

      // 4. Fetch recent absentees
      const { data: absentees } = await supabase
        .from('attendance')
        .select(`
          id,
          students!inner (
            business_id
          )
        `)
        .eq('students.business_id', businessId)
        .eq('status', 'absent')
        .order('date', { ascending: false })
        .limit(10);

      if (absentees) {
        absentees.forEach((a: any) => {
          rawAlerts.push(`abs-${a.id}`);
        });
      }

      // 5. Fetch recently registered students
      const { data: newStudents } = await supabase
        .from('students')
        .select('id')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (newStudents) {
        newStudents.forEach((s: any) => {
          rawAlerts.push(`std-${s.id}`);
        });
      }

      // Load read IDs
      const readIdsJSON = await AsyncStorage.getItem('@presto_admin_read_notifications');
      const readIds: string[] = readIdsJSON ? JSON.parse(readIdsJSON) : [];

      // Count unread dynamic alerts
      const unreadAlertsCount = rawAlerts.filter(id => !readIds.includes(id)).length;

      // Final unread count is the sum of all pending requests + unread dynamic alerts
      const totalUnread = (deletionCount || 0) + (claimCount || 0) + unreadAlertsCount;
      set({ adminUnreadCount: totalUnread });
      return totalUnread;
    } catch (err) {
      console.warn('Failed to fetch admin unread count in store:', err);
      return get().adminUnreadCount;
    }
  },

  fetchStudentUnreadCounts: async (userId: string) => {
    if (!userId) return;
    try {
      // Find the student
      const { data: student } = await supabase
        .from('students')
        .select('id, business_id, batch_name')
        .eq('user_id', userId)
        .maybeSingle();

      if (!student) return;

      // Load read alerts from AsyncStorage
      const readAlertsJSON = await AsyncStorage.getItem('@presto_student_read_notifications');
      const readAlerts: string[] = readAlertsJSON ? JSON.parse(readAlertsJSON) : [];

      const alertIds: string[] = [];

      // 1. Fetch recent attendance logs
      const { data: att } = await supabase
        .from('attendance')
        .select('id, status')
        .eq('student_id', student.id)
        .order('date', { ascending: false })
        .limit(8);

      if (att) {
        att.forEach((a: any) => {
          alertIds.push(`att-${a.id}`);
        });
      }

      // 2. Fetch recent payments
      const { data: paymentsList } = await supabase
        .from('payments')
        .select('id')
        .eq('student_id', student.id)
        .order('payment_date', { ascending: false })
        .limit(5);

      if (paymentsList) {
        paymentsList.forEach((p: any) => {
          alertIds.push(`pay-${p.id}`);
        });
      }

      // 3. Fetch recent community posts — NOT counted in alert badge
      //    (community posts belong to the Community tab, not Alerts)
      //    Only att- and pay- are shown in the Alerts screen.

      const unreadAlertsCount = alertIds.filter(id => !readAlerts.includes(id)).length;
      set({ studentUnreadCount: unreadAlertsCount });

      // 4. Fetch community posts count for community unread count
      const { data: commPosts } = await supabase
        .from('community_posts')
        .select('id, target_batches')
        .eq('business_id', student.business_id)
        .neq('is_deleted', true)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      if (commPosts) {
        const filteredPosts = commPosts.filter((p: any) => {
          const targetBatches = p.target_batches || [];
          return targetBatches.length === 0 || targetBatches.includes(student.batch_name);
        });

        // Load read posts from AsyncStorage
        const readPostsJSON = await AsyncStorage.getItem('@presto_student_read_posts');
        const readPosts: string[] = readPostsJSON ? JSON.parse(readPostsJSON) : [];

        const unreadPostsCount = filteredPosts.filter(p => !readPosts.includes(String(p.id))).length;
        // Don't override the badge count if student is currently reading the community
        if (!get().communityIsOpen) {
          set({ studentCommunityUnreadCount: unreadPostsCount });
        }
      }
    } catch (err) {
      console.warn('Failed to fetch student counts in store:', err);
    }
  },

  fetchStudentPendingTestCount: async (userId: string) => {
    if (!userId) return;
    try {
      const { data: student } = await supabase
        .from('students')
        .select('id, batch_name, business_id')
        .eq('user_id', userId)
        .limit(1);

      if (!student || student.length === 0) return;
      const st = student[0];

      // Get all published tests for business
      const { data: allTests } = await supabase
        .from('tests')
        .select('id, batch_name')
        .eq('business_id', st.business_id)
        .eq('status', 'published');

      if (!allTests) return;

      // Filter by batch
      const applicableTests = allTests.filter((t: any) => {
        if (!t.batch_name || t.batch_name === 'All') return true;
        const testBatch = Array.isArray(t.batch_name) ? t.batch_name[0] : String(t.batch_name);
        return testBatch.toLowerCase().trim() === String(st.batch_name || '').toLowerCase().trim();
      });

      // Get submissions to see what is already taken
      const { data: submissions } = await supabase
        .from('test_submissions')
        .select('test_id')
        .eq('student_id', st.id);

      const takenTestIds = new Set((submissions || []).map((s: any) => s.test_id));
      const pendingCount = applicableTests.filter((t: any) => !takenTestIds.has(t.id)).length;

      set({ studentPendingTestCount: pendingCount });
    } catch (err) {
      console.warn('Failed to fetch pending test count:', err);
    }
  },
}));

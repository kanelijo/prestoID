import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

type NotificationType = 'fee_payment' | 'new_student' | 'attendance' | 'system' | 'community';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  timeAgo: string;
  read: boolean;
}

const NOTIFICATION_CONFIG: Record<
  NotificationType,
  { icon: keyof typeof Ionicons.glyphMap; tint: string; label: string }
> = {
  fee_payment: { icon: 'wallet', tint: Colors.status.success, label: 'Fee Payment Received' },
  new_student: { icon: 'person-add', tint: Colors.status.info, label: 'New Student Registered' },
  attendance: { icon: 'calendar', tint: Colors.accent.primary, label: 'Attendance Alert' },
  system: { icon: 'information-circle', tint: Colors.status.warning, label: 'System Update' },
  community: { icon: 'megaphone', tint: Colors.accent.primary, label: 'Community Response' },
};

const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    type: 'fee_payment',
    title: 'Fee Payment Received',
    description: 'Amit Sharma paid ₹2,500 for June 2026',
    timeAgo: '2 hours ago',
    read: false,
  },
  {
    id: '2',
    type: 'community',
    title: 'Community Response',
    description: 'Priya Patel commented on your announcement',
    timeAgo: '3 hours ago',
    read: false,
  },
  {
    id: '3',
    type: 'attendance',
    title: 'Attendance Alert',
    description: '5 students absent today (MPPSC batch)',
    timeAgo: '5 hours ago',
    read: false,
  },
  {
    id: '4',
    type: 'new_student',
    title: 'New Student Registered',
    description: 'Rohit Mishra registered via invite code',
    timeAgo: '1 day ago',
    read: true,
  },
  {
    id: '5',
    type: 'fee_payment',
    title: 'Fee Payment Received',
    description: 'Sneha Gupta paid ₹2,200 for June 2026',
    timeAgo: '1 day ago',
    read: true,
  },
  {
    id: '6',
    type: 'system',
    title: 'System Update',
    description: 'Monthly fee report is ready to download',
    timeAgo: '2 days ago',
    read: true,
  },
  {
    id: '7',
    type: 'attendance',
    title: 'Attendance Alert',
    description: 'Attendance rate dropped below 80% for 3 students',
    timeAgo: '3 days ago',
    read: true,
  },
  {
    id: '8',
    type: 'community',
    title: 'Community Response',
    description: 'Deepak Kumar liked your note',
    timeAgo: '3 days ago',
    read: true,
  },
];

type FilterTab = 'All' | 'Unread';

export default function AdminNotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS);
  const [activeTab, setActiveTab] = useState<FilterTab>('All');
  const [refreshing, setRefreshing] = useState(false);
  const { user, verified } = useAuthStore();
  const [deletionRequests, setDeletionRequests] = useState<any[]>([]);
  const [claimRequests, setClaimRequests] = useState<any[]>([]);
  const [adminName, setAdminName] = useState('Admin');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const getInitials = (name: string) => {
    const parts = name.split(' ').filter(Boolean);
    return parts.length >= 2
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : name.substring(0, 2).toUpperCase();
  };

  const fetchAdminProfile = async () => {
    if (!verified) {
      setAdminName('Upendra Sir');
      return;
    }
    try {
      if (user) {
        const { data: inst, error: instError } = await supabase
          .from('businesses')
          .select('business_name')
          .eq('admin_id', user.id)
          .maybeSingle();

        if (!instError && inst) {
          if (inst.business_name) setAdminName(inst.business_name);
        } else {
          const { data: profile } = await supabase
            .from('profiles')
            .select('name')
            .eq('id', user.id)
            .maybeSingle();

          if (profile?.name) {
            setAdminName(profile.name);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load admin profile in alerts:', err);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filtered =
    activeTab === 'Unread' ? notifications.filter((n) => !n.read) : notifications;

  const fetchDeletionRequests = async () => {
    if (!verified) {
      setDeletionRequests([
        {
          id: 'demo-req-1',
          user_name: 'Rohit Sharma',
          user_email: 'rohit@email.com',
          requested_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          status: 'pending'
        }
      ]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('account_deletion_requests')
        .select('*')
        .eq('status', 'pending')
        .order('requested_at', { ascending: false });

      if (error) throw error;
      setDeletionRequests(data || []);
    } catch (err) {
      console.warn('Failed to load deletion requests:', err);
    }
  };

  const fetchClaimRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('claim_requests')
        .select(`
          id,
          status,
          created_at,
          students!inner ( id, name, batch_name, aadhaar_number, photo_url )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setClaimRequests(data || []);
    } catch (err) {
      console.warn('Failed to load claim requests:', err);
    }
  };

  useEffect(() => {
    fetchAdminProfile();
    fetchDeletionRequests();
    fetchClaimRequests();
  }, [user, verified]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchDeletionRequests(), fetchClaimRequests()]);
    setRefreshing(false);
  };

  const handleApproveDeletion = async (reqId: any) => {
    const reqIdStr = String(reqId);
    if (!verified || reqIdStr.startsWith('demo-')) {
      setDeletionRequests(prev => prev.filter(r => r.id !== reqId));
      Alert.alert('Approved (Test Mode)', 'Account deletion request approved. Student will have 7 days to recover their account.');
      return;
    }

    try {
      const scheduledDate = new Date();
      scheduledDate.setDate(scheduledDate.getDate() + 7);

      const { error } = await supabase
        .from('account_deletion_requests')
        .update({ status: 'approved', scheduled_delete_at: scheduledDate.toISOString() })
        .eq('id', reqId);

      if (error) throw error;

      Alert.alert('Approved', 'Account deletion request approved successfully.');
      fetchDeletionRequests();
    } catch (err: any) {
      Alert.alert('Failed', err.message || 'Something went wrong');
    }
  };

  const handleRejectDeletion = async (reqId: any) => {
    const reqIdStr = String(reqId);
    if (!verified || reqIdStr.startsWith('demo-')) {
      setDeletionRequests(prev => prev.filter(r => r.id !== reqId));
      Alert.alert('Rejected (Test Mode)', 'Account deletion request rejected.');
      return;
    }

    try {
      const { error } = await supabase
        .from('account_deletion_requests')
        .update({ status: 'rejected' })
        .eq('id', reqId);

      if (error) throw error;

      Alert.alert('Rejected', 'Account deletion request rejected successfully.');
      fetchDeletionRequests();
    } catch (err: any) {
      Alert.alert('Failed', err.message || 'Something went wrong');
    }
  };

  const handleApproveClaim = async (req: any) => {
    try {
      // 1. Update student's user_id
      const { error: studentError } = await supabase
        .from('students')
        .update({ user_id: req.students.user_id }) // Wait, user_id is in claim_requests, not students yet!
        // Fix below in actual implementation
        .eq('id', req.students.id);
    } catch (e) {}
  };

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const TABS: FilterTab[] = ['All', 'Unread'];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.avatarCircle}
            onPress={() => router.push('/(admin)/profile')}
          >
            {logoUrl ? (
              <Image source={{ uri: logoUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{getInitials(adminName)}</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.headerTitle}>PrestoID</Text>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => router.push('/(admin)/profile')}
          >
            <Ionicons name="settings-outline" size={20} color={Colors.text.primary} />
          </TouchableOpacity>
        </View>

        {/* Test Mode Banner */}
        {!verified && (
          <View style={styles.testModeBanner}>
            <Ionicons name="construct-outline" size={16} color="#FFF" />
            <Text style={styles.testModeText}>Test Mode (Awaiting Verification)</Text>
          </View>
        )}

        {/* Title Row */}
        <View style={styles.titleRow}>
          <Text style={styles.title}>Notifications</Text>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={markAllRead} style={styles.markAllButton}>
              <Ionicons name="checkmark-done" size={16} color={Colors.accent.primary} style={{ marginRight: 4 }} />
              <Text style={styles.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Tabs */}
        <View style={styles.tabsRow}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab}
                {tab === 'Unread' && unreadCount > 0 ? ` (${unreadCount})` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Account Deletion Requests Section */}
        {deletionRequests.length > 0 && (
          <View style={styles.deletionSection}>
            <View style={styles.deletionHeader}>
              <Ionicons name="trash-outline" size={18} color={Colors.status.danger} />
              <Text style={styles.deletionTitle}>Account Deletion Requests ({deletionRequests.length})</Text>
            </View>
            {deletionRequests.map((req) => (
              <View key={req.id} style={styles.deletionCard}>
                <View style={styles.deletionCardLeft}>
                  <Text style={styles.deletionName}>{req.user_name}</Text>
                  <Text style={styles.deletionEmail}>{req.user_email}</Text>
                  <Text style={styles.deletionTime}>
                    Requested: {new Date(req.requested_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
                <View style={styles.deletionCardActions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.rejectBtn]}
                    onPress={() => handleRejectDeletion(req.id)}
                  >
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.approveBtn]}
                    onPress={() => handleApproveDeletion(req.id)}
                  >
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Claim Requests Section */}
        {claimRequests.length > 0 && (
          <View style={[styles.deletionSection, { borderColor: Colors.accent.primary + '30' }]}>
            <View style={styles.deletionHeader}>
              <Ionicons name="person-add-outline" size={18} color={Colors.accent.primary} />
              <Text style={[styles.deletionTitle, { color: Colors.accent.primary }]}>Pending Profile Claims ({claimRequests.length})</Text>
            </View>
            <Text style={{ fontSize: 12, color: Colors.text.secondary, marginBottom: 12 }}>
              These students used their Aadhaar number to claim a profile. Verify their identity before approving.
            </Text>
            {claimRequests.map((req) => (
              <View key={req.id} style={styles.deletionCard}>
                <View style={styles.deletionCardLeft}>
                  <Text style={styles.deletionName}>{req.students?.name}</Text>
                  <Text style={styles.deletionEmail}>Aadhaar: {req.students?.aadhaar_number}</Text>
                  <Text style={styles.deletionEmail}>Batch: {req.students?.batch_name}</Text>
                  <Text style={styles.deletionTime}>
                    Requested: {new Date(req.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
                <View style={styles.deletionCardActions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.rejectBtn]}
                    onPress={async () => {
                      await supabase.from('claim_requests').update({ status: 'declined' }).eq('id', req.id);
                      fetchClaimRequests();
                    }}
                  >
                    <Text style={styles.rejectBtnText}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.approveBtn, { backgroundColor: Colors.status.success }]}
                    onPress={async () => {
                      const { data: claimData, error: claimErr } = await supabase.from('claim_requests').select('user_id').eq('id', req.id).single();
                      if (claimErr || !claimData) return;
                      // Claim it!
                      await supabase.from('students').update({ user_id: claimData.user_id }).eq('id', req.students?.id);
                      await supabase.from('claim_requests').update({ status: 'approved' }).eq('id', req.id);
                      fetchClaimRequests();
                      Alert.alert('Approved', `${req.students?.name}'s profile has been linked to their account.`);
                    }}
                  >
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Notification List */}
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={48} color={Colors.text.tertiary} />
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptySubtitle}>No unread notifications</Text>
          </View>
        ) : (
          filtered.map((notification) => {
            const config = NOTIFICATION_CONFIG[notification.type];
            return (
              <TouchableOpacity
                key={notification.id}
                style={[
                  styles.notifCard,
                  !notification.read && styles.notifCardUnread,
                ]}
                activeOpacity={0.7}
                onPress={() => markAsRead(notification.id)}
              >
                {/* Unread dot indicator */}
                {!notification.read && <View style={styles.unreadDot} />}

                {/* Icon */}
                <View style={[styles.notifIconCircle, { backgroundColor: config.tint + '15' }]}>
                  <Ionicons name={config.icon} size={20} color={config.tint} />
                </View>

                {/* Content */}
                <View style={styles.notifContent}>
                  <Text style={[styles.notifTitle, !notification.read && styles.notifTitleUnread]}>
                    {notification.title}
                  </Text>
                  <Text style={styles.notifDescription} numberOfLines={2}>
                    {notification.description}
                  </Text>
                  <Text style={styles.notifTime}>{notification.timeAgo}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  scrollContent: {
    paddingTop: 12,
    paddingBottom: 100,
    paddingHorizontal: 20,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text.inverse,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.bg.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.card.border,
  },

  // Title Row
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  markAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.accent.primary + '10',
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.accent.primary,
  },

  // Filter Tabs
  tabsRow: {
    flexDirection: 'row',
    gap: 0,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.accent.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.tertiary,
  },
  tabTextActive: {
    color: Colors.accent.primary,
    fontWeight: '700',
  },

  // Notification Card
  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.bg.secondary,
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.card.border,
    gap: 12,
    position: 'relative',
  },
  notifCardUnread: {
    backgroundColor: Colors.card.highlight,
    borderColor: Colors.stitch.primaryFixedDim + '40',
  },
  unreadDot: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent.primary,
  },
  notifIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  notifContent: {
    flex: 1,
    paddingRight: 12,
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 3,
  },
  notifTitleUnread: {
    fontWeight: '700',
  },
  notifDescription: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 18,
    fontWeight: '500',
    marginBottom: 4,
  },
  notifTime: {
    fontSize: 11,
    color: Colors.text.tertiary,
    fontWeight: '500',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.text.tertiary,
    fontWeight: '500',
  },
  testModeBanner: {
    backgroundColor: Colors.status.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
    marginBottom: 10,
    gap: 6,
    ...Shadows.sm,
  },
  testModeText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 12,
  },
  deletionSection: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.status.danger + '30',
    padding: 16,
    marginBottom: 20,
    ...Shadows.sm,
  },
  deletionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  deletionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.status.danger,
  },
  deletionCard: {
    backgroundColor: Colors.bg.primary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.card.border,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deletionCardLeft: {
    flex: 1,
    marginRight: 8,
  },
  deletionName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  deletionEmail: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 2,
    fontWeight: '500',
  },
  deletionTime: {
    fontSize: 10,
    color: Colors.text.tertiary,
    marginTop: 4,
    fontWeight: '500',
  },
  deletionCardActions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectBtn: {
    backgroundColor: Colors.bg.tertiary,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  rejectBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  approveBtn: {
    backgroundColor: Colors.status.danger,
  },
  approveBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
});

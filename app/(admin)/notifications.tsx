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
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useNotificationStore } from '@/stores/useNotificationStore';

let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch (e) {
  console.warn('Notifications module not loaded:', e);
}

type NotificationType = 'fee_payment' | 'new_student' | 'attendance' | 'system';

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
};

const formatTimeAgo = (date: Date) => {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

type FilterTab = 'All' | 'Unread';

export default function AdminNotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>('All');
  const [refreshing, setRefreshing] = useState(false);
  const { user, verified, businessId, avatarUrl } = useAuthStore();
  const [deletionRequests, setDeletionRequests] = useState<any[]>([]);
  const [claimRequests, setClaimRequests] = useState<any[]>([]);
  const [adminName, setAdminName] = useState('Admin');
  const logoUrl = avatarUrl || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
  const [hasNotificationPermission, setHasNotificationPermission] = useState(true);

  const checkPermissions = async () => {
    if (!Notifications) return;
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setHasNotificationPermission(status === 'granted');
    } catch (e) {
      console.warn('Failed to check notifications permission:', e);
    }
  };

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

  // Load/save local read state from AsyncStorage
  const loadReadNotifications = async (): Promise<string[]> => {
    try {
      const readIdsJSON = await AsyncStorage.getItem('@presto_admin_read_notifications');
      return readIdsJSON ? JSON.parse(readIdsJSON) : [];
    } catch (e) {
      console.warn('Failed to load read notifications:', e);
      return [];
    }
  };

  const saveReadNotifications = async (ids: string[]) => {
    try {
      await AsyncStorage.setItem('@presto_admin_read_notifications', JSON.stringify(ids));
    } catch (e) {
      console.warn('Failed to save read notifications:', e);
    }
  };

  const fetchDynamicAlerts = async () => {
    if (!user) return;
    try {
      let currentBusinessId = businessId;
      if (!currentBusinessId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('business_id')
          .eq('id', user.id)
          .maybeSingle();
        currentBusinessId = profile?.business_id;
      }
      
      if (!currentBusinessId) return;

      const rawAlerts: Array<Notification & { timestamp: Date }> = [];

      // 1. Fetch recent payments
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select(`
          id,
          amount,
          payment_date,
          transaction_id,
          students!inner (
            name,
            business_id
          )
        `)
        .eq('students.business_id', currentBusinessId)
        .order('payment_date', { ascending: false })
        .limit(10);

      if (!paymentsError && payments) {
        payments.forEach((p: any) => {
          const pDate = p.payment_date ? new Date(p.payment_date) : new Date();
          const formattedMonth = p.payment_date
            ? new Date(p.payment_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            : 'Current Month';
          rawAlerts.push({
            id: `pay-${p.id}`,
            type: 'fee_payment',
            title: 'Fee Payment Received',
            description: `${p.students?.name || 'A student'} paid ₹${Number(p.amount).toLocaleString()} for ${formattedMonth}`,
            timeAgo: '',
            timestamp: pDate,
            read: false,
          });
        });
      }

      // 2. Fetch today's/recent absentees
      const { data: absentees, error: absenteesError } = await supabase
        .from('attendance')
        .select(`
          id,
          date,
          created_at,
          students!inner (
            name,
            business_id,
            batch_name
          )
        `)
        .eq('students.business_id', currentBusinessId)
        .eq('status', 'absent')
        .order('date', { ascending: false })
        .limit(10);

      if (!absenteesError && absentees) {
        absentees.forEach((a: any) => {
          const aDate = a.created_at ? new Date(a.created_at) : new Date(a.date);
          rawAlerts.push({
            id: `abs-${a.id}`,
            type: 'attendance',
            title: 'Absent Alert',
            description: `${a.students?.name || 'A student'} (${a.students?.batch_name || 'N/A'}) was absent on ${a.date}`,
            timeAgo: '',
            timestamp: aDate,
            read: false,
          });
        });
      }

      // 3. Fetch recently registered students
      const { data: newStudents, error: studentError } = await supabase
        .from('students')
        .select('id, name, created_at, enrollment_id')
        .eq('business_id', currentBusinessId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!studentError && newStudents) {
        newStudents.forEach((s: any) => {
          rawAlerts.push({
            id: `std-${s.id}`,
            type: 'new_student',
            title: 'New Student Registered',
            description: `${s.name} (${s.enrollment_id}) joined the workspace`,
            timeAgo: '',
            timestamp: new Date(s.created_at),
            read: false,
          });
        });
      }



      // Sort by timestamp descending
      rawAlerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Load read IDs
      const readIds = await loadReadNotifications();

      // Format timeAgo and mark read state
      const finalAlerts = rawAlerts.map(alert => ({
        id: alert.id,
        type: alert.type,
        title: alert.title,
        description: alert.description,
        timeAgo: formatTimeAgo(alert.timestamp),
        read: readIds.includes(alert.id),
      }));

      setNotifications(finalAlerts);

      // Update badge store
      const unread = finalAlerts.filter(n => !n.read).length;
      useNotificationStore.getState().setAdminUnreadCount(unread);
    } catch (e) {
      console.warn('Failed to fetch dynamic alerts:', e);
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

  useFocusEffect(
    useCallback(() => {
      fetchAdminProfile();
      fetchDeletionRequests();
      fetchClaimRequests();
      fetchDynamicAlerts();
      checkPermissions();
    }, [user, verified])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchDeletionRequests(),
      fetchClaimRequests(),
      fetchDynamicAlerts()
    ]);
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

  const markAsRead = async (id: string) => {
    const updated = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    setNotifications(updated);
    const readIds = await loadReadNotifications();
    if (!readIds.includes(id)) {
      const nextRead = [...readIds, id];
      await saveReadNotifications(nextRead);
    }
    // Update store count
    const unread = updated.filter(n => !n.read).length;
    useNotificationStore.getState().setAdminUnreadCount(unread);
  };

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    const allIds = notifications.map(n => n.id);
    await saveReadNotifications(allIds);
    // Update store count
    useNotificationStore.getState().setAdminUnreadCount(0);
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

        {/* Permissions Warning Banner */}
        {!hasNotificationPermission && (
          <View style={styles.permissionWarningCard}>
            <Ionicons name="notifications-off" size={20} color="#FF9800" />
            <View style={{ flex: 1 }}>
              <Text style={styles.permissionWarningTitle}>Notifications Disabled</Text>
              <Text style={styles.permissionWarningDesc}>Enable notifications in settings to get real-time workspace updates.</Text>
            </View>
            <TouchableOpacity style={styles.permissionWarningBtn} onPress={() => Linking.openSettings()}>
              <Text style={styles.permissionWarningBtnText}>Enable</Text>
            </TouchableOpacity>
          </View>
        )}

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
  permissionWarningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 152, 0, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 152, 0, 0.25)',
    padding: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    gap: 12,
  },
  permissionWarningTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  permissionWarningDesc: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginTop: 2,
    lineHeight: 15,
  },
  permissionWarningBtn: {
    backgroundColor: Colors.accent.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  permissionWarningBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

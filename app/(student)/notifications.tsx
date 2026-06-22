import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useNotificationStore } from '@/stores/useNotificationStore';

let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch (e) {
  console.warn('Notifications module not loaded in notifications screen:', e);
}

type NotificationType = 'absent' | 'fee' | 'announcement' | 'general' | 'attendance' | 'schedule';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  time: string;
  read: boolean;
}

const typeConfig: Record<NotificationType, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  absent: { icon: 'close-circle-outline', color: Colors.status.danger, label: 'Absent Alert' },
  fee: { icon: 'wallet-outline', color: Colors.status.warning, label: 'Fee Reminder' },
  announcement: { icon: 'megaphone-outline', color: Colors.accent.primary, label: 'Announcement' },
  general: { icon: 'information-circle-outline', color: Colors.stitch.tertiaryNeutral, label: 'General' },
  attendance: { icon: 'checkmark-circle-outline', color: Colors.status.success, label: 'Attendance' },
  schedule: { icon: 'calendar-outline', color: Colors.status.info, label: 'Schedule' },
};

export default function StudentNotificationsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [studentName, setStudentName] = useState('You');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [hasNotificationPermission, setHasNotificationPermission] = useState(true);

  const checkPermissions = async () => {
    if (!Notifications) return;
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setHasNotificationPermission(status === 'granted');
    } catch (e) {
      console.warn('Failed to check notification permissions:', e);
    }
  };

  const loadReadNotifications = async (): Promise<string[]> => {
    try {
      const readIdsJSON = await AsyncStorage.getItem('@presto_student_read_notifications');
      return readIdsJSON ? JSON.parse(readIdsJSON) : [];
    } catch (e) {
      console.warn('Failed to load read notifications:', e);
      return [];
    }
  };

  const saveReadNotifications = async (ids: string[]) => {
    try {
      await AsyncStorage.setItem('@presto_student_read_notifications', JSON.stringify(ids));
    } catch (e) {
      console.warn('Failed to save read notifications:', e);
    }
  };

  const loadData = async (silent = false) => {
    if (!user) return;
    if (!silent) setIsLoading(true);
    try {
      const attPref = await AsyncStorage.getItem('@presto_student_settings_attendance_alerts');
      const feePref = await AsyncStorage.getItem('@presto_student_settings_fee_reminders');
      const attendanceEnabled = attPref !== 'false';
      const feeEnabled = feePref !== 'false';

      const readIds = await loadReadNotifications();

      // 1. Fetch Student Profile
      let student = null;
      try {
        const { data, error } = await supabase
          .from('students')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!error && data) {
          student = data;
          setStudentName(data.name);
        }
      } catch (err) {
        console.warn('Failed to fetch student record:', err);
      }

      // 2. Fetch Dynamic System Alerts
      const alerts: Notification[] = [];
      if (student) {
        // Fetch recent attendance logs
        if (attendanceEnabled) {
          const { data: att, error: attError } = await supabase
            .from('attendance')
            .select('*')
            .eq('student_id', student.id)
            .order('date', { ascending: false })
            .limit(8);

          if (!attError && att) {
            att.forEach((a: any) => {
              const isAbsent = a.status === 'absent';
              const alertId = `att-${a.id}`;
              alerts.push({
                id: alertId,
                type: isAbsent ? 'absent' : 'attendance',
                title: isAbsent ? 'Absent Alert' : 'Attendance Marked',
                message: isAbsent
                  ? `You were marked absent today. Please connect with your faculty if this is an error.`
                  : `Your attendance was marked present on ${a.date}. Keep it up!`,
                time: a.date,
                read: readIds.includes(alertId),
              });
            });
          }
        }

        // Fetch recent payments
        if (feeEnabled) {
          const { data: paymentsList, error: payError } = await supabase
            .from('payments')
            .select('id, amount, payment_date, transaction_id')
            .eq('student_id', student.id)
            .order('payment_date', { ascending: false })
            .limit(5);

          if (!payError && paymentsList) {
            paymentsList.forEach((p: any) => {
              const formattedMonth = p.payment_date 
                ? new Date(p.payment_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                : 'Current Month';
              const receiptNo = p.transaction_id || `REC-${p.id.slice(0, 8).toUpperCase()}`;
              const alertId = `pay-${p.id}`;
              alerts.push({
                id: alertId,
                type: 'fee',
                title: 'Payment Received',
                message: `Your payment of ₹${Number(p.amount).toLocaleString()} for ${formattedMonth} has been verified. Receipt No: ${receiptNo}`,
                time: p.payment_date ? new Date(p.payment_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short' }) : 'Recent',
                read: readIds.includes(alertId),
              });
            });
          }
        }
      }

      // Fallback welcome message if absolutely empty
      if (alerts.length === 0) {
        const alertId = 'sys-welcome';
        alerts.push({
          id: alertId,
          type: 'general',
          title: 'Welcome to PrestoID',
          message: 'Your account is now linked. Show your digital ID card at the center to mark attendance!',
          time: 'Just now',
          read: readIds.includes(alertId),
        });
      }
      setNotifications(alerts);

      // Update badge store
      const unread = alerts.filter((n) => !n.read).length;
      useNotificationStore.getState().setStudentUnreadCount(unread);
    } catch (err) {
      console.warn('Failed to load student notifications:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Refresh user metadata in background exactly once on mount
    const refreshUser = async () => {
      try {
        const { data: { user: freshUser } } = await supabase.auth.getUser();
        if (freshUser) {
          useAuthStore.getState().setUser(freshUser);
        }
      } catch (e) {
        console.warn('Failed to refresh user in notifications:', e);
      }
    };
    refreshUser();
  }, []);

  // Reload data on tab focus
  useFocusEffect(
    useCallback(() => {
      loadData();
      checkPermissions();
    }, [user])
  );

  const markAsRead = async (id: string) => {
    const updated = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    setNotifications(updated);
    
    // Save to AsyncStorage
    const readIds = await loadReadNotifications();
    if (!readIds.includes(id)) {
      const nextRead = [...readIds, id];
      await saveReadNotifications(nextRead);
    }
    
    // Update store count
    const unread = updated.filter((n) => !n.read).length;
    useNotificationStore.getState().setStudentUnreadCount(unread);
  };

  const markAllRead = async () => {
    const updated = notifications.map((n) => ({ ...n, read: true }));
    setNotifications(updated);
    
    // Save all to AsyncStorage
    const allIds = notifications.map((n) => n.id);
    await saveReadNotifications(allIds);
    
    // Update store count
    useNotificationStore.getState().setStudentUnreadCount(0);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;
  const filteredNotifications =
    filter === 'unread' ? notifications.filter((n) => !n.read) : notifications;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Notifications</Text>
            <Text style={styles.subtitle}>Stay updated with alerts and notifications</Text>
          </View>

          {/* Permissions Warning Banner */}
          {!hasNotificationPermission && (
            <View style={styles.permissionWarningCard}>
              <Ionicons name="notifications-off" size={20} color="#FF9800" />
              <View style={{ flex: 1 }}>
                <Text style={styles.permissionWarningTitle}>Notifications Disabled</Text>
                <Text style={styles.permissionWarningDesc}>Enable notifications in settings to get real-time check-in alerts.</Text>
              </View>
              <TouchableOpacity style={styles.permissionWarningBtn} onPress={() => Linking.openSettings()}>
                <Text style={styles.permissionWarningBtnText}>Enable</Text>
              </TouchableOpacity>
            </View>
          )}

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.accent.primary} />
            </View>
          ) : (
            <View>
              {/* Filter Row */}
              <View style={styles.filterRow}>
                <TouchableOpacity
                  style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
                  onPress={() => setFilter('all')}
                >
                  <Text style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
                    All ({notifications.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterTab, filter === 'unread' && styles.filterTabActive]}
                  onPress={() => setFilter('unread')}
                >
                  <Text style={[styles.filterTabText, filter === 'unread' && styles.filterTabTextActive]}>
                    Unread ({unreadCount})
                  </Text>
                </TouchableOpacity>

                {unreadCount > 0 && (
                  <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn}>
                    <Text style={styles.markAllText}>Mark all read</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Alerts List */}
              <View style={styles.notificationList}>
                {filteredNotifications.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="checkmark-done-circle-outline" size={48} color={Colors.status.success} style={{ marginBottom: 16 }} />
                    <Text style={styles.emptyTitle}>All caught up!</Text>
                    <Text style={styles.emptySubtitle}>No unread notifications. Check back later.</Text>
                  </View>
                ) : (
                  filteredNotifications.map((notification) => {
                    const config = typeConfig[notification.type];
                    return (
                      <TouchableOpacity
                        key={notification.id}
                        style={[styles.notificationItem, !notification.read && styles.notificationUnread]}
                        onPress={() => {
                          markAsRead(notification.id);
                          if (notification.id.startsWith('comm-')) {
                            router.push('/(student)/community');
                          }
                        }}
                        activeOpacity={0.8}
                      >
                        {!notification.read && <View style={styles.unreadDot} />}
                        <View style={styles.notifContent}>
                          <View style={styles.notifHeader}>
                            <View style={styles.notifLeft}>
                              <View style={[styles.notifIconBox, { backgroundColor: config.color + '10' }]}>
                                <Ionicons name={config.icon} size={18} color={config.color} />
                              </View>
                              <View style={styles.notifTitleRow}>
                                <Text style={[styles.notifTitle, !notification.read && styles.notifTitleUnread]} numberOfLines={1}>
                                  {notification.title}
                                </Text>
                                <View style={[styles.typeBadge, { backgroundColor: config.color + '10' }]}>
                                  <Text style={[styles.typeBadgeText, { color: config.color }]}>
                                    {config.label}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          </View>
                          <Text style={styles.notifMessage}>{notification.message}</Text>
                          <Text style={styles.notifTime}>{notification.time}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  scrollContent: {
    paddingTop: 40,
    paddingBottom: 100,
  },
  header: {
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginTop: 4,
    fontWeight: '500',
  },
  loadingContainer: {
    paddingVertical: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 8,
    marginBottom: 20,
    alignItems: 'center',
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  filterTabActive: {
    backgroundColor: Colors.accent.primary + '10',
    borderColor: Colors.accent.primary + '30',
  },
  filterTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  filterTabTextActive: {
    color: Colors.accent.primary,
  },
  markAllBtn: {
    marginLeft: 'auto',
    backgroundColor: Colors.accent.primary + '10',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  markAllText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.accent.primary,
  },
  notificationList: {
    paddingHorizontal: 24,
  },
  notificationItem: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.card.border,
    position: 'relative',
    overflow: 'hidden',
  },
  notificationUnread: {
    backgroundColor: 'rgba(175, 40, 0, 0.03)',
    borderColor: 'rgba(175, 40, 0, 0.12)',
  },
  unreadDot: {
    position: 'absolute',
    top: 18,
    left: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent.primary,
  },
  notifContent: {
    paddingLeft: 4,
  },
  notifHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  notifLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  notifIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifTitleRow: {
    flex: 1,
    gap: 4,
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  notifTitleUnread: {
    fontWeight: '800',
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  notifMessage: {
    fontSize: 12,
    color: Colors.text.secondary,
    lineHeight: 18,
    marginBottom: 8,
    fontWeight: '500',
  },
  notifTime: {
    fontSize: 11,
    color: Colors.text.tertiary,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.text.secondary,
    textAlign: 'center',
    fontWeight: '500',
    paddingHorizontal: 20,
  },
  permissionWarningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 152, 0, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 152, 0, 0.25)',
    padding: 12,
    marginHorizontal: 24,
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

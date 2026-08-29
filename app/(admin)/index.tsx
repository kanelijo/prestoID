import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, BackHandler, Animated, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PagerView from 'react-native-pager-view';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { supabase } from '@/lib/supabase';
import { CustomAlert } from '@/components/CustomAlert';

// Tab Components
import StudentsListTab from '@/components/admin/StudentsListTab';
import AdminTestTab from '@/components/admin/AdminTestTab';
import AdminLeaderboardTab from '@/components/admin/AdminLeaderboardTab';
import AdminNotificationsTab from '@/components/admin/AdminNotificationsTab';
import AdminProfileTab from '@/components/admin/AdminProfileTab';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TAB_WIDTH = SCREEN_WIDTH / 5;
const PILL_WIDTH = 52;
const PILL_LEFT = (TAB_WIDTH - PILL_WIDTH) / 2;

const TABS = [
  { key: 'students', label: 'Students', icon: 'people' as const, outlineIcon: 'people-outline' as const },
  { key: 'test', label: 'Test', icon: 'document-text' as const, outlineIcon: 'document-text-outline' as const },
  { key: 'leaderboard', label: 'Leaderboard', icon: 'podium' as const, outlineIcon: 'podium-outline' as const },
  { key: 'notifications', label: 'Alerts', icon: 'notifications' as const, outlineIcon: 'notifications-outline' as const },
  { key: 'profile', label: 'Profile', icon: 'person' as const, outlineIcon: 'person-outline' as const },
];

export default function AdminIndex() {
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<PagerView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const activeTabRef = useRef(0);
  const [activeTab, setActiveTab] = useState(0);
  const { adminUnreadCount } = useNotificationStore();
  const { user, businessId } = useAuthStore();
  const params = useLocalSearchParams<{ tab?: string }>();

  // Continuous 120fps hardware-synced gliding pill (ZERO LAG!)
  const handlePageScroll = useCallback(
    (e: any) => {
      const { position, offset } = e.nativeEvent;
      const current = position + offset;
      scrollX.setValue(current);

      const target = Math.round(current);
      if (target !== activeTabRef.current) {
        activeTabRef.current = target;
        setActiveTab(target);
      }
    },
    [scrollX]
  );

  const handlePageSelected = useCallback(
    (e: any) => {
      const pos = e.nativeEvent.position;
      scrollX.setValue(pos);
      activeTabRef.current = pos;
      setActiveTab(pos);
    },
    [scrollX]
  );

  // Sync tab if navigated with ?tab=test, etc.
  useEffect(() => {
    if (params.tab) {
      const idx = TABS.findIndex((t) => t.key === params.tab);
      if (idx !== -1 && idx !== activeTab) {
        activeTabRef.current = idx;
        setActiveTab(idx);
        scrollX.setValue(idx);
        pagerRef.current?.setPage(idx);
      }
    }
  }, [params.tab]);

  // Android hardware back button handler: if not on first tab, go to first tab
  useEffect(() => {
    const backAction = () => {
      if (activeTab !== 0) {
        activeTabRef.current = 0;
        setActiveTab(0);
        scrollX.setValue(0);
        pagerRef.current?.setPage(0);
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [activeTab]);

  // Realtime notification listeners
  useEffect(() => {
    if (user?.id && businessId) {
      useNotificationStore.getState().fetchAdminUnreadCount(user.id, businessId);

      const channelId = `admin_realtime_students_${businessId}_${Math.random().toString(36).substring(7)}`;
      const studentSub = supabase
        .channel(channelId)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'students',
            filter: `business_id=eq.${businessId}`,
          },
          (payload) => {
            const newStudent = payload.new;
            if (newStudent) {
              CustomAlert.alert(
                '🎉 New Student Registered!',
                `${newStudent.name || 'A new student'} (ID: ${newStudent.enrollment_id || 'N/A'}) has registered in ${newStudent.batch_name || 'your institute'}.`
              );
              useNotificationStore.getState().fetchAdminUnreadCount(user.id, businessId);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(studentSub);
      };
    }
  }, [user, businessId]);

  return (
    <View style={styles.container}>
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageScroll={handlePageScroll}
        onPageSelected={handlePageSelected}
        offscreenPageLimit={1}
      >
        <View key="students" style={styles.page}>
          <StudentsListTab />
        </View>
        <View key="test" style={styles.page}>
          <AdminTestTab />
        </View>
        <View key="leaderboard" style={styles.page}>
          <AdminLeaderboardTab />
        </View>
        <View key="notifications" style={styles.page}>
          <AdminNotificationsTab />
        </View>
        <View key="profile" style={styles.page}>
          <AdminProfileTab />
        </View>
      </PagerView>

      {/* WhatsApp Bottom Tab Bar */}
      <View
        style={[
          styles.tabBar,
          {
            height: Platform.OS === 'android' ? 64 : 64 + insets.bottom,
            paddingBottom: Platform.OS === 'android' ? 8 : insets.bottom > 0 ? insets.bottom - 4 : 8,
          },
        ]}
      >
        {/* Continuous Gliding Pill Indicator (Total 120fps Finger Sync!) */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.slidingPill,
            {
              transform: [
                {
                  translateX: scrollX.interpolate({
                    inputRange: [0, 1, 2, 3, 4],
                    outputRange: [
                      0 * TAB_WIDTH + PILL_LEFT,
                      1 * TAB_WIDTH + PILL_LEFT,
                      2 * TAB_WIDTH + PILL_LEFT,
                      3 * TAB_WIDTH + PILL_LEFT,
                      4 * TAB_WIDTH + PILL_LEFT,
                    ],
                  }),
                },
              ],
            },
          ]}
        />

        {TABS.map((tab, idx) => {
          const isFocused = activeTab === idx;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => {
                activeTabRef.current = idx;
                setActiveTab(idx);
                Animated.timing(scrollX, {
                  toValue: idx,
                  duration: 200,
                  useNativeDriver: true,
                }).start();
                pagerRef.current?.setPage(idx);
              }}
              activeOpacity={0.7}
              style={[styles.tabItem, { width: TAB_WIDTH }]}
            >
              <View style={styles.iconWrapper}>
                <Ionicons
                  name={isFocused ? tab.icon : tab.outlineIcon}
                  size={isFocused ? 21 : 22}
                  color={isFocused ? '#AF2800' : '#374151'}
                />
                {tab.key === 'notifications' && adminUnreadCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{adminUnreadCount}</Text>
                  </View>
                )}
              </View>
              <Text
                numberOfLines={1}
                style={[styles.tabLabel, isFocused && styles.tabLabelActive]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E5E7EB',
    borderTopWidth: 1,
    paddingTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 0,
    shadowOpacity: 0,
    position: 'relative',
  },
  slidingPill: {
    position: 'absolute',
    top: 6,
    left: 0,
    width: 52,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFE2DB',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    width: 52,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  tabLabel: {
    fontSize: 11,
    color: '#374151',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 3,
    letterSpacing: 0.1,
  },
  tabLabelActive: {
    color: '#111827',
    fontWeight: '800',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: 6,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
});

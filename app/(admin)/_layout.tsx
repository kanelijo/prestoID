import { useState, useEffect, useCallback, useRef } from 'react';
import { Tabs, Redirect, useRouter, usePathname } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, Platform, PanResponder } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { useAuthStore } from '@/stores/useAuthStore';
import { useNotificationStore } from '@/stores/useNotificationStore';
import OfflineBanner from '@/components/OfflineBanner';
import { supabase } from '@/lib/supabase';
import * as Haptics from 'expo-haptics';

const ADMIN_MAIN_TABS = [
  '/(admin)/students',
  '/(admin)/test',
  '/(admin)/leaderboard',
  '/(admin)/notifications',
  '/(admin)/profile',
];

function TrialBanner() {
  const { user } = useAuthStore();
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    const fetchTrial = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('businesses')
          .select('created_at')
          .eq('admin_id', user.id)
          .single();

        if (error) throw error;
        
        if (data?.created_at) {
          const startedAt = new Date(data.created_at).getTime();
          const now = Date.now();
          const diffMs = now - startedAt;
          const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          const remaining = Math.max(0, 7 - diffDays);
          setDaysLeft(remaining);
        }
      } catch (err) {
        console.warn('Failed to load trial info', err);
      }
    };
    fetchTrial();
  }, [user]);

  if (daysLeft === null) return null;

  const isExpired = daysLeft === 0;

  return (
    <View style={[styles.trialBanner, isExpired ? styles.trialExpired : styles.trialActive]}>
      <Ionicons name={isExpired ? "warning" : "time"} size={16} color="#FFF" />
      <Text style={styles.trialText}>
        {isExpired ? "Trial Expired. Paid features locked." : `Free Trial: ${daysLeft} days left`}
      </Text>
      {!isExpired && (
        <TouchableOpacity style={styles.upgradeBtn}>
          <Text style={styles.upgradeBtnText}>Upgrade</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

type TabIconProps = {
  name: keyof typeof Ionicons.glyphMap;
  label: string;
  focused: boolean;
};

function TabIcon({ name, label, focused }: TabIconProps) {
  return (
    <View style={styles.tabItem}>
      <View style={[styles.iconWrapper, focused && styles.iconWrapperActive]}>
        <Ionicons
          name={name}
          size={focused ? 21 : 22}
          color={focused ? '#AF2800' : '#374151'}
        />
      </View>
      <Text
        numberOfLines={1}
        style={[styles.tabLabel, focused && styles.tabLabelActive]}
      >
        {label}
      </Text>
    </View>
  );
}

import { CustomAlert } from '@/components/CustomAlert';

export default function AdminLayout() {
  const insets = useSafeAreaInsets();
  const { user, businessId, role } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  const handleSwipeTab = useCallback((direction: 'next' | 'prev') => {
    const cleanPath = (pathname || '').toLowerCase();
    // Don't swipe if user is editing or in creation flow
    if (
      cleanPath.includes('create') ||
      cleanPath.includes('review') ||
      cleanPath.includes('analytics') ||
      cleanPath.includes('live-dashboard') ||
      cleanPath.includes('banks') ||
      cleanPath.includes('add')
    ) {
      return;
    }

    let currentIndex = -1;
    if (cleanPath.includes('students')) currentIndex = 0;
    else if (cleanPath.includes('test')) currentIndex = 1;
    else if (cleanPath.includes('leaderboard')) currentIndex = 2;
    else if (cleanPath.includes('notifications')) currentIndex = 3;
    else if (cleanPath.includes('profile')) currentIndex = 4;

    if (currentIndex === -1) return;

    if (direction === 'next' && currentIndex < ADMIN_MAIN_TABS.length - 1) {
      Haptics.selectionAsync();
      router.replace(ADMIN_MAIN_TABS[currentIndex + 1] as any);
    } else if (direction === 'prev' && currentIndex > 0) {
      Haptics.selectionAsync();
      router.replace(ADMIN_MAIN_TABS[currentIndex - 1] as any);
    }
  }, [pathname, router]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only trigger on clear horizontal swipe (dx dominates dy)
        return (
          Math.abs(gestureState.dx) > 30 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.4
        );
      },
      onPanResponderRelease: (_, gestureState) => {
        if (Math.abs(gestureState.dx) > 40 || Math.abs(gestureState.vx) > 0.3) {
          if (gestureState.dx < 0) {
            handleSwipeTab('next');
          } else {
            handleSwipeTab('prev');
          }
        }
      },
    })
  ).current;

  if (role && role !== 'admin') {
    return <Redirect href="/(student)/id-card" />;
  }
  const { adminUnreadCount } = useNotificationStore();

  useEffect(() => {
    if (user?.id && businessId) {
      useNotificationStore.getState().fetchAdminUnreadCount(user.id, businessId);

      // Realtime listener for new student registrations
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
    <View
      style={{ flex: 1 }}
      key={businessId || 'admin-root'}
      {...panResponder.panHandlers}
    >
      {/* <TrialBanner /> */}
      <OfflineBanner />
      <Tabs
        backBehavior="initialRoute"
        screenOptions={{
          lazy: false,
          headerShown: false,
          tabBarButton: (props) => (
            <TouchableOpacity
              {...props}
              activeOpacity={0.7}
            />
          ),
          tabBarStyle: [
            styles.tabBar,
            {
              backgroundColor: '#FFFFFF',
              borderTopColor: '#E5E7EB',
              borderTopWidth: 1,
              elevation: 0,
              shadowOpacity: 0,
              height: Platform.OS === 'android' ? 64 : 64 + insets.bottom,
              paddingBottom: Platform.OS === 'android' ? 8 : (insets.bottom > 0 ? insets.bottom - 4 : 8),
            },
          ],
          tabBarShowLabel: false,
        }}
    >
      <Tabs.Screen
        name="students"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name={focused ? 'people' : 'people-outline'}
              label="Students"
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="test"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name={focused ? 'document-text' : 'document-text-outline'}
              label="Test"
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name={focused ? 'podium' : 'podium-outline'}
              label="Leaderboard"
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          tabBarBadge: adminUnreadCount > 0 ? adminUnreadCount : undefined,
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name={focused ? 'notifications' : 'notifications-outline'}
              label="Alerts"
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name={focused ? 'person' : 'person-outline'}
              label="Profile"
              focused={focused}
            />
          ),
          }}
        />
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="test/create-ai" options={{ href: null }} />
      <Tabs.Screen name="test/create-manual" options={{ href: null }} />
      <Tabs.Screen name="test/target-exam-admin" options={{ href: null }} />
      <Tabs.Screen name="test/banks" options={{ href: null }} />
      <Tabs.Screen name="test/review/[id]" options={{ href: null }} />
      <Tabs.Screen name="test/live-dashboard/[id]" options={{ href: null }} />
      <Tabs.Screen name="test/zenza-review" options={{ href: null }} />
      <Tabs.Screen name="test/analytics/[id]" options={{ href: null }} />
      <Tabs.Screen name="notebank" options={{ href: null }} />
      <Tabs.Screen name="pdf-viewer" options={{ href: null }} />
      <Tabs.Screen name="lab" options={{ href: null }} />
      <Tabs.Screen name="coaching-profile" options={{ href: null }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E5E7EB',
    borderTopWidth: 1,
    paddingTop: 6,
    elevation: 0,
    shadowOpacity: 0,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 68,
  },
  iconWrapper: {
    width: 52,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  iconWrapperActive: {
    backgroundColor: '#FFE2DB',
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
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  trialActive: {
    backgroundColor: Colors.status.warning,
  },
  trialExpired: {
    backgroundColor: Colors.status.danger,
  },
  trialText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  upgradeBtn: {
    backgroundColor: '#FFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  upgradeBtnText: {
    color: Colors.status.warning,
    fontSize: 10,
    fontWeight: '800',
  },
});

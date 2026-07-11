import { useEffect, useState, useCallback, useRef } from 'react';
import { Tabs, useFocusEffect, Redirect, useRouter } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { clearBadgeCount, registerForPushNotificationsAsync } from '@/lib/notifications';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '@/stores/useAuthStore';
import { useNotificationStore } from '@/stores/useNotificationStore';
import OfflineBanner from '@/components/OfflineBanner';
import { supabase } from '@/lib/supabase';

type TabIconProps = {
  name: keyof typeof Ionicons.glyphMap;
  label: string;
  focused: boolean;
};

function TabIcon({ name, label, focused }: TabIconProps) {
  return (
    <View style={styles.tabItem}>
      <Ionicons
        name={name}
        size={22}
        color={focused ? Colors.accent.primary : Colors.text.tertiary}
      />
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit={true}
        minimumFontScale={0.7}
        style={[styles.tabLabel, focused && styles.tabLabelActive]}
      >
        {label}
      </Text>
      {focused && <View style={styles.activeIndicator} />}
    </View>
  );
}

export default function StudentLayout() {
  const insets = useSafeAreaInsets();
  const { user, role } = useAuthStore();

  if (role && role !== 'student') {
    return <Redirect href="/(admin)/students" />;
  }
  const { studentUnreadCount, studentPendingTestCount, fetchStudentPendingTestCount, studentCommunityUnreadCount } = useNotificationStore();
  const router = useRouter();

  useEffect(() => {
    clearBadgeCount();
    if (user?.id) {
      registerForPushNotificationsAsync(user.id);
      if (fetchStudentPendingTestCount) {
        fetchStudentPendingTestCount(user.id);
      }
    }
  }, [user?.id]);

  // Navigate to community screen when tapping a community push notification
  useEffect(() => {
    const tapSub = Notifications.addNotificationResponseReceivedListener(response => {
      const screen = response.notification.request.content.data?.screen;
      if (screen === 'community') {
        router.push('/(student)/community');
      }
    });
    // Increment community badge when notification arrives while app is open (but NOT if community is visible)
    const receiveSub = Notifications.addNotificationReceivedListener(notification => {
      const screen = notification.request.content.data?.screen;
      if (screen === 'community' && !useNotificationStore.getState().communityIsOpen) {
        const curr = useNotificationStore.getState().studentCommunityUnreadCount;
        useNotificationStore.getState().setStudentCommunityUnreadCount(curr + 1);
      }
    });
    return () => { tapSub.remove(); receiveSub.remove(); };
  }, [router]);

  return (
    <>
      <OfflineBanner />
      <Tabs
        backBehavior="history"
        screenOptions={{
        headerShown: false,
        tabBarStyle: [
          styles.tabBar,
          {
            height: 64 + insets.bottom,
            paddingBottom: insets.bottom > 0 ? insets.bottom - 4 : 8,
          },
        ],
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="id-card"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name={focused ? 'card' : 'card-outline'}
              label="ID Card"
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          tabBarStyle: { display: 'none' },
          tabBarBadge: studentCommunityUnreadCount > 0 ? studentCommunityUnreadCount : undefined,
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name={focused ? 'megaphone' : 'megaphone-outline'}
              label="Community"
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="test"
        options={{
          tabBarBadge: studentPendingTestCount > 0 ? studentPendingTestCount : undefined,
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
        name="notifications"
        options={{
          tabBarBadge: studentUnreadCount > 0 ? studentUnreadCount : undefined,
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
      <Tabs.Screen name="test/engine/[id]" options={{ href: null }} />
      <Tabs.Screen name="test/result/[id]" options={{ href: null }} />
      <Tabs.Screen name="notes" options={{ href: null }} />
      <Tabs.Screen name="pdf-viewer" options={{ href: null }} />
      <Tabs.Screen name="lab" options={{ href: null }} />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.bg.secondary,
    borderTopColor: Colors.card.border,
    borderTopWidth: 1,
    paddingTop: 8,
    elevation: 4,
    shadowColor: Colors.text.primary,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    width: 72,
  },
  tabLabel: {
    fontSize: 9,
    color: Colors.text.tertiary,
    fontWeight: '500',
    textAlign: 'center',
  },
  tabLabelActive: {
    color: Colors.accent.primary,
    fontWeight: '700',
  },
  activeIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.accent.primary,
    marginTop: 2,
  },
});

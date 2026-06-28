import { useEffect, useState, useCallback } from 'react';
import { Tabs, useFocusEffect } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { clearBadgeCount, registerForPushNotificationsAsync } from '@/lib/notifications';
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
  const { user } = useAuthStore();
  const { studentUnreadCount } = useNotificationStore();
  const [pendingTestCount, setPendingTestCount] = useState(0);

  useEffect(() => {
    clearBadgeCount();
    if (user) {
      registerForPushNotificationsAsync(user.id);
      fetchPendingTestCount();
    }
  }, [user]);

  const fetchPendingTestCount = async () => {
    if (!user?.id) return;
    try {
      const { data: student } = await supabase
        .from('students')
        .select('id, batch_name, business_id')
        .eq('user_id', user.id)
        .single();
      if (!student) return;

      const { data: allTests } = await supabase
        .from('tests')
        .select('id, batch_name')
        .eq('business_id', student.business_id)
        .eq('status', 'published');

      const applicable = (allTests || []).filter((t: any) =>
        !t.batch_name || t.batch_name === 'All' || t.batch_name === student.batch_name
      );

      const { data: submissions } = await supabase
        .from('test_submissions')
        .select('test_id')
        .eq('student_id', student.id);

      const takenIds = new Set((submissions || []).map((s: any) => s.test_id));
      const pending = applicable.filter((t: any) => !takenIds.has(t.id));
      setPendingTestCount(pending.length);
    } catch (err) {
      console.warn('Badge count fetch error:', err);
    }
  };

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
          tabBarBadge: pendingTestCount > 0 ? pendingTestCount : undefined,
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name={focused ? 'document-text' : 'document-text-outline'}
              label="Test"
              focused={focused}
            />
          ),
        }}
        listeners={{
          tabPress: () => {
            // Clear badge when tab is pressed
            setPendingTestCount(0);
          },
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

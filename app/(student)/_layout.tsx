import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { clearBadgeCount, registerForPushNotificationsAsync } from '@/lib/notifications';
import { useAuthStore } from '@/stores/useAuthStore';
import OfflineBanner from '@/components/OfflineBanner';

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

  useEffect(() => {
    clearBadgeCount();
    if (user) {
      registerForPushNotificationsAsync(user.id);
    }
  }, [user]);

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
      <Tabs.Screen name="select-profile" options={{ href: null }} />
      <Tabs.Screen name="test/engine/[id]" options={{ href: null }} />
      <Tabs.Screen name="test/result/[id]" options={{ href: null }} />
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

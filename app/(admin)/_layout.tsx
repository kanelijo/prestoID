import { useState, useEffect, useCallback } from 'react';
import { Tabs, Redirect } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { useAuthStore } from '@/stores/useAuthStore';
import { useNotificationStore } from '@/stores/useNotificationStore';
import OfflineBanner from '@/components/OfflineBanner';
import { supabase } from '@/lib/supabase';

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

export default function AdminLayout() {
  const insets = useSafeAreaInsets();
  const { user, businessId, role } = useAuthStore();

  if (role && role !== 'admin') {
    return <Redirect href="/(student)/id-card" />;
  }
  const { adminUnreadCount } = useNotificationStore();

  useEffect(() => {
    if (user?.id && businessId) {
      useNotificationStore.getState().fetchAdminUnreadCount(user.id, businessId);
    }
  }, [user, businessId]);

  return (
    <>
      {/* <TrialBanner /> */}
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
      <Tabs.Screen name="test/create-ai" options={{ href: null }} />
      <Tabs.Screen name="test/create-manual" options={{ href: null }} />
      <Tabs.Screen name="test/banks" options={{ href: null }} />
      <Tabs.Screen name="test/review/[id]" options={{ href: null }} />
      <Tabs.Screen name="test/zenza-review" options={{ href: null }} />
      <Tabs.Screen name="test/analytics/[id]" options={{ href: null }} />
      <Tabs.Screen name="notebank" options={{ href: null }} />
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

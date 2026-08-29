import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { useNotificationStore } from '@/stores/useNotificationStore';

const TABS_CONFIG: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; outlineIcon: keyof typeof Ionicons.glyphMap }> = {
  students: { label: 'Students', icon: 'people', outlineIcon: 'people-outline' },
  test: { label: 'Test', icon: 'document-text', outlineIcon: 'document-text-outline' },
  leaderboard: { label: 'Leaderboard', icon: 'podium', outlineIcon: 'podium-outline' },
  notifications: { label: 'Alerts', icon: 'notifications', outlineIcon: 'notifications-outline' },
  profile: { label: 'Profile', icon: 'person', outlineIcon: 'person-outline' },
};

export function AdminWhatsAppBottomTabBar({ state, descriptors, navigation }: MaterialTopTabBarProps) {
  const insets = useSafeAreaInsets();
  const { adminUnreadCount } = useNotificationStore();

  const visibleRoutes = state.routes.filter((r) => TABS_CONFIG[r.name]);

  return (
    <View
      style={[
        styles.tabBar,
        {
          height: Platform.OS === 'android' ? 64 : 64 + insets.bottom,
          paddingBottom: Platform.OS === 'android' ? 8 : insets.bottom > 0 ? insets.bottom - 4 : 8,
        },
      ]}
    >
      {visibleRoutes.map((route) => {
        const isFocused = state.routes[state.index]?.name === route.name;
        const config = TABS_CONFIG[route.name];
        if (!config) return null;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            activeOpacity={0.7}
            style={styles.tabItem}
          >
            <View style={[styles.iconWrapper, isFocused && styles.iconWrapperActive]}>
              <Ionicons
                name={isFocused ? config.icon : config.outlineIcon}
                size={isFocused ? 21 : 22}
                color={isFocused ? '#AF2800' : '#374151'}
              />
              {route.name === 'notifications' && adminUnreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{adminUnreadCount}</Text>
                </View>
              )}
            </View>
            <Text
              numberOfLines={1}
              style={[styles.tabLabel, isFocused && styles.tabLabelActive]}
            >
              {config.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E5E7EB',
    borderTopWidth: 1,
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
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

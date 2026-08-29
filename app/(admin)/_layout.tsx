import { useState, useEffect } from 'react';
import { Redirect } from 'expo-router';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { useAuthStore } from '@/stores/useAuthStore';
import { useNotificationStore } from '@/stores/useNotificationStore';
import OfflineBanner from '@/components/OfflineBanner';
import { supabase } from '@/lib/supabase';
import { CustomAlert } from '@/components/CustomAlert';
import { MaterialTopTabs } from '@/components/MaterialTopTabs';
import { AdminWhatsAppBottomTabBar } from '@/components/AdminWhatsAppBottomTabBar';

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
        <Ionicons name="sparkles" size={14} color="#FFF" style={{ marginLeft: 6 }} />
      )}
    </View>
  );
}

export default function AdminLayout() {
  const { user, businessId, role } = useAuthStore();

  if (role && role !== 'admin') {
    return <Redirect href="/(student)/id-card" />;
  }

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
    <View style={{ flex: 1 }} key={businessId || 'admin-root'}>
      {/* <TrialBanner /> */}
      <OfflineBanner />
      <MaterialTopTabs
        tabBarPosition="bottom"
        tabBar={(props) => <AdminWhatsAppBottomTabBar {...props} />}
        screenOptions={{
          lazy: false,
          swipeEnabled: true,
          animationEnabled: true,
        }}
      >
        <MaterialTopTabs.Screen
          name="students"
          options={{ title: 'Students' }}
        />
        <MaterialTopTabs.Screen
          name="test"
          options={{ title: 'Test' }}
        />
        <MaterialTopTabs.Screen
          name="leaderboard"
          options={{ title: 'Leaderboard' }}
        />
        <MaterialTopTabs.Screen
          name="notifications"
          options={{ title: 'Alerts' }}
        />
        <MaterialTopTabs.Screen
          name="profile"
          options={{ title: 'Profile' }}
        />
        <MaterialTopTabs.Screen name="index" options={{ swipeEnabled: false }} />
        <MaterialTopTabs.Screen name="community" options={{ swipeEnabled: false }} />
        <MaterialTopTabs.Screen name="notebank" options={{ swipeEnabled: false }} />
        <MaterialTopTabs.Screen name="pdf-viewer" options={{ swipeEnabled: false }} />
        <MaterialTopTabs.Screen name="lab" options={{ swipeEnabled: false }} />
        <MaterialTopTabs.Screen name="coaching-profile" options={{ swipeEnabled: false }} />
      </MaterialTopTabs>
    </View>
  );
}

const styles = StyleSheet.create({
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  trialActive: {
    backgroundColor: Colors.accent.primary,
  },
  trialExpired: {
    backgroundColor: '#EF4444',
  },
  trialText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
  },
});

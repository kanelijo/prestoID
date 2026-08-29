import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePrefetchStore } from '@/stores/usePrefetchStore';
import { useFeatureFlags } from '@/stores/useFeatureFlags';
import * as Notifications from 'expo-notifications';

export default function SplashScreen() {
  const router = useRouter();
  const containerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Instant Launch Pipeline (WhatsApp Speed - ~300ms)
    const runLaunchPipeline = async () => {
      let dest = '/onboarding';
      const minAnimPromise = new Promise(res => setTimeout(res, 350)); // Fast 350ms smooth transition
      const flagsPromise = useFeatureFlags.getState().initialize();

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
          let profile: any = null;
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('role, business_id, claimed, avatar_url, is_external')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profileError && profileError.message?.includes('avatar_url')) {
            const { data: fallbackProfile } = await supabase
              .from('profiles')
              .select('role, business_id, claimed, is_external')
              .eq('id', session.user.id)
              .maybeSingle();
            profile = fallbackProfile;
          } else {
            profile = profileData;
          }

          let role = profile?.role;
          let businessId = profile?.business_id;
          let claimed = profile?.claimed;
          let avatarUrl = profile?.avatar_url;
          let isExternal = profile?.is_external;
          let businessData = null;

          if (businessId) {
            const { data: bData } = await supabase
              .from('businesses')
              .select('id, organization_id, business_name, business_type')
              .eq('id', businessId)
              .maybeSingle();
            businessData = bData;
          }

          const store = useAuthStore.getState();
          store.setUser(session.user);
          store.setSession(session);
          store.setRole(role || 'student');
          store.setAvatarUrl(avatarUrl || null);
          if (businessData) {
            store.setBusiness(
              businessData.id,
              businessData.organization_id,
              businessData.business_name,
              businessData.business_type
            );
          }

          // Hydrate student profile data if student
          if (role === 'student' || !role) {
            const { data: studentRecord } = await supabase
              .from('students')
              .select('*')
              .eq('user_id', session.user.id)
              .maybeSingle();
            if (studentRecord) {
              store.setStudentData(studentRecord);
            }
          }

          // Trigger parallel background prefetching
          usePrefetchStore.getState().prefetchCriticalData(session.user.id, role || 'student', businessId);

          if (role === 'admin') {
            dest = businessId ? '/(admin)/students' : '/(auth)/create-institute';
          } else {
            if (isExternal) {
              dest = '/(student)/public-tests';
            } else {
              dest = (claimed || studentRecord) ? '/(student)/id-card' : '/(auth)/claim-profile';
            }
          }

          if ((global as any).pendingNotificationRedirect) {
            dest = (global as any).pendingNotificationRedirect;
            (global as any).pendingNotificationRedirect = null;
          } else {
            try {
              const lastResponse = await Notifications.getLastNotificationResponseAsync();
              if (lastResponse) {
                const data = lastResponse.notification.request.content.data;
                if (data && data.screen) {
                  if (data.screen === 'chat' && data.peerId) {
                    dest = `/(student)/student-chat?peerId=${data.peerId}`;
                  } else if (data.screen === 'peers') {
                    dest = '/(student)/peers';
                  } else if (data.screen === 'community') {
                    dest = '/(student)/community';
                  } else if (data.screen === 'test') {
                    dest = data.testId ? `/(student)/test/engine/${data.testId}` : '/(student)/test';
                  } else if (data.screen === 'admin') {
                    dest = '/(admin)/students';
                  }
                }
                await Notifications.clearLastNotificationResponseAsync();
              }
            } catch (notifErr) {
              // Ignore notification parse error
            }
          }

          await Promise.all([minAnimPromise, flagsPromise]);
        } else {
          // Check local cached profile for offline launch
          const cached = await AsyncStorage.getItem('@user_profile');
          if (cached) {
            const cachedProfile = JSON.parse(cached);
            const store = useAuthStore.getState();
            store.setRole(cachedProfile.role || 'student');
            store.setAvatarUrl(cachedProfile.avatarUrl || null);
            if (cachedProfile.userId) {
              store.setUser({ id: cachedProfile.userId, email: cachedProfile.email });
            }
            if (cachedProfile.businessId) {
              store.setBusiness(
                cachedProfile.businessId,
                cachedProfile.businessCode,
                cachedProfile.businessName,
                cachedProfile.businessType
              );
            }
            if (cachedProfile.role === 'admin') {
              dest = '/(admin)/students';
            } else if (cachedProfile.role === 'student' && cachedProfile.claimed) {
              dest = '/(student)/id-card';
            } else {
              dest = '/(auth)/login';
            }
          } else {
            const onboardingCompleted = await AsyncStorage.getItem('onboarding_completed');
            dest = onboardingCompleted === 'true' ? '/(auth)/login' : '/onboarding';
          }
          await Promise.all([minAnimPromise, flagsPromise]);
        }
      } catch (err) {
        console.warn('[Splash] Launch check error:', err);
        await minAnimPromise;
      }

      // Crisp, clean fade-out into app (150ms)
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        router.replace(dest as any);
      });
    };

    runLaunchPipeline();
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      {/* Centered Clean Brand Logo */}
      <View style={styles.centerContainer}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoLetter}>M</Text>
        </View>
        <Text style={styles.brandTitle}>MockS</Text>
        <Text style={styles.brandTagline}>Exam Level Preparation At Home</Text>
      </View>

      {/* WhatsApp-Style Minimalist Footer Tag */}
      <View style={styles.footerContainer}>
        <Text style={styles.fromText}>from</Text>
        <Text style={styles.teamText}>Team43</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoLetter: {
    fontSize: 38,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
  },
  brandTagline: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 6,
    fontWeight: '500',
  },
  footerContainer: {
    position: 'absolute',
    bottom: 36,
    alignItems: 'center',
  },
  fromText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '400',
    letterSpacing: 0.5,
  },
  teamText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 2,
  },
});

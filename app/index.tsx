import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePrefetchStore } from '@/stores/usePrefetchStore';
import { useFeatureFlags } from '@/stores/useFeatureFlags';
import * as Notifications from 'expo-notifications';


const { width } = Dimensions.get('window');

export default function SplashScreen() {
  const router = useRouter();
  const logoScale = useRef(new Animated.Value(0.3)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;

  const [loadingText, setLoadingText] = useState('Initializing Engine...');

  useEffect(() => {
    // 1. Entrance animation sequence
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 45,
          friction: 6,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(glowOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(subtitleOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // 2. Smooth Progress Bar (0% -> 100% over 2.2s)
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 2200,
      useNativeDriver: false,
    }).start();

    // Dynamic Loading Subtitles
    const t1 = setTimeout(() => setLoadingText('Syncing Community & Tests...'), 800);
    const t2 = setTimeout(() => setLoadingText('Preparing Workspace...'), 1600);

    // 3. Parallel Background Auth Check & Prefetching
    const runLaunchPipeline = async () => {
      let dest = '/onboarding';
      const minAnimPromise = new Promise(res => setTimeout(res, 2300)); // Minimum 2.3s splash experience
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
            const { data: business } = await supabase
              .from('businesses')
              .select('id, organization_id, business_name, business_type')
              .eq('id', businessId)
              .single();
            if (business) businessData = business;
          }

          if (role) {
            const store = useAuthStore.getState();
            store.setUser(session.user);
            store.setSession(session);
            store.setRole(role);
            store.setAvatarUrl(avatarUrl || null);
            if (businessData) {
              store.setBusiness(
                businessData.id,
                businessData.organization_id,
                businessData.business_name,
                businessData.business_type
              );
            }

            // Fire parallel background data prefetch for all tabs
            const prefetchPromise = usePrefetchStore
              .getState()
              .prefetchAll(session.user.id, role, businessId);

            if (role === 'admin') {
              dest = businessId ? '/(admin)/students' : '/(auth)/create-institute';
            } else {
              if (isExternal) {
                dest = '/(student)/public-tests';
              } else {
                dest = claimed ? '/(student)/id-card' : '/(auth)/claim-profile';
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
                  const { actionIdentifier, userText } = lastResponse as any;

                  // Quick reply or mark as read in background/foreground
                  if (actionIdentifier === 'reply' && userText && data?.senderId && data?.receiverId) {
                    await supabase.from('student_messages').insert({
                      sender_id: data.receiverId,
                      receiver_id: data.senderId,
                      text: userText,
                    });
                  } else if (actionIdentifier === 'mark_as_read' && data?.senderId && data?.receiverId) {
                    await supabase.from('student_messages')
                      .update({ is_read: true })
                      .eq('sender_id', data.senderId)
                      .eq('receiver_id', data.receiverId);
                  } else if (data && data.screen) {
                    let targetRoute = '';
                    if (data.screen === 'chat' && data.peerId) {
                      targetRoute = `/(student)/student-chat?peerId=${data.peerId}`;
                    } else if (data.screen === 'peers') {
                      targetRoute = '/(student)/peers';
                    } else if (data.screen === 'community') {
                      targetRoute = '/(student)/community';
                    } else if (data.screen === 'fees' || data.screen === 'attendance') {
                      targetRoute = '/(student)/profile';
                    } else if (data.screen === 'test') {
                      targetRoute = data.testId ? `/(student)/test/engine/${data.testId}` : '/(student)/test';
                    } else if (data.screen === 'admin') {
                      targetRoute = '/(admin)';
                    }
                    if (targetRoute) {
                      dest = targetRoute;
                    }
                  }
                  await Notifications.clearLastNotificationResponseAsync();
                }
              } catch (err) {
                console.warn('[Splash] Last notification check failed:', err);
              }
            }

            // Wait for prefetch, feature flags initialization, and splash animation
            await Promise.all([prefetchPromise, minAnimPromise, flagsPromise]);
          } else {
            await Promise.all([minAnimPromise, flagsPromise]);
          }
        } else {
          // Check local cache if offline
          const cachedProfileStr = await AsyncStorage.getItem('@user_profile');
          if (cachedProfileStr) {
            const cachedProfile = JSON.parse(cachedProfileStr);
            const store = useAuthStore.getState();
            store.setRole(cachedProfile.role);
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

      // Smooth fade-out into app
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        router.replace(dest as any);
      });
    };

    runLaunchPipeline();

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const progressBarWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={{ flex: 1, opacity: containerOpacity }}>
      <LinearGradient colors={[Colors.bg.primary, Colors.bg.secondary, Colors.bg.primary]} style={styles.container}>
        {/* Glow effect behind logo */}
        <Animated.View style={[styles.glow, { opacity: glowOpacity }]} />

        <Animated.View
          style={[
            styles.logoContainer,
            {
              transform: [{ scale: logoScale }],
              opacity: logoOpacity,
            },
          ]}
        >
          <View style={styles.logoIcon}>
            <Text style={styles.logoLetter}>Z</Text>
          </View>
          <Text style={styles.logoText}>Zenza</Text>
        </Animated.View>

        <Animated.Text style={[styles.subtitle, { opacity: subtitleOpacity }]}>
          Smart Organization Management
        </Animated.Text>

        {/* Dynamic Progress Bar & Branding at Bottom */}
        <View style={styles.bottomContainer}>
          <View style={styles.progressSection}>
            <Text style={styles.progressText}>{loadingText}</Text>
            <View style={styles.progressBarBg}>
              <Animated.View style={[styles.progressBarFill, { width: progressBarWidth }]} />
            </View>
          </View>

          <Text style={styles.brandingText}>by Team43</Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: Colors.accent.glow,
  },
  logoContainer: {
    alignItems: 'center',
  },
  logoIcon: {
    width: 84,
    height: 84,
    borderRadius: 26,
    backgroundColor: Colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: Colors.accent.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 10,
  },
  logoLetter: {
    fontSize: 46,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  logoText: {
    fontSize: 38,
    fontWeight: '800',
    color: Colors.text.primary,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.text.secondary,
    marginTop: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 44,
    width: width * 0.7,
    alignItems: 'center',
  },
  progressSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.tertiary,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  progressBarBg: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.accent.primary,
    borderRadius: 2,
  },
  brandingText: {
    fontSize: 12,
    color: Colors.text.tertiary,
    letterSpacing: 1,
    fontWeight: '600',
  },
});

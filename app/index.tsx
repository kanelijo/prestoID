import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePrefetchStore } from '@/stores/usePrefetchStore';

export default function SplashScreen() {
  const router = useRouter();
  const logoScale = useRef(new Animated.Value(0.3)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 600,
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

    // Check active auth session in database with timeout safety
    const checkAuth = async () => {
      let isDone = false;

      // 1. Instant Cache Routing: bypass network and animations if user has a cached profile
      try {
        const cachedProfileStr = await AsyncStorage.getItem('@user_profile');
        if (cachedProfileStr) {
          const cachedProfile = JSON.parse(cachedProfileStr);
          if (cachedProfile.role && cachedProfile.userId) {
            const store = useAuthStore.getState();
            
            // Reconstruct a minimal user object since we bypassed Supabase auth init
            store.setUser({ id: cachedProfile.userId, email: cachedProfile.email });
            
            store.setRole(cachedProfile.role);
            store.setAvatarUrl(cachedProfile.avatarUrl || null);
            if (cachedProfile.businessId) {
              store.setBusiness(
                cachedProfile.businessId,
                cachedProfile.businessCode,
                cachedProfile.businessName,
                cachedProfile.businessType
              );
            }
            
            if (cachedProfile.role === 'student') {
              const cachedStudentStr = await AsyncStorage.getItem('@presto_cached_student_data');
              if (cachedStudentStr) {
                store.setStudentData(JSON.parse(cachedStudentStr));
              }
              // Fire prefetch immediately — user has 2-3s of splash/animation before reaching tabs
              usePrefetchStore.getState().prefetchAll(cachedProfile.userId);
            }

            // Route instantly
            let dest = '';
            if (cachedProfile.role === 'admin') {
              dest = '/(admin)/students';
            } else {
              dest = cachedProfile.claimed ? '/(student)/id-card' : '/(auth)/claim-profile';
            }

            if ((global as any).pendingNotificationRedirect) {
              dest = (global as any).pendingNotificationRedirect;
              (global as any).pendingNotificationRedirect = null;
            }

            router.replace(dest as any);
            isDone = true;
            return;
          }
        }
      } catch (cacheErr) {
        console.warn('Failed to instantly route from cache:', cacheErr);
      }

      const timeout = setTimeout(async () => {
        if (!isDone) {
          isDone = true;
          console.warn('Splash auth check timed out after 8s. Checking local cache before fallback.');
          try {
            // Try cache first — user might just be offline
            const cachedProfileStr = await AsyncStorage.getItem('@user_profile');
            if (cachedProfileStr) {
              const cachedProfile = JSON.parse(cachedProfileStr);
              if (cachedProfile.role && cachedProfile.userId) {
                const store = useAuthStore.getState();
                store.setUser({ id: cachedProfile.userId, email: cachedProfile.email });
                store.setRole(cachedProfile.role);
                store.setAvatarUrl(cachedProfile.avatarUrl || null);
                if (cachedProfile.businessId) {
                  store.setBusiness(
                    cachedProfile.businessId,
                    cachedProfile.businessCode,
                    cachedProfile.businessName,
                    cachedProfile.businessType
                  );
                }
               // Route based on cached role
               let dest = '';
               if (cachedProfile.role === 'admin') {
                 dest = '/(admin)/students';
               } else if (cachedProfile.role === 'student' && cachedProfile.claimed) {
                 dest = '/(student)/id-card';
               } else {
                 dest = '/(auth)/login';
               }

               if ((global as any).pendingNotificationRedirect) {
                 dest = (global as any).pendingNotificationRedirect;
                 (global as any).pendingNotificationRedirect = null;
               }

               router.replace(dest as any);
               return;
              }
            }
            // No cache — check onboarding
            const onboardingCompleted = await AsyncStorage.getItem('onboarding_completed');
            router.replace(onboardingCompleted === 'true' ? '/(auth)/login' : '/onboarding');
          } catch {
            router.replace('/onboarding');
          }
        }
      }, 8000);

      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (isDone) return;

        if (session && session.user) {
          // Fetch user profile from database
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role, business_id, claimed, avatar_url')
            .eq('id', session.user.id)
            .single();

          if (isDone) return;

          let role = profile?.role;
          let businessId = profile?.business_id;
          let claimed = profile?.claimed;
          let avatarUrl = profile?.avatar_url;
          let businessData = null;

          if (profile && !profileError) {
            // Load business details if linked
            if (businessId) {
              const { data: business } = await supabase
                .from('businesses')
                .select('id, organization_id, business_name, business_type')
                .eq('id', businessId)
                .single();

              if (isDone) return;

              if (business) {
                businessData = business;
              }
            }

            // Save to local cache
            try {
              const profileCache = {
                userId: session.user.id,
                email: session.user.email,
                role,
                businessId,
                businessCode: businessData?.organization_id || null,
                businessName: businessData?.business_name || null,
                businessType: businessData?.business_type || null,
                claimed,
                avatarUrl,
              };
              await AsyncStorage.setItem('@user_profile', JSON.stringify(profileCache));
            } catch (cacheErr) {
              console.warn('Failed to save profile cache:', cacheErr);
            }
          } else {
            // Profile fetch from database failed (e.g. offline/network reconnecting)
            // Try reading from cache
            try {
              const cachedProfileStr = await AsyncStorage.getItem('@user_profile');
              if (cachedProfileStr) {
                const cachedProfile = JSON.parse(cachedProfileStr);
                role = cachedProfile.role;
                businessId = cachedProfile.businessId;
                claimed = cachedProfile.claimed;
                avatarUrl = cachedProfile.avatarUrl;
                if (businessId) {
                  businessData = {
                    id: businessId,
                    organization_id: cachedProfile.businessCode,
                    business_name: cachedProfile.businessName,
                    business_type: cachedProfile.businessType,
                  };
                }
              }
            } catch (cacheErr) {
              console.warn('Failed to read profile cache:', cacheErr);
            }
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

            // Route based on role
            let dest = '';
            if (role === 'admin') {
              dest = businessId ? '/(admin)/students' : '/(auth)/create-institute';
            } else {
              dest = claimed ? '/(student)/id-card' : '/(auth)/claim-profile';
              // Fire prefetch — user has splash+animation time before reaching tabs
              if (session.user?.id) {
                usePrefetchStore.getState().prefetchAll(session.user.id);
              }
            }

            if ((global as any).pendingNotificationRedirect) {
              dest = (global as any).pendingNotificationRedirect;
              (global as any).pendingNotificationRedirect = null;
            }

            router.replace(dest as any);
            clearTimeout(timeout);
            isDone = true;
            return;
          }
        }
        
        if (isDone) return;

        // No session or profile found, check onboarding status
        const onboardingCompleted = await AsyncStorage.getItem('onboarding_completed');
        if (onboardingCompleted === 'true') {
          router.replace('/(auth)/login');
        } else {
          router.replace('/onboarding');
        }
        clearTimeout(timeout);
        isDone = true;
      } catch (err) {
        if (isDone) return;
        clearTimeout(timeout);
        isDone = true;
        console.error('Splash auth check error:', err);
        // Check cache before falling back — might be offline
        try {
          const cachedProfileStr = await AsyncStorage.getItem('@user_profile');
          if (cachedProfileStr) {
            const cachedProfile = JSON.parse(cachedProfileStr);
            const store = useAuthStore.getState();
            store.setRole(cachedProfile.role);
            store.setAvatarUrl(cachedProfile.avatarUrl || null);
            if (cachedProfile.businessId) {
              store.setBusiness(
                cachedProfile.businessId,
                cachedProfile.businessCode,
                cachedProfile.businessName,
                cachedProfile.businessType
              );
            }
            let dest = '';
            if (cachedProfile.role === 'admin') {
              dest = '/(admin)/students';
            } else if (cachedProfile.role === 'student' && cachedProfile.claimed) {
              dest = '/(student)/id-card';
            } else {
              dest = '/(auth)/login';
            }

            if ((global as any).pendingNotificationRedirect) {
              dest = (global as any).pendingNotificationRedirect;
              (global as any).pendingNotificationRedirect = null;
            }

            router.replace(dest as any);
            return;
          }
        } catch {}
        router.replace('/onboarding');
      }
    };

    const timer = setTimeout(() => {
      checkAuth();
    }, 2200);

    return () => clearTimeout(timer);
  }, []);

  return (
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
          <Text style={styles.logoLetter}>P</Text>
        </View>
        <Text style={styles.logoText}>PrestoID</Text>
      </Animated.View>

      <Animated.Text style={[styles.subtitle, { opacity: subtitleOpacity }]}>
        Smart Organization Management
      </Animated.Text>

      <View style={styles.bottomBranding}>
        <Text style={styles.brandingText}>by Kanelijo</Text>
      </View>
    </LinearGradient>
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
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: Colors.accent.glow,
  },
  logoContainer: {
    alignItems: 'center',
  },
  logoIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: Colors.accent.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 8,
  },
  logoLetter: {
    fontSize: 44,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  logoText: {
    fontSize: 36,
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
  bottomBranding: {
    position: 'absolute',
    bottom: 50,
  },
  brandingText: {
    fontSize: 12,
    color: Colors.text.tertiary,
    letterSpacing: 1,
    fontWeight: '500',
  },
});

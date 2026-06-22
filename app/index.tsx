import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
      const timeout = setTimeout(async () => {
        if (!isDone) {
          isDone = true;
          console.warn('Splash auth check timed out after 8s. Routing to fallback.');
          try {
            const onboardingCompleted = await AsyncStorage.getItem('onboarding_completed');
            if (onboardingCompleted === 'true') {
              router.replace('/(auth)/login');
            } else {
              router.replace('/onboarding');
            }
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
            .select('role, business_id, claimed')
            .eq('id', session.user.id)
            .single();

          if (isDone) return;

          if (profile && !profileError) {
            const store = useAuthStore.getState();
            store.setUser(session.user);
            store.setSession(session);
            store.setRole(profile.role);
            
            // Load business details if linked
            if (profile.business_id) {
              const { data: business } = await supabase
                .from('businesses')
                .select('id, organization_id, business_name, business_type')
                .eq('id', profile.business_id)
                .single();

              if (isDone) return;

              if (business) {
                store.setBusiness(business.id, business.organization_id, business.business_name, business.business_type);
              }
            }

            // Route based on role
            if (profile.role === 'admin') {
              if (profile.business_id) {
                router.replace('/(admin)/students');
              } else {
                router.replace('/(auth)/create-institute');
              }
            } else {
              // Student
              if (profile.claimed) {
                router.replace('/(student)/id-card');
              } else {
                router.replace('/(auth)/claim-profile');
              }
            }
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

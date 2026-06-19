import { useEffect } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { Colors } from '@/constants/colors';

export default function GoogleAuthCallbackScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams();
  const { setUser, setSession, setRole } = useAuthStore();

  useEffect(() => {
    async function exchange() {
      if (code) {
        try {
          const { data: { user, session }, error } = await supabase.auth.exchangeCodeForSession(String(code));
          if (error) throw error;
          
          if (user) {
            setUser(user);
            setSession(session);
            
            // Fetch profile
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('role')
              .eq('id', user.id)
              .single();

            if (profileError && profileError.code !== 'PGRST116') {
              throw profileError;
            }

            if (profile && profile.role) {
              setRole(profile.role);
              if (profile.role === 'admin') {
                router.replace('/(admin)/students');
              } else {
                router.replace('/(student)/id-card');
              }
            } else {
              router.replace('/(auth)/role-select');
            }
          }
        } catch (err) {
          console.warn('Google Auth Callback Error:', err);
          router.replace('/(auth)/login');
        }
      } else {
        router.replace('/(auth)/login');
      }
    }
    exchange();
  }, [code]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.accent.primary} />
      <Text style={styles.text}>Completing Google login...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
});

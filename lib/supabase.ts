import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { APP_CONFIG } from '@/constants/config';

const supabaseUrl = APP_CONFIG.supabaseUrl || 'https://your-project.supabase.co';
const supabaseAnonKey = APP_CONFIG.supabaseAnonKey || 'your-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Configure Google Sign-In statically so signOut and signIn work across the app
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useAuthStore } from '@/stores/useAuthStore';

try {
  GoogleSignin.configure({
    webClientId: '698075781767-7me6ngm7q5je5lod3ktc5vjk15er19q0.apps.googleusercontent.com',
    offlineAccess: true,
  });
} catch (e) {
  console.warn('GoogleSignin config error in supabase.ts:', e);
}

export const signOutAll = async () => {
  try {
    await GoogleSignin.signOut();
  } catch (e) {
    // Ignore if not signed in or not configured
    console.log('GoogleSignin.signOut ignored/failed:', e);
  }
  await supabase.auth.signOut();
  useAuthStore.getState().reset();
};

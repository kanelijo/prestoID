import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useAuthStore } from '@/stores/useAuthStore';
import { usePrefetchStore } from '@/stores/usePrefetchStore';

export const signOutAll = async () => {
  try {
    await GoogleSignin.signOut();
  } catch (e) {
    console.log('GoogleSignin.signOut ignored/failed:', e);
  }
  await supabase.auth.signOut();
  try {
    await AsyncStorage.removeItem('@user_profile');
  } catch (err) {
    console.warn('Failed to clear cached profile:', err);
  }
  useAuthStore.getState().reset();
  usePrefetchStore.getState().reset();
};

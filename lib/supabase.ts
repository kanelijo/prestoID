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

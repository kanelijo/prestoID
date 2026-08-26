
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { APP_CONFIG } from '@/constants/config';

// These credentials point to the scraper project or fallback to main project
const supabaseUrl = process.env.EXPO_PUBLIC_SCRAPER_URL || APP_CONFIG.supabaseUrl || 'https://your-project.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SCRAPER_ANON_KEY || APP_CONFIG.supabaseAnonKey || 'your-anon-key';

export const scraperSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});


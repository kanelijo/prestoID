
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// These credentials will point to your NEW separate Supabase project
// Dedicated strictly for the Scraper "Content Lake"
const supabaseUrl = process.env.EXPO_PUBLIC_SCRAPER_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SCRAPER_ANON_KEY || '';

export const scraperSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

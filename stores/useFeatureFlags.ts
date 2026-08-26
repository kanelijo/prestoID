import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

interface FeatureFlagsState {
  flags: Record<string, boolean>;
  overrides: Record<string, boolean>;
  initialized: boolean;
  
  initialize: () => Promise<void>;
  isFeatureActive: (key: string) => boolean;
  setOverride: (key: string, enabled: boolean) => Promise<void>;
}

export const useFeatureFlags = create<FeatureFlagsState>((set, get) => ({
  flags: {},
  overrides: {},
  initialized: false,

  initialize: async () => {
    try {
      // 1. Load local developer overrides from AsyncStorage
      const overridesStr = await AsyncStorage.getItem('@feature_flag_overrides');
      const overrides = overridesStr ? JSON.parse(overridesStr) : {};

      // 2. Fetch global flags from Supabase
      const { data, error } = await supabase
        .from('feature_flags')
        .select('key, is_enabled');

      const dbFlags: Record<string, boolean> = {};
      if (!error && data) {
        data.forEach((flag: any) => {
          dbFlags[flag.key] = flag.is_enabled;
        });
      }

      set({ flags: dbFlags, overrides, initialized: true });
    } catch (err) {
      console.warn('[FeatureFlags] Initialization failed:', err);
    }
  },

  isFeatureActive: (key: string) => {
    const { flags, overrides } = get();
    // Local overrides take priority (used for testing on developer devices)
    if (overrides[key] !== undefined) {
      return overrides[key];
    }
    return !!flags[key];
  },

  setOverride: async (key: string, enabled: boolean) => {
    try {
      const { overrides } = get();
      const updatedOverrides = { ...overrides, [key]: enabled };
      
      await AsyncStorage.setItem('@feature_flag_overrides', JSON.stringify(updatedOverrides));
      set({ overrides: updatedOverrides });
    } catch (err) {
      console.warn('[FeatureFlags] Saving override failed:', err);
    }
  },
}));

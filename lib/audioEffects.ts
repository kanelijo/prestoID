import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AUDIO_ENABLED_KEY = '@zenza_audio_effects_enabled';

let isAudioEnabled = true;

// Load initial preference
AsyncStorage.getItem(AUDIO_ENABLED_KEY).then(val => {
  if (val !== null) {
    isAudioEnabled = val === 'true';
  }
});

export const getAudioEffectsEnabled = () => isAudioEnabled;

export const setAudioEffectsEnabled = async (enabled: boolean) => {
  isAudioEnabled = enabled;
  await AsyncStorage.setItem(AUDIO_ENABLED_KEY, String(enabled));
  if (enabled) {
    playAudioFeedback('success');
  }
};

export const playAudioFeedback = (type: 'success' | 'warning' | 'error' | 'click' = 'click') => {
  if (!isAudioEnabled) return;
  try {
    if (type === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (type === 'warning') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else if (type === 'error') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch (e) {
    console.warn('Audio/Haptic feedback error:', e);
  }
};

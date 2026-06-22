import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

let Notifications: any = null;
let Device: any = null;
let Constants: any = null;

try {
  Notifications = require('expo-notifications');
  Device = require('expo-device');
  Constants = require('expo-constants').default;
} catch (e) {
  console.warn('Notifications module not loaded:', e);
}

// Configure notification handler if the module is available
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Request notification permissions, retrieve the Expo Push Token, and save it in the database profiles.
 */
export async function registerForPushNotificationsAsync(userId: string): Promise<string | null> {
  if (!Notifications || !Device || !Constants) {
    console.log('Notifications module not loaded: Skipping push registration.');
    return null;
  }

  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('presto_alerts', {
        name: 'PrestoID Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        enableVibrate: true,
        showBadge: true,
      });
    } catch (e) {
      console.warn('Failed to set notification channel:', e);
    }
  }

  if (Device.isDevice || Platform.OS === 'android') {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.warn('Notification permissions denied.');
        return null;
      }

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });
      const token = tokenData.data;
      console.log('[SUCCESS] Fetched Expo Push Token:', token);

      // Get or create persistent device ID
      let deviceId = await AsyncStorage.getItem('device_id');
      if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
        await AsyncStorage.setItem('device_id', deviceId);
      }

      // Save push token in profiles
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          push_token: token,
          claimed: true
        })
        .eq('id', userId);

      if (profileError) {
        console.warn('Failed to update push_token in profiles:', profileError);
      } else {
        console.log('[SUCCESS] Saved push_token to database profiles for userId:', userId);
      }

      // Update device_id and is_claimed in students table where user_id matches
      const { error: studentError } = await supabase
        .from('students')
        .update({
          device_id: deviceId,
          is_claimed: true
        })
        .eq('user_id', userId);

      if (studentError) {
        console.warn('Failed to update device_id and is_claimed in students:', studentError);
      } else {
        console.log('[SUCCESS] Saved device_id and is_claimed to database students for userId:', userId);
      }

      return token;
    } catch (e: any) {
      console.warn('Failed to fetch Expo push token:', e);
      console.warn(
        '\n👉 TIP: Push notifications require Google Play Services on your device.\n' +
        '1. If you are using a Custom Dev Build (or APK), you MUST run a clean rebuild so that your google-services.json is compiled into native code. Run: npx expo run:android --clean\n' +
        '2. If you are using Expo Go, ensure you are testing on a physical device with active Google Play Services.'
      );
      return null;
    }
  } else {
    console.log('Skipped push token: Push notifications not supported on iOS Simulator');
    return null;
  }
}

/**
 * Call the Expo push notification service to deliver a notification to specified tokens.
 */
export async function sendPushNotification(
  to: string[],
  title: string,
  body: string,
  data: any = {},
  badge?: number
): Promise<void> {
  if (!to || to.length === 0) return;

  // Filter out invalid/empty tokens
  const cleanTokens = to.filter(token => token && token.startsWith('ExponentPushToken'));
  if (cleanTokens.length === 0) return;

  console.log(`[Push] Sending push notifications to ${cleanTokens.length} tokens individually.`);

  // Send to each token individually to avoid PUSH_TOO_MANY_EXPERIENCE_IDS error
  // which happens if tokens from different Expo projects are mixed in the database.
  const sendPromises = cleanTokens.map(async (token) => {
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          to: token,
          title,
          body,
          data,
          sound: 'default',
          priority: 'high',
          channelId: 'presto_alerts',
          badge: badge ?? 1,
        }),
      });

      const resData = await response.json();
      console.log(`Expo push response for token [${token.substring(0, 25)}...]:`, resData);
    } catch (error) {
      console.error(`Failed to send push notification to token [${token.substring(0, 25)}...]:`, error);
    }
  });

  await Promise.all(sendPromises);
}

/**
 * Clear the application's push notification badge count on the device launcher.
 */
export async function clearBadgeCount(): Promise<void> {
  if (Notifications && typeof Notifications.setBadgeCountAsync === 'function') {
    try {
      await Notifications.setBadgeCountAsync(0);
    } catch (e) {
      console.warn('Failed to clear badge count:', e);
    }
  }
}

/**
 * Trigger a local notification immediately on the device (if notifications module is available).
 */
export async function scheduleLocalNotification(title: string, body: string): Promise<void> {
  if (!Notifications) {
    console.log('Notifications module not loaded: Skipping local notification schedule.');
    return;
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        channelId: 'presto_alerts',
      },
      trigger: null,
    });
  } catch (error) {
    console.warn('Failed to schedule local notification:', error);
  }
}

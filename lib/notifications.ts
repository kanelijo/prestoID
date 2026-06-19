import { Platform } from 'react-native';
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

      // Save push token in profiles
      const { error } = await supabase
        .from('profiles')
        .update({ push_token: token })
        .eq('id', userId);

      if (error) {
        console.warn('Failed to update push_token in DB:', error);
      }

      return token;
    } catch (e) {
      console.warn('Failed to fetch Expo push token:', e);
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

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        to,
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
    console.log('Expo push response:', resData);
  } catch (error) {
    console.error('Failed to send push notifications:', error);
  }
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

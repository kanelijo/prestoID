import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

let Notifications: any = null;
let Device: any = null;
let Constants: any = null;

// Track the active screen globally so we can suppress notifications intelligently
export let currentActiveScreen = '';
export const setCurrentActiveScreen = (screen: string) => {
  currentActiveScreen = screen;
};

try {
  Notifications = require('expo-notifications');
  Device = require('expo-device');
  Constants = require('expo-constants').default;
} catch (e) {
  console.warn('Notifications module not loaded:', e);
}

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async (notification: any) => {
      const channelId = notification.request.trigger.channelId;
      const data = notification.request.content.data;
      
      // If we are on the community screen, and this is a community notification, suppress banner and sound
      if (currentActiveScreen === 'community' && (channelId === CHANNELS.community || data?.type === 'new_post' || data?.type === 'new_comment' || data?.type === 'new_like' || data?.type === 'new_reply')) {
         return {
           shouldPlaySound: false,
           shouldSetBadge: false,
           shouldShowAlert: false,
         };
      }
      
      return {
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowAlert: true,
      };
    },
  });
}

// Notification channel IDs
export const CHANNELS = {
  community:  'kf_community_v2',
  fees:       'kf_fees_v2',
  tests:      'kf_tests_v2',
  attendance: 'kf_attendance_v2',
  admin:      'kf_admin_v2',
  general:    'kf_general_v2',
};

async function ensureChannels() {
  if (!Notifications || Platform.OS !== 'android') return;
  const channelDefs = [
    { id: CHANNELS.community,  name: '💬 Community',   desc: 'Likes, comments and replies on posts' },
    { id: CHANNELS.fees,       name: '💰 Fee Alerts',  desc: 'Fee reminders and payment notices' },
    { id: CHANNELS.tests,      name: '📝 Tests',       desc: 'New tests and results' },
    { id: CHANNELS.attendance, name: '✅ Attendance',  desc: 'Attendance marked notifications' },
    { id: CHANNELS.admin,      name: '🔔 Admin Alerts',desc: 'New registrations and admin events' },
    { id: CHANNELS.general,    name: '📣 PrestoID',    desc: 'General app notifications' },
  ];
  for (const ch of channelDefs) {
    try {
      await Notifications.setNotificationChannelAsync(ch.id, {
        name: ch.name,
        description: ch.desc,
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 150, 100, 150],
        enableVibrate: true,
        showBadge: true,
        // No custom sound — Android uses system default automatically
        enableLights: true,
        lightColor: '#AF2800',
      });
    } catch (e) {
      console.warn('Channel setup failed:', ch.id, e);
    }
  }
}
/**
 * Request notification permissions, retrieve the Expo Push Token, and save it in the database profiles.
 */
export async function registerForPushNotificationsAsync(userId: string): Promise<string | null> {
  if (!Notifications || !Device || !Constants) {
    console.log('Notifications module not loaded: Skipping push registration.');
    return null;
  }

  // Set up all notification channels (WhatsApp-style, one per category)
  await ensureChannels();

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
  badge?: number,
  channelId?: string
): Promise<void> {
  if (!to || to.length === 0) return;

  // Filter out invalid/empty tokens
  const cleanTokens = to.filter(token => token && token.startsWith('ExponentPushToken'));
  if (cleanTokens.length === 0) return;

  const channel = channelId || CHANNELS.general;

  console.log(`[Push] Sending ${cleanTokens.length} notification(s) on channel: ${channel}`);

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
          channelId: channel,
          badge: badge ?? 1,
          // Android notification shade style
          android: {
            channelId: channel,
            smallIcon: 'ic_notification',
            color: '#AF2800',
            priority: 'high',
          },
        }),
      });

      const resData = await response.json();
      const status = resData?.data?.status || resData?.data?.[0]?.status;
      
      if (status === 'error') {
        const errorMsg = resData?.data?.message || resData?.data?.[0]?.message;
        const errorDetails = resData?.data?.details || resData?.data?.[0]?.details;
        console.warn(`Push sent [${token.substring(0, 25)}...]: ERROR - ${errorMsg}`, errorDetails);
      } else {
        console.log(`Push sent [${token.substring(0, 25)}...]:`, status);
      }
    } catch (error) {
      console.error(`Push failed [${token.substring(0, 25)}...]:`, error);
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
export async function scheduleLocalNotification(title: string, body: string, channelId?: string): Promise<void> {
  if (!Notifications) {
    console.log('Notifications module not loaded: Skipping local notification schedule.');
    return;
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        channelId: channelId || CHANNELS.tests,
      },
      trigger: null,
    });
  } catch (error) {
    console.warn('Failed to schedule local notification:', error);
  }
}

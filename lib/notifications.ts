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

export let currentActivePeerId = '';
export const setCurrentActivePeerId = (peerId: string) => {
  currentActivePeerId = peerId;
};

try {
  Notifications = require('expo-notifications');
  Device = require('expo-device');
  Constants = require('expo-constants').default;
} catch (e) {
  console.warn('Notifications module not loaded:', e);
}

if (Notifications) {
  // Define notification categories for WhatsApp-style quick replies & mark as read
  Notifications.setNotificationCategoryAsync('chat_reply', [
    {
      identifier: 'reply',
      buttonTitle: '💬 Reply',
      options: {
        opensAppToForeground: false,
      },
      textInput: {
        submitButtonTitle: 'Send',
        placeholder: 'Type your message...',
      },
    },
    {
      identifier: 'mark_as_read',
      buttonTitle: '✓ Mark as Read',
      options: {
        opensAppToForeground: false,
      },
    },
  ]).catch((err: any) => console.warn('Failed to set notification category:', err));

  Notifications.setNotificationHandler({
    handleNotification: async (notification: any) => {
      const channelId = notification.request.trigger?.channelId;
      const data = notification.request.content.data;
      
      // If we are on the community screen, and this is a community notification, suppress banner and sound
      const isCommunityNotification = channelId === CHANNELS.community || 
        data?.screen === 'community' ||
        data?.type === 'new_post' || 
        data?.type === 'new_comment' || 
        data?.type === 'new_like' || 
        data?.type === 'new_reply';

      if (currentActiveScreen === 'community' && isCommunityNotification) {
         return {
           shouldPlaySound: false,
           shouldSetBadge: false,
           shouldShowAlert: false,
         };
      }

      // If we are actively chatting with a peer, and a message arrives from that specific peer, suppress banner/sound
      const isChatNotification = data?.screen === 'chat' || data?.screen === 'student-chat';
      const notificationPeerId = data?.peerId || data?.senderId;

      if (isChatNotification) {
         // Suppress native popup/sound for chats because InAppNotification handles it!
         return {
           shouldPlaySound: false,
           shouldSetBadge: true,
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
  chat:       'kf_chat_v3',
  community:  'kf_community_v3',
  fees:       'kf_fees_v3',
  tests:      'kf_tests_v3',
  attendance: 'kf_attendance_v3',
  admin:      'kf_admin_v3',
  general:    'kf_general_v3',
};

async function ensureChannels() {
  if (!Notifications || Platform.OS !== 'android') return;
  const channelDefs = [
    { id: CHANNELS.chat,       name: '💬 Peer Chat & Requests', desc: 'Direct messages, doubt discussions, and chat requests' },
    { id: CHANNELS.community,  name: '🌐 Community',   desc: 'Likes, comments and replies on posts' },
    { id: CHANNELS.fees,       name: '💰 Fee Alerts',  desc: 'Fee reminders and payment notices' },
    { id: CHANNELS.tests,      name: '📝 Tests',       desc: 'New tests and results' },
    { id: CHANNELS.attendance, name: '✅ Attendance',  desc: 'Attendance marked notifications' },
    { id: CHANNELS.admin,      name: '🔔 Admin Alerts',desc: 'New registrations and admin events' },
    { id: CHANNELS.general,    name: '📣 Zenza',       desc: 'General app notifications' },
  ];
  for (const ch of channelDefs) {
    try {
      await Notifications.setNotificationChannelAsync(ch.id, {
        name: ch.name,
        description: ch.desc,
        importance: Notifications.AndroidImportance.HIGH,
        sound: ch.id === CHANNELS.chat ? 'chat_noti.mp3' : 'app_noti.mp3',
        vibrationPattern: [0, 200, 100, 200],
        enableVibrate: true,
        showBadge: true,
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
        Constants.easConfig?.projectId ??
        'e1b1d0b2-c04d-4e47-bbde-ec7873709e4b';

      let token: string | null = null;
      try {
        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId,
        });
        token = tokenData.data;
        console.log('[SUCCESS] Fetched Expo Push Token:', token);
      } catch (tokenErr: any) {
        console.log('Push token fetch skipped (FCM/Google Play Services unavailable):', tokenErr?.message || tokenErr);
        return null;
      }

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
 * Fetch Expo Push Tokens for all students belonging to a business.
 * Excludes the current user (e.g. teacher/admin) so teachers don't receive push notifications intended for students.
 */
export async function fetchStudentPushTokens(
  businessId: string,
  currentUserId?: string,
  targetBatch?: string
): Promise<string[]> {
  if (!businessId) return [];

  try {
    // 1. Fetch user_ids from students table for this business
    let studentQuery = supabase
      .from('students')
      .select('user_id')
      .eq('business_id', businessId)
      .not('user_id', 'is', null);

    if (targetBatch && targetBatch !== 'All') {
      studentQuery = studentQuery.eq('batch_name', targetBatch);
    }

    const { data: studentRecords } = await studentQuery;
    const studentUserIds = (studentRecords || []).map((s: any) => s.user_id).filter(Boolean);

    // 2. Fetch push tokens from profiles table
    let profileQuery = supabase
      .from('profiles')
      .select('id, push_token, role')
      .not('push_token', 'is', null);

    if (currentUserId) {
      profileQuery = profileQuery.neq('id', currentUserId);
    }

    if (studentUserIds.length > 0) {
      profileQuery = profileQuery.or(`business_id.eq.${businessId},id.in.(${studentUserIds.join(',')})`);
    } else {
      profileQuery = profileQuery.eq('business_id', businessId);
    }

    const { data: profiles, error } = await profileQuery;
    if (error || !profiles) return [];

    // Filter tokens and ensure teacher/admin accounts are excluded
    const tokens = (profiles || [])
      .filter((p: any) => p.role !== 'admin' && p.role !== 'teacher')
      .map((p: any) => p.push_token)
      .filter(Boolean) as string[];

    return Array.from(new Set(tokens));
  } catch (e) {
    console.warn('Failed to fetch student push tokens:', e);
    return [];
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
  channelId?: string,
  imageUrl?: string
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
          categoryIdentifier: data?.categoryIdentifier || undefined,
          // Top level image for attachment expansion if available
          image: imageUrl || undefined,
          // Android notification shade style
          android: {
            channelId: channel,
            smallIcon: 'ic_notification',
            color: '#AF2800',
            priority: 'high',
            largeIcon: imageUrl || undefined,
            groupKey: data?.peerId ? `peer_chat_${data.peerId}` : undefined,
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
        sound: true,
        vibrate: [0, 250, 250, 250],
        priority: Notifications.AndroidNotificationPriority?.HIGH || 'high',
        channelId: channelId || CHANNELS.tests,
      },
      trigger: null,
    });
  } catch (error) {
    console.warn('Failed to schedule local notification:', error);
  }
}

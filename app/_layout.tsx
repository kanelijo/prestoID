import 'react-native-gesture-handler';
import { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { Colors } from '@/constants/colors';
import { backupProcedure } from '@/lib/backupService';
import { useAuthStore } from '@/stores/useAuthStore';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { usePrefetchStore } from '@/stores/usePrefetchStore';
import { supabase } from '@/lib/supabase';
import CustomAlertContainer from '@/components/CustomAlert';
import { savePeerMessageToLocal, runBackgroundCacheCleanup } from '@/lib/localDb';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

try {
  GoogleSignin.configure({
    webClientId: '698075781767-7me6ngm7q5je5lod3ktc5vjk15er19q0.apps.googleusercontent.com',
    offlineAccess: true,
    scopes: ['https://www.googleapis.com/auth/drive.appdata'],
  });
} catch (e) {
  console.warn('GoogleSignin config error in _layout.tsx:', e);
}



// Safely import native modules
let TaskManager: any;
let BackgroundFetch: any;
let Network: any;
let Battery: any;
try {
  TaskManager = require('expo-task-manager');
  BackgroundFetch = require('expo-background-fetch');
  Network = require('expo-network');
  Battery = require('expo-battery');
} catch (e) {
  console.warn('Native background modules not found. Rebuild app.');
}

const BACKUP_TASK_NAME = 'BACKGROUND_AUTO_BACKUP';

if (TaskManager) {
  TaskManager.defineTask(BACKUP_TASK_NAME, async () => {
    try {
      console.log("[BackgroundFetch] Starting Auto-Backup Procedure...");
      const userId = useAuthStore.getState().user?.id;
      if (!userId) {
         console.log("[BackgroundFetch] Aborted: No active user session.");
         return BackgroundFetch.BackgroundFetchResult.NoData;
      }
      
      const success = await backupProcedure(userId);
      console.log("[BackgroundFetch] Auto-Backup Procedure completed with result:", success);
      
      return success 
        ? BackgroundFetch.BackgroundFetchResult.NewData 
        : BackgroundFetch.BackgroundFetchResult.Failed;
    } catch (error) {
      console.error("[BackgroundFetch] Auto-Backup task error:", error);
      return BackgroundFetch ? BackgroundFetch.BackgroundFetchResult.Failed : 2;
    }
  });
}

import { initializeZenzaStorage } from '@/lib/storage';
import { Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';

export default function RootLayout() {
  const router = useRouter();
  const { user, businessId, studentData, role } = useAuthStore();

  // Hide Android system navigation bar (immersive mode)
  useEffect(() => {
    if (Platform.OS === 'android') {
      const timer = setTimeout(async () => {
        try {
          await NavigationBar.setPositionAsync('absolute');
          await NavigationBar.setVisibilityAsync('hidden');
          await NavigationBar.setBehaviorAsync('overlay-swipe');
        } catch (e) {
          console.warn('[NavigationBar] Failed to set immersive mode:', e);
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Global Presence: Track online status whenever user is in the app
  useEffect(() => {
    const userId = user?.id;
    const bizId = businessId || studentData?.business_id;
    console.log("[Presence Debug] useEffect triggered. userId:", userId, "bizId:", bizId, "role:", role);
    if (!userId || !bizId) return;

    // Helper: write last_seen_at to Supabase via RPC (bypasses RLS reliably)
    const updateLastSeen = async () => {
      try {
        const { error } = await supabase.rpc('update_student_last_seen', { target_user_id: userId });
        if (error) console.warn("[Presence] update_student_last_seen error:", error);
      } catch (e) {
        console.warn("[Presence] update_student_last_seen exception:", e);
      }
    };

    const presenceChannel = supabase.channel(`presence_global_app_${bizId}`, {
      config: { presence: { key: userId } },
    });

    presenceChannel
      .on('presence', { event: 'join' }, ({ key }: any) => {
        const current = useAuthStore.getState().onlineUserIds;
        if (!current.includes(key)) {
          useAuthStore.getState().setOnlineUserIds([...current, key]);
        }
        const existing = useAuthStore.getState().onlinePresence;
        useAuthStore.getState().setOnlinePresence({ ...existing, [key]: new Date().toISOString() });
      })
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const activeIds: string[] = [];
        const presenceMap: Record<string, string> = {};
        Object.values(state).forEach((presences: any) => {
          if (Array.isArray(presences)) {
            presences.forEach((p: any) => {
              if (p.user_id) {
                activeIds.push(p.user_id);
                const currentVal = p.online_at || new Date().toISOString();
                const existing = presenceMap[p.user_id];
                if (!existing || new Date(currentVal).getTime() > new Date(existing).getTime()) {
                  presenceMap[p.user_id] = currentVal;
                }
              }
            });
          }
        });
        useAuthStore.getState().setOnlineUserIds(activeIds);
        const existingPresence = useAuthStore.getState().onlinePresence;
        useAuthStore.getState().setOnlinePresence({ ...existingPresence, ...presenceMap });
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }: any) => {
        // Write last_seen_at to DB for departed user — this persists across restarts
        supabase.rpc('update_student_last_seen', { target_user_id: key }).then(({ error }) => {
          if (error) console.warn("[Presence] leave update error:", error);
        });
        // Remove from online list immediately
        const current = useAuthStore.getState().onlineUserIds;
        useAuthStore.getState().setOnlineUserIds(current.filter((id: string) => id !== key));
        // Update in-memory presence with current time as last seen
        const existing = useAuthStore.getState().onlinePresence;
        useAuthStore.getState().setOnlinePresence({ ...existing, [key]: new Date().toISOString() });
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user_id: userId,
            role: role || 'student',
            name: user?.user_metadata?.full_name || studentData?.name || 'User',
            online_at: new Date().toISOString(),
          });
          await updateLastSeen();
        }
      });

    // Refresh presence track every 30s (keeps online_at fresh for online detection)
    const heartbeat = setInterval(() => {
      presenceChannel.track({
        user_id: userId,
        role: role || 'student',
        name: user?.user_metadata?.full_name || studentData?.name || 'User',
        online_at: new Date().toISOString(),
      });
    }, 30000);

    // Write last_seen to DB when app goes to background, and reconnect realtime on active
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        updateLastSeen();
      } else if (nextState === 'active') {
        supabase.realtime.connect();
      }
    });

    return () => {
      clearInterval(heartbeat);
      appStateSub.remove();
      supabase.removeChannel(presenceChannel);
    };


  }, [user?.id, businessId, studentData?.business_id, role]);

  useEffect(() => {
    // Run automated storage & cache eviction 
    runBackgroundCacheCleanup();

    // Initialize structured storage tree (Zenza Images, Zenza Documents, Zenza Backups)
    initializeZenzaStorage();

    // Register auto-backup check every hour
    const registerBackgroundTask = async () => {
      if (!BackgroundFetch) return;
      try {
        await BackgroundFetch.registerTaskAsync(BACKUP_TASK_NAME, {
          minimumInterval: 60 * 60, // Check every 1 hour
          stopOnTerminate: false,
          startOnBoot: true,
        });
        console.log("Auto-Backup task registered.");
      } catch (err) {
        console.log("Task Register Failed:", err);
      }
    };
    registerBackgroundTask();

    const refreshNotificationCounts = () => {
      const store = useAuthStore.getState();
      if (store.user) {
        if (store.role === 'admin') {
          useNotificationStore.getState().fetchAdminUnreadCount(store.user.id, store.businessId || '');
        } else {
          useNotificationStore.getState().fetchStudentUnreadCounts(store.user.id);
          useNotificationStore.getState().fetchStudentPendingTestCount(store.user.id);
          // Fire background prefetch for all student tabs
          usePrefetchStore.getState().prefetchAll(store.user.id);
        }
      }
    };

    const receivedSubscription = Notifications.addNotificationReceivedListener(notification => {
      refreshNotificationCounts();
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
      refreshNotificationCounts();
      const { actionIdentifier, userText } = response as any;
      const data = response.notification.request.content.data;

      // WhatsApp-style quick reply response handler
      if (actionIdentifier === 'reply' && userText && data?.senderId && data?.receiverId) {
        try {
          const tempMsg = {
            id: Date.now(),
            sender_id: String(data.receiverId || ''),
            receiver_id: String(data.senderId || ''),
            text: String(userText || ''),
            created_at: new Date().toISOString(),
            is_read: false
          };
          savePeerMessageToLocal(tempMsg);

          await supabase.from('student_messages').insert({
            sender_id: String(data.receiverId || ''),
            receiver_id: String(data.senderId || ''),
            text: String(userText || ''),
          });
          console.log('[SUCCESS] Quick reply message sent');
        } catch (err) {
          console.warn('[Error] Quick reply insertion failed:', err);
        }
        return;
      }

      // WhatsApp-style Mark as read handler
      if (actionIdentifier === 'mark_as_read' && data?.senderId && data?.receiverId) {
        try {
          const { data: undelivered } = await supabase
            .from('student_messages')
            .select('*')
            .eq('sender_id', data.senderId)
            .eq('receiver_id', data.receiverId);

          if (undelivered && undelivered.length > 0) {
            for (const msg of undelivered) {
              savePeerMessageToLocal({
                id: String(msg.id),
                sender_id: String(msg.sender_id),
                receiver_id: String(msg.receiver_id),
                text: String(msg.text || ''),
                created_at: String(msg.created_at),
                is_read: true
              });
              await supabase.from('student_messages').insert({
                sender_id: String(data.receiverId || ''),
                receiver_id: String(data.senderId || ''),
                text: `__READ_RECEIPT__:${msg.id}`
              });
              await supabase.from('student_messages').delete().eq('id', msg.id);
            }
          }
          console.log('[SUCCESS] Notification marked as read');
        } catch (err) {
          console.warn('[Error] Mark as read failed:', err);
        }
        return;
      }

      if (data && data.screen) {
        let targetRoute = '';
        if (data.screen === 'chat' && data.peerId) {
          targetRoute = `/(student)/student-chat?peerId=${data.peerId}`;
        } else if (data.screen === 'peers') {
          targetRoute = '/(student)/peers';
        } else if (data.screen === 'community') {
          targetRoute = '/(student)/community';
        } else if (data.screen === 'fees') {
          targetRoute = '/(student)/profile';
        } else if (data.screen === 'attendance') {
          targetRoute = '/(student)/profile';
        } else if (data.screen === 'test') {
          if (data.testId) {
            targetRoute = `/(student)/test/engine/${data.testId}`;
          } else {
            targetRoute = '/(student)/test';
          }
        } else if (data.screen === 'admin') {
          targetRoute = '/(admin)';
        }

        if (targetRoute) {
          // Set global pending redirect so index.tsx can consume it on launch
          (global as any).pendingNotificationRedirect = targetRoute;
          router.push(targetRoute as any);
        }
      }
    });

    return () => {
      subscription.remove();
      receivedSubscription.remove();
    };
  }, [router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.bg.primary },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(student)" options={{ headerShown: false }} />
          <Stack.Screen name="(admin)" options={{ headerShown: false }} />
        </Stack>
        <CustomAlertContainer />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

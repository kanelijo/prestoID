import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { Colors } from '@/constants/colors';
import { backupProcedure } from '@/lib/backupService';
import { useAuthStore } from '@/stores/useAuthStore';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { usePrefetchStore } from '@/stores/usePrefetchStore';

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
    const now = new Date();
    const hour = now.getHours();

    // Only run between 2 AM and 5 AM
    if (hour >= 2 && hour <= 5) {
      console.log("[BackgroundFetch] Starting 2 AM Backup...");
      
      if (Network) {
        const networkState = await Network.getNetworkStateAsync();
        if (!networkState.isInternetReachable || networkState.type !== Network.NetworkStateType.WIFI) {
           console.log("[BackgroundFetch] Aborted: Not on Wi-Fi.");
           return BackgroundFetch.BackgroundFetchResult.NoData;
        }
      }

      if (Battery) {
        const batteryLevel = await Battery.getBatteryLevelAsync();
        const batteryState = await Battery.getBatteryStateAsync();
        if (batteryLevel < 0.3 && batteryState !== Battery.BatteryState.CHARGING) {
           console.log("[BackgroundFetch] Aborted: Battery too low and not charging.");
           return BackgroundFetch.BackgroundFetchResult.NoData;
        }
      }

      const userId = useAuthStore.getState().user?.id;
      if (!userId) {
         console.log("[BackgroundFetch] Aborted: No active user.");
         return BackgroundFetch.BackgroundFetchResult.NoData;
      }
      
      const success = await backupProcedure(userId);
      
      return success 
        ? BackgroundFetch.BackgroundFetchResult.NewData 
        : BackgroundFetch.BackgroundFetchResult.Failed;
    }
    
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    return BackgroundFetch ? BackgroundFetch.BackgroundFetchResult.Failed : 2;
  }
});
}

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
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

    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      refreshNotificationCounts();
      const data = response.notification.request.content.data;
      if (data && data.screen) {
        let targetRoute = '';
        if (data.screen === 'community') {
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
    </SafeAreaProvider>
  );
}

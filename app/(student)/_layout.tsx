import { useEffect, useState, useCallback, useRef } from 'react';
import { Tabs, useFocusEffect, Redirect, useRouter } from 'expo-router';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { clearBadgeCount, registerForPushNotificationsAsync } from '@/lib/notifications';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '@/stores/useAuthStore';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { useFeatureFlags } from '@/stores/useFeatureFlags';
import OfflineBanner from '@/components/OfflineBanner';
import InAppNotification from '@/components/InAppNotification';
import { supabase } from '@/lib/supabase';
import { currentActiveScreen, currentActivePeerId } from '@/lib/notifications';
import { savePeerMessageToLocal, getPeerMessagesFromLocal, markPeerMessagesAsReadInLocal } from '@/lib/localDb';

type TabIconProps = {
  name: keyof typeof Ionicons.glyphMap;
  label: string;
  focused: boolean;
};

function TabIcon({ name, label, focused }: TabIconProps) {
  return (
    <View style={styles.tabItem}>
      <Ionicons
        name={name}
        size={22}
        color={focused ? Colors.accent.primary : Colors.text.tertiary}
      />
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit={true}
        minimumFontScale={0.7}
        style={[styles.tabLabel, focused && styles.tabLabelActive]}
      >
        {label}
      </Text>
      {focused && <View style={styles.activeIndicator} />}
    </View>
  );
}

export default function StudentLayout() {
  const insets = useSafeAreaInsets();
  const { user, role, studentData, businessId } = useAuthStore();
  const { isFeatureActive } = useFeatureFlags();

  if (role && role !== 'student') {
    return <Redirect href="/(admin)/students" />;
  }
  const {
    studentUnreadCount,
    studentPendingTestCount,
    fetchStudentPendingTestCount,
    studentCommunityUnreadCount,
    peerUnreadCount,
    fetchPeerUnreadCount
  } = useNotificationStore();
  const router = useRouter();

  useEffect(() => {
    clearBadgeCount();
    if (user?.id) {
      registerForPushNotificationsAsync(user.id);
      if (fetchStudentPendingTestCount) {
        fetchStudentPendingTestCount(user.id);
      }
      if (fetchPeerUnreadCount) {
        fetchPeerUnreadCount(user.id);
      }
    }
  }, [user?.id]);

  // Navigate on notification tap & handle notification action responses (quick reply / mark as read)
  useEffect(() => {
    const tapSub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      const screen = data?.screen;

      if (response.actionIdentifier === 'reply') {
        const userText = response.userText;
        const senderId = data?.senderId || data?.peerId;
        const receiverId = data?.receiverId || user?.id; // current user

        if (userText && senderId && receiverId) {
          // Send reply directly to Supabase transit queue
          supabase.from('student_messages').insert({
            sender_id: receiverId, // current user is sender
            receiver_id: senderId, // original sender is receiver
            text: userText
          }).then(({ data: selectData }) => {
            const confirmedMsg = (selectData && (selectData as any).length > 0) ? (selectData as any)[0] : null;
            if (confirmedMsg) {
              savePeerMessageToLocal({ ...(confirmedMsg as any), is_read: true });
            }
          });
        }
      } else if (response.actionIdentifier === 'mark_as_read') {
        const senderId = data?.senderId || data?.peerId;
        const receiverId = data?.receiverId || user?.id;

        if (senderId && receiverId) {

          markPeerMessagesAsReadInLocal(senderId, receiverId);
          useNotificationStore.getState().fetchPeerUnreadCount(receiverId);

          // Send read receipts back
          supabase.from('student_messages').insert({
            sender_id: receiverId,
            receiver_id: senderId,
            text: `__READ_RECEIPT__:all`
          }).then();
        }
      } else {
        // Standard notification tap
        if (screen === 'community') {
          router.push('/(student)/community');
        } else if ((screen === 'chat' || screen === 'student-chat') && data?.peerId) {
          router.push({ pathname: '/(student)/student-chat', params: { peerId: String(data.peerId) } });
        } else if (screen === 'peers') {
          router.push('/(student)/peers');
        }
      }
    });

    // Handle incoming foreground notifications
    const receiveSub = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data;
      const screen = data?.screen;

      if (screen === 'community' && !useNotificationStore.getState().communityIsOpen) {
        const curr = useNotificationStore.getState().studentCommunityUnreadCount;
        useNotificationStore.getState().setStudentCommunityUnreadCount(curr + 1);
      } else if (screen === 'chat' || screen === 'student-chat') {
        // Increment peer unread badge count
        if (user?.id) {
          fetchPeerUnreadCount(user.id);
        }
        
        // Show Custom In-App Popup only if not currently in this chat
        const title = notification.request.content.title;
        const body = notification.request.content.body;
        const senderId = data?.peerId || data?.senderId;
        

        const isCurrentlyInThisChat = currentActiveScreen === 'peer_chat' && currentActivePeerId === senderId;
        
        if (title && body && !isCurrentlyInThisChat) {
          useNotificationStore.getState().showNotificationPopup({
            title: title,
            body: body,
            peerId: senderId,
            avatarUrl: data?.avatarUrl || null,
          });
        }
      }
    });

    return () => { tapSub.remove(); receiveSub.remove(); };
  }, [router, user?.id]);

  const { activeEnvironment, setActiveEnvironment } = useAuthStore();
  const [isExternalStudent, setIsExternalStudent] = useState<boolean | null>(null);

  useEffect(() => {
    const checkStudentType = async () => {
      if (user?.id) {
        try {
          const { data: prof } = await supabase
            .from('profiles')
            .select('is_external, business_id')
            .eq('id', user.id)
            .single();

          if (prof) {
            const isExt = prof.is_external === true || !prof.business_id;
            setIsExternalStudent(isExt);
            
            if (!isExt && activeEnvironment === 'public') {
              // Force back to enrolled if they were stuck due to old cached state
              setActiveEnvironment('enrolled');
            } else if (!activeEnvironment) {
              setActiveEnvironment(isExt ? 'public' : 'enrolled');
            }
          } else {
            setIsExternalStudent(false);
            if (!activeEnvironment) setActiveEnvironment('enrolled');
          }
        } catch (e) {
          setIsExternalStudent(false);
          if (!activeEnvironment) setActiveEnvironment('enrolled');
        }
      }
    };
    checkStudentType();
  }, [user?.id, businessId, studentData?.business_id]);

  const isPublicEnv = activeEnvironment === 'public' || (activeEnvironment === null && isExternalStudent === true);

  return (
    <View style={{ flex: 1 }} key={`${studentData?.id || 'student'}_${businessId || 'no-biz'}_${isPublicEnv ? 'public' : 'enrolled'}`}>
      <OfflineBanner />
      <InAppNotification />
      <Tabs
        backBehavior="initialRoute"
        screenOptions={{
          headerShown: false,
          tabBarStyle: [
            styles.tabBar,
            {
              height: Platform.OS === 'android' ? 64 : 64 + insets.bottom,
              paddingBottom: Platform.OS === 'android' ? 8 : (insets.bottom > 0 ? insets.bottom - 4 : 8),
            },
          ],
          tabBarShowLabel: false,
        }}
      >
        {/* Enrolled Coaching Student Tabs */}
        <Tabs.Screen
          name="id-card"
          options={{
            href: isPublicEnv ? null : undefined,
            tabBarIcon: ({ focused }) => (
              <TabIcon
                name={focused ? 'card' : 'card-outline'}
                label="ID Card"
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="community"
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="peers"
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="test"
          options={{
            href: isPublicEnv ? null : undefined,
            tabBarBadge: studentPendingTestCount > 0 ? studentPendingTestCount : undefined,
            tabBarIcon: ({ focused }) => (
              <TabIcon
                name={focused ? 'document-text' : 'document-text-outline'}
                label="Test"
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="notifications"
          options={{
            href: isPublicEnv ? null : undefined,
            tabBarBadge: studentUnreadCount > 0 ? studentUnreadCount : undefined,
            tabBarIcon: ({ focused }) => (
              <TabIcon
                name={focused ? 'notifications' : 'notifications-outline'}
                label="Alerts"
                focused={focused}
              />
            ),
          }}
        />

        {/* Public / External Student Tabs */}
        <Tabs.Screen
          name="public-tests"
          options={{
            href: isPublicEnv ? undefined : null,
            tabBarIcon: ({ focused }) => (
              <TabIcon
                name={focused ? 'library' : 'library-outline'}
                label="Open Tests"
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="public-leaderboard"
          options={{
            href: isPublicEnv ? undefined : null,
            tabBarIcon: ({ focused }) => (
              <TabIcon
                name={focused ? 'trophy' : 'trophy-outline'}
                label="Rankings"
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="target-exam-info"
          options={{
            href: isPublicEnv ? undefined : null,
            tabBarIcon: ({ focused }) => (
              <TabIcon
                name={focused ? 'compass' : 'compass-outline'}
                label="Target Hub"
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="public-feed"
          options={{
            href: isPublicEnv ? undefined : null,
            tabBarIcon: ({ focused }) => (
              <TabIcon
                name={focused ? 'newspaper' : 'newspaper-outline'}
                label="Feed"
                focused={focused}
              />
            ),
          }}
        />

        {/* Shared Profile Tab */}
        <Tabs.Screen
          name="profile"
          options={{
            href: undefined,
            tabBarIcon: ({ focused }) => (
              <TabIcon
                name={focused ? 'person' : 'person-outline'}
                label="Profile"
                focused={focused}
              />
            ),
          }}
        />

        {/* Sub-screens with hidden tab bar */}
        <Tabs.Screen name="test/engine/[id]" options={{ href: null, tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="test/result/[id]" options={{ href: null, tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="test/target-exam-student" options={{ href: null, tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="student-chat" options={{ href: null, tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="notes" options={{ href: null, tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="pdf-viewer" options={{ href: null, tabBarStyle: { display: 'none' } }} />
        <Tabs.Screen name="lab" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.bg.secondary,
    borderTopColor: Colors.card.border,
    borderTopWidth: 1,
    paddingTop: 8,
    elevation: 4,
    shadowColor: Colors.text.primary,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    width: 72,
  },
  tabLabel: {
    fontSize: 9,
    color: Colors.text.tertiary,
    fontWeight: '500',
    textAlign: 'center',
  },
  tabLabelActive: {
    color: Colors.accent.primary,
    fontWeight: '700',
  },
  activeIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.accent.primary,
    marginTop: 2,
  },
});

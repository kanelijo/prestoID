import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

let Audio: any = null;
try {
  Audio = require('expo-av').Audio;
} catch (e) {
  console.log('expo-av native module missing, sounds will be disabled');
}
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import CachedImage from '@/components/CachedImage';
import { useChatStore } from '@/stores/useChatStore';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { sendPushNotification, CHANNELS, setCurrentActiveScreen, setCurrentActivePeerId } from '@/lib/notifications';
import * as Haptics from 'expo-haptics';
import {
  savePeerMessageToLocal,
  getPeerMessagesFromLocal,
  updatePeerMessageReadStatusInLocal,
  deletePeerMessageFromLocal,
  markPeerMessagesAsReadInLocal,
} from '@/lib/localDb';

interface Message {
  id: number;
  sender_id: string;
  receiver_id: string;
  text: string;
  created_at: string;
  is_read?: boolean;
  is_delivered?: boolean;
  reply_to_id?: string | null;
  is_deleted_for_me?: boolean;
  is_deleted_for_everyone?: boolean;
}

interface PeerProfile {
  name: string;
  photo_url: string;
  batch_name: string;
  education_completed?: string;
  education_pursuing?: string;
  hobbies?: string;
  push_token?: string;
  last_seen_at?: string;
}

export default function PeerChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { peerId } = useLocalSearchParams<{ peerId: string }>();
  const { user, onlineUserIds, studentData } = useAuthStore();
  const flatListRef = useRef<FlatList>(null);
  const channelRef = useRef<any>(null);

  const storeMessages = useChatStore((state) => state.messagesByPeer[peerId as string] || []);
  const setStoreMessages = useChatStore((state) => state.setMessages);
  const messages = storeMessages;
  
  const setMessages = (updater: any) => {
    if (typeof updater === 'function') {
      const current = useChatStore.getState().messagesByPeer[peerId as string] || [];
      setStoreMessages(peerId as string, updater(current));
    } else {
      setStoreMessages(peerId as string, updater);
    }
  };

  const [peerProfile, setPeerProfile] = useState<PeerProfile | null>(null);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);

  // Reply State
  const [replyingToId, setReplyingToId] = useState<number | string | null>(null);

  // Block State
  const [isBlocked, setIsBlocked] = useState(false);
  const [hasBlockedMe, setHasBlockedMe] = useState(false);

  const playChatSound = async () => {
    if (!Audio) return;
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false, shouldRouteThroughEarpiece: false });
      const { sound } = await Audio.Sound.createAsync(
        require('@/assets/audio/ChatNoti.mp3')
      );
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) sound.unloadAsync();
      });
    } catch (e) {
      console.log('Failed to play chat sound', e);
    }
  };

  const playTickSound = async () => {
    if (!Audio) return;
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false, shouldRouteThroughEarpiece: false });
      const { sound } = await Audio.Sound.createAsync(
        require('@/assets/audio/tick.mp3')
      );
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) sound.unloadAsync();
      });
    } catch (e) {
      console.log('Failed to play tick sound', e);
    }
  };

  // Selected message for action sheet/deletion
  const [selectedMsgId, setSelectedMsgId] = useState<number | string | null>(null);

  // Presence status
  const [isPeerInChatRoom, setIsPeerInChatRoom] = useState(false);

  // Profile details & Image full screen modal states
  const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);
  const [isImageFullscreen, setIsImageFullscreen] = useState(false);

  // Canva-Style Success Animation States
  const [showWelcome, setShowWelcome] = useState(false);
  const cardScale = useRef(new Animated.Value(0.85)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const badgeScale = useRef(new Animated.Value(0)).current;
  const badgeRotate = useRef(new Animated.Value(0)).current;

  // 8 floating particles
  const particleAnims = useRef([...Array(8)].map(() => ({
    y: new Animated.Value(120),
    x: new Animated.Value(0),
    scale: new Animated.Value(0.4 + Math.random() * 0.6),
    opacity: new Animated.Value(0)
  }))).current;

  const isPeerOnline = peerId === 'mock-peer-user-id' ? true : (peerId ? onlineUserIds.includes(peerId) : false);

  useEffect(() => {
    if (!peerId || !user?.id) return;

    // Instantly clear previous peer's data and disable spinner for instant open
    setPeerProfile(null);
    setIsLoading(false);

    setCurrentActiveScreen('peer_chat');
    setCurrentActivePeerId(peerId);

    if (peerId === 'mock-peer-user-id') {
      fetchPeerProfile();
      fetchMessages();
      setIsPeerInChatRoom(true);
      return;
    }

    fetchPeerProfile();
    fetchMessages();

    // Symmetrical channel naming so both users subscribe to the same channel
    const presenceChannelId = `presence:room:${[user.id, peerId].sort().join('-')}`;
    const channel = supabase
      .channel(presenceChannelId, {
        config: { presence: { key: user.id } }
      });
    channelRef.current = channel;

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'student_messages',
        },
        (payload) => {
          const newMsg = payload.new as Message;
          const isMsgRelevant =
            (newMsg.sender_id === user.id && newMsg.receiver_id === peerId) ||
            (newMsg.sender_id === peerId && newMsg.receiver_id === user.id);

          if (isMsgRelevant) {
            if (newMsg.text && newMsg.text.startsWith('__READ_RECEIPT__:') && newMsg.receiver_id === user.id) {
              const readMsgId = newMsg.text.split(':')[1];
              updatePeerMessageReadStatusInLocal(readMsgId, true);
              setMessages((prev) =>
                prev.map((msg) => (String(msg.id) === String(readMsgId) ? { ...msg, is_read: true } : msg))
              );
              supabase.from('student_messages').delete().eq('id', newMsg.id).then();
              return;
            }

            if (newMsg.text && newMsg.text.startsWith('__DELIVERED__:') && newMsg.receiver_id === user.id) {
              const delMsgId = newMsg.text.split(':')[1];
              const { markPeerMessageDelivered } = require('@/lib/localDb');
              markPeerMessageDelivered(delMsgId);
              setMessages((prev) =>
                prev.map((msg) => (String(msg.id) === String(delMsgId) ? { ...msg, is_delivered: true } : msg))
              );
              supabase.from('student_messages').delete().eq('id', newMsg.id).then();
              return;
            }

            if (newMsg.text && newMsg.text.startsWith('__DELETED_EVERYONE__:') && newMsg.receiver_id === user.id) {
              const delMsgId = newMsg.text.split(':')[1];
              const { deletePeerMessageFromLocal } = require('@/lib/localDb');
              deletePeerMessageFromLocal(delMsgId, true);
              setMessages((prev) =>
                prev.map((msg) => (String(msg.id) === String(delMsgId) ? { ...msg, is_deleted_for_everyone: true } : msg))
              );
              supabase.from('student_messages').delete().eq('id', newMsg.id).then();
              return;
            }

            // If the incoming message is from the peer, save locally, mark as read, delete from remote queue
            if (newMsg.sender_id === peerId) {
              const readMsg = { ...newMsg, is_read: true, delivered: true };
              savePeerMessageToLocal(readMsg);
              playChatSound();
              
              // Broadcast read receipt back to sender peer-to-peer over websockets
              channel.send({
                type: 'broadcast',
                event: 'read_receipt',
                payload: { messageId: newMsg.id }
              });

              // Broadcast delivery receipt back to sender over websockets
              channel.send({
                type: 'broadcast',
                event: 'delivery_receipt',
                payload: { messageId: newMsg.id }
              });

              // ALSO insert DB receipts for the sender in case they are offline or on the peers list!
              supabase.from('student_messages').insert([
                { sender_id: user.id, receiver_id: peerId, text: `__DELIVERED__:${newMsg.id}` },
                { sender_id: user.id, receiver_id: peerId, text: `__READ_RECEIPT__:${newMsg.id}` }
              ]).then();

              // Delete from Supabase queue immediately to save storage!
              supabase.from('student_messages').delete().eq('id', newMsg.id).then();
            }

            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;

              // Check if we have an optimistic temporary message matching this text that hasn't been mapped yet
              const tempMatchIndex = prev.findIndex(
                (m) =>
                  m.sender_id === newMsg.sender_id &&
                  m.receiver_id === newMsg.receiver_id &&
                  m.text === newMsg.text &&
                  m.id > 1000000000000 // Temp ID
              );

              if (tempMatchIndex !== -1) {
                const updated = [...prev];
                updated[tempMatchIndex] = {
                  ...updated[tempMatchIndex],
                  id: newMsg.id,
                  created_at: newMsg.created_at,
                  is_read: newMsg.is_read,
                };
                return updated;
              }

              return [...prev, { ...newMsg, is_read: newMsg.sender_id === peerId ? true : newMsg.is_read }];
            });
            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
          }
        }
      )
      .on('broadcast', { event: 'read_receipt' }, (payload) => {
        const { messageId } = payload.payload;
        // Update local SQLite
        updatePeerMessageReadStatusInLocal(messageId, true);
        // Update UI
        setMessages((prev) =>
          prev.map((msg) => (msg.id === messageId ? { ...msg, is_read: true } : msg))
        );
      })
      .on('broadcast', { event: 'delivery_receipt' }, (payload) => {
        const { messageId } = payload.payload;
        const { markPeerMessageDelivered } = require('@/lib/localDb');
        markPeerMessageDelivered(messageId);
        setMessages((prev) =>
          prev.map((msg) => (msg.id === messageId ? { ...msg, is_delivered: true } : msg))
        );
      })
      .on('broadcast', { event: 'message_deleted_everyone' }, (payload) => {
        const { messageId } = payload.payload;
        const { deletePeerMessageFromLocal } = require('@/lib/localDb');
        deletePeerMessageFromLocal(messageId, true);
        setMessages((prev) =>
          prev.map((msg) => (msg.id === messageId ? { ...msg, is_deleted_for_everyone: true } : msg))
        );
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const activeUsers = Object.keys(state);
        setIsPeerInChatRoom(activeUsers.includes(peerId));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ status: 'active_chat', user_id: user.id });
        }
      });

    return () => {
      setCurrentActiveScreen('');
      setCurrentActivePeerId('');
      supabase.removeChannel(channel);
    };
  }, [peerId, user?.id]);

  const runCanvaAnimation = () => {
    // Reset values
    cardScale.setValue(0.85);
    cardOpacity.setValue(0);
    badgeScale.setValue(0);
    badgeRotate.setValue(0);

    // Card reveals with a smooth spring and badge scales with a pulse
    Animated.parallel([
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 650,
        useNativeDriver: true,
      }),
      Animated.spring(cardScale, {
        toValue: 1,
        tension: 35,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.spring(badgeScale, {
        toValue: 1,
        tension: 50,
        friction: 6,
        useNativeDriver: true,
      }),
      Animated.timing(badgeRotate, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    ]).start();

    // Trigger drifting background sparkles (floating upward)
    const particleLoops = particleAnims.map((part, index) => {
      part.y.setValue(120);
      part.x.setValue((index - 3.5) * 32 + (Math.random() * 10 - 5));
      part.opacity.setValue(0);

      return Animated.loop(
        Animated.sequence([
          Animated.delay(index * 200),
          Animated.parallel([
            Animated.timing(part.y, {
              toValue: -180,
              duration: 2600 + Math.random() * 800,
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.timing(part.opacity, {
                toValue: 0.75,
                duration: 400,
                useNativeDriver: true,
              }),
              Animated.timing(part.opacity, {
                toValue: 0,
                duration: 2100,
                useNativeDriver: true,
              })
            ]),
            Animated.sequence([
              Animated.timing(part.x, {
                toValue: (index - 3.5) * 32 + 12,
                duration: 1100,
                useNativeDriver: true,
              }),
              Animated.timing(part.x, {
                toValue: (index - 3.5) * 32 - 12,
                duration: 1100,
                useNativeDriver: true,
              })
            ])
          ])
        ])
      );
    });

    particleLoops.forEach((anim) => anim.start());
  };

  const fetchPeerProfile = async () => {
    if (peerId === 'mock-peer-user-id') {
      setPeerProfile({
        name: 'Test Support User 🤖',
        photo_url: 'https://i.imgur.com/3g7ujGE.png',
        batch_name: 'Zenza Tech Support',
        education_completed: 'M.Tech in Computer Science',
        education_pursuing: 'PhD in Artificial Intelligence',
        hobbies: 'Coding, Reading research papers, Testing apps',
        push_token: undefined
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('students')
        .select('name, photo_url, batch_name, education_completed, education_pursuing, hobbies, last_seen_at')
        .eq('user_id', peerId)
        .maybeSingle();

      if (error) throw error;

      const { data: profData } = await supabase
        .from('profiles')
        .select('push_token')
        .eq('id', peerId)
        .maybeSingle();

      if (data) {
        setPeerProfile({
          ...data,
          push_token: profData?.push_token || undefined
        } as PeerProfile);
      }
      
      // Check block status
      const { data: blockData } = await supabase
        .from('blocked_users')
        .select('*')
        .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${peerId}),and(blocker_id.eq.${peerId},blocked_id.eq.${user.id})`);
        
      if (blockData && blockData.length > 0) {
        setIsBlocked(blockData.some(b => b.blocker_id === user.id));
        setHasBlockedMe(blockData.some(b => b.blocker_id === peerId));
      }
    } catch (err) {
      console.warn('Failed to load peer profile:', err);
    }
  };

  const fetchMessages = async () => {
    if (!user?.id || !peerId) return;

    if (peerId === 'mock-peer-user-id') {
      const initialMsgs = [
        {
          id: 1,
          sender_id: 'mock-peer-user-id',
          receiver_id: user.id,
          text: 'Hi there! I am the Zenza Support Bot. I am here to help you test the real-time chat interface! 🚀',
          created_at: new Date(Date.now() - 60000).toISOString()
        }
      ];
      setMessages(initialMsgs);
      setIsLoading(false);

      // Trigger Canva animation overlay on first open only
      const welcomeShownKey = `@welcome_shown_${peerId}`;
      AsyncStorage.getItem(welcomeShownKey).then((val) => {
        if (!val) {
          setShowWelcome(true);
          setTimeout(() => runCanvaAnimation(), 350);
          AsyncStorage.setItem(welcomeShownKey, 'true').catch(() => {});
        }
      }).catch(() => {});

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 200);
      return;
    }

    try {
      // 1. Fetch cached messages from Global RAM Store (No SQLite queries needed on mount!)
      const localMsgs = useChatStore.getState().messagesByPeer[peerId] || [];
      
      // Send read receipts to Supabase for any unread messages we had from this peer in SQLite
      const unreadLocalMsgs = localMsgs.filter((m) => m.sender_id === peerId && !m.is_read);
      unreadLocalMsgs.forEach((m) => {
        supabase.from('student_messages').insert({
          sender_id: user.id,
          receiver_id: peerId,
          text: `__READ_RECEIPT__:${m.id}`
        }).then();
      });

      // Mark them as read locally in database
      markPeerMessagesAsReadInLocal(peerId, user.id);
      // Set state messages as read so the UI immediately matches
      setMessages(localMsgs.map(m => m.sender_id === peerId ? { ...m, is_read: true } : m));
      // Refresh global unread badges
      useNotificationStore.getState().fetchPeerUnreadCount(user.id);

      // 2. Fetch undelivered messages from Supabase (acting as transit queue)
      const { data, error } = await supabase
        .from('student_messages')
        .select('*')
        .eq('receiver_id', user.id)
        .eq('sender_id', peerId);

      if (error) throw error;

      if (data && data.length > 0) {
        const newMsgs: Message[] = [];
        const msgIdsToDelete: any[] = [];

        for (const msg of data) {
          if (msg.text && msg.text.startsWith('__READ_RECEIPT__:') && msg.receiver_id === user.id) {
            const readMsgId = msg.text.split(':')[1];
            updatePeerMessageReadStatusInLocal(readMsgId, true);
            msgIdsToDelete.push(msg.id);
            continue;
          }

          if (msg.text && msg.text.startsWith('__DELIVERED__:') && msg.receiver_id === user.id) {
            const delMsgId = msg.text.split(':')[1];
            const { markPeerMessageDelivered } = require('@/lib/localDb');
            markPeerMessageDelivered(delMsgId);
            msgIdsToDelete.push(msg.id);
            continue;
          }

          const formattedMsg = { ...msg, is_read: true, delivered: true };
          savePeerMessageToLocal(formattedMsg);
          newMsgs.push(formattedMsg);
          msgIdsToDelete.push(msg.id);

          // Send database-backed read receipt back to the sender
          supabase.from('student_messages').insert({
            sender_id: user.id,
            receiver_id: peerId,
            text: `__READ_RECEIPT__:${msg.id}`
          }).then();

          // Send database-backed delivery receipt back to the sender
          supabase.from('student_messages').insert({
            sender_id: user.id,
            receiver_id: peerId,
            text: `__DELIVERED__:${msg.id}`
          }).then();

          // Send read/delivery receipt broadcast to sender
          if (channelRef.current) {
            channelRef.current.send({
              type: 'broadcast',
              event: 'read_receipt',
              payload: { messageId: msg.id }
            });
            channelRef.current.send({
              type: 'broadcast',
              event: 'delivery_receipt',
              payload: { messageId: msg.id }
            });
          }
        }

        // Delete from Supabase queue to keep space clean!
        supabase.from('student_messages').delete().in('id', msgIdsToDelete).then();

        // Merge with local state and apply read receipts update
        setMessages((prev) => {
          let updatedPrev = prev.map((m) => {
            const hasReceiptInData = data.some(
              (msg) =>
                msg.text &&
                msg.text.startsWith('__READ_RECEIPT__:') &&
                msg.text.split(':')[1] === String(m.id)
            );
            return hasReceiptInData ? { ...m, is_read: true } : m;
          });

          const merged = [...updatedPrev];
          newMsgs.forEach((nm) => {
            if (!merged.some((m) => m.id === nm.id)) {
              merged.push(nm);
            }
          });
          return merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        });
      }

      // If opening chat for the first time (0 history messages) trigger Canva animation overlay only once
      const welcomeShownKey = `@welcome_shown_${peerId}`;
      const welcomeShown = await AsyncStorage.getItem(welcomeShownKey);
      if (!welcomeShown && localMsgs.length === 0 && (!data || data.length === 0)) {
        setShowWelcome(true);
        setTimeout(() => runCanvaAnimation(), 350);
        await AsyncStorage.setItem(welcomeShownKey, 'true');
      }

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 200);
    } catch (err) {
      console.warn('Failed to fetch messages:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || !user?.id || !peerId) return;
    setIsSending(true);

    const messageText = inputText.trim();
    setInputText('');

    const tempId = Date.now();
    const optimisticMsg: Message = {
      id: tempId,
      sender_id: user.id,
      receiver_id: peerId,
      text: messageText,
      created_at: new Date().toISOString(),
      is_read: isPeerInChatRoom,
      reply_to_id: replyingToId ? String(replyingToId) : undefined,
    };
    
    // Clear reply state immediately
    setReplyingToId(null);

    // Save optimistic message to local SQLite
    savePeerMessageToLocal(optimisticMsg);

    // Add optimistic message instantly to state
    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
    playTickSound();

    if (peerId === 'mock-peer-user-id') {
      setIsSending(false);
      // Simulate a typing bot response
      setTimeout(() => {
        const botResponses = [
          "That is awesome! I can receive your messages instantly. 💬",
          "Your custom student bio changes were saved successfully to the database. How else can I help?",
          "Did you see the welcome card explosion? It triggers the first time you chat with any peer! 🎇",
          "Perfect! Let's build Zenza together! 🚀 Feel free to type anything else.",
          "I am a simulated test partner. We did this to save Supabase rows while letting you test the layout!"
        ];
        const randomResp = botResponses[Math.floor(Math.random() * botResponses.length)];
        
        const botMsg: Message = {
          id: Date.now() + 1,
          sender_id: 'mock-peer-user-id',
          receiver_id: user.id,
          text: randomResp,
          created_at: new Date().toISOString()
        };
        setMessages(prev => [...prev, botMsg]);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }, 1000);
      return;
    }

    try {
      const { data: selectData, error } = await supabase
        .from('student_messages')
        .insert({
          sender_id: user.id,
          receiver_id: peerId,
          text: messageText,
        })
        .select();

      if (error) throw error;

      const confirmedMsg = (selectData && selectData.length > 0) ? selectData[0] : null;

      if (confirmedMsg) {
        // First delete optimistic temp message from SQLite, then save database-confirmed one
        deletePeerMessageFromLocal(tempId);
        savePeerMessageToLocal({ ...confirmedMsg, is_read: isPeerInChatRoom, delivered: isPeerInChatRoom });

        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, id: confirmedMsg.id, created_at: confirmedMsg.created_at, is_read: isPeerInChatRoom, is_delivered: isPeerInChatRoom } : m))
        );
      } else {
        // Keep the optimistic message in SQLite and UI if select RLS blocks reading it back
        savePeerMessageToLocal({ ...optimisticMsg, id: tempId, is_read: isPeerInChatRoom, delivered: isPeerInChatRoom });
      }

      // Push notification triggered only if receiver is offline/left the chat room
      if (!isPeerInChatRoom && peerProfile?.push_token) {
        sendPushNotification(
          [peerProfile.push_token],
          studentData?.name || 'New Message',
          messageText,
          {
            screen: 'chat',
            peerId: user.id,
            senderId: user.id,
            receiverId: peerId,
            categoryIdentifier: 'chat_reply'
          },
          1,
          CHANNELS.chat,
          studentData?.photo_url || undefined
        ).catch((e) => console.warn('Failed to send message push:', e));
      }
    } catch (err: any) {
      console.warn('Failed to send message:', err);
      // Remove optimistic message if it failed to save to database
      deletePeerMessageFromLocal(tempId);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (dateString: string) => {
    if (!dateString) return '';
    try {
      const d = new Date(dateString);
      let hours = d.getHours();
      const minutes = d.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const minStr = minutes < 10 ? '0' + minutes : minutes;
      return `${hours}:${minStr} ${ampm}`;
    } catch {
      return '';
    }
  };

  const formatLastSeen = () => {
    const lastSeenVal = peerProfile?.last_seen_at;
    if (!lastSeenVal) return 'Offline';
    try {
      const date = new Date(lastSeenVal);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

      if (diffMins < 1) return 'Last seen: just now';
      if (diffMins < 60) return `Last seen: ${diffMins}m ago`;
      if (diffHours < 24) return `Last seen: ${diffHours}h ago`;
      return 'Last seen: ' + date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    } catch {
      return 'Offline';
    }
  };

  const handleToggleBlock = async () => {
    if (!user?.id || !peerId) return;
    try {
      if (isBlocked) {
        await supabase.from('blocked_users').delete().eq('blocker_id', user.id).eq('blocked_id', peerId);
        setIsBlocked(false);
      } else {
        await supabase.from('blocked_users').insert({ blocker_id: user.id, blocked_id: peerId });
        setIsBlocked(true);
      }
    } catch (e) {
      Alert.alert('Error', 'Could not update block status. Have you created the blocked_users table?');
    }
  };

  const handleDeleteMessage = async (forEveryone: boolean = false) => {
    if (selectedMsgId === null) return;
    try {
      const { deletePeerMessageFromLocal } = require('@/lib/localDb');
      deletePeerMessageFromLocal(selectedMsgId, forEveryone);
      
      if (forEveryone) {
        setMessages((prev) => prev.map((m) => m.id === selectedMsgId ? { ...m, is_deleted_for_everyone: true } : m));
        channelRef.current?.send({
          type: 'broadcast',
          event: 'message_deleted_everyone',
          payload: { messageId: selectedMsgId }
        });
        // Also send a DB receipt in case they are offline
        supabase.from('student_messages').insert({
          sender_id: user?.id,
          receiver_id: peerId,
          text: `__DELETED_EVERYONE__:${selectedMsgId}`
        }).then();
      } else {
        setMessages((prev) => prev.map((m) => m.id === selectedMsgId ? { ...m, is_deleted_for_me: true } : m));
      }
      
      await supabase.from('student_messages').delete().eq('id', selectedMsgId);
    } catch (e) {
      console.warn('Failed to delete message:', e);
    } finally {
      setSelectedMsgId(null);
    }
  };

  const renderMessageBubble = ({ item }: { item: Message }) => {
    if (item.is_deleted_for_me) return null;

    const isMe = item.sender_id === user?.id;
    const isSelected = selectedMsgId === item.id;
    const isDeletedEverywhere = item.is_deleted_for_everyone;

    const getTickDetails = () => {
      if (isDeletedEverywhere) return null; // No ticks on deleted messages
      if (item.is_read) {
        return { name: 'checkmark-done' as const, color: '#FFDAD2' }; // Brand coral/peach read ticks
      }
      if (item.is_delivered) {
        return { name: 'checkmark-done' as const, color: '#E5E7EB' }; // Gray delivered ticks
      }
      return { name: 'checkmark' as const, color: '#E5E7EB' }; // Gray sent tick
    };

    const ticks = getTickDetails();

    const handleLongPress = () => {
      if (isDeletedEverywhere) return; // Cannot select deleted messages
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setSelectedMsgId(item.id);
    };

    return (
      <View style={[styles.messageRow, isMe ? styles.messageRowRight : styles.messageRowLeft]}>
        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={handleLongPress}
          delayLongPress={400}
          style={[
            styles.bubble,
            isMe ? styles.bubbleRight : styles.bubbleLeft,
            isSelected && { backgroundColor: isMe ? '#9E2400' : '#E5E7EB', opacity: 0.8 },
            isDeletedEverywhere && { backgroundColor: isMe ? '#A03010' : '#E5E7EB', opacity: 0.6 }
          ]}
        >
          {item.reply_to_id && !isDeletedEverywhere && (
            <View style={{ backgroundColor: isMe ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', padding: 8, borderRadius: 8, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: isMe ? '#FFF' : Colors.accent.primary }}>
              <Text style={{ fontSize: 12, color: isMe ? '#FFF' : Colors.text.primary, opacity: 0.8 }} numberOfLines={2}>
                {messages.find(m => String(m.id) === String(item.reply_to_id))?.text || 'Message not found'}
              </Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <Text style={[
              styles.messageText, 
              isMe ? styles.messageTextRight : styles.messageTextLeft, 
              { flexShrink: 1, marginRight: 12 },
              isDeletedEverywhere && { fontStyle: 'italic', opacity: 0.8 }
            ]}>
              {isDeletedEverywhere ? '🚫 This message was deleted' : item.text}
            </Text>
            <View style={styles.bubbleMetaContainer}>
              <Text style={[styles.bubbleTimeText, isMe ? styles.bubbleTimeTextRight : styles.bubbleTimeTextLeft]}>
                {formatTime(item.created_at)}
              </Text>
              {isMe && item.id !== 9999 && (
                <Ionicons name={ticks.name} size={13} color={ticks.color} style={styles.tickIcon} />
              )}
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.accent.primary} />
      </View>
    );
  }

  // Calculate rotation key interpolation for double glowing halo
  const spinInterpolation = badgeRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const displayedMessages = isSearchActive && searchQuery.trim() !== '' 
    ? messages.filter(m => m.text?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top - 10, 10) }]}>
      {/* Header */}
      <View style={styles.header}>
        {isSearchActive ? (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => { setIsSearchActive(false); setSearchQuery(''); }} style={{ padding: 5 }}>
              <Ionicons name="arrow-back" size={24} color="#1F2937" />
            </TouchableOpacity>
            <TextInput
              style={{ flex: 1, height: 40, backgroundColor: '#F3F4F6', borderRadius: 20, paddingHorizontal: 15, marginLeft: 10, fontSize: 16 }}
              placeholder="Search in chat..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.replace('/(student)/peers')}
            >
              <Ionicons name="arrow-back" size={24} color="#1F2937" />
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.headerProfileTrigger}
              onPress={() => setIsProfileModalVisible(true)}
              activeOpacity={0.7}
            >
              {peerProfile?.photo_url ? (
                <CachedImage uri={peerProfile.photo_url} style={styles.headerAvatar} />
              ) : (
                <View style={styles.headerAvatarFallback}>
                  <Text style={styles.headerAvatarFallbackText}>
                    {peerProfile?.name.substring(0, 2).toUpperCase() || 'ST'}
                  </Text>
                </View>
              )}

              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.peerName}>{peerProfile?.name || 'Peer Student'}</Text>
                <View style={styles.statusRow}>
                  <View style={[styles.statusDot, { backgroundColor: isPeerOnline ? '#10B981' : '#9CA3AF' }]} />
                  <Text style={styles.statusText}>{isPeerOnline ? 'Online' : formatLastSeen()}</Text>
                </View>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity style={{ padding: 10 }} onPress={() => setIsSearchActive(true)}>
              <Ionicons name="search-outline" size={24} color="#1F2937" />
            </TouchableOpacity>
            
            <TouchableOpacity style={{ padding: 10 }} onPress={handleToggleBlock}>
              <Ionicons name={isBlocked ? "shield-checkmark" : "shield-outline"} size={22} color={isBlocked ? "#EF4444" : "#1F2937"} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={displayedMessages}
          renderItem={renderMessageBubble}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        {/* Input Bar wrapped in SafeAreaView to handle bottom notch natively */}
        <SafeAreaView edges={['bottom']} style={styles.inputSafeArea}>
          {isBlocked || hasBlockedMe ? (
            <View style={{ padding: 15, alignItems: 'center', backgroundColor: '#F9FAFB' }}>
              <Text style={{ color: '#6B7280', fontSize: 14 }}>
                {isBlocked ? 'You have blocked this contact.' : 'You cannot reply to this conversation.'}
              </Text>
              {isBlocked && (
                <TouchableOpacity onPress={handleToggleBlock} style={{ marginTop: 8, paddingVertical: 6, paddingHorizontal: 16, backgroundColor: '#EF4444', borderRadius: 20 }}>
                  <Text style={{ color: 'white', fontWeight: '600' }}>Unblock</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <>
              {replyingToId && (
                <View style={{ backgroundColor: '#F3F4F6', padding: 10, borderTopLeftRadius: 15, borderTopRightRadius: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ borderLeftWidth: 3, borderLeftColor: Colors.accent.primary, paddingLeft: 8, flex: 1 }}>
                    <Text style={{ fontWeight: '600', color: Colors.text.primary, fontSize: 13, marginBottom: 2 }}>Replying to</Text>
                    <Text style={{ color: Colors.text.secondary, fontSize: 13 }} numberOfLines={1}>
                      {messages.find(m => m.id === replyingToId)?.text || ''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setReplyingToId(null)} style={{ padding: 5 }}>
                    <Ionicons name="close-circle" size={20} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
              )}
              <View style={[styles.inputBar, replyingToId ? { borderTopLeftRadius: 0, borderTopRightRadius: 0 } : {}]}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Type a message..."
                  placeholderTextColor="#9CA3AF"
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                />
                <TouchableOpacity
                  style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
                  disabled={!inputText.trim()}
                  onPress={handleSendMessage}
                >
                  <Ionicons name="send" size={18} color="#FFF" />
                </TouchableOpacity>
              </View>
            </>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>

      {/* Advanced Canva-Style Welcome Panel Modal */}
      <Modal visible={showWelcome} transparent animationType="fade">
        <View style={styles.canvaOverlay}>
          <Animated.View
            style={[
              styles.canvaCard,
              {
                opacity: cardOpacity,
                transform: [{ scale: cardScale }],
              },
            ]}
          >
            {/* Drifting sparkle particles (Canvas style background) */}
            <View style={styles.particleContainer}>
              {particleAnims.map((part, i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.sparkleDot,
                    {
                      backgroundColor: ['#EC4899', '#3B82F6', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899', '#3B82F6', '#F59E0B'][i],
                      transform: [
                        { translateX: part.x },
                        { translateY: part.y },
                        { scale: part.scale },
                      ],
                      opacity: part.opacity,
                    },
                  ]}
                />
              ))}
            </View>

            {/* Glowing Double Ring Badge */}
            <Animated.View style={[styles.badgeContainer, { transform: [{ scale: badgeScale }] }]}>
              <Animated.View style={[styles.haloRing, { transform: [{ rotate: spinInterpolation }] }]}>
                <View style={styles.ringAccentDot} />
              </Animated.View>
              <View style={styles.badgeSolidCircle}>
                <Ionicons name="checkmark-sharp" size={32} color="#FFF" />
              </View>
            </Animated.View>

            {/* Text details */}
            <View style={{ alignItems: 'center', marginTop: 12, gap: 10 }}>
              <Text style={styles.canvaTitle}>Workspace Ready</Text>
              <Text style={styles.canvaSubtitle}>
                You have successfully connected with <Text style={{ fontWeight: '900', color: '#1F2937' }}>{peerProfile?.name || 'your peer'}</Text>. Start collaborating, resolving exam doubts, and sharing study resources!
              </Text>
            </View>

            {/* Canva-style CTA button */}
            <TouchableOpacity
              style={styles.canvaCTAButton}
              activeOpacity={0.9}
              onPress={() => setShowWelcome(false)}
            >
              <Text style={styles.canvaCTAText}>Enter Workspace</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      {/* WhatsApp-Style Action Sheet for Message Deletion */}
      <Modal
        visible={selectedMsgId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMsgId(null)}
      >
        <TouchableOpacity
          style={styles.actionSheetOverlay}
          activeOpacity={1}
          onPress={() => setSelectedMsgId(null)}
        >
          <View style={styles.actionSheetContainer}>
            <View style={styles.actionSheetHeader}>
              <Text style={styles.actionSheetTitle}>Message Options</Text>
            </View>
            
            {(() => {
              const selectedMsg = messages.find(m => m.id === selectedMsgId);
              const isOwnMessage = selectedMsg?.sender_id === user?.id;
              return (
                <>
                  <TouchableOpacity
                    style={styles.actionSheetButton}
                    onPress={() => {
                      setReplyingToId(selectedMsgId);
                      setSelectedMsgId(null);
                    }}
                  >
                    <Ionicons name="arrow-undo-outline" size={20} color={Colors.text.primary} />
                    <Text style={styles.actionSheetButtonText}>Reply</Text>
                  </TouchableOpacity>
                  
                  {isOwnMessage ? (
                    <>
                      <TouchableOpacity
                        style={styles.actionSheetButton}
                        onPress={() => handleDeleteMessage(false)}
                      >
                        <Ionicons name="trash-outline" size={20} color="#EF4444" />
                        <Text style={[styles.actionSheetButtonText, { color: '#EF4444' }]}>Delete for Me</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity
                        style={styles.actionSheetButton}
                        onPress={() => handleDeleteMessage(true)}
                      >
                        <Ionicons name="trash-bin-outline" size={20} color="#EF4444" />
                        <Text style={[styles.actionSheetButtonText, { color: '#EF4444' }]}>Delete for Everyone</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <Text style={styles.actionSheetInfo}>You can only delete your own messages.</Text>
                  )}
                </>
              );
            })()}

            <TouchableOpacity
              style={[styles.actionSheetButton, styles.actionSheetCancelButton]}
              onPress={() => setSelectedMsgId(null)}
            >
              <Text style={styles.actionSheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Profile Detail Modal */}
      <Modal visible={isProfileModalVisible} transparent animationType="slide" onRequestClose={() => setIsProfileModalVisible(false)}>
        <View style={styles.profileModalOverlay}>
          <View style={styles.profileDetailCard}>
            {/* Close Button */}
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setIsProfileModalVisible(false)}>
              <Ionicons name="close" size={24} color="#1F2937" />
            </TouchableOpacity>

            {/* Avatar (Clickable to view fullscreen) */}
            <TouchableOpacity 
              activeOpacity={0.9} 
              onPress={() => {
                if (peerProfile?.photo_url) {
                  setIsImageFullscreen(true);
                }
              }}
              style={styles.detailAvatarWrapper}
            >
              {peerProfile?.photo_url ? (
                <CachedImage uri={peerProfile.photo_url} style={styles.detailAvatar as any} />
              ) : (
                <View style={styles.detailAvatarFallback}>
                  <Text style={styles.detailAvatarFallbackText}>
                    {peerProfile?.name.substring(0, 2).toUpperCase() || 'ST'}
                  </Text>
                </View>
              )}
              {peerProfile?.photo_url && (
                <View style={styles.zoomHintBadge}>
                  <Ionicons name="search-outline" size={14} color="#FFF" />
                  <Text style={styles.zoomHintText}>Tap to zoom</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Student Info */}
            <Text style={styles.detailName}>{peerProfile?.name || 'Student'}</Text>
            <Text style={styles.detailMeta}>{peerProfile?.batch_name || 'Classmate'}</Text>

            {/* Bio Sections */}
            <View style={styles.bioContainer}>
              <View style={styles.bioItem}>
                <Text style={styles.bioLabel}>Education Completed</Text>
                <Text style={styles.bioValue}>
                  {peerProfile?.education_completed || 'Not updated yet'}
                </Text>
              </View>

              <View style={styles.bioItem}>
                <Text style={styles.bioLabel}>Education Pursuing</Text>
                <Text style={styles.bioValue}>
                  {peerProfile?.education_pursuing || 'Not updated yet'}
                </Text>
              </View>

              <View style={styles.bioItem}>
                <Text style={styles.bioLabel}>Hobbies</Text>
                <Text style={styles.bioValue}>
                  {peerProfile?.hobbies || 'Not updated yet'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Fullscreen Image Preview Modal */}
      <Modal visible={isImageFullscreen} transparent animationType="fade" onRequestClose={() => setIsImageFullscreen(false)}>
        <View style={styles.fullscreenOverlay}>
          <TouchableOpacity style={styles.fullscreenCloseBtn} onPress={() => setIsImageFullscreen(false)}>
            <Ionicons name="close" size={30} color="#FFF" />
          </TouchableOpacity>
          {peerProfile?.photo_url && (
            <CachedImage uri={peerProfile.photo_url} style={styles.fullscreenImage as any} />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6', // WhatsApp-like light grey background
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 56,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  headerAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarFallbackText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4F46E5',
  },
  peerName: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#1F2937',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 5,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusText: {
    fontSize: 10.5,
    color: '#6B7280',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  messageRow: {
    flexDirection: 'row',
    width: '100%',
  },
  messageRowLeft: {
    justifyContent: 'flex-start',
  },
  messageRowRight: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '68%',
    padding: 10,
    borderRadius: 10,
  },
  bubbleLeft: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  bubbleRight: {
    backgroundColor: Colors.accent.primary, // Stitch primary (Warm coral-red)
    borderTopRightRadius: 2,
    borderWidth: 1,
    borderColor: '#9E2400',
  },
  messageText: {
    fontSize: 13.5,
    lineHeight: 18,
  },
  messageTextLeft: {
    color: '#1F2937',
  },
  messageTextRight: {
    color: '#FFF',
  },
  bubbleMetaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
    gap: 4,
  },
  bubbleTimeText: {
    fontSize: 9.5,
  },
  bubbleTimeTextLeft: {
    color: '#9CA3AF',
  },
  bubbleTimeTextRight: {
    color: 'rgba(255,255,255,0.7)',
  },
  tickIcon: {
    marginLeft: 2,
  },
  inputSafeArea: {
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFF',
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    fontSize: 13.5,
    color: '#1F2937',
    maxHeight: 100,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent.primary, // Stitch primary (Warm coral-red)
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#A0AAB2',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  canvaOverlay: {
    flex: 1,
    backgroundColor: 'rgba(9, 9, 11, 0.7)', // deep charcoal transparent overlay
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  canvaCard: {
    backgroundColor: '#FFF',
    borderRadius: 28,
    padding: 28,
    width: '100%',
    maxWidth: 350,
    alignItems: 'center',
    gap: 24,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  particleContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
  },
  sparkleDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  badgeContainer: {
    width: 90,
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 1,
  },
  haloRing: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: 'rgba(79, 70, 229, 0.25)', // light purple ring
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  ringAccentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4F46E5',
    marginTop: -4,
  },
  badgeSolidCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#4F46E5', // Canva purple
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  canvaTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  canvaSubtitle: {
    fontSize: 13,
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 6,
  },
  canvaCTAButton: {
    width: '100%',
    height: 46,
    borderRadius: 14,
    backgroundColor: '#111827', // dark carbon color
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
    zIndex: 1,
  },
  canvaCTAText: {
    color: '#FFF',
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  headerProfileTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  profileModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  profileDetailCard: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    gap: 16,
    alignItems: 'center',
    position: 'relative',
  },
  modalCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 4,
  },
  detailAvatarWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  detailAvatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  detailAvatarFallback: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#E0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailAvatarFallbackText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#4F46E5',
  },
  zoomHintBadge: {
    position: 'absolute',
    bottom: -4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  zoomHintText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '700',
  },
  detailName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1F2937',
    textAlign: 'center',
    marginTop: 4,
  },
  detailMeta: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: -8,
  },
  bioContainer: {
    width: '100%',
    gap: 14,
    marginTop: 10,
  },
  bioItem: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  bioLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  bioValue: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
  },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  fullscreenCloseBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  fullscreenImage: {
    width: '100%',
    height: '75%',
    resizeMode: 'contain',
  },
  actionSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  actionSheetContainer: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 24,
    gap: 16,
  },
  actionSheetHeader: {
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  actionSheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
  },
  actionSheetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  actionSheetButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  actionSheetCancelButton: {
    justifyContent: 'center',
    marginTop: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 12,
  },
  actionSheetCancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4B5563',
  },
  actionSheetInfo: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 8,
  },
});

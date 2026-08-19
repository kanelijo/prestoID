import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
  Switch,
  Platform,
  KeyboardAvoidingView,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useChatStore, PeerMessage } from '@/stores/useChatStore';
import CachedImage from '@/components/CachedImage';
import { useNotificationStore } from '@/stores/useNotificationStore';
import * as WebBrowser from 'expo-web-browser';
import { sendPushNotification, CHANNELS, currentActivePeerId } from '@/lib/notifications';
import {
  getPeerMessagesFromLocal,
  savePeerMessageToLocal,
  getLocalMessagesForPeer,
  markPeerMessageDelivered,
  getAllPeerMessagesFromLocal,
  updatePeerMessageReadStatusInLocal,
  deleteAllPeerMessagesFromLocal,
} from '@/lib/localDb';

interface Student {
  id: string;
  user_id: string;
  name: string;
  batch_name: string;
  photo_url: string;
  admission_date: string;
  course?: string;
  education_completed?: string;
  education_pursuing?: string;
  hobbies?: string;
  last_seen_at?: string;
}

interface ChatRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  sender_profile?: { name: string; photo_url: string; batch_name: string };
  receiver_profile?: { name: string; photo_url: string; batch_name: string };
}

export default function PeerConversationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, studentData, onlineUserIds, onlinePresence } = useAuthStore();
  const messagesByPeer = useChatStore(state => state.messagesByPeer);
  const { setMessages: setStoreMessages } = useChatStore();
  const channelRef = useRef<any>(null);

  const [activeSegment, setActiveSegment] = useState<'chats' | 'directory'>('chats');
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Chat request states
  const [activeRequests, setActiveRequests] = useState<ChatRequest[]>([]);
  const [chatPeers, setChatPeers] = useState<any[]>([]);
  const [allRequests, setAllRequests] = useState<any[]>([]);

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  // Profile Popup / Terms Modal
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Multi-select for chats
  const [selectedPeerIds, setSelectedPeerIds] = useState<string[]>([]);
  const isSelectionMode = selectedPeerIds.length > 0;

  const handleDeleteSelectedChats = () => {
    if (selectedPeerIds.length === 0) return;
    
    Alert.alert(
      "Clear Chats?",
      `This will completely clear the chat history for ${selectedPeerIds.length} peer(s). You will remain connected to them.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: async () => {
          if (!user?.id) return;
          
          for (const peerId of selectedPeerIds) {
            // Delete from local SQLite
            deleteAllPeerMessagesFromLocal(user.id, peerId);
            // Delete from RAM Store directly
            useChatStore.getState().setMessages(peerId, []);
            
            // Delete from Supabase messages queue
            await supabase.from('student_messages')
              .delete()
              .or(`and(sender_id.eq.${user.id},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${user.id})`);
          }
          
          setSelectedPeerIds([]);
          loadData();
        }}
      ]
    );
  };
  const [isPopupVisible, setIsPopupVisible] = useState(false);
  const [agreeRespect, setAgreeRespect] = useState(false);
  const [agreeBanWarning, setAgreeBanWarning] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  // Current User Profile Bio Editing States
  const [myProfile, setMyProfile] = useState<any>(null);
  const [isMyBioModalVisible, setIsMyBioModalVisible] = useState(false);
  const [myCompleted, setMyCompleted] = useState('');
  const [myPursuing, setMyPursuing] = useState('');
  const [myHobbies, setMyHobbies] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  useEffect(() => {
    loadData();

    if (!user?.id) return;

    // Realtime listener for live chat request status updates and new messages
    const channel = supabase
      .channel('public:chat_requests_peers_msgs')
      .on(
        'broadcast',
        { event: 'chat_request_update' },
        () => {
          loadData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_requests',
        },
        () => {
          loadData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'student_messages',
        },
        (payload) => {
          const newMsg = payload.new as any;
          if (newMsg?.receiver_id === user?.id || newMsg?.sender_id === user?.id) {
            // Don't reload if this message is for the active chat — student-chat.tsx handles it
            const msgPeer = newMsg?.sender_id === user?.id ? newMsg?.receiver_id : newMsg?.sender_id;
            if (msgPeer === currentActivePeerId) return;
            loadData();
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [studentData, user?.id]);

  // Parses student bio from native database columns
  const parseStudentBio = (student: any) => {
    if (!student) return { completed: '', pursuing: '', hobbies: '' };
    return {
      completed: student.education_completed || '',
      pursuing: student.education_pursuing || '',
      hobbies: student.hobbies || '',
    };
  };

  const loadData = async () => {
    let bizId = studentData?.business_id;
    let myUid = user?.id;

    if ((!bizId || !myUid) && user?.id) {
      const { data: stList } = await supabase
        .from('students')
        .select('*')
        .eq('user_id', user.id)
        .limit(1);
      if (stList && stList.length > 0) {
        bizId = stList[0].business_id;
        myUid = stList[0].user_id;
      }
    }

    if (!bizId || !myUid) {
      setIsLoading(false);
      return;
    }

    if (students.length === 0) setIsLoading(true);
    try {
      // 1. Fetch all registered students in the institute
      const { data: studentList, error: stError } = await supabase
        .from('students')
        .select('id, user_id, name, batch_name, photo_url, admission_date, course, education_completed, education_pursuing, hobbies, last_seen_at')
        .eq('business_id', bizId)
        .not('user_id', 'is', null) // Only fetch students who signed up
        .neq('user_id', myUid)      // Exclude current student
        .order('name');

      if (stError) throw stError;

      // 2. Fetch current student profile details
      const { data: selfProfile } = await supabase
        .from('students')
        .select('*')
        .eq('user_id', myUid)
        .maybeSingle();
      
      if (selfProfile) {
        setMyProfile(selfProfile);
        const parsed = parseStudentBio(selfProfile);
        setMyCompleted(parsed.completed);
        setMyPursuing(parsed.pursuing);
        setMyHobbies(parsed.hobbies);
      }

      // 3. Fetch transit messages from Supabase queue (messages sent to user while offline/outside of chat)
      const { data: transitMessages } = await supabase
        .from('student_messages')
        .select('*')
        .eq('receiver_id', myUid);

      if (transitMessages && transitMessages.length > 0) {
        const transitIdsToDelete: any[] = [];
        for (const msg of transitMessages) {
          // SKIP messages from the active chat peer — student-chat.tsx handles those
          const msgPeerId = msg.sender_id === myUid ? msg.receiver_id : msg.sender_id;
          if (msgPeerId === currentActivePeerId) continue;

          if (msg.text && msg.text.startsWith('__READ_RECEIPT__:')) {
            const readMsgId = msg.text.split(':')[1];
            updatePeerMessageReadStatusInLocal(readMsgId, true);
            transitIdsToDelete.push(msg.id);
            continue;
          }
          if (msg.text && msg.text.startsWith('__DELIVERED__:')) {
            const delMsgId = msg.text.split(':')[1];

            markPeerMessageDelivered(delMsgId);
            transitIdsToDelete.push(msg.id);
            continue;
          }
          // Save locally as is_read: false since user has not opened the chat room yet, but it is delivered
          savePeerMessageToLocal({ ...msg, is_read: false, delivered: true });
          transitIdsToDelete.push(msg.id);

          // Insert a __DELIVERED__ database receipt back to the sender
          supabase.from('student_messages').insert({
            sender_id: myUid,
            receiver_id: msg.sender_id,
            text: `__DELIVERED__:${msg.id}`
          }).then();
        }
        // Immediately delete from Supabase queue to keep space clean!
        if (transitIdsToDelete.length > 0) {
          supabase.from('student_messages').delete().in('id', transitIdsToDelete).then();
        }
      }

      // Build unread counts and last message info from local SQLite
      // PRE-FETCH: Load ALL messages into RAM once for instant student-chat.tsx loads
      const allLocalMsgs: PeerMessage[] = getAllPeerMessagesFromLocal(myUid);
      
      const msgsByPeerId: Record<string, PeerMessage[]> = {};
      allLocalMsgs.forEach(m => {
        const otherId = m.sender_id === myUid ? m.receiver_id : m.sender_id;
        if (!msgsByPeerId[otherId]) msgsByPeerId[otherId] = [];
        msgsByPeerId[otherId].push(m);
      });
      
      // Update global RAM store — but NEVER overwrite the active chat's state
      Object.keys(msgsByPeerId).forEach(pId => {
        if (pId === currentActivePeerId) return; // student-chat.tsx owns this peer's state
        setStoreMessages(pId, msgsByPeerId[pId]);
      });

      const conversationMap = new Map<string, { lastMsg: any, unreadCount: number }>();
      const allRegisteredPeers = studentList || [];
      for (const peer of allRegisteredPeers) {
        if (!peer.user_id) continue;
        const localMsgs = msgsByPeerId[peer.user_id] || [];
        const lastMsg = localMsgs[localMsgs.length - 1] || null;
        const unreadCount = localMsgs.filter(m => m.sender_id === peer.user_id && !m.is_read).length;
        conversationMap.set(peer.user_id, { lastMsg, unreadCount });
      }

      // 4. Fetch all chat requests related to me
      const { data: requests, error: reqError } = await supabase
        .from('chat_requests')
        .select('*')
        .or(`sender_id.eq.${myUid},receiver_id.eq.${myUid}`);

      if (reqError) throw reqError;
      setAllRequests(requests || []);

      // Filter and map incoming requests, and active accepted peers
      const pendingIncoming: ChatRequest[] = [];
      const acceptedPeers: any[] = [];
      
      const allStudentsMap = new Map<string, Student>();
      (studentList || []).forEach(s => {
        if (s.user_id) allStudentsMap.set(s.user_id, s);
      });

      (requests || []).forEach((req: any) => {
        if (req.status === 'pending' && req.receiver_id === myUid) {
          const senderObj = allStudentsMap.get(req.sender_id);
          pendingIncoming.push({
            ...req,
            sender_profile: senderObj ? {
              name: senderObj.name,
              photo_url: senderObj.photo_url,
              batch_name: senderObj.batch_name
            } : { name: 'Student', photo_url: '', batch_name: '' }
          });
        } else if (req.status === 'accepted') {
          const peerUid = req.sender_id === myUid ? req.receiver_id : req.sender_id;
          const peerObj = allStudentsMap.get(peerUid);
          if (peerObj) {
            const conv = conversationMap.get(peerUid) || { lastMsg: null, unreadCount: 0 };
            acceptedPeers.push({
              ...peerObj,
              lastMsg: conv.lastMsg,
              unreadCount: conv.unreadCount,
            });
          }
        }
      });



      // Sort accepted peers by their last message timestamp descending (newest messages at the top)
      acceptedPeers.sort((a, b) => {
        const timeA = a.lastMsg ? new Date(a.lastMsg.created_at).getTime() : 0;
        const timeB = b.lastMsg ? new Date(b.lastMsg.created_at).getTime() : 0;
        return timeB - timeA;
      });

      setActiveRequests(pendingIncoming);
      setChatPeers(acceptedPeers);
      useNotificationStore.getState().fetchPeerUnreadCount(myUid);

      // Filter connected peers out of directory student list
      const acceptedPeerUserIds = new Set(acceptedPeers.map((p) => p.user_id));
      const directoryList = (studentList || []).filter((s) => !acceptedPeerUserIds.has(s.user_id));
      setStudents(directoryList);
      setFilteredStudents(directoryList);
    } catch (err: any) {
      console.warn('Failed to load peers/chats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (!text.trim()) {
      setFilteredStudents(students);
      return;
    }
    const filtered = students.filter(s =>
      s.name.toLowerCase().includes(text.toLowerCase()) ||
      s.batch_name.toLowerCase().includes(text.toLowerCase())
    );
    setFilteredStudents(filtered);
  };

  const handleSaveMyBio = async () => {
    if (!user?.id) return;
    try {
      const { error } = await supabase
        .from('students')
        .update({
          education_completed: myCompleted,
          education_pursuing: myPursuing,
          hobbies: myHobbies
        })
        .eq('user_id', user.id);

      if (error) throw error;

      Alert.alert('Success', 'Your educational profile has been updated!');
      setIsMyBioModalVisible(false);
      loadData();
    } catch (err: any) {
      Alert.alert('Update Failed', err.message || 'Unable to save bio.');
    }
  };

  const getRequestStatus = () => {
    if (!selectedStudent || !user?.id) return null;
    const req = allRequests.find(
      r => (r.sender_id === user.id && r.receiver_id === selectedStudent.user_id) ||
           (r.sender_id === selectedStudent.user_id && r.receiver_id === user.id)
    );
    return req ? req : null;
  };

  const handleStartChatRequest = async () => {
    if (!selectedStudent || !user?.id) return;
    setIsSubmittingRequest(true);

    try {
      // Check if a request already exists between these users
      const existing = getRequestStatus();

      if (existing) {
        if (existing.status === 'accepted') {
          setIsPopupVisible(false);
          router.push({ pathname: '/(student)/student-chat', params: { peerId: selectedStudent.user_id } });
          return;
        } else if (existing.status === 'pending') {
          Alert.alert('Request Pending', `A chat request with ${selectedStudent.name} is already pending.`);
          setIsPopupVisible(false);
          return;
        } else {
          // If rejected, allow sending a new request
          await supabase.from('chat_requests').delete().eq('id', existing.id);
        }
      }

      // Create new request
      const { error } = await supabase
        .from('chat_requests')
        .insert({
          sender_id: user.id,
          receiver_id: selectedStudent.user_id,
          status: 'pending'
        });

      if (error) throw error;
      
      channelRef.current?.send({ type: 'broadcast', event: 'chat_request_update', payload: { action: 'sent' } });

      // Fetch receiver's push token and notify them (fire and forget)
      void (async () => {
        try {
          const { data: recProfile } = await supabase
            .from('profiles')
            .select('push_token')
            .eq('id', selectedStudent.user_id)
            .maybeSingle();
          if (recProfile?.push_token) {
            sendPushNotification(
              [recProfile.push_token],
              '💬 New Connection Request',
              `🎉 ${myProfile?.name || 'A student'} wants to connect and chat with you in Zenza!`,
              { screen: 'peers' },
              1,
              CHANNELS.chat,
              myProfile?.photo_url || undefined
            );
          }
        } catch (e) {
          console.warn('Failed to send connection push alert:', e);
        }
      })();

      Alert.alert('Request Sent', `Chat request sent to ${selectedStudent.name}. You can message them once they accept!`);
      setIsPopupVisible(false);
      loadData();
    } catch (err: any) {
      Alert.alert('Request Failed', err.message || 'Unable to start chat request.');
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const handleAcceptRequest = async (reqId: string, peerName: string) => {
    try {
      const { error } = await supabase
        .from('chat_requests')
        .update({ status: 'accepted' })
        .eq('id', reqId);

      if (error) throw error;
      
      channelRef.current?.send({ type: 'broadcast', event: 'chat_request_update', payload: { action: 'accepted' } });
      
      const req = allRequests.find(r => r.id === reqId);
      const peerUid = req?.sender_id;

      // Notify sender that their connection was accepted
      if (peerUid) {
        void (async () => {
          try {
            const { data: senderProf } = await supabase
               .from('profiles')
               .select('push_token')
               .eq('id', peerUid)
               .maybeSingle();
            if (senderProf?.push_token) {
              sendPushNotification(
                [senderProf.push_token],
                '🎉 Connection Request Accepted!',
                `✨ ${myProfile?.name || 'Your peer'} accepted your chat request. Start chatting now!`,
                { screen: 'chat', peerId: user?.id },
                1,
                CHANNELS.chat,
                myProfile?.photo_url || undefined
              );
            }
          } catch (e) {
            console.warn('Failed to send accept notification:', e);
          }
        })();
      }

      // Navigate directly to the chat room
      if (peerUid) {
        router.push({ pathname: '/(student)/student-chat', params: { peerId: peerUid } });
      } else {
        loadData();
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleRejectRequest = async (reqId: string) => {
    try {
      const { error } = await supabase
        .from('chat_requests')
        .update({ status: 'rejected' })
        .eq('id', reqId);

      if (error) throw error;
      
      channelRef.current?.send({ type: 'broadcast', event: 'chat_request_update', payload: { action: 'rejected' } });
      loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleViewPrivacy = () => {
    WebBrowser.openBrowserAsync('https://kanelijo.com/zenza-privacy').catch(() => {});
  };

  const renderStudentRow = ({ item }: { item: Student }) => {
    const isAlreadyConnected = allRequests.some(
      r => r.status === 'accepted' &&
           ((r.sender_id === user?.id && r.receiver_id === item.user_id) ||
            (r.sender_id === item.user_id && r.receiver_id === user?.id))
    );

    const request = allRequests.find(
      r => (r.sender_id === user?.id && r.receiver_id === item.user_id) ||
           (r.sender_id === item.user_id && r.receiver_id === user?.id)
    );

    return (
      <TouchableOpacity
        style={styles.studentCard}
        activeOpacity={0.7}
        onPress={() => {
          if (isAlreadyConnected) {
            router.push({ pathname: '/(student)/student-chat', params: { peerId: item.user_id } });
          } else {
            setSelectedStudent(item);
            setAgreeRespect(request !== undefined);
            setAgreeBanWarning(request !== undefined);
            setIsPopupVisible(true);
          }
        }}
      >
      {item.photo_url ? (
        <CachedImage uri={item.photo_url} style={styles.avatar as any} />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarFallbackText}>{item.name.substring(0,2).toUpperCase()}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.studentName}>{item.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <Text style={styles.studentMeta}>{item.batch_name}</Text>
          {request && request.status === 'pending' && (
            <Text style={[styles.statusBadgeText, { color: '#D97706', backgroundColor: '#FEF3C7' }]}>Pending</Text>
          )}
          {request && request.status === 'rejected' && (
            <Text style={[styles.statusBadgeText, { color: '#EF4444', backgroundColor: '#FEE2E2' }]}>Declined - Retry?</Text>
          )}
        </View>
      </View>
      <Ionicons name="chatbubble-ellipses-outline" size={20} color={Colors.accent.primary} />
    </TouchableOpacity>
    );
  };

  const renderChatPeerRow = ({ item }: { item: any }) => {
    const isOnline = item.user_id === 'mock-peer-user-id' ? true : (item.user_id ? onlineUserIds.includes(item.user_id) : false);

    const formatLastMsgTime = (dateString: string) => {
      if (!dateString) return '';
      try {
        const date = new Date(dateString);
        const now = new Date();
        if (date.toDateString() === now.toDateString()) {
          let hours = date.getHours();
          const minutes = date.getMinutes();
          const ampm = hours >= 12 ? 'PM' : 'AM';
          hours = hours % 12;
          hours = hours ? hours : 12;
          const minStr = minutes < 10 ? '0' + minutes : minutes;
          return `${hours}:${minStr} ${ampm}`;
        }
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) {
          return 'Yesterday';
        }
        return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      } catch {
        return '';
      }
    };

    const peerMsgs = messagesByPeer[item.user_id] || [];
    const lastMsg = peerMsgs.length > 0 ? peerMsgs[peerMsgs.length - 1] : null;
    const unreadCount = peerMsgs.filter(m => m.sender_id === item.user_id && !m.is_read).length;

    const getTickDetails = () => {
      const msg = lastMsg;
      if (!msg) return null;
      if (msg.sender_id !== user?.id) return null;
      if (msg.is_read) {
        return { name: 'checkmark-done' as const, color: Colors.accent.primary }; // Brand read ticks
      }
      if (msg.is_delivered) {
        return { name: 'checkmark-done' as const, color: '#9CA3AF' }; // Gray delivered ticks
      }
      return { name: 'checkmark' as const, color: '#9CA3AF' }; // Gray sent tick
    };

    const formatLastSeen = () => {
      const lastSeenVal = item.user_id ? (onlinePresence[item.user_id] || item.last_seen_at) : item.last_seen_at;
      if (!lastSeenVal) return 'Offline';
      try {
        const date = new Date(lastSeenVal);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      } catch {
        return 'Offline';
      }
    };

    const ticks = getTickDetails();
    const lastMsgTime = lastMsg ? formatLastMsgTime(lastMsg.created_at) : '';

    const isSelected = selectedPeerIds.includes(item.user_id);

    const handlePress = () => {
      if (isSelectionMode) {
        import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
        if (isSelected) {
          setSelectedPeerIds(prev => prev.filter(id => id !== item.user_id));
        } else {
          setSelectedPeerIds(prev => [...prev, item.user_id]);
        }
      } else {
        router.push({ pathname: '/(student)/student-chat', params: { peerId: item.user_id } });
      }
    };

    const handleLongPress = () => {
      if (!isSelectionMode) {
        import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
        setSelectedPeerIds([item.user_id]);
      }
    };

    return (
      <TouchableOpacity
        style={[styles.studentCard, isSelected && { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}
        activeOpacity={0.7}
        onPress={handlePress}
        onLongPress={handleLongPress}
      >
        <View style={{ position: 'relative' }}>
          {isSelected && (
            <View style={{ position: 'absolute', top: -5, left: -5, zIndex: 10, backgroundColor: Colors.accent.primary, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark" size={14} color="#FFF" />
            </View>
          )}
          {item.photo_url ? (
            <CachedImage uri={item.photo_url} style={styles.avatar as any} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>{item.name.substring(0, 2).toUpperCase()}</Text>
            </View>
          )}
          {isOnline && <View style={styles.onlineDotIndicator} />}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.studentName} numberOfLines={1}>{item.name}</Text>
            {lastMsg ? (
              <Text style={[
                styles.lastMsgTimeText,
                unreadCount > 0 && { color: Colors.accent.primary, fontWeight: '700' }
              ]}>
                {lastMsgTime}
              </Text>
            ) : null}
          </View>
          
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, marginRight: 8 }}>
              {ticks && (
                <Ionicons name={ticks.name} size={16} color={ticks.color} />
              )}
              <Text style={styles.lastMsgText} numberOfLines={1}>
                {lastMsg ? lastMsg.text : 'No messages yet. Tap to chat!'}
              </Text>
            </View>
            
            {unreadCount > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {isOnline ? (
                  <Text style={[styles.onlineStatusText, { color: '#10B981', fontWeight: '700', fontSize: 10.5 }]}>● Online</Text>
                ) : (
                  <Text style={[styles.onlineStatusText, { fontSize: 10.5 }]}>Last seen: {formatLastSeen()}</Text>
                )}
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.accent.primary} />
      </View>
    );
  }

  const myBio = parseStudentBio(myProfile);

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top - 10, 10) }]}>
      {/* Header */}
      {isSelectionMode ? (
        <View style={[styles.header, { justifyContent: 'space-between' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
            <TouchableOpacity onPress={() => setSelectedPeerIds([])} style={{ padding: 4 }}>
              <Ionicons name="close" size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#1F2937' }}>{selectedPeerIds.length}</Text>
          </View>
          <TouchableOpacity onPress={handleDeleteSelectedChats} style={{ padding: 4 }}>
            <Ionicons name="trash-outline" size={22} color="#EF4444" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.header}>
          {activeSegment === 'directory' && (
            <TouchableOpacity onPress={() => setActiveSegment('chats')} style={styles.headerBackBtn}>
              <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>
            {activeSegment === 'directory' ? 'Peer Directory' : 'Coaching Peers'}
          </Text>
        </View>
      )}

      {/* Current Student Profile Bio Header */}
      <View style={styles.myBioHeader}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.myBioName}>🎓 {myProfile?.name || 'My Profile Info'}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Text style={styles.myBioText}>Did: <Text style={{fontWeight:'700'}}>{myBio.completed || 'N/A'}</Text></Text>
            <Text style={styles.myBioText}>• Pursuing: <Text style={{fontWeight:'700'}}>{myBio.pursuing || 'N/A'}</Text></Text>
            <Text style={styles.myBioText}>• Likes: <Text style={{fontWeight:'700'}}>{myBio.hobbies || 'N/A'}</Text></Text>
          </View>
        </View>
        <TouchableOpacity 
          style={styles.myBioEditBtn} 
          onPress={() => setIsMyBioModalVisible(true)}
        >
          <Ionicons name="create-outline" size={14} color="#FFF" style={{ marginRight: 4 }} />
          <Text style={styles.myBioEditBtnText}>Edit</Text>
        </TouchableOpacity>
      </View>

      {activeSegment === 'directory' ? (
        <View style={{ flex: 1 }}>
          <View style={styles.searchBarContainer}>
            <Ionicons name="search" size={18} color={Colors.text.tertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or batch..."
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={handleSearch}
            />
          </View>

          <FlatList
            data={filteredStudents}
            renderItem={renderStudentRow}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent.primary} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={40} color={Colors.text.tertiary} />
                <Text style={styles.emptyText}>No registered peers found.</Text>
              </View>
            }
          />
        </View>
      ) : (
        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent.primary} />}
        >
          {/* Pending Chat Requests */}
          {activeRequests.length > 0 && (
            <View style={styles.requestsSection}>
              <Text style={styles.sectionHeader}>Incoming Connection Requests</Text>
              {activeRequests.map((req) => (
                <View key={req.id} style={styles.requestCard}>
                  <View style={styles.reqHeader}>
                    {req.sender_profile?.photo_url ? (
                      <CachedImage uri={req.sender_profile.photo_url} style={styles.reqAvatar as any} />
                    ) : (
                      <View style={styles.reqAvatarFallback}>
                        <Text style={styles.reqAvatarText}>
                          {req.sender_profile?.name.substring(0,2).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reqTitle}>{req.sender_profile?.name} wants to connect</Text>
                      <Text style={styles.reqMeta}>{req.sender_profile?.batch_name}</Text>
                    </View>
                  </View>
                  <View style={styles.reqActions}>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => handleRejectRequest(req.id)}
                    >
                      <Text style={styles.rejectBtnText}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.acceptBtn}
                      onPress={() => handleAcceptRequest(req.id, req.sender_profile?.name || 'Student')}
                    >
                      <Text style={styles.acceptBtnText}>Accept & Chat</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Active Peer Conversations */}
          <Text style={styles.sectionHeader}>My Chats</Text>
          {chatPeers.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="chatbubbles-outline" size={44} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitleText}>No active chats yet</Text>
              <Text style={styles.emptyDescText}>
                Go to the Peer Directory to connect and start chatting with students in your batch.
              </Text>
              <TouchableOpacity
                style={styles.exploreBtn}
                onPress={() => setActiveSegment('directory')}
              >
                <Text style={styles.exploreBtnText}>Search Peers</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={chatPeers}
              renderItem={renderChatPeerRow}
              keyExtractor={item => item.id}
              scrollEnabled={false}
              contentContainerStyle={{ gap: 10 }}
            />
          )}
        </ScrollView>
      )}

      {/* Edit My Bio Modal */}
      <Modal visible={isMyBioModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { borderTopLeftRadius: 24, borderTopRightRadius: 24 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update Educational Bio</Text>
              <TouchableOpacity onPress={() => setIsMyBioModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text.primary} />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 14 }}>
              <View>
                <Text style={styles.inputLabel}>What education did you complete?</Text>
                <TextInput
                  style={styles.bioInput}
                  placeholder="e.g. B.Sc in Physics, Class XII"
                  placeholderTextColor="#9CA3AF"
                  value={myCompleted}
                  onChangeText={setMyCompleted}
                />
              </View>

              <View>
                <Text style={styles.inputLabel}>What course/exam are you pursuing?</Text>
                <TextInput
                  style={styles.bioInput}
                  placeholder="e.g. Preparing for MPPSC, UPSC Civil Services"
                  placeholderTextColor="#9CA3AF"
                  value={myPursuing}
                  onChangeText={setMyPursuing}
                />
              </View>

              <View>
                <Text style={styles.inputLabel}>What are your interests/likes?</Text>
                <TextInput
                  style={styles.bioInput}
                  placeholder="e.g. Reading history books, solving puzzles"
                  placeholderTextColor="#9CA3AF"
                  value={myHobbies}
                  onChangeText={setMyHobbies}
                />
              </View>

              <TouchableOpacity style={styles.saveBioBtn} onPress={handleSaveMyBio}>
                <Text style={styles.saveBioBtnText}>Save Profile Details</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Profile Popup / strict conditions modal */}
      <Modal visible={isPopupVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          {selectedStudent && (
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Student Profile & Bio</Text>
                <TouchableOpacity onPress={() => setIsPopupVisible(false)}>
                  <Ionicons name="close" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              {/* Profile details & Bio (Side by side rendering) */}
              <View style={styles.modalProfileRow}>
                <View style={{ flex: 1.1, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {selectedStudent.photo_url ? (
                      <CachedImage uri={selectedStudent.photo_url} style={styles.modalAvatar as any} />
                    ) : (
                      <View style={styles.modalAvatarFallback}>
                        <Text style={styles.modalAvatarText}>
                          {selectedStudent.name.substring(0,2).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalStudentName} numberOfLines={1}>{selectedStudent.name}</Text>
                      <Text style={styles.modalStudentMeta}>{selectedStudent.batch_name}</Text>
                      <Text style={styles.modalStudentJoined}>
                        Joined: {selectedStudent.admission_date ? new Date(selectedStudent.admission_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Educational Bio Box */}
                {(() => {
                  const bio = parseStudentBio(selectedStudent);
                  return (
                    <View style={styles.modalBioContainer}>
                      <Text style={styles.bioSectionTitle}>🎓 Bio Details</Text>
                      {bio.completed ? (
                        <Text style={styles.bioText} numberOfLines={2}>
                          • Did: <Text style={{ fontWeight: '700' }}>{bio.completed}</Text>
                        </Text>
                      ) : null}
                      {bio.pursuing ? (
                        <Text style={styles.bioText} numberOfLines={2}>
                          • Pursuing: <Text style={{ fontWeight: '700' }}>{bio.pursuing}</Text>
                        </Text>
                      ) : null}
                      {bio.hobbies ? (
                        <Text style={styles.bioText} numberOfLines={2}>
                          • Likes: <Text style={{ fontWeight: '700' }}>{bio.hobbies}</Text>
                        </Text>
                      ) : null}
                      {!bio.completed && !bio.pursuing && !bio.hobbies && (
                        <Text style={[styles.bioText, { fontStyle: 'italic', color: Colors.text.tertiary }]}>
                          No bio added yet.
                        </Text>
                      )}
                    </View>
                  );
                })()}
              </View>

              {/* Dynamically adjust controls based on connection request state */}
              {(() => {
                const request = getRequestStatus();
                
                if (!request) {
                  // Standard flow: no request exists yet
                  return (
                    <>
                      {/* Strict Chatting Guidelines */}
                      <View style={styles.guidelineCard}>
                        <Text style={styles.guidelineHeader}>🔒 Peer Interaction Safeguards</Text>
                        
                        <View style={styles.checkboxRow}>
                          <Switch
                            value={agreeRespect}
                            onValueChange={setAgreeRespect}
                            trackColor={{ false: '#E5E7EB', true: Colors.accent.primary }}
                          />
                          <Text style={styles.checkboxLabel}>
                            I agree to treat all peers with respect and maintain classroom decorum.
                          </Text>
                        </View>

                        <View style={styles.checkboxRow}>
                          <Switch
                            value={agreeBanWarning}
                            onValueChange={setAgreeBanWarning}
                            trackColor={{ false: '#E5E7EB', true: Colors.accent.primary }}
                          />
                          <Text style={styles.checkboxLabel}>
                            I understand that inappropriate/abusive chat will result in an immediate profile ban.
                          </Text>
                        </View>

                        <TouchableOpacity style={styles.privacyLink} onPress={handleViewPrivacy}>
                          <Text style={styles.privacyLinkText}>Read Student Privacy & Safety Policy</Text>
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        style={[styles.launchBtn, (!agreeRespect || !agreeBanWarning) && styles.launchBtnDisabled]}
                        disabled={!agreeRespect || !agreeBanWarning || isSubmittingRequest}
                        onPress={handleStartChatRequest}
                      >
                        {isSubmittingRequest ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <>
                            <Ionicons name="chatbubble-outline" size={18} color="#FFF" />
                            <Text style={styles.launchBtnText}>Start Chatting / Request Connection</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </>
                  );
                }

                if (request.status === 'pending') {
                  if (request.sender_id === user?.id) {
                    // Current user sent the request, pending receiver acceptance
                    return (
                      <View style={styles.requestStatusBox}>
                        <Ionicons name="hourglass-outline" size={24} color="#D97706" />
                        <Text style={styles.requestStatusTitle}>Connection Request Sent</Text>
                        <Text style={styles.requestStatusDesc}>
                          Your chat request is currently pending. You can message {selectedStudent.name} once they accept your invitation!
                        </Text>
                      </View>
                    );
                  } else {
                    // Incoming request from the selected student
                    return (
                      <View style={styles.requestStatusBox}>
                        <Ionicons name="mail-unread-outline" size={24} color={Colors.accent.primary} />
                        <Text style={styles.requestStatusTitle}>Incoming Request</Text>
                        <Text style={styles.requestStatusDesc}>
                          {selectedStudent.name} has requested to connect with you. Please review and accept this request in the "Incoming Connections" tab.
                        </Text>
                      </View>
                    );
                  }
                }

                if (request.status === 'accepted') {
                  // Connection already accepted, render direct chat button
                  return (
                    <TouchableOpacity
                      style={styles.launchBtn}
                      onPress={() => {
                        setIsPopupVisible(false);
                        router.push({ pathname: '/(student)/student-chat', params: { peerId: selectedStudent.user_id } });
                      }}
                    >
                      <Ionicons name="chatbubble-ellipses" size={18} color="#FFF" />
                      <Text style={styles.launchBtnText}>Open Chat Room</Text>
                    </TouchableOpacity>
                  );
                }

                if (request.status === 'rejected') {
                  return (
                    <View style={styles.requestStatusBox}>
                      <Ionicons name="close-circle-outline" size={24} color="#EF4444" />
                      <Text style={[styles.requestStatusTitle, { color: '#EF4444' }]}>Previous Request Declined</Text>
                      <Text style={styles.requestStatusDesc}>
                        The previous connection request was declined. You can send a fresh request if you'd like to reach out again.
                      </Text>
                      <TouchableOpacity
                        style={[styles.launchBtn, { marginTop: 12, width: '100%' }]}
                        onPress={handleStartChatRequest}
                        disabled={isSubmittingRequest}
                      >
                        {isSubmittingRequest ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <>
                            <Ionicons name="refresh-outline" size={18} color="#FFF" />
                            <Text style={styles.launchBtnText}>Send New Request</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                }

                return null;
              })()}
            </View>
          )}
        </View>
      </Modal>
      {/* Floating Action Button for opening directory */}
      {activeSegment === 'chats' && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setActiveSegment('directory')}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color="#FFF" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.bg.primary,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  segmentContainer: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  segmentBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  segmentBtnActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  segmentTextActive: {
    color: '#FFF',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: Colors.card.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.text.primary,
  },
  listContent: {
    padding: 12,
    gap: 10,
  },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.card.border,
    gap: 12,
    ...Shadows.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.accent.primary,
  },
  studentName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  studentMeta: {
    fontSize: 11.5,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.text.tertiary,
  },
  scrollContent: {
    padding: 12,
    gap: 16,
  },
  requestsSection: {
    gap: 10,
  },
  sectionHeader: {
    fontSize: 13.5,
    fontWeight: '800',
    color: Colors.text.primary,
    paddingHorizontal: 4,
  },
  requestCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.card.border,
    padding: 14,
    gap: 12,
    ...Shadows.sm,
  },
  reqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reqAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  reqAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reqAvatarText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.accent.primary,
  },
  reqTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  reqMeta: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginTop: 1,
  },
  reqActions: {
    flexDirection: 'row',
    gap: 8,
  },
  rejectBtn: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  acceptBtn: {
    flex: 1.8,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  emptyBox: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: Colors.card.border,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    ...Shadows.sm,
  },
  emptyTitleText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  emptyDescText: {
    fontSize: 12,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  exploreBtn: {
    backgroundColor: Colors.accent.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  exploreBtnText: {
    fontSize: 12,
    fontWeight: '800' as const,
    color: '#FFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  modalProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: Colors.bg.secondary,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  modalAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  modalAvatarFallback: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  modalAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.accent.primary,
  },
  modalStudentName: {
    fontSize: 14.5,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  modalStudentMeta: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  modalStudentJoined: {
    fontSize: 10.5,
    color: Colors.text.tertiary,
    marginTop: 2,
  },
  guidelineCard: {
    gap: 12,
  },
  guidelineHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkboxLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
    flex: 1,
    lineHeight: 16,
  },
  privacyLink: {
    marginTop: 2,
  },
  privacyLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.accent.primary,
    textDecorationLine: 'underline',
  },
  launchBtn: {
    height: 48,
    backgroundColor: Colors.accent.primary,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  launchBtnDisabled: {
    backgroundColor: '#E5E7EB',
  },
  launchBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFF',
  },
  myBioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    backgroundColor: '#EEF2F6',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 14,
    padding: 12,
    gap: 12,
    marginBottom: 4,
  },
  myBioName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  myBioText: {
    fontSize: 11.5,
    color: Colors.text.secondary,
  },
  myBioEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  myBioEditBtnText: {
    fontSize: 11.5,
    fontWeight: '800' as const,
    color: '#FFF',
  },
  modalBioContainer: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: Colors.card.border,
    paddingLeft: 12,
    gap: 3,
  },
  bioSectionTitle: {
    fontSize: 10,
    fontWeight: '900' as const,
    color: Colors.text.secondary,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  bioText: {
    fontSize: 11,
    color: Colors.text.secondary,
    lineHeight: 15,
  },
  inputLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: Colors.text.primary,
    marginBottom: 6,
  },
  bioInput: {
    height: 40,
    borderWidth: 1,
    borderColor: Colors.card.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 12.5,
    color: Colors.text.primary,
    backgroundColor: '#F9FAFB',
  },
  saveBioBtn: {
    height: 44,
    backgroundColor: Colors.accent.primary,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveBioBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  requestStatusBox: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  requestStatusTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#B45309',
  },
  requestStatusDesc: {
    fontSize: 11.5,
    color: '#78350F',
    textAlign: 'center',
    lineHeight: 16.5,
  },
  onlineDotIndicator: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  onlineStatusText: {
    fontSize: 11.5,
    color: Colors.text.tertiary,
  },
  lastMsgTimeText: {
    fontSize: 10.5,
    color: '#9CA3AF',
  },
  lastMsgText: {
    fontSize: 12,
    color: '#6B7280',
    flex: 1,
  },
  unreadBadge: {
    backgroundColor: Colors.accent.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  unreadBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  headerBackBtn: {
    marginRight: 12,
    padding: 4,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: Colors.accent.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
});

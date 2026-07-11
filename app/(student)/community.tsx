import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Dimensions,
  Alert,
  Modal,
  ScrollView,
  Animated,
  Pressable,
  PanResponder,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { downloadAndOpenSaf } from '@/lib/saf';
import PrestostorageModule from '@/modules/prestostorage/src/PrestostorageModule';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { setCurrentActiveScreen } from '@/lib/notifications';

const { width: screenWidth } = Dimensions.get('window');

// Robust helper to extract attachment Name and URL from markdown (survives parentheses inside URLs!)
const extractUrlAndName = (text: string) => {
  if (!text) return null;
  const linkStart = text.indexOf('](http');
  if (linkStart !== -1) {
    const urlStart = linkStart + 2;
    const urlEnd = text.indexOf(')', urlStart);
    if (urlEnd !== -1) {
      const url = text.substring(urlStart, urlEnd).trim();
      const contentBefore = text.substring(0, linkStart);
      const prefixIndex = contentBefore.indexOf(':');
      let name = 'File';
      let type: 'image' | 'document' = 'document';
      if (prefixIndex !== -1) {
        name = contentBefore.substring(prefixIndex + 1).trim();
        const prefix = contentBefore.substring(1, prefixIndex).trim().toLowerCase();
        if (prefix === 'image') type = 'image';
      }
      return { name, url, type };
    }
  }
  return null;
};

// Date separator helper
const getFormattedDividerDate = (dateString: string) => {
  if (!dateString) return 'Today';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Today';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    const day = date.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  }
};

const formatBubbleTime = (dateString: string) => {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch (e) {
    return '';
  }
};

// Extract links, docs, and media dynamically from community messages
const extractMediaDocsLinks = (msgs: any[]) => {
  const media: string[] = [];
  const docs: { name: string; url: string; date: string }[] = [];
  const links: { title: string; url: string; date: string }[] = [];

  msgs.forEach(msg => {
    const text = msg.text || '';
    const parsed = extractUrlAndName(text);
    
    if (parsed) {
      if (parsed.type === 'image') {
        media.push(parsed.url);
      } else if (parsed.type === 'document') {
        docs.push({ name: parsed.name, url: parsed.url, date: new Date(msg.created_at).toLocaleDateString() });
      }
    }

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlRegex) || [];

    urls.forEach((url: string) => {
      const cleanUrl = url.split(')')[0].split(']')[0];
      if (cleanUrl !== parsed?.url) {
        if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(cleanUrl)) {
          if (!media.includes(cleanUrl)) media.push(cleanUrl);
        } else if (/\.(pdf|docx?|xlsx?|pptx?|txt|zip|rar)$/i.test(cleanUrl)) {
          const fileName = cleanUrl.substring(cleanUrl.lastIndexOf('/') + 1) || 'Document';
          if (!docs.some(d => d.url === cleanUrl)) {
            docs.push({ name: fileName, url: cleanUrl, date: new Date(msg.created_at).toLocaleDateString() });
          }
        } else {
          if (!links.some(l => l.url === cleanUrl)) {
            links.push({ title: cleanUrl, url: cleanUrl, date: new Date(msg.created_at).toLocaleDateString() });
          }
        }
      }
    });
  });

  return { media, docs, links };
};

// Reusable animated pressable that scales down slightly when pressed (WhatsApp/premium tactile feel)
const ScalePressable = ({ children, onPress, style, disabled }: { children: React.ReactNode, onPress?: () => void, style?: any, disabled?: boolean }) => {
  const scaleValue = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleValue, {
      toValue: 0.94,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleValue, {
      toValue: 1.0,
      useNativeDriver: true,
      speed: 40,
      bounciness: 4,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={style}
    >
      <Animated.View style={{ transform: [{ scale: scaleValue }] }}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

// Custom Gesture-Handler based pinch-to-zoom and pan image viewer (cross-platform, Android safe)
const ZoomableImage = ({ uri, onZoomStateChange }: { uri: string, onZoomStateChange: (isZoomed: boolean) => void }) => {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 4));
      runOnJS(onZoomStateChange)(scale.value > 1.05);
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(onZoomStateChange)(false);
      } else {
        savedScale.value = scale.value;
      }
    });

  const panGesture = Gesture.Pan()
    // Only activate pan when zoomed in - otherwise let FlatList handle horizontal swipes
    .activeOffsetX([-20, 20])
    .activeOffsetY([-20, 20])
    .onUpdate((e) => {
      if (scale.value > 1.05) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      if (scale.value > 1.05) {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  return (
    <GestureDetector gesture={composedGesture}>
      <Reanimated.View style={{ width: screenWidth, height: '100%', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
        <Reanimated.Image
          source={{ uri }}
          style={[styles.lightboxImage, animatedStyle]}
          resizeMode="contain"
        />
      </Reanimated.View>
    </GestureDetector>
  );
};

export default function StudentCommunityScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [coachingName, setCoachingName] = useState('Community Chat');
  const [coachingLogoUrl, setCoachingLogoUrl] = useState<string | null>(null);
  const [studentCount, setStudentCount] = useState<number>(0);
  const [orgId, setOrgId] = useState('');

  // Search & Navigation Modals states
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);
  const [showCoachingInfo, setShowCoachingInfo] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'media'>('info');
  const [mediaSubTab, setMediaSubTab] = useState<'media' | 'docs' | 'links'>('media');
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const [downloadedMap, setDownloadedMap] = useState<Record<string, boolean>>({});
  const [localMediaMap, setLocalMediaMap] = useState<Record<string, string>>({});
  const [downloadingIds, setDownloadingIds] = useState<Record<string, boolean>>({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [currentViewerIndex, setCurrentViewerIndex] = useState<number>(0);
  const [lightboxScrollEnabled, setLightboxScrollEnabled] = useState(true);
  const failedDownloadsRef = useRef<Record<string, boolean>>({});

  // Load persisted cache mappings on mount
  useEffect(() => {
    const loadCache = async () => {
      try {
        const downloadedJson = await AsyncStorage.getItem('community_downloaded_media');
        const localPathsJson = await AsyncStorage.getItem('community_local_media_paths');
        
        let loadedDownloads = downloadedJson ? JSON.parse(downloadedJson) : {};
        let loadedPaths = localPathsJson ? JSON.parse(localPathsJson) : {};

        // Verify that files still exist locally
        const verifiedPaths: Record<string, string> = {};
        for (const [msgId, path] of Object.entries(loadedPaths)) {
          const info = await FileSystem.getInfoAsync(path as string);
          if (info.exists) {
            verifiedPaths[msgId] = path as string;
          } else {
            delete loadedDownloads[msgId];
          }
        }

        setDownloadedMap(loadedDownloads);
        setLocalMediaMap(verifiedPaths);
      } catch (e) {
        console.warn('Failed to load cache:', e);
      }
    };
    loadCache();
  }, []);

  // Automatically download images in the background when messages load
  const autoDownloadImages = useCallback(async (msgs: any[]) => {
    for (const msg of msgs) {
      const isImage = msg.image_url || (msg.text && msg.text.startsWith('[Image:'));
      if (isImage) {
        const isSelf = msg.author_id === user?.id;
        // Don't auto-download if already cached locally, if self, if downloading, or if it already failed
        if (!localMediaMap[msg.id] && !isSelf && !downloadingIds[msg.id] && !failedDownloadsRef.current[msg.id]) {
          const parsed = extractUrlAndName(msg.text);
          const imgUri = msg.image_url || parsed?.url;
          if (imgUri) {
            downloadImageLocal(msg.id, imgUri);
          }
        }
      }
    }
  }, [localMediaMap, downloadingIds, user]);

  // Save local media file to device photo gallery
  const saveImageToGallery = async (localUri: string) => {
    try {
      const fileName = localUri.split('/').pop() || 'image.jpg';
      if (Platform.OS === 'android') {
        const result = await PrestostorageModule.saveDocument(localUri, fileName);
        if (result && result.success) {
          Alert.alert('Success', 'Image saved successfully to Downloads/PrestoID folder!');
        } else {
          throw new Error('Failed to save via PrestostorageModule');
        }
      } else {
        const Sharing = require('expo-sharing');
        await Sharing.shareAsync(localUri);
      }
    } catch (e: any) {
      console.warn('Failed to save image:', e);
      Alert.alert('Error', 'Failed to save image: ' + (e.message || e));
    }
  };

  // Share media file natively (downloads remote http paths to cache first if needed)
  const handleShareImage = async (uri: string) => {
    try {
      const Sharing = require('expo-sharing');
      if (uri.startsWith('http')) {
        const fileName = uri.split('/').pop()?.split('?')[0] || 'shared_image.jpg';
        const tempUri = `${FileSystem.cacheDirectory}${fileName}`;
        const { uri: localDownloadedUri } = await FileSystem.downloadAsync(uri, tempUri);
        await Sharing.shareAsync(localDownloadedUri);
        await FileSystem.deleteAsync(localDownloadedUri, { idempotent: true });
      } else {
        await Sharing.shareAsync(uri);
      }
    } catch (e: any) {
      console.warn('Sharing failed:', e);
      Alert.alert('Error', 'Failed to share image: ' + (e.message || e));
    }
  };

  // Download image silently to document directory (caches for 0 second loads) and saves to gallery on Android
  const downloadImageLocal = async (msgId: string, url: string) => {
    if (downloadingIds[msgId]) return;
    setDownloadingIds(prev => ({ ...prev, [msgId]: true }));
    
    try {
      const ext = url.split('.').pop()?.split('?')[0] || 'jpg';
      const safeName = `community_img_${msgId}.${ext}`;
      const localUri = `${FileSystem.documentDirectory}${safeName}`;

      // 1. Download to local persistent app storage
      const downloadResult = await FileSystem.downloadAsync(url, localUri);
      if (downloadResult.status < 200 || downloadResult.status >= 300) {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
        throw new Error(`Server returned status code ${downloadResult.status}`);
      }

      // 2. Android: save to public Gallery/MediaStore
      if (Platform.OS === 'android') {
        try {
          await PrestostorageModule.saveDocument(localUri, safeName);
        } catch (e) {
          console.warn('Silent Android MediaStore gallery save failed:', e);
        }
      }

      // 3. Update paths
      setLocalMediaMap(prev => {
        const updated = { ...prev, [msgId]: localUri };
        AsyncStorage.setItem('community_local_media_paths', JSON.stringify(updated)).catch(e => console.warn(e));
        return updated;
      });

      setDownloadedMap(prev => {
        const updated = { ...prev, [msgId]: true };
        AsyncStorage.setItem('community_downloaded_media', JSON.stringify(updated)).catch(e => console.warn(e));
        return updated;
      });
    } catch (err) {
      console.warn('Silent image cache failed:', err);
      failedDownloadsRef.current[msgId] = true;
    } finally {
      setDownloadingIds(prev => {
        const copy = { ...prev };
        delete copy[msgId];
        return copy;
      });
    }
  };

  // Download document to storage and save to downloads folder / open share sheet
  const handleDownloadDocument = async (msgId: string, url: string, name: string) => {
    if (downloadingIds[msgId]) return;
    setDownloadingIds(prev => ({ ...prev, [msgId]: true }));

    try {
      const result = await downloadAndOpenSaf(url, name);
      if (result && result.success) {
        // Save local cache path
        const safeName = name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const localUri = Platform.OS === 'ios' 
          ? `${FileSystem.documentDirectory}${safeName}` 
          : result.uri || `${FileSystem.cacheDirectory}${safeName}`;

        setLocalMediaMap(prev => {
          const updated = { ...prev, [msgId]: localUri };
          AsyncStorage.setItem('community_local_media_paths', JSON.stringify(updated)).catch(e => console.warn(e));
          return updated;
        });

        setDownloadedMap(prev => {
          const updated = { ...prev, [msgId]: true };
          AsyncStorage.setItem('community_downloaded_media', JSON.stringify(updated)).catch(e => console.warn(e));
          return updated;
        });

        // Open PDF in in-app viewer immediately on success
        if (name.toLowerCase().endsWith('.pdf')) {
          router.push({
            pathname: '/(student)/pdf-viewer',
            params: { uri: localUri, title: name }
          });
        }
      } else {
        throw new Error(result?.error || 'Failed to save document.');
      }
    } catch (err: any) {
      console.warn('Doc download failed:', err);
      Alert.alert('Download Error', err.message || 'Failed to download document.');
    } finally {
      setDownloadingIds(prev => {
        const copy = { ...prev };
        delete copy[msgId];
        return copy;
      });
    }
  };

  const flatListRef = useRef<FlatList>(null);

  const loadMemberAvatars = async (bizId: string) => {
    try {
      const { data: memberProfiles } = await supabase
        .from('profiles')
        .select('id, avatar_url')
        .eq('business_id', bizId);
      
      if (memberProfiles) {
        const map: Record<string, string> = {};
        memberProfiles.forEach(p => {
          if (p.avatar_url) {
            map[p.id] = p.avatar_url;
          }
        });
        setProfilesMap(map);
      }
    } catch (err) {
      console.warn('Failed to load member avatars:', err);
    }
  };

  // Load student profile details
  const loadProfile = async () => {
    if (!user) return;
    try {
      const { data: profile, error } = await supabase
        .from('students')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      if (profile) {
        setStudentProfile(profile);
        
        // Fetch coaching details and admin avatar
        const { data: biz } = await supabase
          .from('businesses')
          .select('business_name, admin_id, organization_id')
          .eq('id', profile.business_id)
          .maybeSingle();
        if (biz) {
          setCoachingName(biz.business_name || 'Community Chat');
          setOrgId(biz.organization_id || '');
          
          if (biz.admin_id) {
            const { data: adminProf } = await supabase
              .from('profiles')
              .select('avatar_url')
              .eq('id', biz.admin_id)
              .maybeSingle();
            if (adminProf?.avatar_url) {
              setCoachingLogoUrl(adminProf.avatar_url);
            }
          }
        }

        // Fetch student count
        const { count } = await supabase
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', profile.business_id);
        if (count !== null) {
          setStudentCount(count);
        }
        
        await loadMemberAvatars(profile.business_id);

        // Fetch messages for this business
        await fetchMessages(profile.business_id);
      }
    } catch (err) {
      console.warn('Failed to load student profile for chat:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMessages = async (businessId: string) => {
    try {
      const { data, error } = await supabase
        .from('community_posts')
        .select('*')
        .eq('business_id', businessId)
        .neq('is_deleted', true)
        .order('created_at', { ascending: true }); // chronological order

      if (error) throw error;
      setMessages(data || []);
      
      // Scroll to bottom after loading
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 150);
    } catch (err) {
      console.warn('Failed to fetch community messages:', err);
    }
  };

  useEffect(() => {
    if (messages.length > 0) {
      autoDownloadImages(messages);
    }
  }, [messages, autoDownloadImages]);

  // When messages are visible and community is open, persist all as "read" in AsyncStorage
  useEffect(() => {
    if (messages.length > 0 && useNotificationStore.getState().communityIsOpen) {
      const persist = async () => {
        try {
          const ids = messages.map(m => String(m.id));
          const existingJSON = await AsyncStorage.getItem('@presto_student_read_posts');
          const existing: string[] = existingJSON ? JSON.parse(existingJSON) : [];
          const merged = [...new Set([...existing, ...ids])];
          await AsyncStorage.setItem('@presto_student_read_posts', JSON.stringify(merged));
          useNotificationStore.getState().setStudentCommunityUnreadCount(0);
        } catch (_) {}
      };
      persist();
    }
  }, [messages.length]);

  // Real-time subscription setup
  useEffect(() => {
    if (!studentProfile?.business_id) return;

    const channel = supabase
      .channel('student_community_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'community_posts'
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const newMsg = payload.new;
          if (newMsg.business_id !== studentProfile.business_id) return;
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        } else if (payload.eventType === 'UPDATE') {
          const updatedMsg = payload.new;
          if (updatedMsg.business_id !== studentProfile.business_id) return;
          if (updatedMsg.is_deleted) {
            setMessages(prev => prev.filter(m => String(m.id) !== String(updatedMsg.id)));
          } else {
            setMessages(prev => prev.map(m => String(m.id) === String(updatedMsg.id) ? updatedMsg : m));
          }
        } else if (payload.eventType === 'DELETE') {
          const deletedId = payload.old.id;
          setMessages(prev => prev.filter(m => String(m.id) !== String(deletedId)));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [studentProfile?.business_id]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 250);
    }
  }, [messages.length]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
      // Mark community as open so notifications don't increment badge
      useNotificationStore.getState().setCommunityIsOpen(true);
      setCurrentActiveScreen('community'); // suppress notification banners while in chat
      useNotificationStore.getState().setStudentCommunityUnreadCount(0);
      // Persist all visible message IDs as "read" so DB re-fetch doesn't reset badge
      const markAllRead = async () => {
        try {
          const store = useNotificationStore.getState();
          const existingJSON = await AsyncStorage.getItem('@presto_student_read_posts');
          const existing: string[] = existingJSON ? JSON.parse(existingJSON) : [];
          // We don't have message IDs here yet — messages loads async, handled in useEffect below
        } catch (_) {}
      };
      markAllRead();
      return () => {
        // Mark community as closed when navigating away
        useNotificationStore.getState().setCommunityIsOpen(false);
        setCurrentActiveScreen(''); // restore notification banners
      };
    }, [user])
  );

  const sendMessage = async () => {
    if (!inputText.trim() || !studentProfile || isSending) return;
    setIsSending(true);
    const textToSend = inputText.trim();
    setInputText('');

    try {
      const { error } = await supabase
        .from('community_posts')
        .insert({
          business_id: studentProfile.business_id,
          author_id: user?.id,
          author_name: studentProfile.name || 'Anonymous Student',
          author_role: 'student',
          category: 'announcement', // default category
          text: textToSend
        });

      if (error) throw error;
    } catch (err) {
      console.warn('Failed to send message:', err);
      Alert.alert('Error', 'Failed to send message. Please try again.');
      setInputText(textToSend); // restore input text on error
    } finally {
      setIsSending(false);
    }
  };

  const filteredMessages = messages.filter(msg => {
    if (!searchQuery.trim()) return true;
    return (msg.text || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
           (msg.author_name || '').toLowerCase().includes(searchQuery.toLowerCase());
  });

  const parsedMedia = extractMediaDocsLinks(messages);
  const imageMessages = messages.filter(msg => msg.image_url || (msg.text && msg.text.startsWith('[Image:')));

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header Banner Card */}
      <View style={styles.header}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => setShowAvatarPreview(true)}>
          <Image 
            source={{ uri: coachingLogoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(coachingName)}&background=0D8ABC&color=fff&rounded=true` }} 
            style={styles.headerAvatar}
          />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.headerInfo} 
          activeOpacity={0.7} 
          onPress={() => {
            setActiveTab('info');
            setShowCoachingInfo(true);
          }}
        >
          <Text style={styles.headerTitle} numberOfLines={1}>{coachingName}</Text>
          <Text style={styles.headerSubtitle}>{studentCount} members</Text>
        </TouchableOpacity>

        {/* Search Icon */}
        <TouchableOpacity 
          style={styles.searchIconBtn} 
          activeOpacity={0.7} 
          onPress={() => {
            setIsSearchActive(!isSearchActive);
            if (isSearchActive) setSearchQuery('');
          }}
        >
          <Ionicons 
            name={isSearchActive ? "close-outline" : "search-outline"} 
            size={22} 
            color={isSearchActive ? Colors.accent.primary : Colors.text.secondary} 
          />
        </TouchableOpacity>
      </View>

      {/* Dynamic Search Bar */}
      {isSearchActive && (
        <View style={styles.searchBarContainer}>
          <Ionicons name="search-outline" size={16} color={Colors.text.tertiary} style={{ marginRight: 8 }} />
          <TextInput 
            style={styles.searchInput}
            placeholder="Search messages, files, docs..."
            placeholderTextColor={Colors.text.tertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={Colors.text.tertiary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Chat Background & Message List */}
      <FlatList
        ref={flatListRef}
        data={filteredMessages}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item, index }) => {
          const isSelf = item.author_id === user?.id;
          
          // Show date separator if date changes
          const prevMsg = filteredMessages[index - 1];
          const showDateSeparator = !prevMsg || 
            new Date(prevMsg.created_at).toDateString() !== new Date(item.created_at).toDateString();

          const isTeacher = item.author_role === 'admin' || item.author_role === 'teacher';
          const isImageAttachment = !!(item.image_url || (item.text && item.text.startsWith('[Image:')));

          return (
            <View style={{ width: '100%' }}>
              {showDateSeparator && (
                <View style={styles.dateBadgeContainer}>
                  <View style={styles.dateBadge}>
                    <Text style={styles.dateBadgeText}>
                      {getFormattedDividerDate(item.created_at)}
                    </Text>
                  </View>
                </View>
              )}

              <View style={[styles.messageRow, isSelf ? styles.rowSelf : styles.rowOther]}>
                {/* Left avatar for incoming messages */}
                {!isSelf && (
                  <Image 
                    source={{ uri: profilesMap[item.author_id] || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.author_name)}&background=AF2800&color=fff&rounded=true` }} 
                    style={styles.bubbleAvatar}
                  />
                )}

                {/* Bubble + tail wrapper */}
                <View style={{ position: 'relative' }}>
                  {/* Tail triangle for non-self messages (bottom-left) */}
                  {!isSelf && !isImageAttachment && (
                    <View style={{
                      position: 'absolute',
                      bottom: 0,
                      left: -7,
                      width: 0,
                      height: 0,
                      borderTopWidth: 8,
                      borderRightWidth: 8,
                      borderTopColor: '#FFFFFF',
                      borderRightColor: 'transparent',
                    }} />
                  )}
                  {/* Tail triangle for self messages (bottom-right) */}
                  {isSelf && !isImageAttachment && (
                    <View style={{
                      position: 'absolute',
                      bottom: 0,
                      right: -7,
                      width: 0,
                      height: 0,
                      borderTopWidth: 8,
                      borderLeftWidth: 8,
                      borderTopColor: '#AF2800',
                      borderLeftColor: 'transparent',
                    }} />
                  )}
                <View style={[
                  styles.bubble,
                  isSelf ? styles.bubbleSelf : styles.bubbleOther,
                  isImageAttachment && { padding: 0, paddingHorizontal: 0, paddingVertical: 0 }
                ]}>
                  {/* Render sender name for incoming messages */}
                  {!isSelf && (
                    <Text style={[
                      styles.authorText,
                      isTeacher ? styles.authorTeacher : styles.authorStudent,
                      isImageAttachment && { marginLeft: 12, marginTop: 8, marginBottom: 4 }
                    ]}>
                      {item.author_name} {isTeacher ? '(Teacher)' : ''}
                    </Text>
                  )}

                  {/* Image Attachment Rendering */}
                  {isImageAttachment && (() => {
                    const isDownloaded = downloadedMap[item.id] || isSelf;
                    const isDownloading = downloadingIds[item.id];
                    const parsed = extractUrlAndName(item.text);
                    const imgUri = item.image_url || parsed?.url;
                    const displayUri = localMediaMap[item.id] || imgUri;
                    const captionText = item.text ? item.text.substring(item.text.indexOf(')') + 1).trim() : '';

                    return (
                      <View style={{ overflow: 'hidden', borderRadius: 16, width: 260 }}>
                        <View style={{ position: 'relative', width: 260, height: 190, overflow: 'hidden' }}>
                          <TouchableOpacity 
                            activeOpacity={0.9}
                            onPress={() => {
                              if (isDownloaded && displayUri) {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                const idx = imageMessages.findIndex(m => m.id === item.id);
                                if (idx !== -1) {
                                  setLightboxIndex(idx);
                                  setCurrentViewerIndex(idx);
                                }
                              }
                            }}
                            disabled={!isDownloaded}
                          >
                            <Image 
                              source={{ uri: displayUri }} 
                              style={styles.bubbleImageAttachment} 
                              blurRadius={isDownloaded ? 0 : 25}
                            />
                          </TouchableOpacity>
                          {!isDownloaded && (
                            <View style={styles.downloadOverlay}>
                              <TouchableOpacity 
                                style={styles.downloadCircle} 
                                activeOpacity={0.8}
                                onPress={() => imgUri && downloadImageLocal(item.id, imgUri)}
                                disabled={isDownloading}
                              >
                                {isDownloading ? (
                                  <ActivityIndicator size="small" color="#FFF" />
                                ) : (
                                  <Ionicons name="download-outline" size={24} color="#FFF" />
                                )}
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                        {captionText ? (
                          <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 }}>
                            <Text style={[styles.messageText, isSelf ? styles.textSelf : styles.textOther, { paddingRight: 0 }]}>
                              {captionText}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  })()}

                  {/* Document Attachment Rendering */}
                  {item.text && item.text.startsWith('[Document:') ? (() => {
                    const isDownloaded = downloadedMap[item.id] || isSelf;
                    const isDownloading = downloadingIds[item.id];
                    const parsed = extractUrlAndName(item.text);
                    const docName = parsed?.name || 'Document';
                    const docUrl = parsed?.url;

                    return (
                      <TouchableOpacity 
                        style={styles.bubbleFileAttachment}
                        activeOpacity={0.7}
                        disabled={isDownloading}
                        onPress={() => {
                          if (docUrl) {
                            if (!isDownloaded) {
                              handleDownloadDocument(item.id, docUrl, docName);
                            } else {
                              const localUri = localMediaMap[item.id];
                              if (localUri && docName.toLowerCase().endsWith('.pdf')) {
                                router.push({
                                  pathname: '/(student)/pdf-viewer',
                                  params: { uri: localUri, title: docName }
                                });
                              } else {
                                downloadAndOpenSaf(docUrl, docName);
                              }
                            }
                          }
                        }}
                      >
                        {isDownloading ? (
                          <ActivityIndicator size="small" color={isSelf ? '#FFF' : '#AF2800'} style={{ marginRight: 8 }} />
                        ) : (
                          <Ionicons 
                            name={isDownloaded ? "document-text" : "download-outline"} 
                            size={24} 
                            color={isSelf ? '#FFF' : '#AF2800'} 
                            style={{ marginRight: 8 }} 
                          />
                        )}
                        <Text style={[styles.bubbleFileAttachmentText, { color: isSelf ? '#FFF' : Colors.text.primary }]} numberOfLines={1}>
                          {docName}
                        </Text>
                        {isDownloaded && !isDownloading && (
                          <Ionicons name="checkmark-circle" size={16} color="#2E7D32" style={{ marginLeft: 8 }} />
                        )}
                      </TouchableOpacity>
                    );
                  })() : (
                    item.text !== '[Attached Image]' && !item.text?.startsWith('[Image:') && (
                      <Text style={[styles.messageText, isSelf ? styles.textSelf : styles.textOther]}>
                        {item.text}
                      </Text>
                    )
                  )}

                  <Text style={[
                    styles.timeText, 
                    isSelf ? styles.timeSelf : styles.timeOther,
                    isImageAttachment && { 
                      position: 'absolute', 
                      bottom: 8, 
                      right: 8, 
                      color: '#FFF', 
                      backgroundColor: 'rgba(0,0,0,0.5)', 
                      paddingHorizontal: 6, 
                      paddingVertical: 2, 
                      borderRadius: 8 
                    }
                  ]}>
                    {formatBubbleTime(item.created_at)}{item.is_edited ? ' • Edited' : ''}
                  </Text>
                </View>
                </View>{/* end tail+bubble wrapper */}
              </View>
            </View>
          );
        }}
      />

      {/* WhatsApp-Style Avatar Preview Modal */}
      <Modal
        visible={showAvatarPreview}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAvatarPreview(false)}
      >
        <TouchableOpacity 
          style={styles.avatarModalBackdrop} 
          activeOpacity={1} 
          onPress={() => setShowAvatarPreview(false)}
        >
          <View style={styles.avatarPreviewContainer}>
            <View style={styles.avatarPreviewHeader}>
              <Text style={styles.avatarPreviewTitle} numberOfLines={1}>{coachingName}</Text>
              <TouchableOpacity onPress={() => setShowAvatarPreview(false)}>
                <Ionicons name="close-outline" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            <Image 
              source={{ uri: coachingLogoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(coachingName)}&background=0D8ABC&color=fff&rounded=true` }} 
              style={styles.avatarLargeImage}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Coaching Info & Media Tabs Modal */}
      <Modal
        visible={showCoachingInfo}
        animationType="slide"
        onRequestClose={() => setShowCoachingInfo(false)}
      >
        <SafeAreaView style={styles.infoModalContainer} edges={['top', 'bottom']}>
          {activeTab === 'info' ? (
            /* Main Info Tab */
            <ScrollView style={{ flex: 1 }}>
              <View style={styles.infoModalHeader}>
                <TouchableOpacity onPress={() => setShowCoachingInfo(false)} style={styles.backBtn}>
                  <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
                <Text style={styles.infoModalHeaderTitle}>Coaching Info</Text>
                <View style={{ width: 40 }} />
              </View>

              {/* Top Profile Card */}
              <View style={styles.infoProfileCard}>
                <Image 
                  source={{ uri: coachingLogoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(coachingName)}&background=0D8ABC&color=fff&rounded=true` }} 
                  style={styles.infoLargeAvatar}
                />
                <Text style={styles.infoCoachingName}>{coachingName}</Text>
                {orgId ? <Text style={styles.infoOrgId}>ID: {orgId}</Text> : null}
                <Text style={styles.infoMemberCount}>{studentCount} students</Text>
              </View>

              {/* Shared Media Row */}
              <TouchableOpacity 
                style={styles.sharedMediaHeaderRow} 
                activeOpacity={0.7}
                onPress={() => {
                  setActiveTab('media');
                  setMediaSubTab('media');
                }}
              >
                <Text style={styles.sharedMediaTitle}>Media, links, and docs</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.sharedMediaCount}>
                    {parsedMedia.media.length + parsedMedia.docs.length + parsedMedia.links.length}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.text.tertiary} style={{ marginLeft: 4 }} />
                </View>
              </TouchableOpacity>

              {/* Horizontal Media Preview */}
              {parsedMedia.media.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalMediaContainer}>
                  {parsedMedia.media.slice(0, 5).map((img, i) => (
                    <TouchableOpacity
                      key={i}
                      activeOpacity={0.8}
                      onPress={() => {
                        const idx = imageMessages.findIndex(m => {
                          const parsed = extractUrlAndName(m.text);
                          const imgUri = m.image_url || parsed?.url;
                          return imgUri === img;
                        });
                        if (idx !== -1) {
                          setLightboxIndex(idx);
                          setCurrentViewerIndex(idx);
                        }
                      }}
                    >
                      <Image source={{ uri: img }} style={styles.mediaPreviewThumbnail} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : (
                <View style={styles.noMediaContainer}>
                  <Text style={styles.noMediaText}>No media, links, or docs shared yet</Text>
                </View>
              )}

              {/* Backup Chat Button */}
              <View style={styles.whatsappOptionSection}>
                <TouchableOpacity 
                  style={styles.whatsappOptionRow} 
                  activeOpacity={0.7}
                  onPress={() => {
                    Alert.alert('Backup', 'Community chat backup completed successfully.');
                  }}
                >
                  <Ionicons name="cloud-upload-outline" size={22} color="#AF2800" style={{ marginRight: 16 }} />
                  <View>
                    <Text style={[styles.whatsappOptionText, { color: '#AF2800' }]}>Backup Chat</Text>
                    <Text style={styles.whatsappOptionSubtext}>Backup community chat history to cloud storage</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            /* Media, Links & Docs Tab Screen */
            <View style={{ flex: 1 }}>
              <View style={styles.infoModalHeader}>
                <TouchableOpacity onPress={() => setActiveTab('info')} style={styles.backBtn}>
                  <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
                <Text style={styles.infoModalHeaderTitle}>All media</Text>
                <View style={{ width: 40 }} />
              </View>

              {/* Sub-tab Selectors */}
              <View style={styles.subTabBar}>
                <TouchableOpacity 
                  style={[styles.subTabButton, mediaSubTab === 'media' && styles.subTabActiveButton]} 
                  onPress={() => setMediaSubTab('media')}
                >
                  <Text style={[styles.subTabText, mediaSubTab === 'media' && styles.subTabActiveText]}>Media</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.subTabButton, mediaSubTab === 'docs' && styles.subTabActiveButton]} 
                  onPress={() => setMediaSubTab('docs')}
                >
                  <Text style={[styles.subTabText, mediaSubTab === 'docs' && styles.subTabActiveText]}>Docs</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.subTabButton, mediaSubTab === 'links' && styles.subTabActiveButton]} 
                  onPress={() => setMediaSubTab('links')}
                >
                  <Text style={[styles.subTabText, mediaSubTab === 'links' && styles.subTabActiveText]}>Links</Text>
                </TouchableOpacity>
              </View>

              {/* Content Grid/List */}
              <View style={{ flex: 1, backgroundColor: '#FFF' }}>
                {mediaSubTab === 'media' && (
                  parsedMedia.media.length > 0 ? (
                    <FlatList 
                      data={parsedMedia.media}
                      numColumns={3}
                      keyExtractor={(item, index) => String(index)}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => {
                            const idx = imageMessages.findIndex(m => {
                              const parsed = extractUrlAndName(m.text);
                              const imgUri = m.image_url || parsed?.url;
                              return imgUri === item;
                            });
                            if (idx !== -1) {
                              setLightboxIndex(idx);
                              setCurrentViewerIndex(idx);
                            }
                          }}
                        >
                          <Image source={{ uri: item }} style={styles.mediaGridItem} />
                        </TouchableOpacity>
                      )}
                      contentContainerStyle={{ padding: 4 }}
                    />
                  ) : (
                    <View style={styles.emptyTabContainer}>
                      <Ionicons name="images-outline" size={48} color={Colors.text.tertiary} />
                      <Text style={styles.emptyTabText}>No media shared yet</Text>
                    </View>
                  )
                )}

                {mediaSubTab === 'docs' && (
                  parsedMedia.docs.length > 0 ? (
                    <FlatList 
                      data={parsedMedia.docs}
                      keyExtractor={(item, index) => String(index)}
                      renderItem={({ item }) => (
                        <TouchableOpacity 
                          style={styles.docItemRow}
                          activeOpacity={0.7}
                          onPress={() => {
                            if (item.url) {
                              downloadAndOpenSaf(item.url, item.name);
                            }
                          }}
                        >
                          <View style={styles.docIconWrapper}>
                            <Ionicons name="document-text" size={24} color="#FD7E5E" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.docItemName} numberOfLines={1}>{item.name}</Text>
                            <Text style={styles.docItemDate}>{item.date}</Text>
                          </View>
                        </TouchableOpacity>
                      )}
                      contentContainerStyle={{ paddingVertical: 8 }}
                    />
                  ) : (
                    <View style={styles.emptyTabContainer}>
                      <Ionicons name="document-text-outline" size={48} color={Colors.text.tertiary} />
                      <Text style={styles.emptyTabText}>No documents shared yet</Text>
                    </View>
                  )
                )}

                {mediaSubTab === 'links' && (
                  parsedMedia.links.length > 0 ? (
                    <FlatList 
                      data={parsedMedia.links}
                      keyExtractor={(item, index) => String(index)}
                      renderItem={({ item }) => (
                        <TouchableOpacity 
                          style={styles.linkItemRow}
                          activeOpacity={0.7}
                          onPress={async () => {
                            if (item.url) {
                              const canOpen = await Linking.canOpenURL(item.url);
                              if (canOpen) {
                                Linking.openURL(item.url);
                              } else {
                                Alert.alert('Error', 'Cannot open URL');
                              }
                            }
                          }}
                        >
                          <View style={styles.linkIconWrapper}>
                            <Ionicons name="link" size={20} color="#3390EC" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.linkItemTitle} numberOfLines={1}>{item.title}</Text>
                            <Text style={[styles.linkItemUrl, { color: '#007AFF', textDecorationLine: 'underline' }]} numberOfLines={1}>{item.url}</Text>
                            <Text style={styles.linkItemDate}>{item.date}</Text>
                          </View>
                        </TouchableOpacity>
                      )}
                      contentContainerStyle={{ paddingVertical: 8 }}
                    />
                  ) : (
                    <View style={styles.emptyTabContainer}>
                      <Ionicons name="link-outline" size={48} color={Colors.text.tertiary} />
                      <Text style={styles.emptyTabText}>No links shared yet</Text>
                    </View>
                  )
                )}
              </View>
            </View>
          )}
        </SafeAreaView>
      </Modal>
      {/* Image Lightbox Modal */}
      {lightboxIndex !== null && (
        <Modal
          visible={lightboxIndex !== null}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setLightboxIndex(null)}
        >
          <View style={styles.lightboxContainer}>
            {/* Top Header Bar Overlay */}
            {(() => {
              const currentMsg = imageMessages[currentViewerIndex];
              if (!currentMsg) return null;
              const isSelf = currentMsg.author_id === user?.id;
              const senderName = isSelf ? 'You' : currentMsg.author_name;
              const formattedTime = formatBubbleTime(currentMsg.created_at);
              const parsed = extractUrlAndName(currentMsg.text);
              const imgUri = currentMsg.image_url || parsed?.url;
              const displayUri = localMediaMap[currentMsg.id] || imgUri;

              return (
                <View style={styles.lightboxHeader}>
                  <View style={styles.lightboxHeaderLeft}>
                    <ScalePressable onPress={() => setLightboxIndex(null)} style={{ padding: 4 }}>
                      <Ionicons name="arrow-back" size={24} color="#FFF" />
                    </ScalePressable>
                    <View style={styles.lightboxHeaderInfo}>
                      <Text style={styles.lightboxHeaderTitle}>{senderName}</Text>
                      <Text style={styles.lightboxHeaderSubtitle}>{formattedTime}</Text>
                    </View>
                  </View>
                  <View style={styles.lightboxHeaderRight}>
                    <ScalePressable 
                      style={styles.lightboxHeaderBtn}
                      onPress={() => displayUri && saveImageToGallery(displayUri)}
                    >
                      <Ionicons name="download-outline" size={24} color="#FFF" />
                    </ScalePressable>
                    <ScalePressable 
                      style={styles.lightboxHeaderBtn}
                      onPress={() => displayUri && handleShareImage(displayUri)}
                    >
                      <Ionicons name="share-social-outline" size={24} color="#FFF" />
                    </ScalePressable>
                  </View>
                </View>
              );
            })()}

            {/* Swipeable FlatList for Images */}
            <FlatList
              data={imageMessages}
              horizontal
              pagingEnabled
              scrollEnabled={lightboxScrollEnabled}
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={lightboxIndex}
              getItemLayout={(data, index) => ({
                length: screenWidth,
                offset: screenWidth * index,
                index,
              })}
              keyExtractor={(item) => String(item.id)}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                setCurrentViewerIndex(idx);
              }}
              renderItem={({ item }) => {
                const parsed = extractUrlAndName(item.text);
                const imgUri = item.image_url || parsed?.url;
                const displayUri = localMediaMap[item.id] || imgUri;
                return (
                  <View style={{ width: screenWidth, height: '100%' }}>
                    {displayUri ? (
                      <ZoomableImage 
                        uri={displayUri} 
                        onZoomStateChange={(isZoomed) => setLightboxScrollEnabled(!isZoomed)}
                      />
                    ) : null}
                  </View>
                );
              }}
            />
          </View>
        </Modal>
      )}
    </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg.primary },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 12, 
    backgroundColor: '#fff', 
    borderWidth: 1, 
    borderColor: Colors.card.border,
    borderRadius: 16,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 8,
    elevation: 4,
    shadowColor: '#281713',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 10
  },
  headerAvatar: { width: 40, height: 40, borderRadius: 20 },
  headerInfo: { marginLeft: 12, flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.text.primary },
  headerSubtitle: { fontSize: 12, color: Colors.text.secondary, fontWeight: '500' },
  listContent: { padding: 12, paddingBottom: 24 },
  dateBadgeContainer: { alignItems: 'center', marginVertical: 12 },
  dateBadge: { backgroundColor: Colors.accent.primary, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  dateBadgeText: { fontSize: 11, color: '#FFFFFF', fontWeight: '600' },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 4, maxWidth: '85%' },
  rowSelf: { alignSelf: 'flex-end' },
  rowOther: { alignSelf: 'flex-start' },
  bubbleAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: 8 },
  bubble: { 
    borderRadius: 20, 
    paddingHorizontal: 16, 
    paddingVertical: 10, 
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    position: 'relative'
  },
  bubbleSelf: { 
    backgroundColor: '#AF2800', 
    borderBottomRightRadius: 4,
    borderColor: '#911D00',
    borderWidth: 0.5
  },
  bubbleOther: { 
    backgroundColor: '#FFFFFF', 
    borderBottomLeftRadius: 4,
    borderColor: Colors.card.border,
    borderWidth: 1
  },
  authorText: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
  authorTeacher: { color: '#AF2800' },
  authorStudent: { color: '#7E57C2' },
  messageText: { fontSize: 14, color: Colors.text.primary, lineHeight: 18, paddingRight: 32 },
  bubbleImageAttachment: {
    width: 260,
    height: 190,
    borderRadius: 16,
    marginVertical: 0,
    resizeMode: 'cover',
  },
  bubbleFileAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 8,
    padding: 12,
    marginVertical: 4,
    width: 220,
  },
  bubbleFileAttachmentText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    marginLeft: 4,
  },
  downloadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  downloadCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  textSelf: { color: '#FFFFFF' },
  textOther: { color: Colors.text.primary },
  timeText: { 
    fontSize: 9, 
    color: Colors.text.tertiary, 
    alignSelf: 'flex-end', 
    marginTop: 4, 
    position: 'absolute', 
    bottom: 4, 
    right: 8 
  },
  timeSelf: { color: '#FFB4A2' },
  timeOther: { color: Colors.text.tertiary },
  inputBar: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    backgroundColor: Colors.bg.primary,
    borderTopWidth: 1,
    borderTopColor: Colors.card.border
  },
  attachIconBtn: {
    padding: 8,
    marginRight: 4,
  },
  textInput: { 
    flex: 1, 
    backgroundColor: '#FFFFFF', 
    borderRadius: 24, 
    borderWidth: 1,
    borderColor: Colors.card.border,
    paddingHorizontal: 16, 
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14, 
    color: Colors.text.primary,
    maxHeight: 100
  },
  sendBtn: { 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    backgroundColor: '#FD7E5E', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginLeft: 8 
  },
  sendBtnDisabled: { 
    backgroundColor: Colors.card.border,
    opacity: 0.6
  },
  searchIconBtn: {
    padding: 8,
    marginLeft: 4,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: Colors.card.border,
    borderRadius: 12,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.text.primary,
    padding: 0,
  },
  avatarModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPreviewContainer: {
    width: 320,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 5,
  },
  avatarPreviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  avatarPreviewTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
    flex: 1,
    marginRight: 12,
  },
  avatarLargeImage: {
    width: 320,
    height: 320,
    resizeMode: 'cover',
  },
  infoModalContainer: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  infoModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
    backgroundColor: '#FFF',
  },
  infoModalHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text.primary,
  },
  backBtn: {
    padding: 8,
  },
  infoProfileCard: {
    backgroundColor: '#FFF',
    paddingVertical: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
    marginBottom: 12,
  },
  infoLargeAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 12,
  },
  infoCoachingName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  infoOrgId: {
    fontSize: 13,
    color: Colors.text.tertiary,
    marginBottom: 4,
    fontWeight: '500',
  },
  infoMemberCount: {
    fontSize: 14,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  sharedMediaHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.card.border,
  },
  sharedMediaTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  sharedMediaCount: {
    fontSize: 14,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  horizontalMediaContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
    marginBottom: 12,
  },
  mediaPreviewThumbnail: {
    width: 70,
    height: 70,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  whatsappOptionSection: {
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.card.border,
    marginBottom: 12,
    paddingVertical: 4,
  },
  whatsappOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  whatsappOptionText: {
    fontSize: 15,
    color: Colors.text.primary,
    fontWeight: '500',
  },
  whatsappOptionSubtext: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  subTabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
  },
  subTabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  subTabActiveButton: {
    borderBottomColor: '#AF2800',
  },
  subTabText: {
    fontSize: 15,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  subTabActiveText: {
    color: '#AF2800',
    fontWeight: 'bold',
  },
  mediaGridItem: {
    width: (Dimensions.get('window').width - 16) / 3,
    height: (Dimensions.get('window').width - 16) / 3,
    margin: 2,
    borderRadius: 4,
  },
  docItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
    backgroundColor: '#FFF',
  },
  docIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#FFF1ED',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  docItemName: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text.primary,
  },
  docItemDate: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 4,
  },
  linkItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
    backgroundColor: '#FFF',
  },
  linkIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#E8F4FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  linkItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  linkItemUrl: {
    fontSize: 13,
    color: '#3390EC',
    marginTop: 2,
  },
  linkItemDate: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 4,
  },
  noMediaContainer: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
    marginBottom: 12,
    alignItems: 'center',
  },
  noMediaText: {
    fontSize: 14,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  emptyTabContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTabText: {
    fontSize: 15,
    color: Colors.text.secondary,
    fontWeight: '500',
    marginTop: 12,
  },
  lightboxContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === 'ios' ? 50 : 25,
    paddingBottom: 15,
    height: Platform.OS === 'ios' ? 105 : 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 100,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  lightboxHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  lightboxHeaderInfo: {
    marginLeft: 16,
    flex: 1,
  },
  lightboxHeaderTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  lightboxHeaderSubtitle: {
    color: '#CCC',
    fontSize: 12,
    marginTop: 2,
  },
  lightboxHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lightboxHeaderBtn: {
    padding: 8,
    marginLeft: 12,
  },
  lightboxImage: {
    width: screenWidth,
    height: '100%',
  }
});

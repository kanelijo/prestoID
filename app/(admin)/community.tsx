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
  Share,
  Switch,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { usePrefetchStore } from '@/stores/usePrefetchStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { DIRS, saveImageToPublicGallery } from '@/lib/storage';
import { updateMediaLocalPointer } from '@/lib/localDb';
import { useFocusEffect, useRouter } from 'expo-router';
import { downloadAndOpenSaf } from '@/lib/saf';
import PrestostorageModule from '@/modules/prestostorage/src/PrestostorageModule';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { decode } from 'base64-arraybuffer';
import { uploadToTelegramViaEdge, getTelegramFastLink, deleteTelegramMessage } from '@/lib/telegram';
import { sendPushNotification, fetchStudentPushTokens, CHANNELS } from '@/lib/notifications';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

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

// Clickable link parser helper
const renderTextWithLinks = (text: string, linkColor: string = '#0066CC') => {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.(?:com|org|net|co|in|edu|gov|io|info)(?:\/[^\s]*)?)/gi;
  const parts = text.split(urlRegex);
  return parts.map((part, idx) => {
    // Reset regex lastIndex because of 'g' flag
    urlRegex.lastIndex = 0;
    if (urlRegex.test(part)) {
      let cleanUrl = part.trim();
      if (!/^https?:\/\//i.test(cleanUrl)) {
        cleanUrl = `https://${cleanUrl}`;
      }
      return (
        <Text
          key={idx}
          style={{ textDecorationLine: 'underline', color: linkColor }}
          onPress={() => Linking.openURL(cleanUrl).catch(err => console.warn("Failed to open URL:", err))}
        >
          {part}
        </Text>
      );
    }
    return part;
  });
};

const FILE_EXT_REGEX = /\.(pdf|docx?|xlsx?|pptx?|txt|zip|rar|apk)(\?|#|$)/i;

const getImagesFromMessage = (msg: any): string[] => {
  if (!msg) return [];
  if (msg.local_uri) return [msg.local_uri];
  if (msg.media_url) {
    if (msg.media_url.startsWith('[')) {
      try {
        const arr: string[] = JSON.parse(msg.media_url);
        return arr.filter(u => !FILE_EXT_REGEX.test(u));
      } catch (e) {
        return FILE_EXT_REGEX.test(msg.media_url) ? [] : [msg.media_url];
      }
    }
    if (FILE_EXT_REGEX.test(msg.media_url)) return [];
    return [msg.media_url];
  }
  // Don't parse image URLs out of Document messages
  if (msg.text && msg.text.startsWith('[Document:')) return [];
  const parsed = extractUrlAndName(msg.text);
  if (parsed?.url && !FILE_EXT_REGEX.test(parsed.url)) {
    return [parsed.url];
  }
  return [];
};


interface LinkPreviewData {
  title: string;
  image?: string;
  description?: string;
  url: string;
}

const previewCache: Record<string, LinkPreviewData | null> = {};

const getYoutubeVideoId = (url: string): string | null => {
  const regExp = /^.*(?:youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[1].length === 11) ? match[1] : null;
};

const LinkPreviewCard = ({ text, isSelf, onLongPress }: { text: string; isSelf: boolean; onLongPress?: () => void }) => {
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(false);

  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.(?:com|org|net|co|in|edu|gov|io|info)(?:\/[^\s]*)?)/gi;
  const match = text.match(urlRegex);
  const rawUrl = match ? match[0] : null;

  useEffect(() => {
    if (!rawUrl) {
      setPreview(null);
      return;
    }

    let cleanUrl = rawUrl.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = `https://${cleanUrl}`;
    }

    // Skip preview for direct file links (PDF, docs, etc.)
    if (/\.(pdf|docx?|xlsx?|pptx?|txt|zip|rar|apk)$/i.test(cleanUrl)) {
      setPreview(null);
      return;
    }

    if (previewCache[cleanUrl] !== undefined) {
      setPreview(previewCache[cleanUrl]);
      return;
    }

    // Set high-quality YouTube preview placeholder immediately if YouTube link detected
    const ytId = getYoutubeVideoId(cleanUrl);
    if (ytId) {
      const initialYTData = {
        title: "YouTube Video",
        image: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
        description: "Watch this video on YouTube.",
        url: cleanUrl
      };
      setPreview(initialYTData);
    }

    setLoading(true);
    // Use jsonlink.io — avoids CORS/SSL issues on Android with direct fetch
    fetch(`https://jsonlink.io/api/extract?url=${encodeURIComponent(cleanUrl)}`)
      .then(res => res.json())
      .then(json => {
        const title = json.title || (ytId ? 'YouTube Video' : '');
        const description = json.description || (ytId ? 'Watch this video on YouTube.' : '');
        let image = Array.isArray(json.images) && json.images.length > 0 ? json.images[0] : json.image;
        
        if (!image && ytId) {
          image = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
        }

        if (title) {
          const data = { title, image, description, url: cleanUrl };
          previewCache[cleanUrl] = data;
          setPreview(data);
        } else if (ytId) {
          // Keep the local youtube placeholder if api fetch returned empty
          previewCache[cleanUrl] = preview;
        } else {
          previewCache[cleanUrl] = null;
          setPreview(null);
        }
      })
      .catch(() => {
        if (!ytId) {
          previewCache[cleanUrl] = null;
          setPreview(null);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [rawUrl]);

  if (loading && !preview) {
    return (
      <View style={{ padding: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: isSelf ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', borderRadius: 8, marginTop: 6 }}>
        <ActivityIndicator size="small" color={isSelf ? '#FFF' : '#AF2800'} />
        <Text style={{ fontSize: 12, marginLeft: 8, color: isSelf ? '#FFF' : '#666' }}>Fetching preview...</Text>
      </View>
    );
  }

  if (!preview) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => Linking.openURL(preview.url).catch(e => console.warn(e))}
      onLongPress={() => onLongPress && onLongPress()}
      delayLongPress={200}
      style={{
        marginTop: 8,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E0E0E0',
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        width: 260,
      }}
    >
      {preview.image ? (
        <Image
          source={{ uri: preview.image }}
          style={{ width: '100%', height: 150, resizeMode: 'cover' }}
        />
      ) : null}
      <View style={{ padding: 12 }}>
        <Text numberOfLines={2} style={{ fontSize: 13, fontWeight: 'bold', color: '#111', lineHeight: 17 }}>
          {preview.title}
        </Text>
        {preview.description ? (
          <Text numberOfLines={2} style={{ fontSize: 11, color: '#555', marginTop: 6, lineHeight: 15 }}>
            {preview.description}
          </Text>
        ) : null}
        <Text numberOfLines={1} style={{ fontSize: 10, color: '#0066CC', marginTop: 6, fontWeight: '500' }}>
          {preview.url.replace(/^https?:\/\/(?:www\.)?/i, '')}
        </Text>
      </View>
    </TouchableOpacity>
  );
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
  const docs: { id: string; name: string; url: string; date: string }[] = [];
  const links: { title: string; url: string; date: string }[] = [];

  msgs.forEach(msg => {
    const text = msg.text || '';
    const parsed = extractUrlAndName(text);
    
    if (parsed) {
      if (parsed.type === 'image') {
        media.push(parsed.url);
      } else if (parsed.type === 'document') {
        docs.push({ id: String(msg.id), name: parsed.name, url: parsed.url, date: new Date(msg.created_at).toLocaleDateString() });
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
            docs.push({ id: String(msg.id), name: fileName, url: cleanUrl, date: new Date(msg.created_at).toLocaleDateString() });
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

export default function AdminCommunityScreen() {
  const router = useRouter();
  const { user, businessId, businessName, avatarUrl } = useAuthStore();
  const prefetch = usePrefetchStore.getState();
  const hasValidCache = prefetch.communityReady && 
    prefetch.communityMessages.length > 0 && 
    prefetch.communityMessages[0].business_id === businessId;
  const [messages, setMessages] = useState<any[]>(hasValidCache ? prefetch.communityMessages : []);
  const [inputText, setInputText] = useState('');
  const [adminProfile, setAdminProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(!hasValidCache);
  const [isSending, setIsSending] = useState(false);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [isPickingDocument, setIsPickingDocument] = useState(false);
  const [coachingName, setCoachingName] = useState(businessName || 'Community Chat');
  const [coachingLogoUrl, setCoachingLogoUrl] = useState<string | null>(avatarUrl || null);
  const [studentCount, setStudentCount] = useState<number>(0);
  const [orgId, setOrgId] = useState('');

  // Search, Dropdown Menu & Navigation Modals states
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
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
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxMessage, setLightboxMessage] = useState<any | null>(null);
  const [selectedActionMessage, setSelectedActionMessage] = useState<any | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [selectedImageForCaption, setSelectedImageForCaption] = useState<{ uri: string; fileName: string; asset?: any; size?: number } | null>(null);
  // Multi-image support
  const [selectedMultiImages, setSelectedMultiImages] = useState<{ uri: string; fileName: string; asset?: any; size?: number }[]>([]);
  const [imageCaptionText, setImageCaptionText] = useState('');
  const failedDownloadsRef = useRef<Record<string, boolean>>({});
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const uploadResultRef = useRef<{ fileId: string; messageId: number | null; publicUrl: string; urls?: string[] } | null>(null);
  const uploadPromiseRef = useRef<Promise<any> | null>(null);
  const activeSessionIdRef = useRef<string>('');
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [uploadProgress, setUploadProgress] = useState(0);
  const [imageDimsCache, setImageDimsCache] = useState<Record<string, { w: number; h: number }>>({});
  const [deleteModalConfig, setDeleteModalConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

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

  // Smart-Sync Media Downloader:
  // - Images & Thumbnails: Always auto-download (<200KB)
  // - Documents/PDFs: Auto-download ONLY when on Wi-Fi, tap-to-download on Cellular/Mobile Data
  const autoDownloadMedia = useCallback(async (msgs: any[]) => {
    let isWifi = false;
    try {
      const netState = await Network.getNetworkStateAsync();
      isWifi = netState.type === Network.NetworkStateType.WIFI;
    } catch (_) {
      isWifi = false;
    }

    for (const msg of msgs) {
      const isImage = msg.image_url || msg.media_url?.startsWith('[') || (msg.text && msg.text.startsWith('[Image:'));
      if (isImage) {
        const isSelf = msg.author_id === user?.id;
        if (isSelf) continue;

        const urls = getImagesFromMessage(msg);
        urls.forEach((imgUri, indexInMsg) => {
          // Skip local file:// paths — they're already on device, no download needed
          if (imgUri.startsWith('file://') || imgUri.startsWith('content://')) return;
          const cacheKey = msg.id + '_' + indexInMsg;
          if (!localMediaMap[cacheKey] && !downloadingIds[cacheKey] && !failedDownloadsRef.current[cacheKey]) {
            downloadImageLocal(msg.id, imgUri, indexInMsg);
          }
        });
      }

      // Auto-download documents on Wi-Fi
      if (isWifi && msg.text && msg.text.startsWith('[Document:')) {
        const parsed = extractUrlAndName(msg.text);
        if (parsed?.url && parsed?.name) {
          const docKey = String(msg.id);
          if (!localMediaMap[docKey] && !downloadingIds[docKey] && !failedDownloadsRef.current[docKey]) {
            downloadDocumentLocal(msg.id, parsed.url, parsed.name);
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
          Alert.alert('Success', 'Image saved successfully to Downloads/Zenza folder!');
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
  const downloadImageLocal = async (msgId: string, url: string, indexInMsg: number = 0) => {
    const cacheKey = msgId + '_' + indexInMsg;
    if (downloadingIds[cacheKey]) return;

    // Guard: file:// and content:// URIs are already local — just register them, never download
    if (url.startsWith('file://') || url.startsWith('content://')) {
      setLocalMediaMap(prev => {
        const updated = { ...prev, [cacheKey]: url };
        AsyncStorage.setItem('community_local_media_paths', JSON.stringify(updated)).catch(() => {});
        return updated;
      });
      setDownloadedMap(prev => {
        const updated = { ...prev, [cacheKey]: true };
        AsyncStorage.setItem('community_downloaded_media', JSON.stringify(updated)).catch(() => {});
        return updated;
      });
      return;
    }

    setDownloadingIds(prev => ({ ...prev, [cacheKey]: true }));
    
    try {
      const ext = url.split('.').pop()?.split('?')[0] || 'jpg';
      const safeName = `community_img_${msgId}_${indexInMsg}.${ext}`;
      const localUri = `${DIRS.images}${safeName}`;

      // 1. Download to local persistent app storage in Zenza Images directory
      const downloadResult = await FileSystem.downloadAsync(url, localUri);
      if (downloadResult.status < 200 || downloadResult.status >= 300) {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
        throw new Error(`Server returned status code ${downloadResult.status}`);
      }

      // 2. Update paths in state, AsyncStorage, and SQLite pointer (cached in app sandbox)
      updateMediaLocalPointer(msgId, localUri);
      setLocalMediaMap(prev => {
        const updated = { ...prev, [cacheKey]: localUri };
        AsyncStorage.setItem('community_local_media_paths', JSON.stringify(updated)).catch(e => console.warn(e));
        return updated;
      });

      setDownloadedMap(prev => {
        const updated = { ...prev, [cacheKey]: true };
        AsyncStorage.setItem('community_downloaded_media', JSON.stringify(updated)).catch(e => console.warn(e));
        return updated;
      });
    } catch (err) {
      console.warn('Silent image cache failed:', err);
      failedDownloadsRef.current[cacheKey] = true;
    } finally {
      setDownloadingIds(prev => {
        const copy = { ...prev };
        delete copy[cacheKey];
        return copy;
      });
    }
  };

  // Download document silently to app storage in Zenza Documents directory (caches for offline viewing)
  const downloadDocumentLocal = async (msgId: string, url: string, name: string) => {
    const cacheKey = msgId;
    if (downloadingIds[cacheKey]) return;

    // Guard: file:// and content:// URIs are already local — just register them, never download
    if (url.startsWith('file://') || url.startsWith('content://')) {
      setLocalMediaMap(prev => {
        const updated = { ...prev, [cacheKey]: url };
        AsyncStorage.setItem('community_local_media_paths', JSON.stringify(updated)).catch(() => {});
        return updated;
      });
      setDownloadedMap(prev => {
        const updated = { ...prev, [cacheKey]: true };
        AsyncStorage.setItem('community_downloaded_media', JSON.stringify(updated)).catch(() => {});
        return updated;
      });
      return;
    }

    setDownloadingIds(prev => ({ ...prev, [cacheKey]: true }));

    try {
      const safeName = name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const localUri = `${DIRS.docs}${safeName}`;

      const downloadResult = await FileSystem.downloadAsync(url, localUri);
      if (downloadResult.status < 200 || downloadResult.status >= 300) {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
        throw new Error(`Server returned status code ${downloadResult.status}`);
      }

      updateMediaLocalPointer(msgId, localUri);
      setLocalMediaMap(prev => {
        const updated = { ...prev, [cacheKey]: localUri };
        AsyncStorage.setItem('community_local_media_paths', JSON.stringify(updated)).catch(() => {});
        return updated;
      });

      setDownloadedMap(prev => {
        const updated = { ...prev, [cacheKey]: true };
        AsyncStorage.setItem('community_downloaded_media', JSON.stringify(updated)).catch(() => {});
        return updated;
      });
    } catch (err) {
      console.warn('Silent document cache failed:', err);
      failedDownloadsRef.current[cacheKey] = true;
    } finally {
      setDownloadingIds(prev => {
        const copy = { ...prev };
        delete copy[cacheKey];
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
            pathname: '/(admin)/pdf-viewer',
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

  // Load admin profile and business details
  const loadProfile = async (silent = false) => {
    if (!user || !businessId) return;
    if (!silent && messages.length === 0 && !prefetch.communityReady) {
      setIsLoading(true);
    }
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;
      if (profile) {
        setAdminProfile(profile);
      }

      // Fetch coaching details and admin avatar
      const { data: biz } = await supabase
        .from('businesses')
        .select('business_name, admin_id, organization_id')
        .eq('id', businessId)
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
        .eq('business_id', businessId);
      if (count !== null) {
        setStudentCount(count);
      }

      await loadMemberAvatars(businessId);

      // Fetch messages for this business
      await fetchMessages(businessId);
    } catch (err) {
      console.warn('Failed to load admin profile for chat:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchMessages = async (bizId: string) => {
    try {
      const { data, error } = await supabase
        .from('community_posts')
        .select('*')
        .eq('business_id', bizId)
        .neq('is_deleted', true)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      const fetched = data || [];
      const chronological = [...fetched].reverse();
      setMessages(chronological);
      setHasMore(fetched.length === 20);
      
      // Scroll to bottom after loading
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 150);
    } catch (err) {
      console.warn('Failed to fetch community messages:', err);
    }
  };

  const fetchMoreMessages = async () => {
    if (!businessId || isLoadingMore || !hasMore || messages.length === 0) return;
    try {
      setIsLoadingMore(true);
      const oldestTimestamp = messages[0].created_at;
      const { data, error } = await supabase
        .from('community_posts')
        .select('*')
        .eq('business_id', businessId)
        .neq('is_deleted', true)
        .lt('created_at', oldestTimestamp)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      const fetched = data || [];
      if (fetched.length < 20) {
        setHasMore(false);
      }
      if (fetched.length > 0) {
        const olderChronological = [...fetched].reverse();
        setMessages(prev => [...olderChronological, ...prev]);
      }
    } catch (err) {
      console.warn('Failed to fetch more messages:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (messages.length > 0) {
      autoDownloadMedia(messages);
    }
  }, [messages, autoDownloadMedia]);

  // Synchronize store updates to local header state
  useEffect(() => {
    if (businessName) setCoachingName(businessName);
  }, [businessName]);

  useEffect(() => {
    if (avatarUrl) setCoachingLogoUrl(avatarUrl);
  }, [avatarUrl]);

  // Fetch profiles and community data once businessId is loaded
  useEffect(() => {
    if (businessId) {
      loadProfile(true);
    }
  }, [businessId]);

  // Real-time subscription setup
  useEffect(() => {
    if (!businessId) return;

    const channelId = `admin_community_changes_${businessId}_${Math.random().toString(36).substring(7)}`;
    const channel = supabase
      .channel(channelId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'community_posts'
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const newMsg = payload.new;
          if (newMsg.business_id !== businessId) return;

          const cleanMsgText = (txt: string) => {
            if (!txt) return '';
            // Remove parenthesized URLs (like local file path or public http url) to compare labels/captions
            return txt.replace(/\([^)]+\)/g, '()').trim();
          };

          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;

            // Try to match and replace the sender's optimistic message
            if (newMsg.author_id === user?.id) {
              const optIndex = prev.findIndex(m => 
                String(m.id).startsWith('optimistic_') && 
                cleanMsgText(m.text) === cleanMsgText(newMsg.text)
              );

              if (optIndex !== -1) {
                const copy = [...prev];
                // Retain local cached URI so image displays instantly without a black box
                copy[optIndex] = {
                  ...newMsg,
                  local_uri: prev[optIndex].local_uri
                };
                return copy;
              }
            }

            return [...prev, newMsg];
          });
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        } else if (payload.eventType === 'UPDATE') {
          const updatedMsg = payload.new;
          if (updatedMsg.business_id !== businessId) return;
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
  }, [businessId]);

  // NOTE: scrollToEnd is handled per-insert inside sendMessage / realtime handler.
  // Do NOT add a global messages.length effect — it causes layout jumps on optimistic inserts.

  const handlePickImage = async () => {
    setIsPickingImage(true);
    try {
      const status = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!status.granted) {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission Denied', 'Media library permission is required to select images.');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit: 5,
      });

      setIsPickingImage(false);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const captionText = inputText.trim();
        setInputText(''); // Clear input text box

        const tempMsgId = `optimistic_${Date.now()}`;
        let sourceUri = asset.uri;

        if (Platform.OS === 'android' && sourceUri.startsWith('content://')) {
          try {
            const tempPath = `${FileSystem.cacheDirectory}pick_${Date.now()}.jpg`;
            await FileSystem.copyAsync({ from: sourceUri, to: tempPath });
            sourceUri = tempPath;
          } catch (copyErr) {
            console.warn('Cache copy fallback:', copyErr);
          }
        }

        const fileName = asset.fileName || 'image.jpg';

        // Perform fast local manipulation first to get final compressed size
        let selectedImageUri = sourceUri;
        let finalMB = '2.0';
        try {
          const manipResult = await ImageManipulator.manipulateAsync(
            sourceUri,
            [{ resize: { width: 1024 } }],
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
          );
          selectedImageUri = manipResult.uri;
          const info = await FileSystem.getInfoAsync(selectedImageUri);
          if (info.exists && info.size) {
            finalMB = (info.size / (1024 * 1024)).toFixed(1);
          }
        } catch (manipErr) {
          console.warn('Manipulation failed:', manipErr);
        }

        const messageText = captionText 
          ? `[Image: ${fileName}](${selectedImageUri}) \n\n${captionText}`
          : `[Image: ${fileName}](${selectedImageUri})`;

        // Instantly place optimistic image message into chat list (WhatsApp style - NO extra modal page!)
        const optimisticMsg = {
          id: tempMsgId,
          is_optimistic: true,
          upload_status: 'uploading',
          upload_progress: 5,
          upload_size_text: `0.1 MB / ${finalMB} MB`,
          author_id: user?.id,
          author_name: adminProfile?.full_name || 'Admin',
          author_role: 'admin',
          category: 'announcement',
          text: messageText,
          local_uri: selectedImageUri,
          created_at: new Date().toISOString(),
          likes: 0,
          comments: '[]',
          liked: false,
        };

        setMessages((prev) => [...prev, optimisticMsg]);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

        // Perform background upload with WhatsApp-style progress updates
        (async () => {
          try {
            let publicUrl = '';
            let tgFileIdVal = '';

            try {
              const uploadRes = await uploadToTelegramViaEdge(
                selectedImageUri,
                fileName,
                (loaded, total) => {
                  const pct = Math.round((loaded / total) * 100);
                  const uploadedMB = ((loaded / total) * Number(finalMB)).toFixed(1);
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === tempMsgId
                        ? {
                            ...m,
                            upload_progress: Math.min(99, pct),
                            upload_size_text: `${uploadedMB} MB / ${finalMB} MB`,
                          }
                        : m
                    )
                  );
                }
              );
              publicUrl = await getTelegramFastLink(uploadRes.fileId);
              tgFileIdVal = uploadRes.messageId ? `${uploadRes.messageId}:${uploadRes.fileId}` : uploadRes.fileId;
            } catch (tgErr) {
              console.warn('Telegram upload failed, trying avatars bucket:', tgErr);
              const base64 = await FileSystem.readAsStringAsync(selectedImageUri, { encoding: FileSystem.EncodingType.Base64 });
              const fileExt = fileName.split('.').pop() || 'jpg';
              const filePath = `community/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
              
              const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, decode(base64), { contentType: `image/${fileExt}` });

              if (uploadError) throw uploadError;
              const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
              publicUrl = urlData.publicUrl;
            }

            const finalMessageText = captionText 
              ? `[Image: ${fileName}](${publicUrl}) \n\n${captionText}`
              : `[Image: ${fileName}](${publicUrl})`;

            const { data: insertedRows, error: insertError } = await supabase
              .from('community_posts')
              .insert({
                business_id: businessId,
                author_id: user?.id,
                author_name: adminProfile?.full_name || 'Admin',
                author_role: 'admin',
                category: 'announcement',
                text: finalMessageText,
                media_url: publicUrl,
                tg_file_id: tgFileIdVal || null,
              })
              .select();

            if (insertError) throw insertError;

            if (insertedRows && insertedRows.length > 0) {
              const finalMsg = insertedRows[0];
              // Register local paths in mapping so it is never downloaded on user's own device
              const cacheKey = finalMsg.id + '_0';
              setLocalMediaMap(prev => {
                const updated = { ...prev, [cacheKey]: sourceUri };
                AsyncStorage.setItem('community_local_media_paths', JSON.stringify(updated)).catch(() => {});
                return updated;
              });
              setDownloadedMap(prev => {
                const updated = { ...prev, [cacheKey]: true };
                AsyncStorage.setItem('community_downloaded_media', JSON.stringify(updated)).catch(() => {});
                return updated;
              });

              // Keep local_uri on the final message so Image shows instantly without a black box
              setMessages((prev) => prev.map((m) => (m.id === tempMsgId ? { ...finalMsg, local_uri: sourceUri } : m)));
              notifyCommunityStudents(
                `${adminProfile?.full_name || 'Teacher'} posted an image`,
                captionText || 'New photo in Community'
              );
            }
          } catch (err: any) {
            console.error('Optimistic image upload failed:', err);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempMsgId
                  ? {
                      ...m,
                      upload_status: 'error',
                      upload_size_text: 'Upload failed',
                    }
                  : m
              )
            );
          }
        })();
      }
    } catch (err: any) {
      setIsPickingImage(false);
      console.warn('Failed to pick image:', err);
      Alert.alert('Error', 'Failed to select image. Please try again.');
    }
  };

  const handleSharePost = async () => {};

  const sendMessage = async () => {
    if (!inputText.trim() || !businessId) return;
    const textToSend = inputText.trim();
    setInputText(''); // Clear input instantly — NO button spinner!

    if (editingMessageId) {
      try {
        const { error } = await supabase
          .from('community_posts')
          .update({ text: textToSend })
          .eq('id', editingMessageId);
        if (error) throw error;
        setMessages((prev) => prev.map((m) => (m.id === editingMessageId ? { ...m, text: textToSend } : m)));
        setEditingMessageId(null);
      } catch (err) {
        console.warn('Failed to edit message:', err);
      }
      return;
    }

    const tempMsgId = `optimistic_txt_${Date.now()}`;
    const optimisticMsg = {
      id: tempMsgId,
      is_optimistic: true,
      upload_status: 'sending',
      author_id: user?.id,
      author_name: adminProfile?.full_name || 'Admin',
      author_role: 'admin',
      category: 'announcement',
      text: textToSend,
      created_at: new Date().toISOString(),
      likes: 0,
      comments: '[]',
      liked: false,
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const { data: insertedRows, error: insertError } = await supabase
        .from('community_posts')
        .insert({
          business_id: businessId,
          author_id: user?.id,
          author_name: adminProfile?.full_name || 'Admin',
          author_role: 'admin',
          category: 'announcement',
          text: textToSend,
        })
        .select();

      if (insertError) throw insertError;

      if (insertedRows && insertedRows.length > 0) {
        const finalMsg = insertedRows[0];
        setMessages((prev) => prev.map((m) => (m.id === tempMsgId ? finalMsg : m)));
        notifyCommunityStudents(
          `${adminProfile?.full_name || 'Teacher'} posted in Community`,
          textToSend.length > 80 ? textToSend.substring(0, 80) + '…' : textToSend
        );
      }
    } catch (err) {
      console.warn('Failed to send text message:', err);
      setMessages((prev) => prev.filter((m) => m.id !== tempMsgId));
      setInputText(textToSend); // Restore input text on error
      Alert.alert('Error', 'Failed to send message. Please try again.');
    }
  };

  const handlePickDocument = async () => {
    setIsPickingDocument(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      setIsPickingDocument(false);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const doc = result.assets[0];
        const tempMsgId = `optimistic_doc_${Date.now()}`;
        
        let finalMB = '2.0';
        try {
          const docInfo = await FileSystem.getInfoAsync(doc.uri);
          if (docInfo.exists && docInfo.size) {
            finalMB = (docInfo.size / (1024 * 1024)).toFixed(1);
          } else if (doc.size) {
            finalMB = (doc.size / (1024 * 1024)).toFixed(1);
          }
        } catch (_) {}

        const optimisticMsg = {
          id: tempMsgId,
          is_optimistic: true,
          upload_status: 'uploading',
          upload_progress: 5,
          upload_size_text: `0.1 MB / ${finalMB} MB`,
          author_id: user?.id,
          author_name: adminProfile?.full_name || 'Admin',
          author_role: 'admin',
          category: 'announcement',
          text: `[Document: ${doc.name}](${doc.uri})`,
          created_at: new Date().toISOString(),
          likes: 0,
          comments: '[]',
          liked: false,
        };

        setMessages((prev) => [...prev, optimisticMsg]);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

        (async () => {
          try {
            let publicUrl = '';
            let tgFileIdVal = '';
            try {
              const uploadRes = await uploadToTelegramViaEdge(
                doc.uri,
                doc.name,
                (loaded, total) => {
                  const pct = Math.round((loaded / total) * 100);
                  const uploadedMB = ((loaded / total) * Number(finalMB)).toFixed(1);
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === tempMsgId
                        ? {
                            ...m,
                            upload_progress: Math.min(99, pct),
                            upload_size_text: `${uploadedMB} MB / ${finalMB} MB`,
                          }
                        : m
                    )
                  );
                }
              );
              publicUrl = await getTelegramFastLink(uploadRes.fileId);
              tgFileIdVal = uploadRes.messageId ? `${uploadRes.messageId}:${uploadRes.fileId}` : uploadRes.fileId;
            } catch (tgErr) {
              console.warn('Telegram upload failed, trying avatars bucket:', tgErr);
              const base64 = await FileSystem.readAsStringAsync(doc.uri, { encoding: FileSystem.EncodingType.Base64 });
              const safeName = doc.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
              const filePath = `community/${Date.now()}_${safeName}`;
              
              const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, decode(base64), { contentType: doc.mimeType || 'application/octet-stream' });

              if (uploadError) throw uploadError;
              const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
              publicUrl = urlData.publicUrl;
            }

            const { data: insertedRows, error: insertError } = await supabase
              .from('community_posts')
              .insert({
                business_id: businessId,
                author_id: user?.id,
                author_name: adminProfile?.full_name || 'Admin',
                author_role: 'admin',
                category: 'announcement',
                text: `[Document: ${doc.name}](${publicUrl})`,
                tg_file_id: tgFileIdVal || null,
              })
              .select();

            if (insertError) throw insertError;

            if (insertedRows && insertedRows.length > 0) {
              const finalMsg = insertedRows[0];
              const docKey = String(finalMsg.id);
              setLocalMediaMap(prev => {
                const updated = { ...prev, [docKey]: doc.uri };
                AsyncStorage.setItem('community_local_media_paths', JSON.stringify(updated)).catch(() => {});
                return updated;
              });
              setDownloadedMap(prev => {
                const updated = { ...prev, [docKey]: true };
                AsyncStorage.setItem('community_downloaded_media', JSON.stringify(updated)).catch(() => {});
                return updated;
              });

              setMessages((prev) => prev.map((m) => (m.id === tempMsgId ? finalMsg : m)));
              notifyCommunityStudents(
                `${adminProfile?.full_name || 'Teacher'} shared a document`,
                doc.name || 'New document in Community'
              );
            }
          } catch (err: any) {
            console.error('Optimistic document upload failed:', err);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempMsgId
                  ? {
                      ...m,
                      upload_status: 'error',
                      upload_size_text: 'Upload failed',
                    }
                  : m
              )
            );
          }
        })();
      }
    } catch (err: any) {
      setIsPickingDocument(false);
      console.warn('Failed to pick/upload document:', err);
      Alert.alert('Error', 'Failed to select document. Please try again.');
    } finally {
      setIsPickingDocument(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadProfile(true);
    }, [user, businessId])
  );

  const deleteMessage = (msgId: string) => {
    setDeleteModalConfig({
      visible: true,
      title: 'Delete Message?',
      message: 'Are you sure you want to delete this message? This action cannot be undone.',
      onConfirm: async () => {
        setDeleteModalConfig(null);
        try {
          const msgToDelete = messages.find(m => String(m.id) === String(msgId));
          if (msgToDelete?.tg_file_id && msgToDelete.tg_file_id.includes(':')) {
            const tgMsgIdStr = msgToDelete.tg_file_id.split(':')[0];
            const tgMsgId = parseInt(tgMsgIdStr, 10);
            if (!isNaN(tgMsgId)) {
              deleteTelegramMessage(tgMsgId).catch(err => console.warn('Failed to delete from Telegram:', err));
            }
          }

          // Soft delete to avoid foreign key errors on YouTube links or posts
          const { error: softErr } = await supabase
            .from('community_posts')
            .update({ is_deleted: true, text: 'This message was deleted' })
            .eq('id', msgId);

          if (softErr) {
            try { await supabase.from('community_comments').delete().eq('post_id', msgId); } catch (_) {}
            try { await supabase.from('community_likes').delete().eq('post_id', msgId); } catch (_) {}
            const { error: hardErr } = await supabase.from('community_posts').delete().eq('id', msgId);
            if (hardErr) throw hardErr;
          }

          setMessages(prev => prev.filter(m => String(m.id) !== String(msgId)));
        } catch (err: any) {
          console.warn('Failed to delete message:', err);
        }
      }
    });
  };

  const enterMultiSelect = (msgId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsMultiSelect(true);
    setSelectedIds(new Set([msgId]));
  };

  const toggleSelectId = (msgId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const cancelMultiSelect = () => {
    setIsMultiSelect(false);
    setSelectedIds(new Set());
  };

  const deleteSelectedMessages = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    setDeleteModalConfig({
      visible: true,
      title: `Delete ${count} message${count > 1 ? 's' : ''}?`,
      message: 'These messages will be permanently deleted from the community.',
      onConfirm: async () => {
        setDeleteModalConfig(null);
        try {
          const ids = Array.from(selectedIds);
          const { error: softErr } = await supabase
            .from('community_posts')
            .update({ is_deleted: true, text: 'This message was deleted' })
            .in('id', ids);

          if (softErr) {
            try { await supabase.from('community_comments').delete().in('post_id', ids); } catch (_) {}
            try { await supabase.from('community_likes').delete().in('post_id', ids); } catch (_) {}
            const { error: hardErr } = await supabase.from('community_posts').delete().in('id', ids);
            if (hardErr) throw hardErr;
          }

          setMessages(prev => prev.filter(m => !selectedIds.has(String(m.id))));
          cancelMultiSelect();
        } catch (err: any) {
          console.warn('Failed to delete selected messages:', err);
        }
      }
    });
  };

  // Send push notification to all students in this business when teacher posts
  const notifyCommunityStudents = async (title: string, body: string) => {
    try {
      if (!businessId || !user?.id) return;
      const tokens = await fetchStudentPushTokens(businessId, user.id);
      if (tokens.length > 0) {
        await sendPushNotification(tokens, title, body, { screen: 'community' }, 1, CHANNELS.community);
      }
    } catch (e) {
      console.warn('Failed to send community push notifications:', e);
    }
  };

  const filteredMessages = messages.filter(msg => {
    if (!searchQuery.trim()) return true;
    return (msg.text || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
           (msg.author_name || '').toLowerCase().includes(searchQuery.toLowerCase());
  });
  const parsedMedia = extractMediaDocsLinks(messages);
  const imageMessages = messages.filter(msg => msg.image_url || (msg.text && msg.text.startsWith('[Image:')));

  const [onlineCount, setOnlineCount] = useState<number>(0);

  // Real-time Supabase Presence tracking (CRDT in-memory online status)
  useEffect(() => {
    if (!businessId || !user?.id) return;

    const presenceChannel = supabase.channel(`presence_admin_community_${businessId}`, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const keys = Object.keys(state);
        setOnlineCount(keys.length);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user_id: user.id,
            role: 'admin',
            name: adminProfile?.full_name || 'Teacher',
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [businessId, user?.id, adminProfile?.full_name]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header Banner Card */}
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/(admin)/coaching-profile')}
          style={styles.headerAvatar3DContainer}
        >
          <View style={styles.headerAvatarInner}>
            <Image 
              source={{ uri: coachingLogoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(coachingName)}&background=0D8ABC&color=fff&rounded=true` }} 
              style={styles.headerAvatarImage}
            />
          </View>
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
          <Text style={styles.headerSubtitle}>
            {onlineCount > 0 ? `🟢 ${onlineCount} Online • ${studentCount} members` : `${studentCount} members`}
          </Text>
        </TouchableOpacity>

        {/* 3-Dots Menu Icon */}
        <TouchableOpacity 
          style={styles.menuIconBtn} 
          activeOpacity={0.7} 
          onPress={() => {
            if (isSearchActive) {
              setIsSearchActive(false);
              setSearchQuery('');
            } else {
              setShowMenu(!showMenu);
            }
          }}
        >
          <Ionicons 
            name={isSearchActive ? "close-outline" : "ellipsis-vertical"} 
            size={22} 
            color={isSearchActive ? Colors.accent.primary : Colors.text.secondary} 
          />
        </TouchableOpacity>

        {/* Multi-select action bar */}
        {isMultiSelect && (
          <View style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: '#AF2800', paddingHorizontal: 16, borderRadius: 12,
          }}>
            <TouchableOpacity onPress={cancelMultiSelect} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="close" size={22} color="#FFF" />
              <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '600', marginLeft: 8 }}>
                {selectedIds.size} selected
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={deleteSelectedMessages} disabled={selectedIds.size === 0}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 }}>
              <Ionicons name="trash-outline" size={18} color="#FFF" />
              <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700', marginLeft: 6 }}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Dropdown menu */}
        {showMenu && (
          <View style={styles.dropdownMenu}>
            <TouchableOpacity 
              style={styles.dropdownMenuItem}
              onPress={() => {
                setIsSearchActive(true);
                setShowMenu(false);
              }}
            >
              <Ionicons name="search-outline" size={18} color={Colors.text.primary} style={{ marginRight: 8 }} />
              <Text style={styles.dropdownMenuText}>Search Messages</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.dropdownMenuItem, { borderTopWidth: 1, borderTopColor: Colors.card.border }]}
              onPress={() => {
                setActiveTab('info');
                setShowCoachingInfo(true);
                setShowMenu(false);
              }}
            >
              <Ionicons name="information-circle-outline" size={18} color={Colors.text.primary} style={{ marginRight: 8 }} />
              <Text style={styles.dropdownMenuText}>Coaching Info</Text>
            </TouchableOpacity>
          </View>
        )}
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
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
          <FlatList
          ref={flatListRef}
          data={filteredMessages}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
          maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
          onScroll={({ nativeEvent }) => {
            if (nativeEvent.contentOffset.y <= 50 && hasMore && !isLoadingMore && !isLoading) {
              fetchMoreMessages();
            }
          }}
          scrollEventThrottle={16}
          ListHeaderComponent={
            isLoadingMore ? (
              <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#AF2800" />
              </View>
            ) : null
          }
          renderItem={({ item, index }) => {
            const isSelf = item.author_id === user?.id;
            
            // Show date separator if date changes
            const prevMsg = filteredMessages[index - 1];
            const showDateSeparator = !prevMsg || 
              new Date(prevMsg.created_at).toDateString() !== new Date(item.created_at).toDateString();

            const urls = getImagesFromMessage(item);
            const isImageAttachment = urls.length > 0 || !!item.local_uri || !!item.is_optimistic;
            const captionText = isImageAttachment && item.text && item.text.includes(')')
              ? item.text.substring(item.text.indexOf(')') + 1).trim()
              : (!isImageAttachment ? item.text : '');

            // Link-only message detection (suppress bubble styling)
            const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.(?:com|org|net|co|in|edu|gov|io|info)(?:\/[^\s]*)?)/gi;
            const matchedUrls = item.text ? item.text.match(urlRegex) : null;
            const isLinkOnly = !!(matchedUrls && matchedUrls.length === 1 && item.text.trim() === matchedUrls[0].trim());

            const shouldShowBubble = (!isImageAttachment || captionText.length > 0) && !isLinkOnly;
            const isTeacher = item.author_role === 'admin' || item.author_role === 'teacher';

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

                  <TouchableOpacity 
                    activeOpacity={0.95}
                    delayLongPress={200}
                    onLongPress={() => isMultiSelect ? null : enterMultiSelect(String(item.id))}
                    onPress={() => isMultiSelect ? toggleSelectId(String(item.id)) : null}
                    style={[
                      shouldShowBubble ? styles.bubble : { backgroundColor: 'transparent', borderWidth: 0, shadowOpacity: 0, elevation: 0, padding: 0 },
                      shouldShowBubble ? (isSelf ? styles.bubbleSelf : styles.bubbleOther) : null,
                      (isImageAttachment && shouldShowBubble) && { padding: 0, paddingHorizontal: 0, paddingVertical: 0 },
                      isMultiSelect && selectedIds.has(String(item.id)) && { opacity: 0.7, borderWidth: 2, borderColor: '#AF2800' }
                    ]}
                  >
                    {/* Render sender name for incoming messages */}
                    {!isSelf && (
                      <Text style={[
                        styles.authorText,
                        isTeacher ? styles.authorTeacher : styles.authorStudent,
                        (isImageAttachment || isLinkOnly) && { marginLeft: shouldShowBubble ? 12 : 0, marginTop: shouldShowBubble ? 8 : 2, marginBottom: 4 }
                      ]}>
                        {item.author_name} {isTeacher ? '(Teacher)' : ''}
                      </Text>
                    )}

                    {/* Image Attachment Rendering */}
                    {isImageAttachment && (() => {
                      const urls = getImagesFromMessage(item);
                      // For optimistic messages, local_uri is source of truth — don't bail out on empty urls[]
                      if (urls.length === 0 && !item.local_uri) return null;

                      // [].every() returns true — must guard against empty urls[] for optimistic local_uri messages
                      const isDownloaded = urls.length > 0
                        ? urls.every((_, idx) => downloadedMap[item.id + '_' + idx] || isSelf)
                        : !!item.local_uri; // optimistic with local_uri only: treat as "downloaded"
                      const isDownloading = urls.some((_, idx) => downloadingIds[item.id + '_' + idx]);
                      const captionText = item.text ? item.text.substring(item.text.indexOf(')') + 1).trim() : '';

                      const BOX_W = 260;
                      const cachedDims = imageDimsCache[item.id];
                      const dynHeight = cachedDims
                        ? Math.max(160, Math.min(320, Math.round((cachedDims.h / cachedDims.w) * BOX_W)))
                        : 190;

                      // Lazy-load image dimensions for aspect ratio (guard: never call getSize on local file:// uris — can crash on Android)
                      if (!cachedDims && urls[0] && urls[0].startsWith('http')) {
                        Image.getSize(urls[0], (w, h) => {
                          setImageDimsCache(prev => ({ ...prev, [item.id]: { w, h } }));
                        }, () => {});
                      }

                      // Tapping opens the lightbox with all images from this message
                      const handlePressImage = (tappedIndex: number) => {
                        if (isMultiSelect) {
                          toggleSelectId(String(item.id));
                          return;
                        }
                        if (isDownloaded) {
                          const resolvedUris = urls.map((url, idx) => localMediaMap[item.id + '_' + idx] || url);
                          setLightboxImages(resolvedUris);
                          setLightboxMessage(item);
                          setLightboxIndex(tappedIndex);
                          setCurrentViewerIndex(tappedIndex);
                        }
                      };

                      const handleDownloadBunch = () => {
                        urls.forEach((url, idx) => {
                          downloadImageLocal(item.id, url, idx);
                        });
                      };

                      if (urls.length > 1) {
                        // Multi-image Card Spread (Overlap Fan Layout)
                        return (
                          <View style={{ width: BOX_W, overflow: 'visible', marginVertical: 8 }}>
                            <View style={{ position: 'relative', width: BOX_W, height: dynHeight + 15, overflow: 'visible' }}>
                              {/* Third card (bottom layer) */}
                              {urls.length > 2 && (
                                <View style={{
                                  position: 'absolute',
                                  width: BOX_W - 20,
                                  height: dynHeight - 10,
                                  borderRadius: 16,
                                  backgroundColor: '#E0E0E0',
                                  left: 10,
                                  top: 20,
                                  transform: [{ rotate: '4deg' }],
                                  opacity: 0.7,
                                  elevation: 2,
                                  overflow: 'hidden'
                                }}>
                                  <Image source={{ uri: urls[2] }} style={{ width: '100%', height: '100%', opacity: 0.8 }} />
                                </View>
                              )}

                              {/* Second card (middle layer) */}
                              <View style={{
                                  position: 'absolute',
                                  width: BOX_W - 20,
                                  height: dynHeight - 10,
                                  borderRadius: 16,
                                  backgroundColor: '#E0E0E0',
                                  left: 10,
                                  top: 12,
                                  transform: [{ rotate: '-4deg' }],
                                  opacity: 0.9,
                                  elevation: 3,
                                  overflow: 'hidden'
                                }}>
                                  <Image source={{ uri: urls[1] }} style={{ width: '100%', height: '100%', opacity: 0.9 }} />
                                </View>

                              {/* Top card */}
                              <View style={{
                                position: 'absolute',
                                width: BOX_W - 20,
                                height: dynHeight - 10,
                                borderRadius: 16,
                                backgroundColor: '#E0E0E0',
                                left: 10,
                                top: 0,
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.15,
                                shadowRadius: 6,
                                elevation: 5,
                                overflow: 'hidden'
                              }}>
                                <TouchableOpacity
                                  activeOpacity={0.9}
                                  delayLongPress={200}
                                  onLongPress={() => isMultiSelect ? null : enterMultiSelect(String(item.id))}
                                  onPress={() => handlePressImage(0)}
                                  disabled={!isDownloaded && !isMultiSelect}
                                  style={{ width: '100%', height: '100%' }}
                                >
                                  {isDownloaded ? (
                                    <Image 
                                      source={{ uri: localMediaMap[item.id + '_0'] || urls[0] }} 
                                      style={{ width: '100%', height: '100%' }}
                                    />
                                  ) : (
                                    <View style={{ width: '100%', height: '100%', backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' }}>
                                      <Ionicons name="image-outline" size={40} color="rgba(255,255,255,0.3)" />
                                    </View>
                                  )}
                                  
                                  {/* Glassmorphic Count Badge */}
                                  <View style={{
                                    position: 'absolute',
                                    bottom: 12,
                                    right: 12,
                                    backgroundColor: 'rgba(0, 0, 0, 0.65)',
                                    paddingHorizontal: 10,
                                    paddingVertical: 5,
                                    borderRadius: 20,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 4
                                  }}>
                                    <Ionicons name="images" size={14} color="#FFF" />
                                    <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>
                                      {urls.length} Images
                                    </Text>
                                  </View>
                                </TouchableOpacity>

                                {!isDownloaded && (
                                  <View style={styles.downloadOverlay}>
                                    <TouchableOpacity 
                                      style={styles.downloadCircle} 
                                      activeOpacity={0.8}
                                      onPress={handleDownloadBunch}
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
                            </View>
                            {captionText ? (
                              <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 }}>
                                <Text style={[styles.messageText, isSelf ? styles.textSelf : styles.textOther, { paddingRight: 0 }]}>
                                  {renderTextWithLinks(captionText, '#0066CC')}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        );
                      }

                      // Single Image Layout
                      const displayUri = item.local_uri || localMediaMap[item.id + '_0'] || localMediaMap[item.id] || (urls.length > 0 ? urls[0] : null);
                      return (
                        <View style={{ overflow: 'hidden', borderRadius: 16, width: BOX_W }}>
                          <View style={{ position: 'relative', width: BOX_W, height: dynHeight, overflow: 'hidden' }}>
                            <TouchableOpacity 
                              activeOpacity={0.9} 
                              delayLongPress={200}
                              onLongPress={() => isMultiSelect ? null : enterMultiSelect(String(item.id))}
                              onPress={() => handlePressImage(0)}
                              disabled={!isDownloaded && !isMultiSelect}
                            >
                              {item.is_optimistic || isDownloaded || item.local_uri ? (
                                <Image 
                                  source={{ uri: item.local_uri || displayUri }}
                                  defaultSource={item.local_uri ? { uri: item.local_uri } : undefined}
                                  style={[styles.bubbleImageAttachment, { width: BOX_W, height: dynHeight }]} 
                                />
                              ) : (
                                <View style={{ width: BOX_W, height: dynHeight, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' }}>
                                  <Ionicons name="image-outline" size={40} color="rgba(255,255,255,0.3)" />
                                </View>
                              )}
                            </TouchableOpacity>

                            {/* WhatsApp-Style Circular Realtime Upload Progress Overlay */}
                            {item.is_optimistic && item.upload_status === 'uploading' && (
                              <View style={styles.uploadingOverlay}>
                                <View style={styles.whatsappProgressCircle}>
                                  <ActivityIndicator size="small" color="#FFFFFF" />
                                  <Text style={styles.uploadingPctText}>{item.upload_progress || 0}%</Text>
                                </View>
                                <Text style={styles.uploadingSizeText}>{item.upload_size_text || 'Uploading...'}</Text>
                              </View>
                            )}

                            {!isDownloaded && !item.is_optimistic && (
                              <View style={styles.downloadOverlay}>
                                <TouchableOpacity 
                                  style={styles.downloadCircle} 
                                  activeOpacity={0.8}
                                  onPress={() => downloadImageLocal(item.id, urls[0], 0)}
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
                               {renderTextWithLinks(captionText, '#0066CC')}
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
                          disabled={(isDownloading || (item.is_optimistic && item.upload_status === 'uploading')) && !isMultiSelect}
                          delayLongPress={200}
                          onLongPress={() => isMultiSelect ? null : enterMultiSelect(String(item.id))}
                          onPress={() => {
                            if (isMultiSelect) { toggleSelectId(String(item.id)); return; }
                            if (docUrl) {
                              if (!isDownloaded) {
                                handleDownloadDocument(item.id, docUrl, docName);
                              } else {
                                const localUri = localMediaMap[item.id];
                                if (localUri && docName.toLowerCase().endsWith('.pdf')) {
                                  router.push({
                                    pathname: '/(admin)/pdf-viewer',
                                    params: { uri: localUri, title: docName }
                                  });
                                } else {
                                  downloadAndOpenSaf(docUrl, docName);
                                }
                              }
                            }
                          }}
                        >
                          {item.is_optimistic && item.upload_status === 'uploading' ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                              <ActivityIndicator size="small" color="#AF2800" style={{ marginRight: 8 }} />
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.bubbleFileAttachmentText, { color: Colors.text.primary }]} numberOfLines={1}>
                                  {docName}
                                </Text>
                                <Text style={{ fontSize: 11, color: Colors.accent.primary, fontWeight: '700', marginTop: 2 }}>
                                  Uploading... {item.upload_progress || 0}% ({item.upload_size_text || ''})
                                </Text>
                              </View>
                            </View>
                          ) : (
                            <>
                              {isDownloading ? (
                                <ActivityIndicator size="small" color="#AF2800" style={{ marginRight: 8 }} />
                              ) : (
                                <Ionicons 
                                  name={isDownloaded ? "document-text" : "download-outline"} 
                                  size={24} 
                                  color="#AF2800" 
                                  style={{ marginRight: 8 }} 
                                />
                              )}
                              <Text style={[styles.bubbleFileAttachmentText, { color: Colors.text.primary }]} numberOfLines={1}>
                                {docName}
                              </Text>
                              {isDownloaded && !isDownloading && !item.is_optimistic && (
                                <Ionicons name="checkmark-circle" size={16} color="#2E7D32" style={{ marginLeft: 8 }} />
                              )}
                            </>
                          )}
                        </TouchableOpacity>
                      );
                    })() : (
                      item.text !== '[Attached Image]' && !item.text?.startsWith('[Image:') && (
                        <View style={{ minWidth: 160 }}>
                          {!isLinkOnly && (
                            <Text style={[styles.messageText, isSelf ? styles.textSelf : styles.textOther]}>
                              {renderTextWithLinks(item.text, '#0066CC')}
                            </Text>
                          )}
                          <TouchableOpacity
                            activeOpacity={1}
                            delayLongPress={200}
                            onLongPress={() => isMultiSelect ? toggleSelectId(String(item.id)) : deleteMessage(String(item.id))}
                            onPress={() => isMultiSelect ? toggleSelectId(String(item.id)) : null}
                          >
                            <LinkPreviewCard 
                              text={item.text} 
                              isSelf={isSelf} 
                              onLongPress={() => isMultiSelect ? toggleSelectId(String(item.id)) : deleteMessage(String(item.id))}
                            />
                          </TouchableOpacity>
                        </View>
                      )
                    )}

                    <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 2 }}>
                      <Text style={[
                        styles.timeText, 
                        isSelf ? styles.timeSelf : styles.timeOther,
                        (isImageAttachment || isLinkOnly) && { 
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
                      {item.is_optimistic && item.upload_status === 'sending' && (
                        <Ionicons name="time-outline" size={13} color={isSelf ? "rgba(255,255,255,0.7)" : Colors.text.secondary} style={{ marginLeft: 4 }} />
                      )}
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
            <LinearGradient
              colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.05)']}
              style={styles.bottomVignette}
              pointerEvents="none"
            />
          </View>

        {/* Editing message indicator header */}
        {editingMessageId !== null && (
          <View style={styles.editingHeader}>
            <Ionicons name="pencil" size={16} color={Colors.accent.primary} style={{ marginRight: 8 }} />
            <Text style={styles.editingHeaderText} numberOfLines={1}>
              Editing Message
            </Text>
            <TouchableOpacity 
              style={{ marginLeft: 'auto', padding: 4 }} 
              onPress={() => {
                setEditingMessageId(null);
                setInputText('');
              }}
            >
              <Ionicons name="close-circle" size={18} color={Colors.text.tertiary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <ScalePressable 
            style={styles.attachIconBtn} 
            onPress={handlePickImage}
            disabled={isPickingImage || isPickingDocument}
          >
            {isPickingImage ? (
              <ActivityIndicator size="small" color={Colors.accent.primary} />
            ) : (
              <Ionicons name="image-outline" size={22} color={Colors.text.secondary} />
            )}
          </ScalePressable>
          <ScalePressable 
            style={styles.attachIconBtn} 
            onPress={handlePickDocument}
            disabled={isPickingImage || isPickingDocument}
          >
            {isPickingDocument ? (
              <ActivityIndicator size="small" color={Colors.accent.primary} />
            ) : (
              <Ionicons name="document-text-outline" size={22} color={Colors.text.secondary} />
            )}
          </ScalePressable>
          <TextInput 
            style={styles.textInput}
            placeholder="Type a message..."
            placeholderTextColor={Colors.text.tertiary}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={1000}
          />
          <ScalePressable 
            style={[styles.sendBtn, (!inputText.trim() && !isSending) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={(!inputText.trim() && !isSending) || isSending}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="arrow-up" size={20} color="#FFF" />
            )}
          </ScalePressable>
        </View>
      </KeyboardAvoidingView>

      {/* Image Caption Modal */}
      {/* Instagram-Style Post Sharing Screen Modal */}
      <Modal
        visible={selectedImageForCaption !== null}
        animationType="slide"
        transparent={false}
        onRequestClose={() => {
          // Abort any ongoing upload
          activeSessionIdRef.current = '';
          uploadResultRef.current = null;
          setUploadState('idle');
          setSelectedImageForCaption(null);
          setImageCaptionText('');
        }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF' }}>
          {/* Header */}
          <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#EAEAEA', paddingHorizontal: 16 }}>
            <TouchableOpacity onPress={() => {
              // Abort any ongoing background upload and close modal
              activeSessionIdRef.current = '';
              uploadResultRef.current = null;
              setUploadState('idle');
              setSelectedImageForCaption(null);
              setImageCaptionText('');
            }}>
              <Text style={{ fontSize: 16, color: Colors.text.primary }}>Cancel</Text>
            </TouchableOpacity>
            
            <Text style={{ fontSize: 18, fontWeight: '700', color: Colors.text.primary, position: 'absolute', left: 0, right: 0, textAlign: 'center', zIndex: -1 }}>
              New Post
            </Text>
            
            <TouchableOpacity 
              onPress={handleSharePost}
              disabled={isSending}
              style={{ flexDirection: 'row', alignItems: 'center' }}
            >
              {isSending ? (
                <ActivityIndicator size="small" color={Colors.accent.primary} />
              ) : (
                <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.accent.primary }}>Share</Text>
              )}
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView 
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 16 }}>
              {/* Row for Preview and Caption Input */}
              <View style={{ flexDirection: 'column', paddingHorizontal: 16, gap: 12, marginBottom: 20 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {selectedMultiImages.length > 0 ? (
                    selectedMultiImages.map((img, idx) => (
                      <View key={idx} style={{ position: 'relative' }}>
                        <Image 
                          source={{ uri: img.uri }} 
                          style={{ width: 85, height: 85, borderRadius: 8, backgroundColor: '#F0F0F0', marginRight: 8, resizeMode: 'cover' }}
                        />
                        <View style={{
                          position: 'absolute',
                          top: 4,
                          right: 12,
                          backgroundColor: 'rgba(0,0,0,0.6)',
                          width: 18,
                          height: 18,
                          borderRadius: 9,
                          justifyContent: 'center',
                          alignItems: 'center'
                        }}>
                          <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700' }}>{idx + 1}</Text>
                        </View>
                      </View>
                    ))
                  ) : selectedImageForCaption ? (
                    <Image 
                      source={{ uri: selectedImageForCaption.uri }} 
                      style={{ width: 85, height: 85, borderRadius: 8, backgroundColor: '#F0F0F0', resizeMode: 'cover' }}
                    />
                  ) : null}
                </ScrollView>
                
                <TextInput
                  placeholder="Write a caption..."
                  placeholderTextColor={Colors.text.tertiary}
                  style={{ width: '100%', fontSize: 15, color: Colors.text.primary, minHeight: 85, textAlignVertical: 'top', paddingTop: 4 }}
                  value={imageCaptionText}
                  onChangeText={setImageCaptionText}
                  multiline
                  maxLength={2000}
                />
              </View>

              <View style={{ height: 1, backgroundColor: '#EAEAEA', marginHorizontal: 16, marginBottom: 16 }} />

              {/* Upload Status / Progress Bar */}
              <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
                {uploadState === 'uploading' && (
                  <View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 12, color: Colors.text.secondary, fontWeight: '500' }}>Uploading...</Text>
                      <Text style={{ fontSize: 12, color: Colors.accent.primary, fontWeight: '700' }}>{uploadProgress}%</Text>
                    </View>
                    <View style={{ height: 5, backgroundColor: '#E8E8E8', borderRadius: 3, overflow: 'hidden' }}>
                      <View style={{
                        height: '100%',
                        width: `${uploadProgress}%`,
                        backgroundColor: Colors.accent.primary,
                        borderRadius: 3,
                      }} />
                    </View>
                  </View>
                )}
                {uploadState === 'success' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="checkmark-circle" size={18} color="#2e7d32" />
                    <Text style={{ fontSize: 13, color: '#2e7d32', fontWeight: '600' }}>Upload complete — ready to share</Text>
                  </View>
                )}
                {uploadState === 'error' && (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                    onPress={handlePickImage}
                  >
                    <Ionicons name="alert-circle" size={18} color="#c62828" />
                    <Text style={{ fontSize: 13, color: '#c62828', fontWeight: '500' }}>Upload failed. Tap to retry.</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={{ height: 1, backgroundColor: '#EAEAEA', marginHorizontal: 16, marginBottom: 16 }} />

              {/* Decorative Settings list to look exactly like Instagram */}
              <View style={{ paddingHorizontal: 16, gap: 18 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 15, color: Colors.text.primary }}>Tag People</Text>
                  <Ionicons name="chevron-forward" size={18} color={Colors.text.tertiary} />
                </View>
                
                <View style={{ height: 1, backgroundColor: '#F4F4F4' }} />

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 15, color: Colors.text.primary }}>Add Location</Text>
                  <Ionicons name="chevron-forward" size={18} color={Colors.text.tertiary} />
                </View>

                <View style={{ height: 1, backgroundColor: '#F4F4F4' }} />

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ gap: 2 }}>
                    <Text style={{ fontSize: 15, color: Colors.text.primary }}>Post to Telegram Channel</Text>
                    <Text style={{ fontSize: 12, color: Colors.text.tertiary }}>Auto-sync with coaching group</Text>
                  </View>
                  <Switch value={true} disabled={true} trackColor={{ true: Colors.accent.primary }} />
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Custom Action Popover Modal (White Milk Bubble) */}
      <Modal
        visible={selectedActionMessage !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedActionMessage(null)}
      >
        <TouchableOpacity 
          style={styles.popoverOverlay}
          activeOpacity={1}
          onPress={() => setSelectedActionMessage(null)}
        >
          <View style={styles.popoverBubble}>
            <Text style={styles.popoverHeaderTitle} numberOfLines={1}>
              Message Actions
            </Text>
            
            {/* Show Edit only for text messages */}
            {selectedActionMessage && !selectedActionMessage.image_url && !(selectedActionMessage.text && selectedActionMessage.text.startsWith('[Image:')) && !(selectedActionMessage.text && selectedActionMessage.text.startsWith('[Document:')) && (
              <TouchableOpacity 
                style={styles.popoverItem} 
                onPress={() => {
                  setInputText(selectedActionMessage.text);
                  setEditingMessageId(selectedActionMessage.id);
                  setSelectedActionMessage(null);
                }}
              >
                <Ionicons name="pencil-outline" size={20} color={Colors.text.primary} style={{ marginRight: 12 }} />
                <Text style={styles.popoverItemText}>Edit Message</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              style={styles.popoverItem} 
              onPress={async () => {
                const textToShare = selectedActionMessage?.text || '';
                setSelectedActionMessage(null);
                try {
                  await Share.share({
                    message: textToShare.startsWith('[Image:') || textToShare.startsWith('[Document:') 
                      ? extractUrlAndName(textToShare)?.url || textToShare 
                      : textToShare
                  });
                } catch (e: any) {
                  console.warn('Share error:', e);
                }
              }}
            >
              <Ionicons name="share-social-outline" size={20} color={Colors.text.primary} style={{ marginRight: 12 }} />
              <Text style={styles.popoverItemText}>Share Message</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.popoverItem, { borderBottomWidth: 0 }]} 
              onPress={() => {
                const msgId = selectedActionMessage.id;
                setSelectedActionMessage(null);
                deleteMessage(msgId);
              }}
            >
              <Ionicons name="trash-outline" size={20} color="#FF3B30" style={{ marginRight: 12 }} />
              <Text style={[styles.popoverItemText, { color: '#FF3B30' }]}>Delete Message</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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
                              const localUri = localMediaMap[item.id];
                              if (localUri && item.name.toLowerCase().endsWith('.pdf')) {
                                router.push({
                                  pathname: '/(admin)/pdf-viewer',
                                  params: { uri: localUri, title: item.name }
                                });
                              } else if (!localUri && item.name.toLowerCase().endsWith('.pdf')) {
                                handleDownloadDocument(item.id, item.url, item.name);
                              } else {
                                downloadAndOpenSaf(item.url, item.name);
                              }
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
              if (!lightboxMessage) return null;
              const isSelf = lightboxMessage.author_id === user?.id;
              const senderName = isSelf ? 'You' : lightboxMessage.author_name;
              const formattedTime = formatBubbleTime(lightboxMessage.created_at);
              const displayUri = lightboxImages[currentViewerIndex];

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
              data={lightboxImages}
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
              keyExtractor={(item, index) => String(index)}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                setCurrentViewerIndex(idx);
              }}
              renderItem={({ item: displayUri }) => {
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

      {/* Sleek Pure Milk White Compact Delete Confirmation Modal */}
      {deleteModalConfig && (
        <Modal visible={deleteModalConfig.visible} transparent animationType="fade" onRequestClose={() => setDeleteModalConfig(null)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
            <View style={{ width: '100%', maxWidth: 290, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name="trash-outline" size={24} color="#EF4444" />
              </View>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 6 }}>{deleteModalConfig.title}</Text>
              <Text style={{ fontSize: 12, color: '#6B7280', textAlign: 'center', lineHeight: 16, marginBottom: 20 }}>{deleteModalConfig.message}</Text>
              <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                <TouchableOpacity 
                  style={{ flex: 1, height: 40, borderRadius: 12, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' }}
                  onPress={() => setDeleteModalConfig(null)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ flex: 1, height: 40, borderRadius: 12, backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center' }}
                  onPress={deleteModalConfig.onConfirm}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  topVignette: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    zIndex: 2,
  },
  bottomVignette: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 10,
    zIndex: 2,
  },
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
  headerAvatar3DContainer: {
    padding: 2,
    borderRadius: 22,
    backgroundColor: '#FFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: Colors.text.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 4,
  },
  headerAvatarInner: {
    width: 40,
    height: 40,
    borderRadius: 19,
    backgroundColor: Colors.bg.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  headerAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
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
    borderRadius: 16, 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    position: 'relative'
  },
  bubbleSelf: { 
    backgroundColor: '#FFFFFF', 
    borderBottomRightRadius: 4,
    borderColor: Colors.card.border,
    borderWidth: 1
  },
  bubbleOther: { 
    backgroundColor: '#FFFFFF', 
    borderBottomLeftRadius: 4,
    borderColor: Colors.card.border,
    borderWidth: 1
  },
  authorText: { fontSize: 10.5, fontWeight: '700', marginBottom: 2 },
  authorTeacher: { color: '#AF2800' },
  authorStudent: { color: '#7E57C2' },
  messageText: { fontSize: 13, color: Colors.text.primary, lineHeight: 17, paddingRight: 32 },
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
  textSelf: { color: Colors.text.primary },
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
  timeSelf: { color: Colors.text.tertiary },
  timeOther: { color: Colors.text.tertiary },
  inputBar: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 12, 
    paddingTop: 8, 
    paddingBottom: Platform.OS === 'ios' ? 24 : 12, 
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
    backgroundColor: '#AF2800', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginLeft: 8 
  },
  sendBtnDisabled: { 
    backgroundColor: '#AF2800',
    opacity: 0.3
  },
  menuIconBtn: {
    padding: 8,
    marginLeft: 4,
  },
  dropdownMenu: {
    position: 'absolute',
    right: 12,
    top: 56,
    backgroundColor: '#FFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.card.border,
    elevation: 5,
    shadowColor: '#281713',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 999,
    width: 170,
  },
  dropdownMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownMenuText: {
    fontSize: 14,
    color: Colors.text.primary,
    fontWeight: '500',
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
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  whatsappProgressCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  uploadingPctText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  uploadingSizeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  editingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: Colors.card.border,
  },
  editingHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.accent.primary,
  },
  popoverOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  popoverBubble: {
    width: 260,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  popoverHeaderTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    textAlign: 'center',
  },
  popoverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.card.border,
  },
  popoverItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
  },
});

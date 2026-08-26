/**
 * CachedImage — uses expo-image when native module is available (after rebuild),
 * gracefully falls back to React Native's built-in Image with a custom
 * local file cache (via expo-file-system) otherwise.
 * This prevents crashes and guarantees offline caching even in Expo Go.
 */
import { Image, ImageStyle, View, Text, StyleSheet, ViewStyle, ActivityIndicator } from 'react-native';
import { Colors } from '@/constants/colors';
import { useState, useEffect } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

// Try to load expo-image — only works after `npx expo run:android`
let ExpoImage: any = null;
try {
  const mod = require('expo-image');
  if (mod && mod.Image && typeof mod.Image === 'function') {
    ExpoImage = mod.Image;
  }
} catch (_) {}

const PLACEHOLDER_BLURHASH = '|LHLh9Dh00%M00_g_0.w_0%MoffR00Rj00Rj00~q_0%M_0_g00%M00_g00%M00_g00%M00_g';

type Props = {
  uri?: string | null;
  style?: ImageStyle;
  containerStyle?: ViewStyle;
  fallbackInitial?: string;
  priority?: 'low' | 'normal' | 'high';
  contentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  borderRadius?: number;
};

function getCacheFilename(url: string) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash |= 0;
  }
  return `img_${Math.abs(hash)}`;
}

export default function CachedImage({
  uri,
  style,
  containerStyle,
  fallbackInitial,
  priority = 'normal',
  contentFit = 'cover',
  borderRadius,
}: Props) {
  const [localUri, setLocalUri] = useState<string | null>(null);

  useEffect(() => {
    if (!uri) {
      setLocalUri(null);
      return;
    }

    if (!uri.startsWith('http://') && !uri.startsWith('https://')) {
      setLocalUri(uri);
      return;
    }

    const cacheFile = async () => {
      try {
        const filename = getCacheFilename(uri);
        const cachePath = `${FileSystem.cacheDirectory}${filename}`;
        const fileInfo = await FileSystem.getInfoAsync(cachePath);

        if (fileInfo.exists) {
          setLocalUri(cachePath);
        } else {
          const downloadResult = await FileSystem.downloadAsync(uri, cachePath);
          setLocalUri(downloadResult.uri);
        }
      } catch (err) {
        console.warn('Failed to cache image locally:', err);
        setLocalUri(uri);
      }
    };

    cacheFile();
  }, [uri]);

  const resolvedStyle: any = {
    ...(style as object ?? {}),
    ...(borderRadius !== undefined ? { borderRadius } : {}),
  };

  if (!uri) {
    return (
      <View style={[styles.fallback, resolvedStyle, containerStyle]}>
        {fallbackInitial ? (
          <Text style={styles.fallbackText}>{fallbackInitial.charAt(0).toUpperCase()}</Text>
        ) : null}
      </View>
    );
  }

  const [isLoading, setIsLoading] = useState(true);

  if (ExpoImage) {
    return (
      <ExpoImage
        source={{ uri }}
        style={resolvedStyle}
        contentFit={contentFit}
        priority={priority}
        cachePolicy="disk"
        placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
        placeholderContentFit="cover"
        transition={200}
        onLoad={() => setIsLoading(false)}
      />
    );
  }

  return (
    <View style={[resolvedStyle, { overflow: 'hidden', backgroundColor: Colors.bg.tertiary }]}>
      <Image
        source={{ uri: localUri || uri }}
        style={[StyleSheet.absoluteFill]}
        resizeMode={contentFit === 'contain' ? 'contain' : 'cover'}
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
      />
      {isLoading && (
        <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="small" color={Colors.accent.primary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: Colors.bg.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.accent.primary,
  },
});

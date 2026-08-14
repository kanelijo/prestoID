import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotificationStore } from '@/stores/useNotificationStore';
import CachedImage from './CachedImage';
import { useRouter } from 'expo-router';

let Audio: any = null;
try {
  Audio = require('expo-av').Audio;
} catch (e) {
  console.log('expo-av native module missing, sounds will be disabled');
}

export default function InAppNotification() {
  const { isPopupVisible, currentPopupNotification, hideNotificationPopup } = useNotificationStore();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const slideAnim = useRef(new Animated.Value(-150)).current;

  useEffect(() => {
    if (isPopupVisible && currentPopupNotification) {
      playSound();
      Animated.spring(slideAnim, {
        toValue: insets.top + 10,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }).start();

      const timer = setTimeout(() => {
        closePopup();
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [isPopupVisible]);

  const playSound = async () => {
    if (!Audio) return;
    try {
      // Setup Audio
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldRouteThroughEarpiece: false,
      });
      // App notification sound
      const { sound } = await Audio.Sound.createAsync(
        require('@/assets/audio/AppNoti.mp3')
      );
      await sound.playAsync();
      
      // Cleanup after playing
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
        }
      });
    } catch (e) {
      console.log('Failed to play notification sound', e);
    }
  };

  const closePopup = () => {
    Animated.timing(slideAnim, {
      toValue: -150,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      hideNotificationPopup();
    });
  };

  const handlePress = () => {
    closePopup();
    if (currentPopupNotification?.peerId) {
      router.push(`/(student)/student-chat?peerId=${currentPopupNotification.peerId}`);
    }
  };

  if (!isPopupVisible || !currentPopupNotification) return null;

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
      <TouchableOpacity activeOpacity={0.9} onPress={handlePress} style={styles.content}>
        <View style={styles.header}>
          {currentPopupNotification.avatarUrl ? (
            <CachedImage url={currentPopupNotification.avatarUrl} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.placeholderAvatar]} />
          )}
          <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={1}>{currentPopupNotification.title}</Text>
            <Text style={styles.body} numberOfLines={2}>{currentPopupNotification.body}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  content: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  placeholderAvatar: {
    backgroundColor: '#f0f0f0',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  body: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 18,
  },
});

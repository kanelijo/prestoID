import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing } from 'react-native-reanimated';

interface LiveTestCardProps {
  test: any;
  index?: number;
  onPress?: () => void;
}

export default function LiveTestCard({ test, index, onPress }: LiveTestCardProps) {
  const isLive = test.status === 'live';
  
  // Heartbeat Animation
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (isLive) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.2, { duration: 300, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 300, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800 })
        ),
        -1, // infinite
        true
      );
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 300 }),
          withTiming(1, { duration: 300 }),
          withTiming(1, { duration: 800 })
        ),
        -1,
        true
      );
    }
  }, [isLive]);

  const heartbeatStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Available Now';
    const d = new Date(dateString);
    return d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, month: 'short', day: 'numeric' });
  };

  return (
    <TouchableOpacity style={[styles.card, isLive && { borderColor: '#FF0000', borderWidth: 2 }]} onPress={onPress}>
      <View style={styles.headerRow}>
        <View style={styles.badgeContainer}>
          {index !== undefined && (
            <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.text.tertiary, textTransform: 'uppercase', marginRight: 8 }}>
              Test {index + 1}
            </Text>
          )}
          {isLive && (
            <Animated.View style={[styles.heartbeatDot, heartbeatStyle, { backgroundColor: '#FF0000' }]} />
          )}
          <View style={[styles.badgeBg, isLive ? { backgroundColor: '#FF0000' } : { backgroundColor: Colors.accent.primary }]}>
            <Text style={[styles.badgeText, { color: '#FFF' }]}>
              {isLive ? 'LIVE NOW' : 'SCHEDULED'}
            </Text>
          </View>
        </View>
      </View>
      
      <Text style={styles.title} numberOfLines={2}>{test.title}</Text>
      
      <View style={styles.footerRow}>
        <View style={styles.infoPill}>
          <Ionicons name="time-outline" size={14} color={Colors.text.secondary} />
          <Text style={styles.infoText}>{test.duration_minutes || test.time_limit} mins</Text>
        </View>
        <View style={styles.infoPill}>
          <Ionicons name="calendar-outline" size={14} color={Colors.text.secondary} />
          <Text style={styles.infoText}>{formatDate(test.start_time || test.scheduled_at)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    width: 260,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    elevation: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  heartbeatDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    marginRight: 6,
  },
  badgeBg: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  liveText: {
    color: '#FF3B30',
  },
  scheduledText: {
    color: Colors.text.secondary,
  },
  subjectText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.accent.primary,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 12,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  infoText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
});

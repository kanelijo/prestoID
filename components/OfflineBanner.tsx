import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import * as Network from 'expo-network';
import { Colors } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';

export default function OfflineBanner() {
  const [isConnected, setIsConnected] = useState(true);
  const [showBackOnline, setShowBackOnline] = useState(false);
  const slideAnim = useState(new Animated.Value(-50))[0];

  useEffect(() => {
    let checkInterval: ReturnType<typeof setInterval>;

    const checkNetwork = async () => {
      const state = await Network.getNetworkStateAsync();
      const currentlyConnected = !!state.isConnected && !!state.isInternetReachable;

      setIsConnected((prev) => {
        if (!prev && currentlyConnected) {
          // Just came back online
          setShowBackOnline(true);
          setTimeout(() => setShowBackOnline(false), 3000);
        }
        return currentlyConnected;
      });
    };

    checkNetwork();
    checkInterval = setInterval(checkNetwork, 3000); // Check every 3s

    return () => clearInterval(checkInterval);
  }, []);

  useEffect(() => {
    if (!isConnected || showBackOnline) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -50,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isConnected, showBackOnline]);

  if (isConnected && !showBackOnline) return null;

  return (
    <Animated.View 
      style={[
        styles.banner, 
        { 
          transform: [{ translateY: slideAnim }],
          backgroundColor: isConnected ? Colors.status.success : Colors.status.danger 
        }
      ]}
    >
      <Ionicons 
        name={isConnected ? "wifi" : "cloud-offline"} 
        size={14} 
        color="#FFF" 
        style={styles.icon} 
      />
      <Text style={styles.text}>
        {isConnected ? 'Back Online' : 'No Internet Connection. Viewing Offline Data.'}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    zIndex: 999,
  },
  icon: {
    marginRight: 6,
  },
  text: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
});

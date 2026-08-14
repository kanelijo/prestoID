import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';

export interface CustomAlertButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

let globalShowAlert: (
  title: string,
  message?: string,
  buttons?: CustomAlertButton[]
) => void = () => {};

export const CustomAlert = {
  alert: (title: string, message?: string, buttons?: CustomAlertButton[], options?: any) => {
    globalShowAlert(title, message, buttons);
  }
};

export default function CustomAlertContainer() {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [buttons, setButtons] = useState<CustomAlertButton[]>([]);
  const [scaleAnim] = useState(new Animated.Value(0.9));
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    globalShowAlert = (t: string, m?: string, b?: CustomAlertButton[]) => {
      setTitle(t);
      setMessage(m || '');
      setButtons(b || [{ text: 'OK' }]);
      setVisible(true);

      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 100,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        })
      ]).start();
    };
  }, []);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      })
    ]).start(() => {
      setVisible(false);
    });
  };

  const handleButtonPress = (btn: CustomAlertButton) => {
    handleClose();
    if (btn.onPress) {
      setTimeout(() => {
        btn.onPress?.();
      }, 200);
    }
  };

  if (!visible) return null;

  // Decide icon based on title or message keywords
  const combinedText = (title + ' ' + message).toLowerCase();
  let iconName: 'checkmark-circle' | 'close-circle' | 'alert-circle' | 'information-circle' = 'information-circle';
  let iconColor = Colors.accent.primary;
  
  if (combinedText.includes('success') || combinedText.includes('congratulations') || combinedText.includes('saved') || combinedText.includes('linked') || combinedText.includes('done') || combinedText.includes('complete')) {
    iconName = 'checkmark-circle';
    iconColor = '#4CAF50'; // green
  } else if (combinedText.includes('error') || combinedText.includes('failed') || combinedText.includes('denied') || combinedText.includes('violation') || combinedText.includes('invalid') || combinedText.includes('weak') || combinedText.includes('mismatch')) {
    iconName = 'close-circle';
    iconColor = '#F44336'; // red
  } else if (combinedText.includes('warning') || combinedText.includes('attention') || combinedText.includes('confirm') || combinedText.includes('delete') || combinedText.includes('logout') || combinedText.includes('remove')) {
    iconName = 'alert-circle';
    iconColor = '#FF9800'; // orange
  }

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
          <View style={[styles.iconContainer, { backgroundColor: iconColor + '15' }]}>
            <Ionicons name={iconName} size={36} color={iconColor} />
          </View>

          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={[styles.buttonContainer, buttons.length > 2 && styles.buttonContainerVertical]}>
            {buttons.map((btn, idx) => {
              const isDestructive = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';
              
              let btnBg = Colors.bg.tertiary;
              let textColor = Colors.text.secondary;
              
              if (isDestructive) {
                btnBg = '#F4433620';
                textColor = '#F44336';
              } else if (!isCancel) {
                btnBg = Colors.accent.primary;
                textColor = '#FFF';
              }

              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.button,
                    { backgroundColor: btnBg },
                    buttons.length > 2 && styles.buttonVertical,
                    buttons.length === 1 && { width: '100%' },
                    buttons.length === 2 && { flex: 1 }
                  ]}
                  activeOpacity={0.8}
                  onPress={() => handleButtonPress(btn)}
                >
                  <Text style={[styles.buttonText, { color: textColor }]}>
                    {btn.text || 'OK'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  iconContainer: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
    justifyContent: 'center',
  },
  buttonContainerVertical: {
    flexDirection: 'column',
    gap: 8,
  },
  button: {
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonVertical: {
    width: '100%',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
  },
});

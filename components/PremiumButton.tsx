import React from 'react';
import { TouchableOpacity, TouchableOpacityProps, StyleProp, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';

export interface PremiumButtonProps extends TouchableOpacityProps {
  hapticStyle?: Haptics.ImpactFeedbackStyle;
  children: React.ReactNode;
}

export function PremiumButton({
  hapticStyle = Haptics.ImpactFeedbackStyle.Light,
  onPress,
  children,
  ...props
}: PremiumButtonProps) {
  const handlePress = (e: any) => {
    Haptics.impactAsync(hapticStyle).catch(() => {});
    if (onPress) {
      onPress(e);
    }
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7} {...props}>
      {children}
    </TouchableOpacity>
  );
}

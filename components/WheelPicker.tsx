import React, { useRef, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/colors';

const ITEM_HEIGHT = 45;

interface WheelPickerProps {
  items: string[];
  selectedValue: string;
  onValueChange: (value: string) => void;
  width?: number;
  label?: string;
}

export default function WheelPicker({ items, selectedValue, onValueChange, width = 80, label }: WheelPickerProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const lastTickedIndex = useRef(-1);
  const internalIndex = useRef(items.indexOf(selectedValue));
  
  const paddedItems = ['', ...items, ''];
  const initialIndex = items.indexOf(selectedValue);

  useEffect(() => {
    if (scrollViewRef.current && initialIndex !== -1) {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          y: initialIndex * ITEM_HEIGHT,
          animated: false,
        });
        lastTickedIndex.current = initialIndex;
        internalIndex.current = initialIndex;
      }, 100);
    }
  }, [initialIndex]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    const index = Math.round(y / ITEM_HEIGHT);
    const validIndex = Math.max(0, Math.min(index, items.length - 1));
    
    if (validIndex !== lastTickedIndex.current && validIndex >= 0) {
      lastTickedIndex.current = validIndex;
      internalIndex.current = validIndex;
      // Fire the native hardware tick
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleScrollEnd = () => {
    const value = items[internalIndex.current];
    if (value !== selectedValue) {
      onValueChange(value);
    }
  };

  return (
    <View style={[styles.container, { width }]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.pickerContainer}>
        <View style={styles.selectionIndicator} />
        
        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="normal"
          onScroll={handleScroll}
          onMomentumScrollEnd={handleScrollEnd}
          onScrollEndDrag={handleScrollEnd}
          scrollEventThrottle={16}
          contentContainerStyle={styles.listContent}
        >
          {paddedItems.map((item, index) => {
            const isSelected = item === selectedValue;
            return (
              <View key={`${item}-${index}`} style={[styles.itemContainer, { width, height: ITEM_HEIGHT }]}>
                <Text style={[styles.itemText, isSelected && styles.selectedItemText]}>
                  {item}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginHorizontal: 5,
  },
  label: {
    fontSize: 12,
    color: Colors.text.tertiary,
    marginBottom: 8,
    fontFamily: 'Outfit_500Medium',
  },
  pickerContainer: {
    height: ITEM_HEIGHT * 3, // Shows 3 items at a time
    overflow: 'hidden',
    position: 'relative',
  },
  listContent: {
    paddingVertical: 0,
  },
  itemContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    fontSize: 22,
    color: Colors.text.secondary,
    fontFamily: 'Outfit_500Medium',
  },
  selectedItemText: {
    color: Colors.text.primary,
    fontFamily: 'Outfit_700Bold',
    fontSize: 24,
  },
  selectionIndicator: {
    position: 'absolute',
    top: ITEM_HEIGHT,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    zIndex: -1,
    borderRadius: 8,
  },
});

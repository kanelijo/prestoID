import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import WheelPicker from './WheelPicker';
import { Colors } from '@/constants/colors';

interface DobPickerProps {
  visible: boolean;
  onClose: () => void;
  currentDob: string;
  onSave: (dob: string) => void;
}

const DAYS = Array.from({ length: 31 }, (_, i) => (i + 1).toString().padStart(2, '0'));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 100 }, (_, i) => (currentYear - i).toString());

export default function DobPickerBottomSheet({ visible, onClose, currentDob, onSave }: DobPickerProps) {
  const [day, setDay] = useState('15');
  const [month, setMonth] = useState('Jun');
  const [year, setYear] = useState('2005');

  useEffect(() => {
    if (visible && currentDob) {
      const parts = currentDob.split(' ');
      if (parts.length === 3) {
        setDay(parts[0].padStart(2, '0'));
        setMonth(parts[1]);
        setYear(parts[2]);
      }
    }
  }, [visible, currentDob]);

  const handleSave = () => {
    onSave(`${day} ${month} ${year}`);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        
        <View style={styles.sheetContainer}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Date of Birth</Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.pickerRow}>
            <WheelPicker items={DAYS} selectedValue={day} onValueChange={setDay} label="Day" width={80} />
            <WheelPicker items={MONTHS} selectedValue={month} onValueChange={setMonth} label="Month" width={90} />
            <WheelPicker items={YEARS} selectedValue={year} onValueChange={setYear} label="Year" width={90} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: Colors.bg.secondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.bg.tertiary,
  },
  cancelText: {
    color: Colors.text.tertiary,
    fontSize: 16,
    fontFamily: 'Outfit_500Medium',
  },
  title: {
    color: Colors.text.primary,
    fontSize: 18,
    fontFamily: 'Outfit_600SemiBold',
  },
  saveText: {
    color: Colors.accent.primary,
    fontSize: 16,
    fontFamily: 'Outfit_600SemiBold',
  },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
  },
});

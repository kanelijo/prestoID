import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import WheelPicker from './WheelPicker';
import { Colors } from '@/constants/colors';

interface DateTimePickerProps {
  visible: boolean;
  onClose: () => void;
  currentDate: Date | null;
  onSave: (date: Date) => void;
  title?: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HOURS = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));
const AMPM = ['AM', 'PM'];

export default function DateTimePickerBottomSheet({ visible, onClose, currentDate, onSave, title = "Select Date & Time" }: DateTimePickerProps) {
  const currentYear = new Date().getFullYear();
  const YEARS = Array.from({ length: 10 }, (_, i) => (currentYear + i).toString());

  const [day, setDay] = useState('01');
  const [month, setMonth] = useState('Jan');
  const [year, setYear] = useState(currentYear.toString());
  const [hour, setHour] = useState('12');
  const [minute, setMinute] = useState('00');
  const [ampm, setAmpm] = useState('AM');

  // Dynamically compute days in month
  const mIndex = MONTHS.indexOf(month);
  const daysInMonth = new Date(parseInt(year), mIndex + 1, 0).getDate();
  const DAYS = Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString().padStart(2, '0'));

  useEffect(() => {
    if (visible) {
      const d = currentDate || new Date();
      setDay(d.getDate().toString().padStart(2, '0'));
      setMonth(MONTHS[d.getMonth()]);
      setYear(d.getFullYear().toString());
      
      let h = d.getHours();
      const isPm = h >= 12;
      if (h === 0) h = 12;
      else if (h > 12) h -= 12;
      
      setHour(h.toString().padStart(2, '0'));
      setMinute(d.getMinutes().toString().padStart(2, '0'));
      setAmpm(isPm ? 'PM' : 'AM');
    }
  }, [visible, currentDate]);

  const handleSave = () => {
    let h24 = parseInt(hour);
    if (ampm === 'PM' && h24 !== 12) h24 += 12;
    if (ampm === 'AM' && h24 === 12) h24 = 0;

    const d = new Date(
      parseInt(year), 
      MONTHS.indexOf(month), 
      parseInt(day), 
      h24, 
      parseInt(minute)
    );
    onSave(d);
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
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.pickerRow}>
            {/* Date Segment */}
            <WheelPicker items={DAYS} selectedValue={day} onValueChange={setDay} label="Day" width={60} />
            <WheelPicker items={MONTHS} selectedValue={month} onValueChange={setMonth} label="Month" width={70} />
            <WheelPicker items={YEARS} selectedValue={year} onValueChange={setYear} label="Year" width={70} />
            
            <View style={styles.divider} />

            {/* Time Segment */}
            <WheelPicker items={HOURS} selectedValue={hour} onValueChange={setHour} label="Hr" width={40} />
            <Text style={{ fontSize: 24, fontWeight: 'bold', alignSelf: 'center', marginTop: 15, marginHorizontal: 2 }}>:</Text>
            <WheelPicker items={MINUTES} selectedValue={minute} onValueChange={setMinute} label="Min" width={45} />
            <WheelPicker items={AMPM} selectedValue={ampm} onValueChange={setAmpm} label="" width={45} />
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
  },
  title: {
    color: Colors.text.primary,
    fontSize: 18,
    fontWeight: '600',
  },
  saveText: {
    color: Colors.accent.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 30,
    paddingHorizontal: 10,
  },
  divider: {
    width: 1,
    backgroundColor: '#E5E5E5',
    marginHorizontal: 10,
    height: '80%',
    alignSelf: 'center',
  }
});

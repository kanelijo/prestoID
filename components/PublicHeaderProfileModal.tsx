import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Gradients, Shadows } from '@/constants/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

interface PublicHeaderProfileModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const CATEGORIES = [
  'Government Exams',
  'Central Entrance Exams',
  'Engineering (JEE/GATE)',
  'Medical (NEET)',
  'School Boards',
];

const TARGET_EXAMS: Record<string, string[]> = {
  'Government Exams': ['MPPSC', 'MP ESB Patwari', 'MP Police SI', 'SSC CGL', 'Banking PO', 'UPSC CSE'],
  'Central Entrance Exams': ['CUET UG', 'CUET PG', 'IPMAT'],
  'Engineering (JEE/GATE)': ['JEE Main', 'JEE Advanced', 'GATE', 'MP PET'],
  'Medical (NEET)': ['NEET UG', 'AIIMS', 'NEET PG'],
  'School Boards': ['MP Board 12th', 'CBSE 12th', 'MP Board 10th', 'CBSE 10th'],
};

export default function PublicHeaderProfileModal({
  visible,
  onClose,
  onSaved,
}: PublicHeaderProfileModalProps) {
  const { user } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);

  const [fullName, setFullName] = useState('');
  const [mobileNum, setMobileNum] = useState('');
  const [address, setAddress] = useState('');
  const [pastSchool, setPastSchool] = useState('');
  const [pursuingCollege, setPursuingCollege] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Government Exams');
  const [selectedTargetExam, setSelectedTargetExam] = useState('MPPSC');

  useEffect(() => {
    if (visible && user?.id) {
      loadProfileData();
    }
  }, [visible, user?.id]);

  const loadProfileData = async () => {
    try {
      setIsLoading(true);
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user?.id)
        .single();

      if (profile) {
        setFullName(profile.full_name || profile.name || '');
        setMobileNum(profile.phone || '');
        setAddress(profile.address || '');
        setSelectedCategory(profile.category_type || 'Government Exams');
        setSelectedTargetExam(profile.target_exam || 'MPPSC');

        const acad = profile.academic_info || {};
        setPastSchool(acad.past_school || '');
        setPursuingCollege(acad.pursuing_college || '');
      }
    } catch (e) {
      console.warn('Failed to load profile', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;
    try {
      setIsLoading(true);

      const academicData = {
        past_school: pastSchool,
        pursuing_college: pursuingCollege,
      };

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          name: fullName,
          phone: mobileNum,
          address,
          category_type: selectedCategory,
          target_exam: selectedTargetExam,
          academic_info: academicData,
        })
        .eq('id', user.id);

      if (error) throw error;

      Alert.alert('Saved! 🎉', 'Your profile details have been updated successfully.');
      if (onSaved) onSaved();
      onClose();
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'Could not update profile.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.container}
        >
          <View style={styles.sheet}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <LinearGradient colors={Gradients.primary as [string, string]} style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>
                    {fullName ? fullName.charAt(0).toUpperCase() : 'S'}
                  </Text>
                </LinearGradient>
                <View>
                  <Text style={styles.title}>Edit Student Profile</Text>
                  <Text style={styles.subtitle}>Personal & Academic Details</Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.text.tertiary} />
              </TouchableOpacity>
            </View>

            {isLoading && !fullName ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color={Colors.accent.primary} />
              </View>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.scrollBody}
              >
                {/* Personal Information */}
                <Text style={styles.sectionHeading}>👤 Personal Details</Text>

                <View style={styles.inputBox}>
                  <Text style={styles.inputLabel}>Full Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your name"
                    placeholderTextColor={Colors.text.tertiary}
                    value={fullName}
                    onChangeText={setFullName}
                  />
                </View>

                <View style={styles.inputBox}>
                  <Text style={styles.inputLabel}>Mobile Number</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="+91 XXXXX XXXXX"
                    placeholderTextColor={Colors.text.tertiary}
                    value={mobileNum}
                    onChangeText={setMobileNum}
                    keyboardType="phone-pad"
                  />
                </View>

                <View style={styles.inputBox}>
                  <Text style={styles.inputLabel}>City & Address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Gwalior, Madhya Pradesh"
                    placeholderTextColor={Colors.text.tertiary}
                    value={address}
                    onChangeText={setAddress}
                  />
                </View>

                {/* Academic History */}
                <Text style={styles.sectionHeading}>🎓 Academic Background</Text>

                <View style={styles.inputBox}>
                  <Text style={styles.inputLabel}>Past School / High School</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. St. Paul School"
                    placeholderTextColor={Colors.text.tertiary}
                    value={pastSchool}
                    onChangeText={setPastSchool}
                  />
                </View>

                <View style={styles.inputBox}>
                  <Text style={styles.inputLabel}>Pursuing College / Institution</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. MITS Gwalior / Jiwaji University"
                    placeholderTextColor={Colors.text.tertiary}
                    value={pursuingCollege}
                    onChangeText={setPursuingCollege}
                  />
                </View>

                {/* Exam Category Selector */}
                <Text style={styles.sectionHeading}>🎯 Exam Goal & Category</Text>

                <Text style={styles.subLabel}>Select Exam Domain:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.chip, selectedCategory === cat && styles.chipActive]}
                      onPress={() => {
                        setSelectedCategory(cat);
                        const exams = TARGET_EXAMS[cat] || [];
                        if (exams.length > 0) setSelectedTargetExam(exams[0]);
                      }}
                    >
                      <Text style={[styles.chipText, selectedCategory === cat && styles.chipTextActive]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={[styles.subLabel, { marginTop: 12 }]}>Target Exam:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {(TARGET_EXAMS[selectedCategory] || []).map((ex) => (
                    <TouchableOpacity
                      key={ex}
                      style={[styles.examChip, selectedTargetExam === ex && styles.examChipActive]}
                      onPress={() => setSelectedTargetExam(ex)}
                    >
                      <Text
                        style={[
                          styles.examChipText,
                          selectedTargetExam === ex && styles.examChipTextActive,
                        ]}
                      >
                        {ex}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Save Button */}
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleSave}
                  disabled={isLoading}
                  activeOpacity={0.8}
                >
                  <LinearGradient colors={Gradients.primary as [string, string]} style={styles.saveBtnGradient}>
                    {isLoading ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.saveBtnText}>Save Profile Details</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  container: {
    maxHeight: '90%',
  },
  sheet: {
    backgroundColor: '#12121E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text.primary,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.text.tertiary,
  },
  closeBtn: {
    padding: 6,
  },
  loadingBox: {
    paddingVertical: 50,
    alignItems: 'center',
  },
  scrollBody: {
    paddingBottom: 20,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.accent.primary,
    marginTop: 14,
    marginBottom: 10,
  },
  inputBox: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#1E1E2E',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.text.primary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  subLabel: {
    fontSize: 12,
    color: Colors.text.tertiary,
    marginBottom: 6,
  },
  chipScroll: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  chip: {
    backgroundColor: '#1E1E2E',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  chipActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  chipText: {
    color: Colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFF',
  },
  examChip: {
    backgroundColor: '#252538',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  examChipActive: {
    borderColor: Colors.accent.primary,
    backgroundColor: 'rgba(175,40,0,0.2)',
  },
  examChipText: {
    color: Colors.text.tertiary,
    fontSize: 12,
  },
  examChipTextActive: {
    color: Colors.accent.primary,
    fontWeight: 'bold',
  },
  saveBtn: {
    marginTop: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  saveBtnGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
});

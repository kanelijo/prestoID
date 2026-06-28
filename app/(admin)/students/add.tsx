import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Gradients, Shadows } from '@/constants/colors';
import { BATCHES_DEFAULT, APP_CONFIG } from '@/constants/config';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

export default function AddStudentScreen() {
  const router = useRouter();
  const { user, session, businessId, businessCode, businessName, businessType } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [generatedDetails, setGeneratedDetails] = useState<{ studentName: string; enrollId: string; secretCode: string } | null>(null);

  const [form, setForm] = useState({
    name: '',
    fatherName: '',
    studentPhone: '',
    parentPhone: '',
    email: '',
    batch: '',
    feeAmount: '',
    feeCycle: 'monthly',
    feeDueDate: '15',
    aadhaarNumber: '',
    course: '',
    duration: '1 Year',
    address: '',
    validityPeriod: '1 Year',
  });



  const updateForm = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.fatherName.trim() || !form.studentPhone.trim() || !form.parentPhone.trim() || !form.batch || !form.feeAmount || !form.aadhaarNumber.trim()) {
      Alert.alert('Missing Fields', 'Please fill all required fields, including Aadhaar Number');
      return;
    }
    if (form.studentPhone.length !== 10 || form.parentPhone.length !== 10) {
      Alert.alert('Invalid Phone', 'Phone numbers must be exactly 10 digits');
      return;
    }
    if (form.studentPhone.trim() === form.parentPhone.trim()) {
      Alert.alert('Invalid Phone', 'Student phone number and Parent/Father phone number must be different');
      return;
    }
    if (form.aadhaarNumber.trim().length !== 12 || isNaN(Number(form.aadhaarNumber.trim()))) {
      Alert.alert('Invalid Aadhaar', 'Aadhaar number must be exactly 12 digits');
      return;
    }

    if (form.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(form.email.trim())) {
        Alert.alert('Invalid Email', 'Please enter a valid email address');
        return;
      }
      if (!form.email.trim().toLowerCase().endsWith('@gmail.com')) {
        Alert.alert('Email Format', 'Email must be a valid @gmail.com address');
        return;
      }
    }

    if (!businessId || !businessCode) {
      Alert.alert('Wait', 'Organization details are not loaded yet. Please try again.');
      return;
    }

    setIsSubmitting(true);
    try {
      let finalPhotoUrl = null;
      if (photo) {
        const fileExt = photo.split('.').pop() || 'jpg';
        const fileName = `student-${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const token = session?.access_token || APP_CONFIG.supabaseAnonKey;
        const uploadResult = await FileSystem.uploadAsync(
          `${APP_CONFIG.supabaseUrl}/storage/v1/object/avatars/${filePath}`,
          photo,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: APP_CONFIG.supabaseAnonKey,
              'Content-Type': `image/${fileExt === 'png' ? 'png' : 'jpeg'}`,
            },
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          }
        );

        if (uploadResult.status >= 200 && uploadResult.status < 300) {
          const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);
          finalPhotoUrl = publicUrl;
        } else {
          console.warn('Failed to upload student avatar:', uploadResult.status, uploadResult.body);
        }
      }

      // Get current student count for the business to generate sequential ID
      const { count, error: countError } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId);

      if (countError) throw countError;

      const nextNum = (count || 0) + 1;
      const formattedNum = nextNum.toString().padStart(3, '0');
      const enrollId = `${businessCode}${formattedNum}`; // e.g. UCI001

      // Generate a 6-character alphanumeric secret code
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded confusing chars like I, O, 1, 0
      let secretCode = '';
      for (let i = 0; i < 6; i++) {
        secretCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      // Calculate MM/YY for valid_from and valid_till
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = String(now.getFullYear()).slice(-2);
      const validFrom = `${month}/${year}`;

      let tillDate = new Date();
      if (form.validityPeriod === '6 Months') {
        tillDate.setMonth(tillDate.getMonth() + 6);
      } else if (form.validityPeriod === '2 Years') {
        tillDate.setFullYear(tillDate.getFullYear() + 2);
      } else {
        tillDate.setFullYear(tillDate.getFullYear() + 1);
      }
      const tillMonth = String(tillDate.getMonth() + 1).padStart(2, '0');
      const tillYear = String(tillDate.getFullYear()).slice(-2);
      const validTill = `${tillMonth}/${tillYear}`;

      const { error } = await supabase
        .from('students')
        .insert({
          name: form.name.trim(),
          father_name: form.fatherName.trim(),
          phone: form.studentPhone.trim(),
          parent_phone: form.parentPhone.trim(),
          email: form.email.trim() || null,
          batch_name: form.batch,
          fee_amount: Number(form.feeAmount),
          fee_cycle: form.feeCycle,
          photo_url: finalPhotoUrl,
          enrollment_id: enrollId,
          fee_status: 'unpaid',
          business_id: businessId,
          aadhaar_number: form.aadhaarNumber.trim() || null,
          secret_code: secretCode,
          course: form.course.trim() || null,
          duration: form.duration,
          address: form.address.trim() || null,
          valid_from: validFrom,
          valid_till: validTill,
        });

      if (error) throw error;

      setGeneratedDetails({
        studentName: form.name.trim(),
        enrollId: enrollId,
        secretCode: secretCode,
      });
      setShowSuccessModal(true);
    } catch (error: any) {
      Alert.alert('Registration Failed', error.message || 'Failed to add student. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={20} color={Colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Student</Text>
        </View>

        {/* Photo */}
        <View style={styles.photoSection}>
          <TouchableOpacity onPress={pickImage} activeOpacity={0.8}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.photoPreview} />
            ) : (
              <LinearGradient colors={Gradients.primary as [string, string]} style={styles.photoPlaceholder}>
                <Ionicons name="camera-outline" size={28} color="#FFFFFF" />
                <Text style={styles.photoPlaceholderText}>Add Photo</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
          <View style={styles.photoButtons}>
            <TouchableOpacity style={styles.photoBtn} onPress={takePhoto}>
              <View style={styles.btnInner}>
                <Ionicons name="camera-outline" size={14} color={Colors.text.secondary} style={{ marginRight: 4 }} />
                <Text style={styles.photoBtnText}>Camera</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoBtn} onPress={pickImage}>
              <View style={styles.btnInner}>
                <Ionicons name="image-outline" size={14} color={Colors.text.secondary} style={{ marginRight: 4 }} />
                <Text style={styles.photoBtnText}>Gallery</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Form Fields */}
        <View style={styles.form}>
          <InputField
            label="Full Name *"
            placeholder="Student's full name"
            value={form.name}
            onChangeText={(v) => updateForm('name', v)}
          />
          <InputField
            label="Father's Name *"
            placeholder="Father's name"
            value={form.fatherName}
            onChangeText={(v) => updateForm('fatherName', v)}
          />
          <InputField
            label="Student Phone *"
            placeholder="10 digit number"
            value={form.studentPhone}
            onChangeText={(v) => updateForm('studentPhone', v.replace(/[^0-9]/g, '').slice(0, 10))}
            keyboardType="phone-pad"
          />
          <InputField
            label="Parent Phone (WhatsApp) *"
            placeholder="For notifications"
            value={form.parentPhone}
            onChangeText={(v) => updateForm('parentPhone', v.replace(/[^0-9]/g, '').slice(0, 10))}
            keyboardType="phone-pad"
          />
          <InputField
            label="Address"
            placeholder="Residential address (optional)"
            value={form.address}
            onChangeText={(v) => updateForm('address', v)}
          />
          <InputField
            label="Email"
            placeholder="student@email.com (optional)"
            value={form.email}
            onChangeText={(v) => updateForm('email', v)}
            keyboardType="email-address"
          />
          <InputField
            label="Aadhaar Number *"
            placeholder="12 digit Aadhaar number"
            value={form.aadhaarNumber}
            onChangeText={(v) => updateForm('aadhaarNumber', v.replace(/[^0-9]/g, '').slice(0, 12))}
            keyboardType="number-pad"
          />

          {/* Duration Selector */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Course Duration</Text>
            <View style={styles.dueDateRow}>
              {['6 Months', '1 Year', '2 Years'].map((dur) => (
                <TouchableOpacity
                  key={dur}
                  style={[styles.dueDateOption, form.duration === dur && styles.dueDateOptionActive]}
                  onPress={() => updateForm('duration', dur)}
                >
                  <Text style={[styles.dueDateText, form.duration === dur && styles.dueDateTextActive]}>
                    {dur}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Batch Selector */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Batch *</Text>
            <View style={styles.batchGrid}>
              {BATCHES_DEFAULT.map((batch) => (
                <TouchableOpacity
                  key={batch}
                  style={[styles.batchOption, form.batch === batch && styles.batchOptionActive]}
                  onPress={() => updateForm('batch', batch)}
                >
                  <Text
                    style={[styles.batchOptionText, form.batch === batch && styles.batchOptionTextActive]}
                  >
                    {batch}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <InputField
            label="Fee Amount (₹) *"
            placeholder="e.g. 2500"
            value={form.feeAmount}
            onChangeText={(v) => updateForm('feeAmount', v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
          />

          {/* Fee Payment Cycle Selector */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Fee Payment Cycle *</Text>
            <View style={styles.dueDateRow}>
              {['monthly', 'yearly', 'one time'].map((cycle) => (
                <TouchableOpacity
                  key={cycle}
                  style={[styles.dueDateOption, form.feeCycle === cycle && styles.dueDateOptionActive]}
                  onPress={() => updateForm('feeCycle', cycle)}
                >
                  <Text style={[styles.dueDateText, form.feeCycle === cycle && styles.dueDateTextActive]}>
                    {cycle === 'monthly' ? 'Monthly' : cycle === 'yearly' ? 'Yearly' : 'One Time'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Validity Period Selector */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Valid Till (Period) *</Text>
            <View style={styles.dueDateRow}>
              {['6 Months', '1 Year', '2 Years'].map((period) => (
                <TouchableOpacity
                  key={period}
                  style={[styles.dueDateOption, form.validityPeriod === period && styles.dueDateOptionActive]}
                  onPress={() => updateForm('validityPeriod', period)}
                >
                  <Text style={[styles.dueDateText, form.validityPeriod === period && styles.dueDateTextActive]}>
                    {period}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Fee Due Date */}
          {form.feeCycle !== 'yearly' && form.feeCycle !== 'one time' && (
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Fee Due Date</Text>
              <View style={styles.dueDateRow}>
                {['1', '15', '28'].map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.dueDateOption, form.feeDueDate === d && styles.dueDateOptionActive]}
                    onPress={() => updateForm('feeDueDate', d)}
                  >
                    <Text style={[styles.dueDateText, form.feeDueDate === d && styles.dueDateTextActive]}>
                      {d === '28' ? 'Last Day' : `${d}th`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Submit */}
        <TouchableOpacity onPress={handleSubmit} disabled={isSubmitting} activeOpacity={0.85}>
          <LinearGradient
            colors={Gradients.primary as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.submitButton, isSubmitting && { opacity: 0.7 }]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitButtonText}>Add Student & Generate ID</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Success Modal */}
        <Modal
          visible={showSuccessModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {
            setShowSuccessModal(false);
            router.back();
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.successHeader}>
                <View style={styles.successIconCircle}>
                  <Ionicons name="checkmark" size={32} color="#FFFFFF" />
                </View>
                <Text style={styles.successTitle}>Student Registered!</Text>
                <Text style={styles.successSubtitle}>
                  {generatedDetails?.studentName} has been successfully registered.
                </Text>
              </View>

              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Enrollment ID</Text>
                  <Text style={styles.infoValue}>{generatedDetails?.enrollId}</Text>
                </View>
                <View style={styles.infoDivider} />
                
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Organization ID</Text>
                  <Text style={styles.infoValue}>{businessCode}</Text>
                </View>
                <View style={styles.infoDivider} />

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Secret Passcode</Text>
                  <Text style={[styles.infoValue, styles.highlightCode]}>
                    {generatedDetails?.secretCode}
                  </Text>
                </View>
              </View>

              <Text style={styles.instructionsText}>
                Share these credentials with the student/parent so they can claim their Virtual ID Card.
              </Text>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.shareButton}
                  activeOpacity={0.8}
                  onPress={() => {
                    if (!generatedDetails || !businessId) return;
                    const shareText = `Dear parent/student, *${generatedDetails.studentName}* has been registered at *${businessName}*.\n\nPlease download the PrestoID app and claim your digital card.\n\n🔑 *Organization ID*: ${businessCode}\n🔐 *Secret Code*: ${generatedDetails.secretCode}\n\nUse these details to access your Virtual ID Card and tracking dashboard.`;
                    const url = `https://wa.me/91${form.parentPhone}?text=${encodeURIComponent(shareText)}`;
                    Linking.openURL(url);
                  }}
                >
                  <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.shareButtonText}>Share via WhatsApp</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.closeButton}
                  activeOpacity={0.8}
                  onPress={() => {
                    setShowSuccessModal(false);
                    router.back();
                  }}
                >
                  <Text style={styles.closeButtonText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

// Reusable Input Field Component
function InputField({
  label,
  placeholder,
  value,
  onChangeText,
  keyboardType = 'default',
  secureTextEntry = false,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: any;
  secureTextEntry?: boolean;
}) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        placeholder={placeholder}
        placeholderTextColor={Colors.text.tertiary}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  scrollContent: {
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.bg.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  photoSection: {
    alignItems: 'center',
    marginBottom: 24,
    gap: 12,
  },
  photoPreview: {
    width: 90,
    height: 110,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.accent.primary,
  },
  photoPlaceholder: {
    width: 90,
    height: 110,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  photoPlaceholderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  photoButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  photoBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  btnInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  photoBtnText: {
    fontSize: 12,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  form: {
    gap: 14,
    marginBottom: 28,
  },
  fieldContainer: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  fieldInput: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.card.border,
    paddingHorizontal: 16,
    height: 48,
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  batchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  batchOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  batchOptionActive: {
    backgroundColor: Colors.accent.primary + '10',
    borderColor: Colors.accent.primary + '30',
  },
  batchOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  batchOptionTextActive: {
    color: Colors.accent.primary,
  },
  dueDateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dueDateOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.card.border,
    alignItems: 'center',
  },
  dueDateOptionActive: {
    backgroundColor: Colors.accent.primary + '10',
    borderColor: Colors.accent.primary + '30',
  },
  dueDateText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  dueDateTextActive: {
    color: Colors.accent.primary,
  },
  submitButton: {
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: Colors.bg.secondary,
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.card.border,
    alignItems: 'center',
    ...Shadows.md,
  },
  successHeader: {
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  successIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#34C759', // Success green
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text.primary,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 13,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  infoCard: {
    backgroundColor: Colors.bg.primary,
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.card.border,
    padding: 16,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  highlightCode: {
    color: Colors.accent.primary,
    fontSize: 16,
    letterSpacing: 1,
  },
  infoDivider: {
    height: 1,
    backgroundColor: Colors.card.border,
    marginVertical: 10,
  },
  instructionsText: {
    fontSize: 12,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  modalActions: {
    width: '100%',
    gap: 10,
  },
  shareButton: {
    height: 48,
    backgroundColor: '#25D366', // WhatsApp green
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  closeButton: {
    height: 44,
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  closeButtonText: {
    color: Colors.text.secondary,
    fontSize: 14,
    fontWeight: '600',
  },
});

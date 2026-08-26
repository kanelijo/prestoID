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
  KeyboardAvoidingView,
  Platform,
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

type MonthlyFeeItem = {
  monthKey: string;
  label: string;
  amount: string;
};

export default function AddStudentScreen() {
  const router = useRouter();
  const { user, session, businessId, businessCode, businessName, businessType } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);

  // Success Modal State
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [generatedDetails, setGeneratedDetails] = useState<{ studentName: string; enrollId: string; secretCode: string } | null>(null);

  // Dynamic Batches State
  const [batches, setBatches] = useState<string[]>([]);

  useEffect(() => {
    const loadBatches = async () => {
      if (!businessId) {
        setBatches(BATCHES_DEFAULT);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('batches')
          .select('name')
          .eq('business_id', businessId)
          .order('name');
        if (!error && data && data.length > 0) {
          setBatches(data.map((b) => b.name));
        } else {
          setBatches(BATCHES_DEFAULT);
        }
      } catch (_) {
        setBatches(BATCHES_DEFAULT);
      }
    };
    loadBatches();
  }, [businessId]);

  // Fee Payment Status Modal State
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [initialPaymentChoice, setInitialPaymentChoice] = useState<'paid' | 'unpaid'>('paid');
  const [selectedPaidMonthKeys, setSelectedPaidMonthKeys] = useState<string[]>([]);

  // Main Form State
  const [form, setForm] = useState({
    name: '',
    fatherName: '',
    studentPhone: '',
    parentPhone: '',
    email: '',
    batch: '',
    feeAmount: '', // Single fee amount for One-Time
    defaultMonthlyAmount: '', // Quick pre-fill for Monthly
    feeCycle: 'monthly', // 'monthly' | 'one time'
    feeDueDate: '15', // '1' | '15' | '28'
    aadhaarNumber: '',
    course: '',
    duration: '1 Year',
    address: '',
    validityPeriod: '1 Year',
  });

  // Monthly EMI Breakdown State
  const [monthlyFees, setMonthlyFees] = useState<MonthlyFeeItem[]>([]);

  // Helper to generate months array based on duration
  const generateMonths = (durationStr: string, fillAmount: string = '') => {
    const now = new Date();
    let monthCount = 12;
    if (durationStr === '6 Months') monthCount = 6;
    else if (durationStr === '2 Years') monthCount = 24;

    const list: MonthlyFeeItem[] = [];
    for (let i = 0; i < monthCount; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthLabel = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      list.push({
        monthKey,
        label: monthLabel,
        amount: fillAmount,
      });
    }
    return list;
  };

  // Initialize & update monthly breakdown list when duration or cycle changes
  useEffect(() => {
    if (form.feeCycle === 'monthly') {
      const newList = generateMonths(form.duration, form.defaultMonthlyAmount);
      setMonthlyFees(newList);
      // Pre-select first month for payment modal by default
      if (newList.length > 0) {
        setSelectedPaidMonthKeys([newList[0].monthKey]);
      }
    }
  }, [form.duration, form.feeCycle]);

  // Update a single form field
  const updateForm = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Handle Quick Pre-Fill Default Monthly Amount
  const handleDefaultMonthlyAmountChange = (value: string) => {
    const clean = value.replace(/[^0-9]/g, '');
    updateForm('defaultMonthlyAmount', clean);
    setMonthlyFees((prev) =>
      prev.map((item) => ({
        ...item,
        amount: clean,
      }))
    );
  };

  // Handle editing an individual month's fee amount
  const handleIndividualMonthFeeChange = (index: number, value: string) => {
    const clean = value.replace(/[^0-9]/g, '');
    setMonthlyFees((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], amount: clean };
      return copy;
    });
  };

  // Calculate Total Fee Amount (Monthly sum vs One Time)
  const calculatedTotalFee = form.feeCycle === 'monthly'
    ? monthlyFees.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    : Number(form.feeAmount) || 0;

  // Image Picker Handlers
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

  // Step 1: Handle initial form validation & show Fee Status Modal
  const handleFormSubmit = () => {
    if (!form.name.trim() || !form.fatherName.trim() || !form.studentPhone.trim() || !form.parentPhone.trim() || !form.batch || !form.aadhaarNumber.trim()) {
      Alert.alert('Missing Fields', 'Please fill all required fields, including Aadhaar Number');
      return;
    }

    if (form.feeCycle === 'one time' && !form.feeAmount.trim()) {
      Alert.alert('Missing Fee', 'Please enter the total fee amount for One-Time payment');
      return;
    }

    if (form.feeCycle === 'monthly' && calculatedTotalFee === 0) {
      Alert.alert('Missing Fee', 'Please enter monthly fee amounts for the student');
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

    // Open Fee Payment Status Popup Modal
    setShowFeeModal(true);
  };

  // Toggle paid month selection in fee confirmation modal
  const togglePaidMonthKey = (key: string) => {
    setSelectedPaidMonthKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // Step 2: Final Submit to Supabase after confirming fee status in popup
  const processStudentRegistration = async () => {
    setShowFeeModal(false);
    setIsSubmitting(true);

    try {
      let finalPhotoUrl = null;
      if (photo) {
        let fileExt = 'jpg';
        const cleanUri = photo.split('?')[0].split('#')[0];
        const parts = cleanUri.split('.');
        if (parts.length > 1) {
          const ext = parts.pop()?.toLowerCase() || 'jpg';
          if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
            fileExt = ext;
          }
        }
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
        }
      }

      // Generate sequential enrollment ID
      const { count, error: countError } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId);

      if (countError) throw countError;

      const nextNum = (count || 0) + 1;
      const formattedNum = nextNum.toString().padStart(3, '0');
      const enrollId = `${businessCode}${formattedNum}`; // e.g. UCI001

      // Generate 6-char secret passcode
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let secretCode = '';
      for (let i = 0; i < 6; i++) {
        secretCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      // Calculate MM/YY for valid_from and valid_till
      const now = new Date();
      const monthStr = String(now.getMonth() + 1).padStart(2, '0');
      const yearStr = String(now.getFullYear()).slice(-2);
      const validFrom = `${monthStr}/${yearStr}`;

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

      // Calculate next due date
      let nextDueDateStr: string | null = null;
      if (initialPaymentChoice === 'unpaid' || (form.feeCycle === 'monthly' && selectedPaidMonthKeys.length < monthlyFees.length)) {
        const dueDay = Number(form.feeDueDate) || 15;
        const targetDate = new Date();
        targetDate.setMonth(targetDate.getMonth() + (initialPaymentChoice === 'unpaid' ? 0 : 1));
        targetDate.setDate(Math.min(dueDay, 28));
        nextDueDateStr = targetDate.toISOString().split('T')[0];
      }

      // Determine final fee_status
      const finalFeeStatus = initialPaymentChoice === 'paid' ? 'paid' : 'unpaid';

      // Insert Student record into Supabase
      const { data: newStudent, error: insertErr } = await supabase
        .from('students')
        .insert({
          name: form.name.trim(),
          father_name: form.fatherName.trim(),
          phone: form.studentPhone.trim(),
          parent_phone: form.parentPhone.trim(),
          email: form.email.trim() || null,
          batch_name: form.batch,
          fee_amount: calculatedTotalFee,
          fee_cycle: form.feeCycle,
          photo_url: finalPhotoUrl,
          enrollment_id: enrollId,
          fee_status: finalFeeStatus,
          business_id: businessId,
          aadhaar_number: form.aadhaarNumber.trim() || null,
          secret_code: secretCode,
          course: form.course.trim() || null,
          duration: form.duration,
          address: form.address.trim() || null,
          valid_from: validFrom,
          valid_till: validTill,
          next_due_date: nextDueDateStr,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      // If fee was paid today, record entry in payments table
      if (initialPaymentChoice === 'paid' && newStudent?.id) {
        let initialPaidAmount = calculatedTotalFee;
        if (form.feeCycle === 'monthly') {
          initialPaidAmount = monthlyFees
            .filter((m) => selectedPaidMonthKeys.includes(m.monthKey))
            .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        }

        try {
          await supabase.from('payments').insert({
            business_id: businessId,
            student_id: newStudent.id,
            amount: initialPaidAmount,
            status: 'success',
            payment_date: new Date().toISOString(),
          });
        } catch (payErr) {
          console.warn('Initial payment record creation non-fatal error:', payErr);
        }
      }

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

  // Compute total initial paid amount for payment modal
  const initialPaidTotalInModal = form.feeCycle === 'one time'
    ? Number(form.feeAmount) || 0
    : monthlyFees
        .filter((m) => selectedPaidMonthKeys.includes(m.monthKey))
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

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

        {/* Photo Section */}
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

          {/* Course Duration Selector */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Course Duration *</Text>
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
              {batches.map((batch) => (
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

          {/* Fee Payment Cycle Selector */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Fee Payment Cycle *</Text>
            <View style={styles.dueDateRow}>
              {[
                { cycle: 'one time', label: 'One Time' },
                { cycle: 'monthly', label: 'Monthly (EMI)' },
              ].map(({ cycle, label }) => (
                <TouchableOpacity
                  key={cycle}
                  style={[styles.dueDateOption, form.feeCycle === cycle && styles.dueDateOptionActive]}
                  onPress={() => updateForm('feeCycle', cycle)}
                >
                  <Text style={[styles.dueDateText, form.feeCycle === cycle && styles.dueDateTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ONE TIME FEE AMOUNT INPUT */}
          {form.feeCycle === 'one time' && (
            <InputField
              label="Total Fee Amount (₹) *"
              placeholder="e.g. 25000"
              value={form.feeAmount}
              onChangeText={(v) => updateForm('feeAmount', v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
            />
          )}

          {/* MONTHLY FEE BREAKDOWN & DUE DATE (Removed for One Time) */}
          {form.feeCycle === 'monthly' && (
            <>
              {/* Fee Due Date Selector */}
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Fee Due Date (Every Month) *</Text>
                <View style={styles.dueDateRow}>
                  {['1', '5', '10', '15', '28'].map((d) => (
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

              {/* Monthly EMI Breakdown Section */}
              <View style={styles.emiCard}>
                <View style={styles.emiHeader}>
                  <Ionicons name="calendar-outline" size={20} color={Colors.accent.primary} />
                  <Text style={styles.emiTitle}>Monthly Fee Breakdown (EMI)</Text>
                </View>
                <Text style={styles.emiSubtitle}>
                  Set custom fee amounts for each month or use quick pre-fill below.
                </Text>

                {/* Quick Pre-fill Default Amount */}
                <View style={styles.quickFillContainer}>
                  <Text style={styles.quickFillLabel}>Quick Set Default Fee (₹):</Text>
                  <TextInput
                    style={styles.quickFillInput}
                    placeholder="e.g. 2000"
                    placeholderTextColor={Colors.text.tertiary}
                    value={form.defaultMonthlyAmount}
                    onChangeText={handleDefaultMonthlyAmountChange}
                    keyboardType="number-pad"
                  />
                </View>

                {/* Months Grid */}
                <View style={styles.monthsGrid}>
                  {monthlyFees.map((m, idx) => (
                    <View key={m.monthKey} style={styles.monthBox}>
                      <Text style={styles.monthBoxLabel} numberOfLines={1}>
                        {m.label}
                      </Text>
                      <View style={styles.monthInputWrapper}>
                        <Text style={styles.rupeeSymbol}>₹</Text>
                        <TextInput
                          style={styles.monthInput}
                          placeholder="0"
                          placeholderTextColor={Colors.text.tertiary}
                          value={m.amount}
                          onChangeText={(v) => handleIndividualMonthFeeChange(idx, v)}
                          keyboardType="number-pad"
                        />
                      </View>
                    </View>
                  ))}
                </View>

                {/* Total Fee Banner */}
                <View style={styles.totalFeeBanner}>
                  <Text style={styles.totalFeeLabel}>Calculated Total Course Fee:</Text>
                  <Text style={styles.totalFeeValue}>₹{calculatedTotalFee.toLocaleString('en-IN')}</Text>
                </View>
              </View>
            </>
          )}

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
        </View>

        {/* Submit Button */}
        <TouchableOpacity onPress={handleFormSubmit} disabled={isSubmitting} activeOpacity={0.85}>
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

        {/* STEP 1: FEE PAYMENT STATUS CONFIRMATION POPUP MODAL */}
        <Modal
          visible={showFeeModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowFeeModal(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowFeeModal(false)}
          >
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', alignItems: 'center' }}>
              <TouchableOpacity
                activeOpacity={1}
                onPress={(e) => e.stopPropagation?.()}
                style={styles.paymentModalContent}
              >
                <View style={styles.paymentModalHeader}>
                  <Ionicons name="card-outline" size={26} color={Colors.accent.primary} />
                  <Text style={styles.paymentModalTitle}>Confirm Fee Payment Status</Text>
                  <TouchableOpacity onPress={() => setShowFeeModal(false)} style={{ padding: 4 }}>
                    <Ionicons name="close" size={22} color={Colors.text.secondary} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.paymentModalSubtitle}>
                  Has <Text style={{ fontWeight: '700', color: Colors.text.primary }}>{form.name || 'the student'}</Text> paid the fee amount today?
                </Text>

                {/* Paid vs Unpaid Selector Tabs */}
                <View style={styles.statusToggleRow}>
                  <TouchableOpacity
                    style={[styles.statusToggleBtn, initialPaymentChoice === 'paid' && styles.statusToggleBtnPaid]}
                    onPress={() => setInitialPaymentChoice('paid')}
                  >
                    <Ionicons name="checkmark-circle" size={18} color={initialPaymentChoice === 'paid' ? '#FFF' : Colors.status.success} />
                    <Text style={[styles.statusToggleText, initialPaymentChoice === 'paid' && { color: '#FFF' }]}>
                      Yes, Paid Today
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.statusToggleBtn, initialPaymentChoice === 'unpaid' && styles.statusToggleBtnUnpaid]}
                    onPress={() => setInitialPaymentChoice('unpaid')}
                  >
                    <Ionicons name="alert-circle" size={18} color={initialPaymentChoice === 'unpaid' ? '#FFF' : Colors.status.danger} />
                    <Text style={[styles.statusToggleText, initialPaymentChoice === 'unpaid' && { color: '#FFF' }]}>
                      No, Unpaid (Send Reminders)
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* IF PAID SELECTED */}
                {initialPaymentChoice === 'paid' && (
                  <View style={styles.paidDetailsCard}>
                    <Text style={styles.paidDetailsTitle}>
                      Payment Type: {form.feeCycle === 'one time' ? 'One Time Full Fee' : 'Monthly Installments'}
                    </Text>

                    {form.feeCycle === 'one time' ? (
                      <View style={styles.oneTimePaidBox}>
                        <Text style={styles.oneTimePaidLabel}>Full Amount Paid Today:</Text>
                        <Text style={styles.oneTimePaidAmount}>₹{Number(form.feeAmount || 0).toLocaleString('en-IN')}</Text>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.selectMonthsLabel}>Select month(s) paid by student today:</Text>
                        <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                          <View style={styles.monthsCheckList}>
                            {monthlyFees.map((m) => {
                              const isChecked = selectedPaidMonthKeys.includes(m.monthKey);
                              return (
                                <TouchableOpacity
                                  key={m.monthKey}
                                  style={[styles.monthCheckItem, isChecked && styles.monthCheckItemActive]}
                                  onPress={() => togglePaidMonthKey(m.monthKey)}
                                >
                                  <Ionicons
                                    name={isChecked ? 'checkbox' : 'square-outline'}
                                    size={20}
                                    color={isChecked ? Colors.accent.primary : Colors.text.tertiary}
                                  />
                                  <Text style={[styles.monthCheckText, isChecked && styles.monthCheckTextActive]}>
                                    {m.label}
                                  </Text>
                                  <Text style={styles.monthCheckAmount}>₹{m.amount || '0'}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </ScrollView>

                        <View style={styles.totalReceivedRow}>
                          <Text style={styles.totalReceivedLabel}>Total Paid Today:</Text>
                          <Text style={styles.totalReceivedAmount}>₹{initialPaidTotalInModal.toLocaleString('en-IN')}</Text>
                        </View>
                      </>
                    )}
                  </View>
                )}

                {/* IF UNPAID SELECTED */}
                {initialPaymentChoice === 'unpaid' && (
                  <View style={styles.unpaidInfoBox}>
                    <Ionicons name="time-outline" size={20} color={Colors.status.warning} />
                    <Text style={styles.unpaidInfoText}>
                      Student will be marked <Text style={{ fontWeight: '700' }}>Unpaid</Text>. Payment reminders will be scheduled for the <Text style={{ fontWeight: '700' }}>{form.feeDueDate}th</Text> of every month.
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.confirmPaymentBtn, isSubmitting && { opacity: 0.7 }]}
                  onPress={processStudentRegistration}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.confirmPaymentBtnText}>
                      Confirm & Register Student
                    </Text>
                  )}
                </TouchableOpacity>
              </TouchableOpacity>
            </KeyboardAvoidingView>
          </TouchableOpacity>
        </Modal>

        {/* STEP 2: REGISTRATION SUCCESS CREDENTIALS MODAL */}
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
                  onPress={() => {
                    const message = `Welcome ${generatedDetails?.studentName} to ${businessName}!\n\nHere are your login credentials to claim your Virtual Student ID Card on Zenza App:\n\n📌 Organization Code: ${businessCode}\n🆔 Enrollment ID: ${generatedDetails?.enrollId}\n🔑 Secret Passcode: ${generatedDetails?.secretCode}\n\nDownload Zenza Student App & enter these details to access your account!`;
                    Linking.openURL(`whatsapp://send?phone=91${form.parentPhone}&text=${encodeURIComponent(message)}`);
                  }}
                >
                  <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.shareButtonText}>Share Credentials on WhatsApp</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.closeButton}
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

  // Monthly EMI Breakdown Card Styles
  emiCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.card.border,
    gap: 12,
    marginTop: 4,
    ...Shadows.sm,
  },
  emiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emiTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  emiSubtitle: {
    fontSize: 12,
    color: Colors.text.secondary,
    lineHeight: 16,
  },
  quickFillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bg.primary,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  quickFillLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  quickFillInput: {
    backgroundColor: Colors.bg.secondary,
    width: 100,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.card.border,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 14,
    color: Colors.accent.primary,
  },
  monthsGrid: {
    gap: 8,
  },
  monthBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bg.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  monthBoxLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
    flex: 1,
  },
  monthInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.card.border,
    paddingHorizontal: 8,
    height: 36,
  },
  rupeeSymbol: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.secondary,
    marginRight: 4,
  },
  monthInput: {
    width: 70,
    height: 36,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  totalFeeBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.accent.primary + '15',
    padding: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  totalFeeLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  totalFeeValue: {
    fontSize: 16,
    fontWeight: '800',
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

  // Payment Confirmation Modal Styles
  paymentModalContent: {
    backgroundColor: Colors.bg.secondary,
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.card.border,
    gap: 14,
    ...Shadows.md,
  },
  paymentModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paymentModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text.primary,
    flex: 1,
    marginLeft: 8,
  },
  paymentModalSubtitle: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  statusToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: Colors.bg.primary,
    borderWidth: 1.5,
    borderColor: Colors.card.border,
    gap: 6,
  },
  statusToggleBtnPaid: {
    backgroundColor: Colors.status.success,
    borderColor: Colors.status.success,
  },
  statusToggleBtnUnpaid: {
    backgroundColor: Colors.status.danger,
    borderColor: Colors.status.danger,
  },
  statusToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  paidDetailsCard: {
    backgroundColor: Colors.bg.primary,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.card.border,
    gap: 10,
  },
  paidDetailsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  oneTimePaidBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.status.success + '15',
    padding: 12,
    borderRadius: 10,
  },
  oneTimePaidLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  oneTimePaidAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.status.success,
  },
  selectMonthsLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  monthsCheckList: {
    gap: 6,
  },
  monthCheckItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.bg.secondary,
    gap: 8,
  },
  monthCheckItemActive: {
    backgroundColor: Colors.accent.primary + '10',
  },
  monthCheckText: {
    fontSize: 12,
    color: Colors.text.secondary,
    flex: 1,
  },
  monthCheckTextActive: {
    color: Colors.accent.primary,
    fontWeight: '700',
  },
  monthCheckAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  totalReceivedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.status.success + '15',
    padding: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  totalReceivedLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  totalReceivedAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.status.success,
  },
  unpaidInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.status.warning + '15',
    padding: 12,
    borderRadius: 12,
    gap: 10,
  },
  unpaidInfoText: {
    flex: 1,
    fontSize: 12,
    color: Colors.text.primary,
    lineHeight: 17,
  },
  confirmPaymentBtn: {
    height: 48,
    backgroundColor: Colors.accent.primary,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  confirmPaymentBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },

  // Credentials Success Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
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
    backgroundColor: '#34C759',
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
    backgroundColor: '#25D366',
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

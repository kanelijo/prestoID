import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors, Gradients, Shadows } from '@/constants/colors';
import { APP_CONFIG } from '@/constants/config';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

type ServiceType = 'Coaching' | 'Library' | 'School' | 'College' | 'Hostel';

export default function CreateInstituteScreen() {
  const router = useRouter();
  const { user, session } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [serviceType, setServiceType] = useState<ServiceType>('Coaching');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  // Dropdown states
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);

  // Dynamic Metadata States
  // 1. Coaching Center Details
  const EXAM_CATEGORIES: Record<string, string[]> = {
    'Government': ['UPSC', 'MPPSC', 'SSC', 'Banking', 'Railway', 'VYAPAM'],
    'Medical': ['NEET UG', 'NEET PG', 'AIIMS', 'Nursing'],
    'Engineering': ['JEE Main', 'JEE Advanced', 'BITSAT', 'State CET'],
    'Board': ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English', 'Commerce', 'Arts'],
  };
  const SHIFT_OPTIONS = ['Morning (8 AM - 1 PM)', 'Evening (3 PM - 8 PM)', 'Full Day', 'Flexible Time'];

  const [coachingCategory, setCoachingCategory] = useState('Government');
  const [coachingSubExams, setCoachingSubExams] = useState<string[]>([]);
  const [coachingShifts, setCoachingShifts] = useState<string[]>(['Flexible Time']);
  // 2. Library Details
  const [librarySeats, setLibrarySeats] = useState('');
  const [libraryAccess, setLibraryAccess] = useState('24 Hours');
  // 3. School Details
  const [schoolBoard, setSchoolBoard] = useState('CBSE');
  const [schoolGrades, setSchoolGrades] = useState('1st to 12th');
  // 4. College Details
  const [collegeUniversity, setCollegeUniversity] = useState('DAVV');
  const [collegeDegrees, setCollegeDegrees] = useState('UG & PG');
  // 5. Hostel Details
  const [hostelType, setHostelType] = useState('Girls Hostel');
  const [hostelRooms, setHostelRooms] = useState('');

  // Auto-generate coaching_id on name change (3 abbrev - 4 random digits)
  useEffect(() => {
    if (name.trim()) {
      const initials = name
        .split(' ')
        .filter(Boolean)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .replace(/[^A-Z]/g, '')
        .padEnd(3, 'X')
        .slice(0, 3);
      
      // 4 random alphanumeric chars
      const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
      setInviteCode(`${initials}-${randomStr}`);
    } else {
      setInviteCode('');
    }
  }, [name]);

  const handlePickLogo = async () => {
    Alert.alert('Institute Logo', 'Select source', [
      {
        text: 'Camera',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission Denied', 'Camera permissions are required.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.6,
          });
          if (!result.canceled && result.assets[0]) {
            uploadLogo(result.assets[0].uri);
          }
        }
      },
      {
        text: 'Gallery',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission Denied', 'Gallery permissions are required.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.6,
          });
          if (!result.canceled && result.assets[0]) {
            uploadLogo(result.assets[0].uri);
          }
        }
      },
      { text: 'Cancel', style: 'cancel' }
    ]);
  };

  const uploadLogo = async (uri: string) => {
    if (!user) return;
    setIsUploadingLogo(true);
    setLogoUri(uri);
    try {
      const fileExt = uri.split('.').pop() || 'jpg';
      const fileName = `logo-${user.id}-${Math.floor(Date.now() / 1000)}.${fileExt}`;
      const filePath = `${fileName}`;

      const token = session?.access_token || APP_CONFIG.supabaseAnonKey;
      const uploadResult = await FileSystem.uploadAsync(
        `${APP_CONFIG.supabaseUrl}/storage/v1/object/avatars/${filePath}`,
        uri,
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

      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(`Upload failed with status ${uploadResult.status}: ${uploadResult.body}`);
      }

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setLogoUrl(publicUrl);
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Failed to upload logo.');
      setLogoUri(null);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleCreateProfile = async () => {
    if (!name.trim() || !phone.trim() || !address.trim() || !inviteCode.trim()) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    if (phone.trim().length !== 10 || isNaN(Number(phone))) {
      Alert.alert('Invalid Phone', 'Phone number must be exactly 10 digits.');
      return;
    }

    setIsLoading(true);

    try {
      if (!user) throw new Error('No user session found.');

      // Save business center
      let metadata = {};
      if (serviceType === 'Coaching') {
        metadata = { category: coachingCategory, subExams: coachingSubExams, shifts: coachingShifts };
      } else if (serviceType === 'Library') {
        metadata = { seats: librarySeats, access: libraryAccess };
      } else if (serviceType === 'School') {
        metadata = { board: schoolBoard, grades: schoolGrades };
      } else if (serviceType === 'College') {
        metadata = { university: collegeUniversity, degrees: collegeDegrees };
      } else if (serviceType === 'Hostel') {
        metadata = { type: hostelType, rooms: hostelRooms };
      }

      const { data: business, error: businessError } = await supabase
        .from('businesses')
        .insert({
          admin_id: user.id,
          business_name: name.trim(),
          business_type: serviceType,
          organization_id: inviteCode.trim().toUpperCase(),
          metadata: metadata,
        })
        .select('id')
        .single();

      if (businessError) {
        if (businessError.code === '23505') {
          throw new Error('This Organization ID is already in use. Please modify it.');
        }
        throw businessError;
      }

      // Update admin profile — link to this business (profile already exists from auth trigger)
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          name: user.user_metadata?.name || name.trim(),
          role: 'admin',
          business_id: business.id,
          claimed: true,
        }, { onConflict: 'id' });

      if (profileError && profileError.code !== '23505') { // Ignore if profile already exists somehow
        throw profileError;
      }

      // Update store
      const store = useAuthStore.getState();
      store.setBusiness(business.id, inviteCode.trim().toUpperCase(), name.trim(), serviceType);

      Alert.alert('Success', 'Organization profile created successfully.', [
        { text: 'OK', onPress: () => router.replace('/(admin)/students') }
      ]);
    } catch (err: any) {
      Alert.alert('Setup Failed', err.message || 'Failed to save coaching profile.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <Text style={styles.heading}>Workspace Setup</Text>
          <Text style={styles.subheading}>Create your organization profile to manage student IDs.</Text>

          {/* Logo Picker */}
          <View style={styles.logoPickerSection}>
            <TouchableOpacity onPress={handlePickLogo} activeOpacity={0.8} disabled={isUploadingLogo}>
              {isUploadingLogo ? (
                <View style={[styles.logoPreview, { justifyContent: 'center', alignItems: 'center' }]}>
                  <ActivityIndicator color={Colors.accent.primary} />
                </View>
              ) : logoUri ? (
                <Image source={{ uri: logoUri }} style={styles.logoPreview} />
              ) : (
                <LinearGradient colors={Gradients.primary as [string, string]} style={styles.logoPlaceholder}>
                  <Ionicons name="business-outline" size={28} color="#FFFFFF" />
                  <Text style={styles.logoPlaceholderText}>Add Logo</Text>
                </LinearGradient>
              )}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={14} color="#FFF" />
              </View>
            </TouchableOpacity>
            <Text style={styles.logoLabel}>{isUploadingLogo ? 'Uploading logo...' : 'Institute Logo / Seal'}</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Institute Name */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Organization Name *</Text>
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                placeholder="e.g. UCI Competition Institute"
                placeholderTextColor={Colors.text.tertiary}
              />
            </View>

            {/* Service Type (Dropdown Selector) */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Service Type *</Text>
              <TouchableOpacity
                style={styles.dropdownTrigger}
                onPress={() => setShowServiceDropdown(!showServiceDropdown)}
                activeOpacity={0.8}
              >
                <Text style={styles.dropdownTriggerText}>
                  {serviceType === 'Coaching' ? 'Coaching Center' : 
                   serviceType === 'Library' ? 'Study Library' : 
                   serviceType === 'School' ? 'School' : 
                   serviceType === 'College' ? 'College' : 
                   serviceType === 'Hostel' ? 'Hostel / PG (GS)' : serviceType}
                </Text>
                <Ionicons name={showServiceDropdown ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.text.secondary} />
              </TouchableOpacity>
 
               {showServiceDropdown && (
                 <View style={styles.dropdownMenu}>
                   {(['Coaching', 'Library', 'School', 'College', 'Hostel'] as ServiceType[]).map((type) => (
                     <TouchableOpacity
                       key={type}
                       style={[styles.dropdownItem, serviceType === type && styles.dropdownItemActive]}
                       onPress={() => {
                         setServiceType(type);
                         setShowServiceDropdown(false);
                       }}
                     >
                       <Text style={[styles.dropdownItemText, serviceType === type && styles.dropdownItemTextActive]}>
                         {type === 'Coaching' ? 'Coaching Center' : 
                          type === 'Library' ? 'Study Library' : 
                          type === 'School' ? 'School' : 
                          type === 'College' ? 'College' : 'Hostel / PG (GS)'}
                       </Text>
                       {serviceType === type && <Ionicons name="checkmark" size={18} color={Colors.accent.primary} />}
                     </TouchableOpacity>
                   ))}
                 </View>
               )}
            </View>

            {/* Invite Code */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Organization ID (Unique) *</Text>
              <View style={styles.codeWrapper}>
                <TextInput
                  style={[styles.textInput, { flex: 1, textTransform: 'uppercase', fontWeight: '800', letterSpacing: 1 }]}
                  value={inviteCode}
                  onChangeText={(v) => setInviteCode(v.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase())}
                  placeholder="e.g. UCI-2026"
                  placeholderTextColor={Colors.text.tertiary}
                />
              </View>
              <Text style={styles.hintText}>Students will enter this code during signup to join your roster.</Text>
            </View>

            {/* Contact Phone */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Contact Phone Number *</Text>
              <TextInput
                style={styles.textInput}
                value={phone}
                onChangeText={(v) => setPhone(v.replace(/[^0-9]/g, '').slice(0, 10))}
                keyboardType="phone-pad"
                maxLength={10}
                placeholder="10-digit phone number"
                placeholderTextColor={Colors.text.tertiary}
              />
            </View>

            {/* Address */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Address / Location *</Text>
              <TextInput
                style={[styles.textInput, { height: 72, textAlignVertical: 'top' }]}
                value={address}
                onChangeText={setAddress}
                multiline={true}
                placeholder="Complete address of campus"
                placeholderTextColor={Colors.text.tertiary}
              />
            </View>

            {/* ===================================================
                DYNAMIC SERVICE SECTION
               =================================================== */}
            <Text style={styles.sectionLabel}>{serviceType} Parameters</Text>
            
            {serviceType === 'Coaching' && (
              <View style={styles.paramCard}>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Exam Category</Text>
                  <View style={styles.chipRow}>
                    {Object.keys(EXAM_CATEGORIES).map((cat) => (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.chip, coachingCategory === cat && styles.chipActive]}
                        onPress={() => {
                          setCoachingCategory(cat);
                          setCoachingSubExams([]); // reset sub-exams on category change
                        }}
                      >
                        <Text style={[styles.chipText, coachingCategory === cat && styles.chipTextActive]}>{cat}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={[styles.inputContainer, { marginTop: 14 }]}>
                  <Text style={styles.inputLabel}>Sub-Exams (Select multiple)</Text>
                  <View style={styles.chipRow}>
                    {EXAM_CATEGORIES[coachingCategory].map((subExam) => {
                      const isSelected = coachingSubExams.includes(subExam);
                      return (
                        <TouchableOpacity
                          key={subExam}
                          style={[styles.chip, isSelected && styles.chipActive]}
                          onPress={() => {
                            setCoachingSubExams((prev) => 
                              isSelected 
                                ? prev.filter(item => item !== subExam)
                                : [...prev, subExam]
                            );
                          }}
                        >
                          <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{subExam}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={[styles.inputContainer, { marginTop: 14 }]}>
                  <Text style={styles.inputLabel}>Coaching Shifts (Select multiple)</Text>
                  <View style={styles.chipRow}>
                    {SHIFT_OPTIONS.map((s) => {
                      const isSelected = coachingShifts.includes(s);
                      return (
                        <TouchableOpacity
                          key={s}
                          style={[styles.chip, isSelected && styles.chipActive]}
                          onPress={() => {
                            setCoachingShifts((prev) => 
                              isSelected 
                                ? prev.filter(item => item !== s)
                                : [...prev, s]
                            );
                          }}
                        >
                          <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{s}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>
            )}

            {serviceType === 'Library' && (
              <View style={styles.paramCard}>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Total Seats Capacity *</Text>
                  <TextInput
                    style={styles.textInput}
                    value={librarySeats}
                    onChangeText={(v) => setLibrarySeats(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="e.g. 150"
                    placeholderTextColor={Colors.text.tertiary}
                  />
                </View>

                <View style={[styles.inputContainer, { marginTop: 14 }]}>
                  <Text style={styles.inputLabel}>Timing Access Modes</Text>
                  <View style={styles.chipRow}>
                    {['24 Hours', '12 Hours (Day)', 'Hourly slots'].map((s) => (
                      <TouchableOpacity
                        key={s}
                        style={[styles.chip, libraryAccess === s && styles.chipActive]}
                        onPress={() => setLibraryAccess(s)}
                      >
                        <Text style={[styles.chipText, libraryAccess === s && styles.chipTextActive]}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            )}

             {serviceType === 'School' && (
              <View style={styles.paramCard}>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Affiliation Board</Text>
                  <View style={styles.chipRow}>
                    {['CBSE', 'ICSE', 'State Board', 'International'].map((b) => (
                      <TouchableOpacity
                        key={b}
                        style={[styles.chip, schoolBoard === b && styles.chipActive]}
                        onPress={() => setSchoolBoard(b)}
                      >
                        <Text style={[styles.chipText, schoolBoard === b && styles.chipTextActive]}>{b}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={[styles.inputContainer, { marginTop: 14 }]}>
                  <Text style={styles.inputLabel}>Grades Range</Text>
                  <View style={styles.chipRow}>
                    {['Nursery to 8th', '1st to 12th', 'High School Only', 'Nursery to 12th'].map((g) => (
                      <TouchableOpacity
                        key={g}
                        style={[styles.chip, schoolGrades === g && styles.chipActive]}
                        onPress={() => setSchoolGrades(g)}
                      >
                        <Text style={[styles.chipText, schoolGrades === g && styles.chipTextActive]}>{g}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {serviceType === 'College' && (
              <View style={styles.paramCard}>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>University Affiliation</Text>
                  <View style={styles.chipRow}>
                    {['DAVV', 'RGPV', 'Delhi University', 'State University', 'Other'].map((b) => (
                      <TouchableOpacity
                        key={b}
                        style={[styles.chip, collegeUniversity === b && styles.chipActive]}
                        onPress={() => setCollegeUniversity(b)}
                      >
                        <Text style={[styles.chipText, collegeUniversity === b && styles.chipTextActive]}>{b}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={[styles.inputContainer, { marginTop: 14 }]}>
                  <Text style={styles.inputLabel}>Degrees Offered</Text>
                  <View style={styles.chipRow}>
                    {['UG Only', 'PG Only', 'UG & PG', 'Diploma / Voc'].map((g) => (
                      <TouchableOpacity
                        key={g}
                        style={[styles.chip, collegeDegrees === g && styles.chipActive]}
                        onPress={() => setCollegeDegrees(g)}
                      >
                        <Text style={[styles.chipText, collegeDegrees === g && styles.chipTextActive]}>{g}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {serviceType === 'Hostel' && (
              <View style={styles.paramCard}>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Hostel / PG Type</Text>
                  <View style={styles.chipRow}>
                    {['Girls Hostel', 'Boys Hostel', 'Co-ed / PG', 'Single Rooms'].map((b) => (
                      <TouchableOpacity
                        key={b}
                        style={[styles.chip, hostelType === b && styles.chipActive]}
                        onPress={() => setHostelType(b)}
                      >
                        <Text style={[styles.chipText, hostelType === b && styles.chipTextActive]}>{b}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={[styles.inputContainer, { marginTop: 14 }]}>
                  <Text style={styles.inputLabel}>Number of Rooms (Optional)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. 50"
                    placeholderTextColor={Colors.text.tertiary}
                    value={hostelRooms}
                    onChangeText={(v) => setHostelRooms(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
            )}
          </View>

          {/* Submit */}
          <TouchableOpacity onPress={handleCreateProfile} disabled={isLoading || isUploadingLogo} activeOpacity={0.85}>
            <LinearGradient
              colors={Gradients.primary as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.submitButton, (isLoading || isUploadingLogo) && { opacity: 0.7 }]}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitButtonText}>Register Workspace & Launch</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 60,
  },
  heading: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text.primary,
    marginBottom: 6,
  },
  subheading: {
    fontSize: 14,
    color: Colors.text.secondary,
    lineHeight: 20,
    fontWeight: '500',
    marginBottom: 28,
  },
  logoPickerSection: {
    alignItems: 'center',
    marginBottom: 28,
    gap: 8,
  },
  logoPreview: {
    width: 80,
    height: 80,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: Colors.accent.primary,
  },
  logoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  logoPlaceholderText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.bg.primary,
    elevation: 3,
  },
  logoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginTop: 4,
  },
  form: {
    gap: 16,
    marginBottom: 28,
  },
  inputContainer: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  textInput: {
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
  hintText: {
    fontSize: 11,
    color: Colors.text.tertiary,
    fontWeight: '500',
    marginTop: 2,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bg.secondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.card.border,
    paddingHorizontal: 16,
    height: 48,
  },
  dropdownTriggerText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  dropdownMenu: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.card.border,
    overflow: 'hidden',
    marginTop: 4,
    ...Shadows.sm,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.card.border + '60',
  },
  dropdownItemActive: {
    backgroundColor: Colors.bg.tertiary,
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text.secondary,
  },
  dropdownItemTextActive: {
    color: Colors.accent.primary,
    fontWeight: '600',
  },
  codeWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 10,
  },
  paramCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.card.border,
    padding: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: Colors.bg.primary,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  chipActive: {
    backgroundColor: Colors.accent.primary + '10',
    borderColor: Colors.accent.primary + '40',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  chipTextActive: {
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
});

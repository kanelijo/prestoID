import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '@/constants/colors';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import CachedImage from '@/components/CachedImage';
import { CustomAlert } from '@/components/CustomAlert';
import { playAudioFeedback } from '@/lib/audioEffects';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function CoachingProfileScreen() {
  const router = useRouter();
  const { user, businessId, businessName, businessCode, avatarUrl, setBusiness, setAvatarUrl } = useAuthStore();

  const [orgName, setOrgName] = useState(businessName || 'My Coaching Center');
  const [orgCode, setOrgCode] = useState(businessCode || 'ORG-100');
  const [logoUri, setLogoUri] = useState<string | null>(avatarUrl || null);
  const [location, setLocation] = useState('Indore, Madhya Pradesh');
  const [phone, setPhone] = useState('+91 98765 43210');
  const [email, setEmail] = useState(user?.email || 'admin@coaching.com');
  const [whatsapp, setWhatsapp] = useState('+91 98765 43210');

  const [batches, setBatches] = useState<string[]>(['MPPSC', 'SSC', 'VYAPAM', 'Railway', 'Banking', 'UPSC']);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // Add Batch Modal state
  const [isAddBatchVisible, setIsAddBatchVisible] = useState(false);
  const [newBatchInput, setNewBatchInput] = useState('');

  // Org ID Copy Modal state
  const [isOrgCodeModalVisible, setIsOrgCodeModalVisible] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    loadCoachingDetails();
  }, [user, businessId]);

  const loadCoachingDetails = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      // 1. Fetch business table info
      if (businessId) {
        const { data: biz } = await supabase
          .from('businesses')
          .select('*')
          .eq('id', businessId)
          .maybeSingle();

        if (biz) {
          setOrgName(biz.business_name || orgName);
          setOrgCode(biz.organization_id || orgCode);
          
          // Read metadata payload safely
          const meta = biz.metadata || {};
          if (meta.location) setLocation(meta.location);
          if (meta.phone) setPhone(meta.phone);
          if (meta.whatsapp) setWhatsapp(meta.whatsapp);
          if (Array.isArray(meta.batches) && meta.batches.length > 0) {
            setBatches(meta.batches);
          }
        }
      }

      // 2. Fetch admin profile avatar
      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_url, full_name')
        .eq('id', user.id)
        .maybeSingle();

      if (profile) {
        if (profile.avatar_url) setLogoUri(profile.avatar_url);
        if (!businessName && profile.full_name) setOrgName(profile.full_name);
      }
    } catch (err) {
      console.warn('Failed to load coaching details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePickLogo = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        CustomAlert.alert('Permission Denied', 'Media library access is required to update organization logo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedAsset = result.assets[0];
        const localUri = selectedAsset.uri;

        // 1. OPTIMISTIC UPDATE: Instant 0ms visual update
        setLogoUri(localUri);
        setAvatarUrl(localUri);
        playAudioFeedback('success');
        CustomAlert.alert('Success 🎉', 'Organization logo updated successfully!');

        // 2. BACKGROUND WORK: Upload to storage and sync tables
        (async () => {
          try {
            const fileName = `biz_logo_${user?.id}_${Date.now()}.jpg`;
            const response = await fetch(localUri);
            const blob = await response.blob();
            const arrayBuffer = await new Response(blob).arrayBuffer();

            const { error: uploadError } = await supabase.storage
              .from('avatars')
              .upload(fileName, arrayBuffer, {
                contentType: 'image/jpeg',
                upsert: true,
              });

            if (uploadError) {
              console.warn('[LogoUpload] Storage upload warning:', uploadError);
              return;
            }

            const { data: publicData } = supabase.storage
              .from('avatars')
              .getPublicUrl(fileName);

            const publicUrl = publicData.publicUrl;

            // Sync with global store and local state
            setLogoUri(publicUrl);
            setAvatarUrl(publicUrl);

            // Update in profiles
            if (user?.id) {
              await supabase
                .from('profiles')
                .update({ avatar_url: publicUrl })
                .eq('id', user.id);
            }

            // Update in businesses
            if (businessId) {
              await supabase
                .from('businesses')
                .update({ logo_url: publicUrl })
                .eq('id', businessId);
            }

            // Update AsyncStorage user profile cache
            const cachedRaw = await AsyncStorage.getItem('@user_profile');
            if (cachedRaw) {
              const cachedObj = JSON.parse(cachedRaw);
              cachedObj.avatarUrl = publicUrl;
              await AsyncStorage.setItem('@user_profile', JSON.stringify(cachedObj));
            }
          } catch (bgErr) {
            console.warn('[LogoUpload] Background sync error:', bgErr);
          }
        })();
      }
    } catch (err: any) {
      console.error('Failed to pick organization logo:', err);
      CustomAlert.alert('Error', err.message || 'Could not pick logo. Please try again.');
    }
  };

  const handleSaveCoachingProfile = async () => {
    if (!orgName.trim()) {
      CustomAlert.alert('Invalid Name', 'Please enter a valid organization name.');
      return;
    }

    setIsSaving(true);
    try {
      if (businessId) {
        // Store location, phone, whatsapp, batches inside the metadata JSONB column
        // to avoid missing column errors on custom database schemas
        const metadataPayload = {
          location: location.trim(),
          phone: phone.trim(),
          whatsapp: whatsapp.trim(),
          batches: batches,
        };

        const { error } = await supabase
          .from('businesses')
          .update({
            business_name: orgName.trim(),
            metadata: metadataPayload,
          })
          .eq('id', businessId);

        if (error) throw error;
      }

      // Update auth store
      setBusiness(businessId || '', orgCode, orgName.trim(), 'coaching');

      playAudioFeedback('success');
      CustomAlert.alert('Success 🎉', 'Organization profile updated successfully!');
    } catch (err: any) {
      console.error('Failed to save coaching profile:', err);
      CustomAlert.alert('Error', err.message || 'Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenOrgCodeModal = () => {
    setIsCopied(false);
    setIsOrgCodeModalVisible(true);
    playAudioFeedback('click');
  };

  const handleCopyOrgIdToClipboard = () => {
    try {
      Clipboard.setString(orgCode);
      setIsCopied(true);
      playAudioFeedback('success');
      setTimeout(() => setIsCopied(false), 2500);
    } catch {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    }
  };

  const handleAddBatch = () => {
    const trimmed = newBatchInput.trim();
    if (!trimmed) return;
    if (batches.includes(trimmed)) {
      CustomAlert.alert('Duplicate Batch', 'This batch already exists.');
      return;
    }
    setBatches([...batches, trimmed]);
    setNewBatchInput('');
    setIsAddBatchVisible(false);
    playAudioFeedback('click');
  };

  const handleDeleteBatch = (targetBatch: string) => {
    CustomAlert.alert('Remove Batch', `Are you sure you want to remove "${targetBatch}" from active batches?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setBatches(batches.filter(b => b !== targetBatch));
          playAudioFeedback('click');
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.accent.primary} />
        <Text style={{ marginTop: 12, color: Colors.text.secondary, fontWeight: '600' }}>
          Loading Organization Profile...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Organization Profile</Text>
        <TouchableOpacity style={styles.saveHeaderBtn} onPress={handleSaveCoachingProfile} disabled={isSaving}>
          {isSaving ? (
            <ActivityIndicator size="small" color={Colors.accent.primary} />
          ) : (
            <Text style={styles.saveHeaderText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Logo Card Section */}
          <View style={styles.logoSectionCard}>
            <TouchableOpacity style={styles.logoWrapper} onPress={handlePickLogo} disabled={isUploadingLogo}>
              {logoUri ? (
                <CachedImage uri={logoUri} style={styles.logoImage} priority="high" />
              ) : (
                <View style={styles.logoFallback}>
                  <Text style={styles.logoFallbackText}>
                    {orgName.substring(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.cameraOverlayBtn}>
                {isUploadingLogo ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Ionicons name="camera" size={16} color="#FFF" />
                )}
              </View>
            </TouchableOpacity>

            <Text style={styles.orgTitleText}>{orgName}</Text>

            {/* Org Code Pill */}
            <TouchableOpacity style={styles.codePill} onPress={handleOpenOrgCodeModal}>
              <Ionicons name="key-outline" size={14} color={Colors.accent.primary} />
              <Text style={styles.codePillText}>Org ID: {orgCode}</Text>
              <Ionicons name="copy-outline" size={14} color={Colors.accent.primary} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>

          {/* NoteBank Shifted Banner */}
          <TouchableOpacity
            style={styles.notebankBanner}
            activeOpacity={0.88}
            onPress={() => router.push('/(admin)/notebank')}
          >
            <LinearGradient
              colors={['#4E6AFF15', '#7C3AED15']}
              style={styles.notebankGrad}
            >
              <View style={styles.notebankIconBox}>
                <Ionicons name="folder-open" size={24} color={Colors.accent.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.notebankTitle}>Study NoteBank & Resources</Text>
                <Text style={styles.notebankDesc}>
                  Manage textbooks, PDFs, exam notes, and past year question papers.
                </Text>
              </View>
              <View style={styles.notebankArrowBtn}>
                <Ionicons name="chevron-forward" size={18} color={Colors.accent.primary} />
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* Basic Details Form */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeaderTitle}>🏢 Basic Details</Text>

            <View style={styles.inputField}>
              <Text style={styles.fieldLabel}>Organization Name</Text>
              <View style={styles.inputBox}>
                <Ionicons name="business-outline" size={18} color={Colors.text.tertiary} />
                <TextInput
                  style={styles.textInput}
                  value={orgName}
                  onChangeText={setOrgName}
                  placeholder="Enter Coaching / College Name"
                  placeholderTextColor={Colors.text.tertiary}
                />
              </View>
            </View>

            <View style={styles.inputField}>
              <Text style={styles.fieldLabel}>Address / Location</Text>
              <View style={styles.inputBox}>
                <Ionicons name="location-outline" size={18} color={Colors.text.tertiary} />
                <TextInput
                  style={styles.textInput}
                  value={location}
                  onChangeText={setLocation}
                  placeholder="City, State / Campus Address"
                  placeholderTextColor={Colors.text.tertiary}
                />
              </View>
            </View>
          </View>

          {/* Batches Management */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeaderTitle}>🏷️ Active Batches ({batches.length})</Text>
              <TouchableOpacity style={styles.addBatchPill} onPress={() => setIsAddBatchVisible(true)}>
                <Ionicons name="add" size={16} color={Colors.accent.primary} />
                <Text style={styles.addBatchPillText}>Add Batch</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.batchesGrid}>
              {batches.map((batch) => (
                <View key={batch} style={styles.batchChip}>
                  <Text style={styles.batchChipText}>{batch}</Text>
                  <TouchableOpacity onPress={() => handleDeleteBatch(batch)} style={styles.batchRemoveBtn}>
                    <Ionicons name="close-circle" size={16} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>

          {/* Contact Details */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeaderTitle}>📞 Contact Details for Students</Text>

            <View style={styles.inputField}>
              <Text style={styles.fieldLabel}>Phone Number</Text>
              <View style={styles.inputBox}>
                <Ionicons name="call-outline" size={18} color={Colors.text.tertiary} />
                <TextInput
                  style={styles.textInput}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="Contact Phone Number"
                  placeholderTextColor={Colors.text.tertiary}
                />
              </View>
            </View>

            <View style={styles.inputField}>
              <Text style={styles.fieldLabel}>Email Address (Uneditable)</Text>
              <View style={[styles.inputBox, { opacity: 0.7, backgroundColor: Colors.bg.tertiary }]}>
                <Ionicons name="mail-outline" size={18} color={Colors.text.tertiary} />
                <TextInput
                  style={[styles.textInput, { color: Colors.text.secondary }]}
                  value={email}
                  editable={false}
                  placeholder="Official Email"
                  placeholderTextColor={Colors.text.tertiary}
                />
              </View>
            </View>

            <View style={styles.inputField}>
              <Text style={styles.fieldLabel}>WhatsApp Support Number</Text>
              <View style={styles.inputBox}>
                <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                <TextInput
                  style={styles.textInput}
                  value={whatsapp}
                  onChangeText={setWhatsapp}
                  keyboardType="phone-pad"
                  placeholder="WhatsApp Number"
                  placeholderTextColor={Colors.text.tertiary}
                />
              </View>
            </View>
          </View>

          {/* Save Button */}
          <TouchableOpacity style={styles.saveSubmitBtn} onPress={handleSaveCoachingProfile} disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#FFF" />
                <Text style={styles.saveSubmitText}>Save Organization Profile</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Org ID Copy Modal */}
      <Modal visible={isOrgCodeModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.orgModalHeaderIconBox}>
              <Ionicons name="key" size={32} color={Colors.accent.primary} />
            </View>
            <Text style={[styles.modalTitle, { textAlign: 'center' }]}>Organization Code / ID</Text>
            <Text style={[styles.modalSub, { textAlign: 'center', marginBottom: 8 }]}>
              Share this Organization Code with your students so they can easily claim profiles and join your coaching center.
            </Text>

            <View style={styles.orgCodeDisplayBox}>
              <Text style={styles.orgCodeDisplayText}>{orgCode}</Text>
            </View>

            <TouchableOpacity
              style={[styles.copyActionBtn, isCopied && styles.copyActionBtnDone]}
              onPress={handleCopyOrgIdToClipboard}
              activeOpacity={0.8}
            >
              <Ionicons name={isCopied ? "checkmark-circle" : "copy"} size={18} color="#FFF" />
              <Text style={styles.copyActionBtnText}>{isCopied ? "Copied! ✓" : "Copy ID"}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setIsOrgCodeModalVisible(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add Batch Modal */}
      <Modal visible={isAddBatchVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add New Batch</Text>
            <Text style={styles.modalSub}>Enter batch course name (e.g. NEET 2026, Foundation, JEE Advanced)</Text>

            <TextInput
              style={styles.modalInput}
              value={newBatchInput}
              onChangeText={setNewBatchInput}
              placeholder="Batch Name"
              placeholderTextColor={Colors.text.tertiary}
              autoFocus
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setIsAddBatchVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalAddBtn} onPress={handleAddBatch}>
                <Text style={styles.modalAddText}>Add Batch</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
    backgroundColor: '#FFF',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  saveHeaderBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#FFF0ED',
    borderRadius: 16,
  },
  saveHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.accent.primary,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 160,
    gap: 16,
  },
  logoSectionCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.card.border,
    ...Shadows.sm,
  },
  logoWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  logoImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  logoFallback: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoFallbackText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFF',
  },
  cameraOverlayBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  orgTitleText: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  codePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF0ED',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  codePillText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.accent.primary,
    marginHorizontal: 4,
  },
  notebankBanner: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.accent.primary + '30',
  },
  notebankGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  notebankIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  notebankTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  notebankDesc: {
    fontSize: 12,
    color: Colors.text.secondary,
    lineHeight: 16,
  },
  notebankArrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.card.border,
    gap: 14,
    ...Shadows.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  addBatchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF0ED',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    gap: 2,
  },
  addBatchPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.accent.primary,
  },
  inputField: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    borderWidth: 1,
    borderColor: Colors.card.border,
    gap: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.text.primary,
    fontWeight: '500',
  },
  batchesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  batchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.card.border,
    gap: 6,
  },
  batchChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  batchRemoveBtn: {
    padding: 2,
  },
  saveSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent.primary,
    height: 52,
    borderRadius: 16,
    gap: 8,
    marginTop: 8,
    ...Shadows.md,
  },
  saveSubmitText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  orgModalHeaderIconBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFF0ED',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 4,
  },
  orgCodeDisplayBox: {
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1.5,
    borderColor: Colors.accent.primary + '40',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  orgCodeDisplayText: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.accent.primary,
    letterSpacing: 2,
  },
  copyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent.primary,
    height: 48,
    borderRadius: 14,
    gap: 8,
    marginTop: 4,
  },
  copyActionBtnDone: {
    backgroundColor: '#10B981', // Green
  },
  copyActionBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFF',
  },
  modalCloseBtn: {
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: 2,
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.tertiary,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  modalSub: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: Colors.card.border,
    fontSize: 15,
    color: Colors.text.primary,
    marginTop: 4,
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.tertiary,
  },
  modalAddBtn: {
    backgroundColor: Colors.accent.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  modalAddText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
});

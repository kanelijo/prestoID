import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors, Shadows, Gradients } from '@/constants/colors';
import { APP_CONFIG } from '@/constants/config';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { uploadFileToGoogleDrive, deleteFileFromGoogleDrive } from '@/lib/googleDrive';
import CachedImage from '@/components/CachedImage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type StudyMaterial = {
  id: string;
  title: string;
  type: 'Notes' | 'E-Book' | 'Doc';
  batch_name: string;
  file_url: string;
  file_name: string;
  thumbnail_url?: string | null;
  created_at: string;
};

export default function NoteBankScreen() {
  const router = useRouter();
  const { user, businessId, businessCode } = useAuthStore();
  
  // Loading & Data states
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); // 0–1 overall
  const [uploadStatusText, setUploadStatusText] = useState('');
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [batches, setBatches] = useState<string[]>([]);
  
  // Navigation/Filter states
  const [selectedBatchFolder, setSelectedBatchFolder] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'Notes' | 'E-Book' | 'Doc'>('Notes');
  
  // Upload modal states
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadBatch, setUploadBatch] = useState('');
  const [uploadType, setUploadType] = useState<'Notes' | 'E-Book' | 'Doc'>('Notes');
  const [selectedFiles, setSelectedFiles] = useState<any[]>([]);

  const fetchMaterialsAndBatches = async () => {
    let targetBusinessId = businessId;
    if (!targetBusinessId && user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('business_id')
        .eq('id', user.id)
        .maybeSingle();
      if (profile) {
        targetBusinessId = profile.business_id;
      }
    }

    if (!targetBusinessId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // 1. Fetch study materials
      const { data: materialsData, error: materialsError } = await supabase
        .from('study_materials')
        .select('*')
        .eq('business_id', targetBusinessId)
        .order('created_at', { ascending: false });

      if (materialsError) throw materialsError;
      setMaterials(materialsData || []);

      // 2. Fetch coaching batches from batches table
      const { data: batchList } = await supabase
        .from('batches')
        .select('name')
        .eq('business_id', targetBusinessId);

      // 3. Fetch unique batch names from students table
      const { data: studentBatches } = await supabase
        .from('students')
        .select('batch_name')
        .eq('business_id', targetBusinessId);

      // 4. Fetch subExams from business metadata
      const { data: businessData } = await supabase
        .from('businesses')
        .select('metadata')
        .eq('id', targetBusinessId)
        .maybeSingle();

      const batchSet = new Set<string>();

      // Add from batches table
      if (batchList) {
        batchList.forEach((b) => {
          if (b.name) batchSet.add(b.name.trim().toUpperCase());
        });
      }

      // Add from students table
      if (studentBatches) {
        studentBatches.forEach((s) => {
          if (s.batch_name) batchSet.add(s.batch_name.trim().toUpperCase());
        });
      }

      // Add from business metadata sub-exams
      if (businessData?.metadata?.subExams && Array.isArray(businessData.metadata.subExams)) {
        businessData.metadata.subExams.forEach((exam: string) => {
          if (exam) batchSet.add(exam.trim().toUpperCase());
        });
      }

      // Convert to array and sort
      let names = Array.from(batchSet).sort();

      // If still empty, fall back to standard list
      if (names.length === 0) {
        names = ['MPPSC', 'SSC', 'VYAPAM', 'Railway', 'Banking', 'UPSC'];
      }

      setBatches(names);
      if (names.length > 0 && (!uploadBatch || !names.includes(uploadBatch))) {
        setUploadBatch(names[0]);
      }
    } catch (err) {
      console.warn('Failed to load NoteBank details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMaterialsAndBatches();
  }, [businessId]);

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedFiles(result.assets);
        
        // Pre-fill Title with file name (without extension) if title is empty
        if (!uploadTitle.trim() && result.assets.length > 0) {
          const firstFile = result.assets[0];
          const nameWithoutExt = firstFile.name.split('.').slice(0, -1).join('.') || firstFile.name;
          setUploadTitle(nameWithoutExt);
        }
      }
    } catch (err) {
      console.warn('Document picker error:', err);
    }
  };

  const handleUploadMaterial = async () => {
    if (selectedFiles.length === 0) {
      Alert.alert('File Required', 'Please select at least one syllabus, note, or e-book file.');
      return;
    }
    if (!uploadBatch) {
      Alert.alert('Batch Required', 'Please select a batch.');
      return;
    }

    setIsUploading(true);
    try {
      let targetBusinessId = businessId;
      if (!targetBusinessId && user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('business_id')
          .eq('id', user.id)
          .maybeSingle();
        if (profile) {
          targetBusinessId = profile.business_id;
        }
      }

      if (!targetBusinessId) {
        throw new Error('Business ID could not be verified. Please try again.');
      }

      // Resolve Folder Name (Organization ID)
      let folderName = businessCode;
      if (!folderName) {
        const { data: businessData } = await supabase
          .from('businesses')
          .select('organization_id')
          .eq('id', targetBusinessId)
          .maybeSingle();
        if (businessData) {
          folderName = businessData.organization_id;
        }
      }
      if (!folderName) {
        folderName = 'UNLINKED-COACHING';
      }

      // Loop through all selected files and upload them
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const fileUri = file.uri;
        const originalName = file.name;
        const fileExt = originalName.split('.').pop() || 'pdf';
        const fileSizeMB = ((file.size || 0) / (1024 * 1024)).toFixed(1);

        // Update status label for this file
        setUploadStatusText(
          selectedFiles.length > 1
            ? `File ${i + 1} of ${selectedFiles.length}: ${originalName}`
            : originalName
        );

        // Determine title for the database entry
        let finalTitle = uploadTitle.trim();
        if (selectedFiles.length > 1) {
          if (finalTitle) {
            finalTitle = `${finalTitle} - Part ${i + 1}`;
          } else {
            finalTitle = originalName.split('.').slice(0, -1).join('.') || originalName;
          }
        } else {
          if (!finalTitle) {
            finalTitle = originalName.split('.').slice(0, -1).join('.') || originalName;
          }
        }

        const uploadRes = await uploadFileToGoogleDrive(
          fileUri,
          finalTitle + '.' + fileExt,
          folderName,
          (fileProgress) => {
            // Overall progress = completed files + current file progress
            const overall = (i + fileProgress) / selectedFiles.length;
            setUploadProgress(overall);
            const uploadedMB = (((file.size || 0) * fileProgress) / (1024 * 1024)).toFixed(1);
            setUploadStatusText(
              selectedFiles.length > 1
                ? `File ${i + 1}/${selectedFiles.length} • ${uploadedMB}/${fileSizeMB} MB`
                : `${uploadedMB} / ${fileSizeMB} MB`
            );
          }
        );

        // Mark this file fully done
        setUploadProgress((i + 1) / selectedFiles.length);

        // Insert record into study_materials table
        const { error } = await supabase
          .from('study_materials')
          .insert({
            business_id: targetBusinessId,
            title: finalTitle,
            type: uploadType,
            batch_name: uploadBatch,
            file_url: uploadRes.fileUrl,
            file_name: originalName,
            thumbnail_url: uploadRes.thumbnailUrl,
          });

        if (error) throw error;
      }

      // Reset & Reload
      setShowUploadModal(false);
      setUploadTitle('');
      setSelectedFiles([]);
      setUploadProgress(0);
      setUploadStatusText('');
      fetchMaterialsAndBatches();
      Alert.alert('Success', `${selectedFiles.length} file(s) uploaded successfully.`);
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Failed to upload study material.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStatusText('');
    }
  };

  const handleDeleteMaterial = async (id: string, title: string) => {
    Alert.alert(
      'Delete Material',
      `Are you sure you want to delete "${title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: material } = await supabase
                .from('study_materials')
                .select('file_url')
                .eq('id', id)
                .maybeSingle();

              const { error } = await supabase
                .from('study_materials')
                .delete()
                .eq('id', id);

              if (error) throw error;

              if (material?.file_url) {
                deleteFileFromGoogleDrive(material.file_url).catch((err) => {
                  console.warn('Failed to delete Google Drive file:', err);
                });
              }

              fetchMaterialsAndBatches();
            } catch (err: any) {
              Alert.alert('Delete Failed', err.message || 'Could not delete the file.');
            }
          },
        },
      ]
    );
  };

  const triggerDownload = (url: string, fileName?: string) => {
    if (!url) return;
    const downloadUrl = url.includes('?')
      ? `${url}&download=${encodeURIComponent(fileName || '')}`
      : `${url}?download=${encodeURIComponent(fileName || '')}`;
    Linking.openURL(downloadUrl);
  };

  // Helper to count files in a batch folder
  const getBatchFileCount = (batchName: string) => {
    return materials.filter((m) => m.batch_name === batchName).length;
  };

  const renderUploadModal = () => (
    <Modal
      visible={showUploadModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => {
        if (!isUploading) setShowUploadModal(false);
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Upload Material</Text>
            {!isUploading && (
              <TouchableOpacity onPress={() => setShowUploadModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text.primary} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
            {/* File Picker Block */}
            <TouchableOpacity
              style={[styles.pickerBox, selectedFiles.length > 0 && styles.pickerBoxActive]}
              onPress={handlePickDocument}
              activeOpacity={0.7}
            >
              <Ionicons
                name={selectedFiles.length > 0 ? 'document-attach' : 'cloud-upload-outline'}
                size={32}
                color={selectedFiles.length > 0 ? Colors.accent.primary : Colors.text.tertiary}
              />
              <Text style={styles.pickerText} numberOfLines={1}>
                {selectedFiles.length > 0
                  ? selectedFiles.length === 1
                    ? selectedFiles[0].name
                    : `${selectedFiles.length} files selected`
                  : 'Choose Syllabus, Note, or E-Book'}
              </Text>
              {selectedFiles.length > 0 && (
                <Text style={styles.pickerSubText}>
                  {selectedFiles.length === 1
                    ? `${(selectedFiles[0].size / (1024 * 1024)).toFixed(2)} MB • Tap to change`
                    : `${(selectedFiles.reduce((acc, f) => acc + (f.size || 0), 0) / (1024 * 1024)).toFixed(2)} MB total • Tap to change`}
                </Text>
              )}
            </TouchableOpacity>

            {/* Title / Name Input */}
            <Text style={styles.fieldLabel}>Display Name</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. History Chapter 1 Notes"
              placeholderTextColor={Colors.text.tertiary}
              value={uploadTitle}
              onChangeText={setUploadTitle}
            />

            {/* Type selector */}
            <Text style={styles.fieldLabel}>Material Type</Text>
            <View style={styles.segmentedRow}>
              {(['Notes', 'E-Book', 'Doc'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.segmentBtn, uploadType === t && styles.segmentBtnActive]}
                  onPress={() => setUploadType(t)}
                >
                  <Text style={[styles.segmentText, uploadType === t && styles.segmentTextActive]}>
                    {t === 'Notes' ? 'Notes 📝' : t === 'E-Book' ? 'E-Book 📚' : 'Doc 📄'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Batch selector */}
            <Text style={styles.fieldLabel}>Select Batch</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.batchSelectorScroll}>
              <View style={styles.batchGridSelect}>
                {batches.map((b) => (
                  <TouchableOpacity
                    key={b}
                    style={[styles.batchSelectorChip, uploadBatch === b && styles.batchSelectorChipActive]}
                    onPress={() => setUploadBatch(b)}
                  >
                    <Text style={[styles.batchSelectorText, uploadBatch === b && styles.batchSelectorTextActive]}>
                      {b}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Submit Button OR Progress Bar */}
            {isUploading ? (
              <View style={styles.progressCard}>
                {/* Header row */}
                <View style={styles.progressCardHeader}>
                  <View style={styles.progressIconWrap}>
                    <ActivityIndicator size="small" color={Colors.accent.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.progressTitle} numberOfLines={1}>
                      {uploadStatusText || 'Uploading...'}
                    </Text>
                    <Text style={styles.progressSubtitle}>
                      {Math.round(uploadProgress * 100)}% complete
                      {selectedFiles.length > 1
                        ? ` • ${Math.floor(uploadProgress * selectedFiles.length)} of ${selectedFiles.length} files`
                        : ''}
                    </Text>
                  </View>
                  <Text style={styles.progressPercent}>
                    {Math.round(uploadProgress * 100)}%
                  </Text>
                </View>

                {/* Progress Track */}
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.round(uploadProgress * 100)}%` },
                    ]}
                  />
                </View>

                <Text style={styles.progressHint}>
                  Please wait — do not close the app
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleUploadMaterial}
              >
                <Ionicons name="checkmark-circle" size={18} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.submitButtonText}>Upload NoteBank</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header Row */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (selectedBatchFolder) {
              setSelectedBatchFolder(null);
            } else {
              router.back();
            }
          }}
        >
          <Ionicons name="arrow-back" size={20} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {selectedBatchFolder ? `${selectedBatchFolder} Notes` : 'NoteBank'}
        </Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!selectedBatchFolder ? (
          // Main Folder dashboard
          <>
            {/* Big upload Action Button */}
            <TouchableOpacity
              style={styles.scannerButton}
              activeOpacity={0.9}
              onPress={() => setShowUploadModal(true)}
            >
              <LinearGradient
                colors={Gradients.primary as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.scannerGradient}
              >
                <View style={styles.scannerIconWrapper}>
                  <Ionicons name="cloud-upload" size={20} color="#FFF" />
                </View>
                <View style={styles.scannerTextWrapper}>
                  <Text style={styles.scannerTitle}>Upload Study Material</Text>
                  <Text style={styles.scannerDesc}>Upload Syllabus, E-Books, Notes & assign to batches</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Batch Folders</Text>
            {isLoading ? (
              <ActivityIndicator color={Colors.accent.primary} style={{ marginTop: 20 }} />
            ) : batches.length === 0 ? (
              <Text style={styles.emptyText}>No batches created yet. Add a batch on your profile screen.</Text>
            ) : (
              <View style={styles.foldersGrid}>
                {batches.map((batch) => {
                  const count = getBatchFileCount(batch);
                  return (
                    <TouchableOpacity
                      key={batch}
                      style={styles.folderCard}
                      activeOpacity={0.8}
                      onPress={() => setSelectedBatchFolder(batch)}
                    >
                      <Ionicons name="folder" size={48} color="#FFB300" />
                      <Text style={styles.folderTitle} numberOfLines={1}>
                        {batch}
                      </Text>
                      <Text style={styles.folderMeta}>{count} files</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
        ) : (
          // Folder contents view (materials inside selected batch)
          <>
            {/* Category tabs inside batch */}
            <View style={styles.tabsRow}>
              {(['Notes', 'E-Book', 'Doc'] as const).map((tab) => {
                const count = materials.filter((m) => m.batch_name === selectedBatchFolder && m.type === tab).length;
                return (
                  <TouchableOpacity
                    key={tab}
                    style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
                    onPress={() => setActiveTab(tab)}
                  >
                    <Text style={[styles.tabButtonText, activeTab === tab && styles.tabButtonTextActive]}>
                      {tab} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* List of files */}
            {isLoading ? (
              <ActivityIndicator color={Colors.accent.primary} style={{ marginTop: 20 }} />
            ) : (
              <View style={{ marginTop: 10 }}>
                {materials.filter((m) => m.batch_name === selectedBatchFolder && m.type === activeTab).length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="document-text-outline" size={48} color={Colors.text.tertiary} />
                    <Text style={styles.emptyText}>No {activeTab} files in this batch yet.</Text>
                  </View>
                ) : (
                  materials
                    .filter((m) => m.batch_name === selectedBatchFolder && m.type === activeTab)
                    .map((item) => (
                      <View key={item.id} style={styles.fileCard}>
                        <View style={styles.fileIconWrap}>
                          {item.thumbnail_url ? (
                            <CachedImage uri={item.thumbnail_url} style={styles.fileThumbnail} contentFit="cover" />
                          ) : (
                            <Ionicons
                              name={
                                item.type === 'Notes'
                                  ? 'document-text'
                                  : item.type === 'E-Book'
                                  ? 'book'
                                  : 'document'
                              }
                              size={24}
                              color={Colors.accent.primary}
                            />
                          )}
                        </View>
                        <View style={{ flex: 1, paddingHorizontal: 12 }}>
                          <Text style={styles.fileTitle} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={styles.fileMeta} numberOfLines={1}>
                            {item.file_name || 'NoteBank File'}
                          </Text>
                        </View>

                        <View style={styles.fileActions}>
                          <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={() => triggerDownload(item.file_url, item.file_name)}
                          >
                            <Ionicons name="download-outline" size={20} color={Colors.status.success} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={() => handleDeleteMaterial(item.id, item.title)}
                          >
                            <Ionicons name="trash-outline" size={20} color={Colors.status.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
      {renderUploadModal()}
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
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
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  headerPlaceholder: {
    width: 38,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  scannerButton: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    ...Shadows.md,
  },
  scannerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  scannerIconWrapper: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  scannerTextWrapper: {
    flex: 1,
  },
  scannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFF',
  },
  scannerDesc: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text.primary,
    marginBottom: 14,
    letterSpacing: 0.3,
  },
  foldersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  folderCard: {
    width: (SCREEN_WIDTH - 44) / 3,
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.card.border,
    padding: 12,
    alignItems: 'center',
    ...Shadows.sm,
  },
  folderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 6,
    textAlign: 'center',
  },
  folderMeta: {
    fontSize: 10,
    color: Colors.text.tertiary,
    marginTop: 2,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '500',
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.bg.secondary,
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.card.border,
    marginBottom: 16,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: Colors.accent.primary,
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  tabButtonTextActive: {
    color: '#FFF',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.card.border,
    padding: 12,
    marginBottom: 10,
    ...Shadows.sm,
  },
  fileIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.bg.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  fileThumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  fileTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  fileMeta: {
    fontSize: 11,
    color: Colors.text.tertiary,
    marginTop: 2,
    fontWeight: '500',
  },
  fileActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.bg.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: Colors.bg.primary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  modalScroll: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  pickerBox: {
    width: '100%',
    height: 120,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.card.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
    backgroundColor: Colors.bg.secondary,
  },
  pickerBoxActive: {
    borderColor: Colors.accent.primary,
    backgroundColor: Colors.bg.tertiary,
    borderStyle: 'solid',
  },
  pickerText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 8,
    textAlign: 'center',
  },
  pickerSubText: {
    fontSize: 11,
    color: Colors.text.tertiary,
    marginTop: 4,
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  textInput: {
    width: '100%',
    height: 48,
    backgroundColor: Colors.bg.input,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.card.border,
    paddingHorizontal: 14,
    fontSize: 14,
    color: Colors.text.primary,
    fontWeight: '600',
    marginBottom: 16,
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1.5,
    borderColor: Colors.card.border,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  segmentTextActive: {
    color: '#FFF',
  },
  batchSelectorScroll: {
    marginBottom: 24,
  },
  batchGridSelect: {
    flexDirection: 'row',
    gap: 8,
  },
  batchSelectorChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1.5,
    borderColor: Colors.card.border,
  },
  batchSelectorChipActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  batchSelectorText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  batchSelectorTextActive: {
    color: '#FFF',
  },
  submitButton: {
    flexDirection: 'row',
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    ...Shadows.md,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFF',
  },
  // Upload Progress Card
  progressCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.card.border,
    padding: 16,
    marginTop: 8,
    ...Shadows.md,
  },
  progressCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  progressIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.bg.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  progressSubtitle: {
    fontSize: 11,
    color: Colors.text.tertiary,
    marginTop: 2,
    fontWeight: '500',
  },
  progressPercent: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.accent.primary,
    marginLeft: 8,
  },
  progressTrack: {
    height: 8,
    borderRadius: 100,
    backgroundColor: Colors.bg.tertiary,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 100,
    backgroundColor: Colors.accent.primary,
  },
  progressHint: {
    fontSize: 11,
    color: Colors.text.tertiary,
    textAlign: 'center',
    fontWeight: '500',
  },
});

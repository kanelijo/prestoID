import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Linking,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { CustomAlert } from '@/components/CustomAlert';

let DocumentPicker: any = null;
try {
  DocumentPicker = require('expo-document-picker');
} catch (e) {
  console.warn('DocumentPicker native module not found:', e);
}

const DELETED_BANKS_KEY = '@deleted_test_bank_ids';

// Initial baseline mock data
const INITIAL_MOCK_BANKS = [
  { id: 'mock-1', name: 'Indus Valley Civilization', description: 'History chapter 1 notes & syllabus guidelines.', created_at: new Date().toISOString() },
  { id: 'mock-2', name: 'Cell Structure & Functions', description: 'Biology fundamentals & cell organelles diagram explanation.', created_at: new Date(Date.now() - 86400000).toISOString() },
];

export default function TestBanksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { verified, user, businessId } = useAuthStore();
  
  const [banks, setBanks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Create Modal state
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newBankName, setNewBankName] = useState('');
  const [newBankDesc, setNewBankDesc] = useState('');
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Material Detail View Modal state
  const [selectedMaterial, setSelectedMaterial] = useState<any | null>(null);

  const fetchBanks = async () => {
    setIsLoading(true);

    try {
      // Fetch deleted IDs list
      const deletedIdsRaw = await AsyncStorage.getItem(DELETED_BANKS_KEY);
      const deletedIds: string[] = deletedIdsRaw ? JSON.parse(deletedIdsRaw) : [];

      if (!businessId) {
        const filteredMock = INITIAL_MOCK_BANKS.filter(b => !deletedIds.includes(b.id));
        setBanks(filteredMock);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('test_banks')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Filter out deleted items
      const activeBanks = (data || []).filter(b => !deletedIds.includes(b.id));
      setBanks(activeBanks);
    } catch (err: any) {
      console.warn('Failed to fetch test banks:', err);
      const deletedIdsRaw = await AsyncStorage.getItem(DELETED_BANKS_KEY);
      const deletedIds: string[] = deletedIdsRaw ? JSON.parse(deletedIdsRaw) : [];
      setBanks(INITIAL_MOCK_BANKS.filter(b => !deletedIds.includes(b.id)));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBanks();
  }, [verified, businessId]);

  const handlePickDocument = async () => {
    if (!DocumentPicker || !DocumentPicker.getDocumentAsync) {
      CustomAlert.alert('Unsupported', 'Document picking is not supported in this development build.');
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedFile(result.assets[0]);
      }
    } catch (err) {
      console.warn('Pick document error:', err);
    }
  };

  const uploadFileToSupabase = async (uri: string, folder: string, filename: string): Promise<string> => {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    const filePath = `${folder}/${Date.now()}_${filename}`;
    const ext = filename.split('.').pop()?.toLowerCase();
    const contentType = ext === 'pdf' ? 'application/pdf' : 
                        ext === 'png' ? 'image/png' :
                        ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
                        'application/octet-stream';
                        
    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(filePath, decode(base64), {
        contentType,
        upsert: true,
      });
      
    if (error) throw error;
    
    const { data: publicUrlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);
      
    return publicUrlData.publicUrl;
  };

  const handleCreateBank = async () => {
    if (!newBankName.trim()) {
      CustomAlert.alert('Error', 'Please enter a name for the test bank.');
      return;
    }

    if (!verified || !businessId) {
      const newBank = {
        id: 'local-' + Date.now(),
        name: newBankName.trim(),
        description: newBankDesc.trim(),
        file_url: selectedFile ? selectedFile.uri : null,
        created_at: new Date().toISOString(),
      };
      setBanks([newBank, ...banks]);
      setIsModalVisible(false);
      setNewBankName('');
      setNewBankDesc('');
      setSelectedFile(null);
      CustomAlert.alert('Success 🎉', 'Material created successfully.');
      return;
    }

    setIsUploading(true);
    try {
      let fileUrl = null;
      if (selectedFile) {
        try {
          fileUrl = await uploadFileToSupabase(selectedFile.uri, 'test-banks', selectedFile.name);
        } catch (uploadErr: any) {
          console.warn('File upload failed, saving without file:', uploadErr);
          CustomAlert.alert('Upload Warning', 'File upload failed. Saving the test bank with text notes only.');
        }
      }

      const { data, error } = await supabase
        .from('test_banks')
        .insert({
          business_id: businessId,
          name: newBankName.trim(),
          description: newBankDesc.trim(),
          file_url: fileUrl,
        })
        .select()
        .single();

      if (error) throw error;
      
      setBanks([data, ...banks]);
      setIsModalVisible(false);
      setNewBankName('');
      setNewBankDesc('');
      setSelectedFile(null);
      CustomAlert.alert('Success 🎉', 'Test bank created successfully. You can now use it to generate AI tests.');
    } catch (err: any) {
      CustomAlert.alert('Error', err.message || 'Failed to create test bank');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteBank = (id: string, name: string) => {
    CustomAlert.alert(
      'Delete Material',
      `Are you sure you want to permanently delete "${name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // 1. Save deleted ID to AsyncStorage to ensure permanent deletion even for local/mock items
              const deletedIdsRaw = await AsyncStorage.getItem(DELETED_BANKS_KEY);
              const deletedIds: string[] = deletedIdsRaw ? JSON.parse(deletedIdsRaw) : [];
              if (!deletedIds.includes(id)) {
                deletedIds.push(id);
                await AsyncStorage.setItem(DELETED_BANKS_KEY, JSON.stringify(deletedIds));
              }

              // 2. Delete database row if in Supabase mode
              if (businessId && !id.startsWith('mock-') && !id.startsWith('local-')) {
                const { data: bankRow } = await supabase
                  .from('test_banks')
                  .select('file_url')
                  .eq('id', id)
                  .single();

                await supabase.from('test_banks').delete().eq('id', id);

                if (bankRow?.file_url) {
                  try {
                    const url = bankRow.file_url as string;
                    const storageIndex = url.indexOf('/avatars/');
                    if (storageIndex !== -1) {
                      const filePath = url.substring(storageIndex + '/avatars/'.length);
                      await supabase.storage.from('avatars').remove([filePath]);
                    }
                  } catch (storageErr) {
                    console.warn('Storage cleanup non-fatal warning:', storageErr);
                  }
                }
              }

              // 3. Remove from UI state
              setBanks(prev => prev.filter(b => b.id !== id));
              if (selectedMaterial?.id === id) {
                setSelectedMaterial(null);
              }
              CustomAlert.alert('Deleted', 'Material deleted successfully.');
            } catch (err: any) {
              CustomAlert.alert('Error', 'Failed to delete material: ' + err.message);
            }
          },
        },
      ]
    );
  };

  const handleOpenFile = (fileUrl: string, fileName: string) => {
    if (!fileUrl) return;
    try {
      const lower = fileUrl.toLowerCase();
      if (lower.includes('.pdf')) {
        router.push({
          pathname: '/(admin)/pdf-viewer',
          params: { uri: fileUrl, title: fileName || 'PDF Document' },
        });
      } else {
        Linking.openURL(fileUrl).catch(() => {
          CustomAlert.alert('Cannot Open File', 'Could not open file URL: ' + fileUrl);
        });
      }
    } catch (err: any) {
      Linking.openURL(fileUrl).catch(() => {
        CustomAlert.alert('Error', 'Could not open file.');
      });
    }
  };

  const renderBank = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.bankCard}
      activeOpacity={0.8}
      onPress={() => setSelectedMaterial(item)}
    >
      <View style={styles.iconContainer}>
        <Ionicons
          name={item.file_url ? 'document-text' : 'folder-open'}
          size={24}
          color={Colors.accent.primary}
        />
      </View>

      <View style={styles.bankInfo}>
        <Text style={styles.bankName}>{item.name}</Text>
        <Text style={styles.bankDesc} numberOfLines={2}>
          {item.description || 'No description provided.'}
        </Text>
        
        {item.file_url && (
          <TouchableOpacity
            style={styles.fileLinkRow}
            onPress={() => handleOpenFile(item.file_url, item.name)}
          >
            <Ionicons name="document-attach" size={14} color={Colors.accent.primary} />
            <Text style={styles.fileLinkText} numberOfLines={1}>
              View Attached File ↗
            </Text>
          </TouchableOpacity>
        )}

        <Text style={styles.bankDate}>
          Added on {new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </Text>
      </View>

      <TouchableOpacity style={styles.menuBtn} onPress={() => handleDeleteBank(item.id, item.name)}>
        <Ionicons name="trash-outline" size={20} color={Colors.status.danger} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.push('/(admin)/test')}>
          <Ionicons name="chevron-back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Test Banks & Materials</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setIsModalVisible(true)}>
          <Ionicons name="add" size={24} color={Colors.accent.primary} />
        </TouchableOpacity>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle-outline" size={20} color={Colors.accent.primary} />
        <Text style={styles.infoText}>
          Upload syllabus PDFs, notes, or images here. Tap any material to read notes or open attached documents.
        </Text>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.accent.primary} />
        </View>
      ) : (
        <FlatList
          data={banks}
          renderItem={renderBank}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="folder-open-outline" size={48} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitle}>No Materials Available</Text>
              <Text style={styles.emptyDesc}>Tap the + button to upload notes or syllabus PDFs for AI generation.</Text>
            </View>
          }
        />
      )}

      {/* Material Details Viewer Modal */}
      <Modal
        visible={selectedMaterial !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedMaterial(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedMaterial(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation?.()}
            style={[styles.detailModalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Ionicons name="document-text" size={24} color={Colors.accent.primary} />
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {selectedMaterial?.name}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedMaterial(null)}>
                <Ionicons name="close" size={24} color={Colors.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.detailLabel}>Description & Notes</Text>
              <View style={styles.detailDescBox}>
                <Text style={styles.detailDescText}>
                  {selectedMaterial?.description || 'No detailed description provided for this material.'}
                </Text>
              </View>

              <Text style={styles.detailMetaText}>
                Created: {selectedMaterial?.created_at ? new Date(selectedMaterial.created_at).toLocaleString('en-IN') : 'N/A'}
              </Text>
            </ScrollView>

            <View style={styles.detailModalActionRow}>
              {selectedMaterial?.file_url && (
                <TouchableOpacity
                  style={styles.openFileActionBtn}
                  onPress={() => handleOpenFile(selectedMaterial.file_url, selectedMaterial.name)}
                >
                  <Ionicons name="open-outline" size={18} color="#FFF" />
                  <Text style={styles.openFileActionText}>Open Attached Document</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.deleteMaterialActionBtn}
                onPress={() => handleDeleteBank(selectedMaterial.id, selectedMaterial.name)}
              >
                <Ionicons name="trash-outline" size={18} color={Colors.status.danger} />
                <Text style={styles.deleteMaterialActionText}>Delete Material</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Upload Modal */}
      <Modal
        visible={isModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalContainer}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={(e) => e.stopPropagation?.()}
              style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Upload Test Material</Text>
                <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                  <Ionicons name="close" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Subject / Topic Name *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., Indus Valley Civilization"
                    placeholderTextColor={Colors.text.tertiary}
                    value={newBankName}
                    onChangeText={setNewBankName}
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Description / Notes</Text>
                  <TextInput
                    style={[styles.input, { height: 90 }]}
                    placeholder="Paste text notes here, or describe the topic..."
                    placeholderTextColor={Colors.text.tertiary}
                    multiline
                    value={newBankDesc}
                    onChangeText={setNewBankDesc}
                  />
                </View>
                
                <TouchableOpacity style={styles.uploadBtn} onPress={handlePickDocument}>
                  <Ionicons name={selectedFile ? "checkmark-circle" : "document-attach-outline"} size={20} color={selectedFile ? Colors.status.success : Colors.text.secondary} />
                  <Text style={[styles.uploadBtnText, selectedFile && { color: Colors.status.success }]} numberOfLines={1}>
                    {selectedFile ? selectedFile.name : 'Attach PDF / Image (Optional)'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalFooter}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleCreateBank} disabled={isUploading}>
                  {isUploading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>Save Material</Text>
                  )}
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  addButton: {
    padding: 4,
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: Colors.accent.primary + '15',
    padding: 16,
    margin: 16,
    borderRadius: 12,
    gap: 12,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: Colors.text.primary,
    lineHeight: 18,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  bankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.card.border,
    ...Shadows.sm,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.accent.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  bankInfo: {
    flex: 1,
  },
  bankName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  bankDesc: {
    fontSize: 13,
    color: Colors.text.secondary,
    marginTop: 4,
    lineHeight: 18,
  },
  fileLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF0ED',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
    marginTop: 8,
  },
  fileLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.accent.primary,
  },
  bankDate: {
    fontSize: 11,
    color: Colors.text.tertiary,
    marginTop: 6,
  },
  menuBtn: {
    padding: 8,
  },
  emptyState: {
    paddingTop: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 16,
  },
  emptyDesc: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
  // Detail Modal Styles
  detailModalContent: {
    backgroundColor: Colors.bg.primary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 12,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.secondary,
    marginTop: 8,
    marginBottom: 4,
  },
  detailDescBox: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  detailDescText: {
    fontSize: 14,
    color: Colors.text.primary,
    lineHeight: 20,
  },
  detailMetaText: {
    fontSize: 12,
    color: Colors.text.tertiary,
    marginTop: 10,
  },
  detailModalActionRow: {
    gap: 10,
    marginTop: 16,
  },
  openFileActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent.primary,
    height: 48,
    borderRadius: 14,
    gap: 8,
  },
  openFileActionText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
  deleteMaterialActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    height: 44,
    borderRadius: 14,
    gap: 6,
  },
  deleteMaterialActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.status.danger,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    width: '100%',
  },
  modalContent: {
    backgroundColor: Colors.bg.primary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  modalBody: {
    gap: 16,
  },
  inputContainer: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  input: {
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.card.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.text.primary,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg.tertiary,
    borderWidth: 1,
    borderColor: Colors.card.border,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginTop: 8,
  },
  uploadBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.accent.primary,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
});

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

let DocumentPicker: any = null;
try {
  DocumentPicker = require('expo-document-picker');
} catch (e) {
  console.warn('DocumentPicker native module not found:', e);
}

// Temporary mock data
const MOCK_BANKS = [
  { id: '1', name: 'Indus Valley Civilization', description: 'History chapter 1 notes', created_at: new Date().toISOString() },
  { id: '2', name: 'Cell Structure & Functions', description: 'Biology biology biology', created_at: new Date(Date.now() - 86400000).toISOString() },
];

export default function TestBanksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { verified, user, businessId } = useAuthStore();
  const [banks, setBanks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal state
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newBankName, setNewBankName] = useState('');
  const [newBankDesc, setNewBankDesc] = useState('');
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);

  const fetchBanks = async () => {
    setIsLoading(true);
    if (!verified || !businessId) {
      setBanks(MOCK_BANKS);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('test_banks')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBanks(data || []);
    } catch (err: any) {
      console.warn('Failed to fetch test banks:', err);
      setBanks(MOCK_BANKS);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBanks();
  }, [verified, businessId]);

  const handlePickDocument = async () => {
    if (!DocumentPicker || !DocumentPicker.getDocumentAsync) {
      Alert.alert('Unsupported', 'Document picking is not supported in this development build.');
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
      Alert.alert('Error', 'Please enter a name for the test bank.');
      return;
    }

    if (!verified || !businessId) {
      const newBank = {
        id: Math.random().toString(),
        name: newBankName,
        description: newBankDesc,
        created_at: new Date().toISOString(),
      };
      setBanks([newBank, ...banks]);
      setIsModalVisible(false);
      setNewBankName('');
      setNewBankDesc('');
      setSelectedFile(null);
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
          Alert.alert('Upload Warning', 'File upload failed. Saving the test bank with text notes only.');
        }
      }

      const { data, error } = await supabase
        .from('test_banks')
        .insert({
          business_id: businessId,
          name: newBankName,
          description: newBankDesc,
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
      Alert.alert('Success', 'Test bank created successfully. You can now use it to generate AI tests.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create test bank');
    } finally {
      setIsUploading(false);
    }
  };

  const renderBank = ({ item }: { item: any }) => (
    <View style={styles.bankCard}>
      <View style={styles.iconContainer}>
        <Ionicons name="folder-open-outline" size={24} color={Colors.accent.primary} />
      </View>
      <View style={styles.bankInfo}>
        <Text style={styles.bankName}>{item.name}</Text>
        <Text style={styles.bankDesc} numberOfLines={1}>{item.description || 'No description'}</Text>
        {item.file_url && (
          <View style={styles.fileLinkRow}>
            <Ionicons name="document-outline" size={14} color={Colors.accent.primary} />
            <Text style={styles.fileLinkText} numberOfLines={1}>Attached Document</Text>
          </View>
        )}
        <Text style={styles.bankDate}>
          Added on {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>
      <TouchableOpacity style={styles.menuBtn}>
        <Ionicons name="ellipsis-vertical" size={20} color={Colors.text.tertiary} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Test Banks (Material)</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setIsModalVisible(true)}>
          <Ionicons name="add" size={24} color={Colors.accent.primary} />
        </TouchableOpacity>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle-outline" size={20} color={Colors.accent.primary} />
        <Text style={styles.infoText}>
          Upload syllabus PDFs, notes, or images here. The AI will read these materials to generate high-quality relevant questions.
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
              <Text style={styles.emptyTitle}>No Materials Uploaded</Text>
              <Text style={styles.emptyDesc}>Tap the + button to upload notes or syllabus PDFs for AI generation.</Text>
            </View>
          }
        />
      )}

      {/* Upload Modal */}
      <Modal
        visible={isModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalContainer}
          >
            <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
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
                    style={[styles.input, { height: 80 }]}
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
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.accent.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
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
  },
  fileLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  fileLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.accent.primary,
  },
  bankDate: {
    fontSize: 11,
    color: Colors.text.tertiary,
    marginTop: 6,
  },
  menuBtn: {
    padding: 4,
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
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
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
    marginTop: 32,
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

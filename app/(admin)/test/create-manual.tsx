import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import * as ImagePicker from 'expo-image-picker';
let ImageManipulator: any = null;
try {
  ImageManipulator = require('expo-image-manipulator');
} catch (e) {
  console.warn('ExpoImageManipulator native module is not available:', e);
}
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';

const BATCHES = ['All', 'MPPSC', 'SSC', 'VYAPAM', 'Railway', 'Banking', 'UPSC'];
const optLabels = ['A', 'B', 'C', 'D'];

export default function CreateManualTestScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, verified, businessId } = useAuthStore();
  
  const [title, setTitle] = useState('');
  const [targetBatch, setTargetBatch] = useState('All');
  const [duration, setDuration] = useState('60');
  const [isSavingTest, setIsSavingTest] = useState(false);

  const [questions, setQuestions] = useState<any[]>([]);

  // Edit Modal State
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'text' | 'image'>('text');
  const [editQText, setEditQText] = useState('');
  const [editOptions, setEditOptions] = useState<string[]>(['', '', '', '']);
  const [editCorrectIdx, setEditCorrectIdx] = useState(0);
  const [editExplanation, setEditExplanation] = useState('');

  // Image Cropping State
  const [rawImageUri, setRawImageUri] = useState<string | null>(null);
  const [imageWidth, setImageWidth] = useState(0);
  const [imageHeight, setImageHeight] = useState(0);
  const [cropYPercent, setCropYPercent] = useState(0);
  const [cropHeightPercent, setCropHeightPercent] = useState(100);
  const [croppedImageUri, setCroppedImageUri] = useState<string | null>(null);
  const [isCropping, setIsCropping] = useState(false);

  const openEditModal = (qId: string | null, qData?: any) => {
    setEditingQuestionId(qId);
    if (!qId) {
      setEditorMode('text');
      setEditQText('');
      setEditOptions(['', '', '', '']);
      setEditCorrectIdx(0);
      setEditExplanation('');
      setRawImageUri(null);
      setCroppedImageUri(null);
    } else if (qData) {
      setEditorMode(qData.question_image_url ? 'image' : 'text');
      setEditQText(qData.question_text || '');
      setEditOptions(qData.options && qData.options.length === 4 ? [...qData.options] : ['', '', '', '']);
      setEditCorrectIdx(qData.correct_option !== undefined ? qData.correct_option : 0);
      setEditExplanation(qData.explanation || '');
      setRawImageUri(qData.question_image_url || null); // Note: For local preview, base64 or file URIs will be stored here
      setCroppedImageUri(qData.question_image_url || null);
    }
  };

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Denied', 'Please allow gallery access to pick photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setRawImageUri(asset.uri);
      setImageWidth(asset.width);
      setImageHeight(asset.height);
      setCropYPercent(0);
      setCropHeightPercent(100);
      setCroppedImageUri(asset.uri);
    }
  };

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Denied', 'Please allow camera access to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setRawImageUri(asset.uri);
      setImageWidth(asset.width);
      setImageHeight(asset.height);
      setCropYPercent(0);
      setCropHeightPercent(100);
      setCroppedImageUri(asset.uri);
    }
  };

  const applyCrop = async () => {
    if (!rawImageUri) return;
    setIsCropping(true);
    try {
      const originY = Math.floor((cropYPercent / 100) * imageHeight);
      const cropHeight = Math.floor((cropHeightPercent / 100) * imageHeight);
      const safeOriginY = Math.max(0, Math.min(originY, imageHeight - 10));
      const safeHeight = Math.max(10, Math.min(cropHeight, imageHeight - safeOriginY));

      if (!ImageManipulator || !ImageManipulator.manipulateAsync) {
        Alert.alert('Notice', 'Native image cropping is not available on this device. Using the original uncropped image.', [{ text: 'OK' }]);
        setCroppedImageUri(rawImageUri);
        return;
      }
      const result = await ImageManipulator.manipulateAsync(
        rawImageUri,
        [{ crop: { originX: 0, originY: safeOriginY, width: imageWidth, height: safeHeight } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      setCroppedImageUri(result.uri);
      Alert.alert('Cropped', 'Image cropped successfully.');
    } catch (e) {
      console.warn(e);
      Alert.alert('Crop Failed', 'Could not crop the image.');
    } finally {
      setIsCropping(false);
    }
  };

  const handleSaveQuestion = () => {
    if (editorMode === 'text' && !editQText.trim()) {
      Alert.alert('Error', 'Please enter question text.');
      return;
    }
    if (editorMode === 'image' && !croppedImageUri) {
      Alert.alert('Error', 'Please select and crop an image.');
      return;
    }
    if (editOptions.some(opt => !opt.trim())) {
      Alert.alert('Error', 'Please fill all 4 options.');
      return;
    }

    const newQuestionData = {
      id: editingQuestionId || Math.random().toString(36).substring(7),
      question_text: editorMode === 'text' ? editQText.trim() : null,
      question_image_url: editorMode === 'image' ? croppedImageUri : null,
      options: editOptions.map(o => o.trim()),
      correct_option: editCorrectIdx,
      explanation: editExplanation.trim() || null,
    };

    if (editingQuestionId) {
      setQuestions(prev => prev.map(q => q.id === editingQuestionId ? newQuestionData : q));
    } else {
      setQuestions(prev => [...prev, newQuestionData]);
    }
    setEditingQuestionId(null);
  };

  const handleDeleteQuestion = (id: string) => {
    Alert.alert('Delete', 'Are you sure you want to remove this question?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => setQuestions(prev => prev.filter(q => q.id !== id))
      }
    ]);
  };

  const handleSaveTest = async () => {
    if (!title.trim() || !duration) {
      Alert.alert('Error', 'Please fill all required test details');
      return;
    }
    if (questions.length === 0) {
      Alert.alert('Error', 'Please add at least one question to the test.');
      return;
    }

    setIsSavingTest(true);
    try {
      if (!verified || !businessId) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        Alert.alert('Success', 'Mock manual test created!');
        router.back();
        return;
      }

      // 1. Create the test record
      const { data: newTest, error: testErr } = await supabase
        .from('tests')
        .insert({
          business_id: businessId,
          title,
          batch_name: targetBatch === 'All' ? null : targetBatch,
          duration_minutes: parseInt(duration),
          total_marks: questions.length,
          status: 'published', // manual tests publish directly by default
        })
        .select()
        .single();

      if (testErr) throw testErr;

      // 2. Upload images and prepare question inserts
      const inserts = [];
      for (const q of questions) {
        let finalImageUrl = q.question_image_url;

        // If it's a local file (file://), upload it to Supabase
        if (finalImageUrl && finalImageUrl.startsWith('file://')) {
          try {
            const base64 = await FileSystem.readAsStringAsync(finalImageUrl, { encoding: FileSystem.EncodingType.Base64 });
            const filePath = `${businessId}/${newTest.id}/${Math.random().toString(36).substring(7)}.jpg`;
            const { error: uploadError } = await supabase.storage.from('test-images').upload(filePath, decode(base64), { contentType: 'image/jpeg' });
            if (!uploadError) {
              const { data: urlData } = supabase.storage.from('test-images').getPublicUrl(filePath);
              finalImageUrl = urlData.publicUrl;
            }
          } catch (uploadErr) {
            console.warn('Failed to upload image', uploadErr);
          }
        }

        inserts.push({
          test_id: newTest.id,
          question_text: q.question_text,
          question_image_url: finalImageUrl,
          options: q.options,
          correct_option: q.correct_option,
          explanation: q.explanation
        });
      }

      // 3. Insert questions
      const { error: qErr } = await supabase.from('test_questions').insert(inserts);
      if (qErr) throw qErr;

      Alert.alert('Success', 'Test published successfully!');
      router.back();
    } catch (err: any) {
      Alert.alert('Failed to save test', err.message);
    } finally {
      setIsSavingTest(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manual Test Builder</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.sectionTitleStyle}>Test Details</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Test Title *</Text>
            <TextInput style={styles.input} placeholder="e.g., Weekly Mock Test" placeholderTextColor={Colors.text.tertiary} value={title} onChangeText={setTitle} />
          </View>
          <View style={styles.row}>
            <View style={[styles.inputContainer, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Duration (mins) *</Text>
              <TextInput style={styles.input} placeholder="60" keyboardType="numeric" placeholderTextColor={Colors.text.tertiary} value={duration} onChangeText={setDuration} />
            </View>
            <View style={[styles.inputContainer, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Target Batch *</Text>
              <View style={styles.batchPicker}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {BATCHES.map(b => (
                    <TouchableOpacity key={b} style={[styles.batchChip, targetBatch === b && styles.batchChipActive]} onPress={() => setTargetBatch(b)}>
                      <Text style={[styles.batchChipText, targetBatch === b && styles.batchChipTextActive]}>{b}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.questionsHeader}>
            <Text style={styles.sectionTitleStyle}>Questions ({questions.length})</Text>
          </View>

          {questions.map((q, idx) => (
            <View key={q.id} style={styles.questionItemCard}>
              <View style={styles.qHeader}>
                <View style={styles.qBadge}><Text style={styles.qBadgeText}>Q{idx + 1}</Text></View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={() => openEditModal(q.id, q)}><Ionicons name="pencil" size={20} color={Colors.accent.primary} /></TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteQuestion(q.id)}><Ionicons name="trash" size={20} color={Colors.status.danger} /></TouchableOpacity>
                </View>
              </View>
              {q.question_text && <Text style={styles.qText}>{q.question_text}</Text>}
              {q.question_image_url && (
                <Image source={{ uri: q.question_image_url }} style={styles.qImage} resizeMode="contain" />
              )}
            </View>
          ))}

          <TouchableOpacity style={styles.addQuestionCardBtn} onPress={() => openEditModal(null)}>
            <Ionicons name="add-circle-outline" size={24} color={Colors.accent.primary} />
            <Text style={styles.addQuestionCardBtnText}>Add Question Manually</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.generateBtn} onPress={handleSaveTest} disabled={isSavingTest}>
          {isSavingTest ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.generateBtnText}>Save & Publish Test</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Editor Modal */}
      <Modal visible={editingQuestionId !== null} animationType="slide" transparent={true} onRequestClose={() => setEditingQuestionId(null)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalContainer}>
            <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingQuestionId ? 'Edit Question' : 'Add Question'}</Text>
                <TouchableOpacity onPress={() => setEditingQuestionId(null)}><Ionicons name="close" size={24} color={Colors.text.primary} /></TouchableOpacity>
              </View>

              <View style={styles.toggleRow}>
                <TouchableOpacity style={[styles.toggleBtn, editorMode === 'text' && styles.toggleBtnActive]} onPress={() => setEditorMode('text')}>
                  <Text style={[styles.toggleBtnText, editorMode === 'text' && styles.toggleBtnTextActive]}>Text Mode</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.toggleBtn, editorMode === 'image' && styles.toggleBtnActive]} onPress={() => setEditorMode('image')}>
                  <Text style={[styles.toggleBtnText, editorMode === 'image' && styles.toggleBtnTextActive]}>Image Mode</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                {editorMode === 'text' ? (
                  <>
                    <View style={styles.inputContainer}>
                      <Text style={styles.inputLabel}>Question Text *</Text>
                      <TextInput style={[styles.input, { height: 75 }]} multiline placeholder="Enter the question text" placeholderTextColor={Colors.text.tertiary} value={editQText} onChangeText={setEditQText} />
                    </View>
                    {editOptions.map((opt, idx) => (
                      <View key={idx} style={styles.inputContainer}>
                        <Text style={styles.inputLabel}>Option {optLabels[idx]} *</Text>
                        <TextInput style={styles.input} placeholder={`Enter option ${optLabels[idx]}`} placeholderTextColor={Colors.text.tertiary} value={opt} onChangeText={(val) => {
                          const newOpts = [...editOptions];
                          newOpts[idx] = val;
                          setEditOptions(newOpts);
                        }} />
                      </View>
                    ))}
                  </>
                ) : (
                  <>
                    <View style={styles.imagePickerRow}>
                      <TouchableOpacity style={styles.imgPickerBtn} onPress={handlePickImage}>
                        <Ionicons name="images-outline" size={18} color={Colors.accent.primary} />
                        <Text style={styles.imgPickerBtnText}>Gallery</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.imgPickerBtn} onPress={handleTakePhoto}>
                        <Ionicons name="camera-outline" size={18} color={Colors.accent.primary} />
                        <Text style={styles.imgPickerBtnText}>Camera</Text>
                      </TouchableOpacity>
                    </View>

                    {rawImageUri && (
                      <View style={styles.cropWorkspace}>
                        <Text style={styles.cropTitle}>Crop Boundaries Preview</Text>
                        <View style={styles.cropImageWrapper}>
                          <Image source={{ uri: rawImageUri }} style={styles.cropImagePreview} resizeMode="contain" />
                          <View style={[styles.cropOverlayLine, { top: `${cropYPercent}%`, height: `${cropHeightPercent}%` }]} />
                        </View>
                        <View style={styles.cropControls}>
                          <Text style={styles.controlLabel}>Crop Start Y: {cropYPercent}%</Text>
                          <View style={styles.controlRow}>
                            <TouchableOpacity style={styles.controlBtn} onPress={() => setCropYPercent(prev => Math.max(0, prev - 10))}><Text style={styles.controlBtnText}>-10%</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.controlBtn} onPress={() => setCropYPercent(prev => Math.max(0, prev - 1))}><Text style={styles.controlBtnText}>-1%</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.controlBtn} onPress={() => setCropYPercent(prev => Math.min(100 - cropHeightPercent, prev + 1))}><Text style={styles.controlBtnText}>+1%</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.controlBtn} onPress={() => setCropYPercent(prev => Math.min(100 - cropHeightPercent, prev + 10))}><Text style={styles.controlBtnText}>+10%</Text></TouchableOpacity>
                          </View>
                          <Text style={styles.controlLabel}>Crop Height: {cropHeightPercent}%</Text>
                          <View style={styles.controlRow}>
                            <TouchableOpacity style={styles.controlBtn} onPress={() => setCropHeightPercent(prev => Math.max(10, prev - 10))}><Text style={styles.controlBtnText}>-10%</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.controlBtn} onPress={() => setCropHeightPercent(prev => Math.max(10, prev - 1))}><Text style={styles.controlBtnText}>-1%</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.controlBtn} onPress={() => setCropHeightPercent(prev => Math.min(100 - cropYPercent, prev + 1))}><Text style={styles.controlBtnText}>+1%</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.controlBtn} onPress={() => setCropHeightPercent(prev => Math.min(100 - cropYPercent, prev + 10))}><Text style={styles.controlBtnText}>+10%</Text></TouchableOpacity>
                          </View>
                          <TouchableOpacity style={styles.applyCropBtn} onPress={applyCrop} disabled={isCropping}>
                            <Text style={styles.applyCropBtnText}>{isCropping ? 'Cropping...' : 'Apply Crop'}</Text>
                          </TouchableOpacity>
                        </View>
                        {croppedImageUri && croppedImageUri !== rawImageUri && (
                          <View style={{ marginTop: 15 }}>
                            <Text style={styles.cropTitle}>Cropped Result:</Text>
                            <Image source={{ uri: croppedImageUri }} style={styles.finalPreviewImage} resizeMode="contain" />
                          </View>
                        )}
                      </View>
                    )}

                    <Text style={[styles.cropTitle, { marginTop: 20 }]}>Options for this Image *</Text>
                    {editOptions.map((opt, idx) => (
                      <View key={idx} style={styles.inputContainer}>
                        <Text style={styles.inputLabel}>Option {optLabels[idx]}</Text>
                        <TextInput style={styles.input} placeholder={`Enter option ${optLabels[idx]}`} placeholderTextColor={Colors.text.tertiary} value={opt} onChangeText={(val) => {
                          const newOpts = [...editOptions];
                          newOpts[idx] = val;
                          setEditOptions(newOpts);
                        }} />
                      </View>
                    ))}
                  </>
                )}

                <Text style={styles.inputLabel}>Correct Option *</Text>
                <View style={[styles.row, { flexWrap: 'wrap', marginBottom: 20 }]}>
                  {optLabels.map((lbl, idx) => (
                    <TouchableOpacity key={idx} style={styles.radioOption} onPress={() => setEditCorrectIdx(idx)}>
                      <View style={styles.radio}>{editCorrectIdx === idx && <View style={styles.radioInner} />}</View>
                      <Text style={styles.radioLabel}>Option {lbl}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Explanation (Optional)</Text>
                  <TextInput style={[styles.input, { height: 60 }]} multiline placeholder="Explain why this option is correct" placeholderTextColor={Colors.text.tertiary} value={editExplanation} onChangeText={setEditExplanation} />
                </View>
              </ScrollView>
              
              <View style={styles.modalFooter}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditingQuestionId(null)}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveQuestion}><Text style={styles.modalSaveText}>Save Question</Text></TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.card.border, backgroundColor: Colors.bg.secondary },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bg.tertiary, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.text.primary },
  content: { padding: 20, paddingBottom: 100 },
  card: { backgroundColor: Colors.bg.secondary, borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: Colors.card.border },
  sectionTitleStyle: { fontSize: 14, fontWeight: '700', color: Colors.text.primary, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputContainer: { marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: Colors.text.secondary, marginBottom: 8 },
  input: { backgroundColor: Colors.bg.primary, borderWidth: 1, borderColor: Colors.card.border, borderRadius: 10, paddingHorizontal: 14, height: 48, fontSize: 15, color: Colors.text.primary },
  row: { flexDirection: 'row', gap: 12 },
  batchPicker: { height: 48, justifyContent: 'center' },
  batchChip: { paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: Colors.bg.primary, borderWidth: 1, borderColor: Colors.card.border, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  batchChipActive: { backgroundColor: Colors.accent.primary, borderColor: Colors.accent.primary },
  batchChipText: { fontSize: 13, fontWeight: '500', color: Colors.text.secondary },
  batchChipTextActive: { color: '#FFF', fontWeight: '600' },
  questionsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  questionItemCard: { backgroundColor: Colors.bg.primary, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.card.border, marginBottom: 12 },
  qHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  qBadge: { backgroundColor: Colors.accent.primary + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  qBadgeText: { fontSize: 12, fontWeight: '700', color: Colors.accent.primary },
  qText: { fontSize: 14, color: Colors.text.primary, lineHeight: 20 },
  qImage: { width: '100%', height: 150, marginTop: 10, borderRadius: 8, backgroundColor: Colors.bg.tertiary },
  addQuestionCardBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.accent.primary, borderStyle: 'dashed', backgroundColor: Colors.accent.primary + '08' },
  addQuestionCardBtnText: { fontSize: 15, fontWeight: '600', color: Colors.accent.primary, marginLeft: 8 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.bg.secondary, padding: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: Colors.card.border },
  generateBtn: { height: 54, borderRadius: 27, backgroundColor: Colors.accent.primary, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  generateBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContainer: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.bg.secondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.text.primary },
  toggleRow: { flexDirection: 'row', backgroundColor: Colors.bg.primary, borderRadius: 12, padding: 4, marginBottom: 20, borderWidth: 1, borderColor: Colors.card.border },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  toggleBtnActive: { backgroundColor: Colors.bg.secondary, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 }, android: { elevation: 2 } }) },
  toggleBtnText: { fontSize: 14, fontWeight: '600', color: Colors.text.secondary },
  toggleBtnTextActive: { color: Colors.text.primary },
  modalBody: { flexShrink: 1, marginBottom: 20 },
  imagePickerRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  imgPickerBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 12, backgroundColor: Colors.accent.primary + '15', borderWidth: 1, borderColor: Colors.accent.primary + '30', gap: 8 },
  imgPickerBtnText: { fontSize: 14, fontWeight: '600', color: Colors.accent.primary },
  cropWorkspace: { backgroundColor: Colors.bg.primary, borderRadius: 12, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: Colors.card.border },
  cropTitle: { fontSize: 13, fontWeight: '600', color: Colors.text.secondary, marginBottom: 12 },
  cropImageWrapper: { position: 'relative', width: '100%', height: 250, backgroundColor: Colors.bg.tertiary, borderRadius: 8, overflow: 'hidden' },
  cropImagePreview: { width: '100%', height: '100%' },
  cropOverlayLine: { position: 'absolute', left: 0, right: 0, borderWidth: 2, borderColor: '#00FF00', backgroundColor: 'rgba(0, 255, 0, 0.1)' },
  cropControls: { marginTop: 15 },
  controlLabel: { fontSize: 12, fontWeight: '600', color: Colors.text.secondary, marginBottom: 8, marginTop: 8 },
  controlRow: { flexDirection: 'row', gap: 8 },
  controlBtn: { flex: 1, height: 32, backgroundColor: Colors.bg.tertiary, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  controlBtnText: { fontSize: 11, fontWeight: '600', color: Colors.text.primary },
  applyCropBtn: { marginTop: 15, height: 40, backgroundColor: Colors.accent.primary, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  applyCropBtnText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  finalPreviewImage: { width: '100%', height: 150, borderRadius: 8, backgroundColor: Colors.bg.tertiary },
  radioOption: { flexDirection: 'row', alignItems: 'center', width: '50%', marginBottom: 12 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.text.tertiary, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.accent.primary },
  radioLabel: { fontSize: 14, color: Colors.text.primary },
  modalFooter: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: { flex: 1, height: 50, borderRadius: 12, backgroundColor: Colors.bg.tertiary, justifyContent: 'center', alignItems: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: Colors.text.secondary },
  modalSaveBtn: { flex: 1, height: 50, borderRadius: 12, backgroundColor: Colors.accent.primary, justifyContent: 'center', alignItems: 'center' },
  modalSaveText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
});

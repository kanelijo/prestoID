import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

// Mock test data for fallback
const MOCK_QUESTIONS = [
  {
    id: 'q1',
    question_text: "What was the main feature of the Indus Valley Civilization?",
    options: ["Town Planning", "Iron usage", "Horse chariots", "Temple architecture"],
    correct_option: 0,
    explanation: "The Indus Valley Civilization is best known for its advanced urban town planning and drainage systems."
  },
  {
    id: 'q2',
    question_text: "Which of these was a major port city of Indus Valley?",
    options: ["Harappa", "Lothal", "Mohenjodaro", "Kalibangan"],
    correct_option: 1,
    explanation: "Lothal was a prominent port city known for its massive dockyard."
  }
];

export default function TestReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { verified } = useAuthStore();
  
  const [testDetails, setTestDetails] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);

  // Edit Modal State
  const [editingQuestion, setEditingQuestion] = useState<any | null>(null);
  const [editorMode, setEditorMode] = useState<'text' | 'image'>('text');
  const [editQText, setEditQText] = useState('');
  const [editOptions, setEditOptions] = useState<string[]>(['', '', '', '']);
  const [editCorrectIdx, setEditCorrectIdx] = useState(0);
  const [editExplanation, setEditExplanation] = useState('');
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);

  // Image Cropping State
  const [rawImageUri, setRawImageUri] = useState<string | null>(null);
  const [imageWidth, setImageWidth] = useState(0);
  const [imageHeight, setImageHeight] = useState(0);
  const [cropYPercent, setCropYPercent] = useState(0);
  const [cropHeightPercent, setCropHeightPercent] = useState(100);
  const [croppedImageUri, setCroppedImageUri] = useState<string | null>(null);
  const [isCropping, setIsCropping] = useState(false);

  useEffect(() => {
    fetchTestDetails();
  }, [id, verified]);

  const fetchTestDetails = async () => {
    setIsLoading(true);
    try {
      if (!verified || id === 'demo-test-id') {
        setTestDetails({ title: 'AI Generated Mock Test', duration_minutes: 60, status: 'draft' });
        setQuestions(MOCK_QUESTIONS);
        setIsLoading(false);
        return;
      }

      // Fetch test
      const { data: testData, error: testErr } = await supabase
        .from('tests')
        .select('*')
        .eq('id', id)
        .single();
      
      if (testErr) throw testErr;
      setTestDetails(testData);

      // Fetch questions
      const { data: qData, error: qErr } = await supabase
        .from('test_questions')
        .select('*')
        .eq('test_id', id)
        .order('created_at', { ascending: true });
        
      if (qErr) throw qErr;
      setQuestions(qData || []);
    } catch (err) {
      console.warn(err);
      setTestDetails({ title: 'Unknown Test' });
    } finally {
      setIsLoading(false);
    }
  };

  const openEditModal = (q: any) => {
    setEditingQuestion(q);
    if (q.id === 'new-q') {
      setEditorMode('text');
      setEditQText('');
      setEditOptions(['', '', '', '']);
      setEditCorrectIdx(0);
      setEditExplanation('');
      setRawImageUri(null);
      setCroppedImageUri(null);
    } else {
      setEditorMode(q.question_image_url ? 'image' : 'text');
      setEditQText(q.question_text || '');
      setEditOptions(q.options && q.options.length === 4 ? [...q.options] : ['', '', '', '']);
      setEditCorrectIdx(q.correct_option !== undefined ? q.correct_option : 0);
      setEditExplanation(q.explanation || '');
      setRawImageUri(q.question_image_url || null);
      setCroppedImageUri(q.question_image_url || null);
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

    const result = await ImagePicker.launchCameraAsync({
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

  const applyCrop = async () => {
    if (!rawImageUri) return;
    setIsCropping(true);
    try {
      const originY = Math.floor((cropYPercent / 100) * imageHeight);
      const cropHeight = Math.floor((cropHeightPercent / 100) * imageHeight);
      
      const safeOriginY = Math.max(0, Math.min(originY, imageHeight - 10));
      const safeHeight = Math.max(10, Math.min(cropHeight, imageHeight - safeOriginY));

      const result = await ImageManipulator.manipulateAsync(
        rawImageUri,
        [
          {
            crop: {
              originX: 0,
              originY: safeOriginY,
              width: imageWidth,
              height: safeHeight,
            },
          },
        ],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      setCroppedImageUri(result.uri);
    } catch (e) {
      console.warn('Cropping error:', e);
      Alert.alert('Error', 'Failed to crop image.');
    } finally {
      setIsCropping(false);
    }
  };

  const uploadCroppedImage = async (uri: string): Promise<string> => {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    const filename = `question-${id}-${Math.floor(Date.now() / 1000)}.jpg`;
    const filePath = `test-questions/${filename}`;
                        
    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(filePath, decode(base64), {
        contentType: 'image/jpeg',
        upsert: true,
      });
      
    if (error) throw error;
    
    const { data: publicUrlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);
      
    return publicUrlData.publicUrl;
  };

  const handleSaveQuestion = async () => {
    if (editorMode === 'text') {
      if (!editQText.trim() || editOptions.some(opt => !opt.trim())) {
        Alert.alert('Error', 'Please fill the question and all 4 options.');
        return;
      }
    } else {
      if (!croppedImageUri) {
        Alert.alert('Error', 'Please select and crop a question image.');
        return;
      }
    }

    setIsSavingQuestion(true);
    try {
      let finalImageUrl = null;
      
      if (editorMode === 'image' && croppedImageUri) {
        if (croppedImageUri.startsWith('http')) {
          finalImageUrl = croppedImageUri;
        } else {
          finalImageUrl = await uploadCroppedImage(croppedImageUri);
        }
      }

      const payload = {
        question_text: editorMode === 'text' ? editQText : 'Image Question',
        options: editorMode === 'text' ? editOptions : ['A', 'B', 'C', 'D'],
        correct_option: editCorrectIdx,
        explanation: editExplanation,
        question_image_url: editorMode === 'text' ? null : finalImageUrl
      };

      if (!verified || id === 'demo-test-id') {
        const mockQ = {
          id: editingQuestion?.id === 'new-q' ? Math.random().toString() : editingQuestion.id,
          test_id: id,
          ...payload
        };

        if (editingQuestion?.id && editingQuestion.id !== 'new-q') {
          setQuestions(questions.map(q => q.id === editingQuestion.id ? mockQ : q));
        } else {
          setQuestions([...questions, mockQ]);
        }
        setEditingQuestion(null);
        return;
      }

      if (editingQuestion?.id && editingQuestion.id !== 'new-q') {
        // Update
        const { error } = await supabase
          .from('test_questions')
          .update(payload)
          .eq('id', editingQuestion.id);

        if (error) throw error;
        setQuestions(questions.map(q => q.id === editingQuestion.id ? { ...q, ...payload } : q));
      } else {
        // Insert
        const { data, error } = await supabase
          .from('test_questions')
          .insert({
            test_id: id,
            ...payload
          })
          .select()
          .single();

        if (error) throw error;
        setQuestions([...questions, data]);
      }

      setEditingQuestion(null);
      Alert.alert('Success', 'Question saved successfully.');
    } catch (err: any) {
      Alert.alert('Save Failed', err.message);
    } finally {
      setIsSavingQuestion(false);
    }
  };

  const handlePublish = async () => {
    Alert.alert('Publish Test', 'Are you sure you want to publish this test? Students in the target batches will be notified.', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Publish', 
        onPress: async () => {
          setIsPublishing(true);
          try {
            if (!verified || id === 'demo-test-id') {
              Alert.alert('Success', 'Test published successfully!');
              router.replace('/(admin)/test');
              return;
            }

            const { error } = await supabase
              .from('tests')
              .update({ status: 'published', start_time: new Date().toISOString() })
              .eq('id', id);

            if (error) throw error;
            Alert.alert('Success', 'Test published successfully!');
            router.replace('/(admin)/test');
          } catch (err: any) {
            Alert.alert('Error', err.message);
          } finally {
            setIsPublishing(false);
          }
        }
      }
    ]);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.accent.primary} />
      </SafeAreaView>
    );
  }

  const optLabels = ['A', 'B', 'C', 'D'];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>Review AI Output</Text>
          <Text style={styles.headerSubtitle}>{testDetails?.title}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.infoBanner}>
        <Ionicons name="checkmark-circle" size={20} color={Colors.status.success} />
        <Text style={styles.infoText}>
          AI generated {questions.length} questions. Please review them before publishing.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {questions.map((q, index) => (
          <View key={q.id} style={styles.questionCard}>
            <View style={styles.questionHeader}>
              <Text style={styles.questionNum}>Q{index + 1}</Text>
              <TouchableOpacity style={styles.editBtn} onPress={() => openEditModal(q)}>
                <Ionicons name="pencil" size={16} color={Colors.accent.primary} />
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
            </View>
            
            {q.question_image_url ? (
              <Image source={{ uri: q.question_image_url }} style={styles.questionPreviewImage} resizeMode="contain" />
            ) : (
              <Text style={styles.questionText}>{q.question_text}</Text>
            )}
            
            <View style={styles.optionsList}>
              {(q.options || []).map((opt: string, oIdx: number) => {
                const isCorrect = q.correct_option === oIdx;
                return (
                  <View key={oIdx} style={[styles.optionRow, isCorrect && styles.optionCorrect]}>
                    <View style={styles.optionLetter}><Text style={styles.optionLetterText}>{optLabels[oIdx]}</Text></View>
                    <Text style={styles.optionText}>{opt}</Text>
                    {isCorrect && <Ionicons name="checkmark-circle" size={20} color={Colors.status.success} />}
                  </View>
                );
              })}
            </View>
            
            {q.explanation && (
              <View style={styles.explanationBox}>
                <Text style={styles.explanationLabel}>AI Explanation:</Text>
                <Text style={styles.explanationText}>{q.explanation}</Text>
              </View>
            )}
          </View>
        ))}

        <TouchableOpacity style={styles.addQuestionCardBtn} onPress={() => openEditModal({ id: 'new-q' })}>
          <Ionicons name="add-circle-outline" size={24} color={Colors.accent.primary} />
          <Text style={styles.addQuestionCardBtnText}>Add Question Manually</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.publishBtn} onPress={handlePublish} disabled={isPublishing}>
          {isPublishing ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="send" size={20} color="#FFF" />
              <Text style={styles.publishBtnText}>Publish Test</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Inline Question Editor Modal */}
      <Modal
        visible={editingQuestion !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditingQuestion(null)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalContainer}
          >
            <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingQuestion?.id === 'new-q' ? 'Add MCQ Question' : 'Edit MCQ Question'}
                </Text>
                <TouchableOpacity onPress={() => setEditingQuestion(null)}>
                  <Ionicons name="close" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              {/* Mode Toggle */}
              <View style={styles.toggleRow}>
                <TouchableOpacity 
                  style={[styles.toggleBtn, editorMode === 'text' && styles.toggleBtnActive]}
                  onPress={() => setEditorMode('text')}
                >
                  <Text style={[styles.toggleBtnText, editorMode === 'text' && styles.toggleBtnTextActive]}>Text Mode</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.toggleBtn, editorMode === 'image' && styles.toggleBtnActive]}
                  onPress={() => setEditorMode('image')}
                >
                  <Text style={[styles.toggleBtnText, editorMode === 'image' && styles.toggleBtnTextActive]}>Image Mode</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                {editorMode === 'text' ? (
                  <>
                    <View style={styles.inputContainer}>
                      <Text style={styles.inputLabel}>Question Text *</Text>
                      <TextInput
                        style={[styles.input, { height: 75 }]}
                        multiline
                        placeholder="Enter the question text"
                        placeholderTextColor={Colors.text.tertiary}
                        value={editQText}
                        onChangeText={setEditQText}
                      />
                    </View>

                    {editOptions.map((opt, idx) => (
                      <View key={idx} style={styles.inputContainer}>
                        <Text style={styles.inputLabel}>Option {optLabels[idx]} *</Text>
                        <TextInput
                          style={styles.input}
                          placeholder={`Enter option ${optLabels[idx]}`}
                          placeholderTextColor={Colors.text.tertiary}
                          value={opt}
                          onChangeText={(val) => {
                            const newOpts = [...editOptions];
                            newOpts[idx] = val;
                            setEditOptions(newOpts);
                          }}
                        />
                      </View>
                    ))}
                  </>
                ) : (
                  <>
                    {/* Image Picking buttons */}
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
                          <View 
                            style={[
                              styles.cropOverlayLine, 
                              { 
                                top: `${cropYPercent}%`, 
                                height: `${cropHeightPercent}%` 
                              }
                            ]} 
                          />
                        </View>

                        {/* Adjust buttons */}
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

                          <TouchableOpacity 
                            style={styles.previewCropBtn} 
                            onPress={applyCrop}
                            disabled={isCropping}
                          >
                            <Text style={styles.previewCropBtnText}>
                              {isCropping ? 'Cropping...' : 'Generate Crop Preview'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}

                    {croppedImageUri && (
                      <View style={styles.croppedPreviewCard}>
                        <Text style={styles.cropTitle}>Cropped Preview (What students will see)</Text>
                        <Image source={{ uri: croppedImageUri }} style={styles.croppedImage} resizeMode="contain" />
                      </View>
                    )}
                  </>
                )}

                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Correct Option *</Text>
                  <View style={styles.correctSelectorRow}>
                    {optLabels.map((lbl, idx) => (
                      <TouchableOpacity
                        key={lbl}
                        style={[styles.selectorChip, editCorrectIdx === idx && styles.selectorChipActive]}
                        onPress={() => setEditCorrectIdx(idx)}
                      >
                        <Text style={[styles.selectorChipText, editCorrectIdx === idx && styles.selectorChipTextActive]}>
                          {lbl}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={[styles.inputContainer, { marginBottom: 30 }]}>
                  <Text style={styles.inputLabel}>Explanation</Text>
                  <TextInput
                    style={[styles.input, { height: 60 }]}
                    multiline
                    placeholder="Explain why this option is correct..."
                    placeholderTextColor={Colors.text.tertiary}
                    value={editExplanation}
                    onChangeText={setEditExplanation}
                  />
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingQuestion(null)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveQuestion} disabled={isSavingQuestion}>
                  {isSavingQuestion ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>Save Question</Text>
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
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.status.success + '15',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: Colors.status.success,
    fontWeight: '600',
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  questionCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  questionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  questionNum: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text.tertiary,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.accent.primary + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.accent.primary,
  },
  questionText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 16,
    lineHeight: 22,
  },
  questionPreviewImage: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    marginBottom: 16,
    backgroundColor: '#F3F4F6',
  },
  optionsList: {
    gap: 8,
    marginBottom: 16,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.primary,
    borderWidth: 1,
    borderColor: Colors.card.border,
    padding: 12,
    borderRadius: 10,
    gap: 12,
  },
  optionCorrect: {
    borderColor: Colors.status.success,
    backgroundColor: Colors.status.success + '0A',
  },
  optionLetter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.bg.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionLetterText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text.primary,
  },
  explanationBox: {
    backgroundColor: Colors.bg.primary,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent.primary,
  },
  explanationLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
    marginBottom: 4,
  },
  explanationText: {
    fontSize: 13,
    color: Colors.text.primary,
    lineHeight: 18,
  },
  addQuestionCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.accent.primary,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 16,
    gap: 8,
    marginVertical: 12,
  },
  addQuestionCardBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.accent.primary,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.card.border,
    backgroundColor: Colors.bg.primary,
  },
  publishBtn: {
    flexDirection: 'row',
    backgroundColor: Colors.status.success,
    height: 54,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  publishBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    width: '100%',
    maxHeight: '92%',
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
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  toggleBtnActive: {
    backgroundColor: Colors.bg.secondary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  toggleBtnTextActive: {
    color: Colors.accent.primary,
    fontWeight: '700',
  },
  modalBody: {
    maxHeight: 380,
  },
  inputContainer: {
    gap: 6,
    marginBottom: 12,
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
    padding: 12,
    fontSize: 15,
    color: Colors.text.primary,
  },
  imagePickerRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  imgPickerBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 48,
    borderWidth: 1.5,
    borderColor: Colors.accent.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.bg.secondary,
  },
  imgPickerBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.accent.primary,
  },
  cropWorkspace: {
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.card.border,
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
  },
  cropTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.secondary,
    marginBottom: 8,
  },
  cropImageWrapper: {
    position: 'relative',
    height: 180,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cropImagePreview: {
    width: '100%',
    height: '100%',
  },
  cropOverlayLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderWidth: 2,
    borderColor: Colors.accent.primary,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(175, 40, 0, 0.08)',
  },
  cropControls: {
    marginTop: 12,
    gap: 8,
  },
  controlLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  controlRow: {
    flexDirection: 'row',
    gap: 6,
  },
  controlBtn: {
    flex: 1,
    height: 32,
    borderRadius: 6,
    backgroundColor: Colors.bg.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  controlBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  previewCropBtn: {
    height: 40,
    backgroundColor: Colors.accent.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  previewCropBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  croppedPreviewCard: {
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.status.success,
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
  },
  croppedImage: {
    width: '100%',
    height: 120,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  correctSelectorRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  selectorChip: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.card.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectorChipActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  selectorChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  selectorChipTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
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

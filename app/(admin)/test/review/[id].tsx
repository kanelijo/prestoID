import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

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
  const [editQText, setEditQText] = useState('');
  const [editOptions, setEditOptions] = useState<string[]>(['', '', '', '']);
  const [editCorrectIdx, setEditCorrectIdx] = useState(0);
  const [editExplanation, setEditExplanation] = useState('');
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);

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
    setEditQText(q.question_text);
    setEditOptions(q.options && q.options.length === 4 ? [...q.options] : ['', '', '', '']);
    setEditCorrectIdx(q.correct_option !== undefined ? q.correct_option : 0);
    setEditExplanation(q.explanation || '');
  };

  const handleSaveQuestion = async () => {
    if (!editQText.trim() || editOptions.some(opt => !opt.trim())) {
      Alert.alert('Error', 'Please fill the question and all 4 options.');
      return;
    }

    if (!verified || id === 'demo-test-id') {
      const updated = questions.map(q => {
        if (q.id === editingQuestion.id) {
          return {
            ...q,
            question_text: editQText,
            options: [...editOptions],
            correct_option: editCorrectIdx,
            explanation: editExplanation
          };
        }
        return q;
      });
      setQuestions(updated);
      setEditingQuestion(null);
      return;
    }

    setIsSavingQuestion(true);
    try {
      const { error } = await supabase
        .from('test_questions')
        .update({
          question_text: editQText,
          options: editOptions,
          correct_option: editCorrectIdx,
          explanation: editExplanation
        })
        .eq('id', editingQuestion.id);

      if (error) throw error;

      // Update local state
      const updated = questions.map(q => {
        if (q.id === editingQuestion.id) {
          return {
            ...q,
            question_text: editQText,
            options: [...editOptions],
            correct_option: editCorrectIdx,
            explanation: editExplanation
          };
        }
        return q;
      });
      setQuestions(updated);
      setEditingQuestion(null);
      Alert.alert('Success', 'Question updated successfully.');
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
            
            <Text style={styles.questionText}>{q.question_text}</Text>
            
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
                <Text style={styles.modalTitle}>Edit MCQ Question</Text>
                <TouchableOpacity onPress={() => setEditingQuestion(null)}>
                  <Ionicons name="close" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Question Text *</Text>
                  <TextInput
                    style={[styles.input, { height: 80 }]}
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
                    style={[styles.input, { height: 70 }]}
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
                    <Text style={styles.saveBtnText}>Save Changes</Text>
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
    maxHeight: '90%',
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
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  modalBody: {
    maxHeight: 400,
  },
  inputContainer: {
    gap: 8,
    marginBottom: 14,
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
    marginTop: 20,
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

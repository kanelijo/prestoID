import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
    option_a: "Town Planning",
    option_b: "Iron usage",
    option_c: "Horse chariots",
    option_d: "Temple architecture",
    correct_option: "A",
    explanation: "The Indus Valley Civilization is best known for its advanced urban town planning and drainage systems."
  },
  {
    id: 'q2',
    question_text: "Which of these was a major port city of Indus Valley?",
    option_a: "Harappa",
    option_b: "Lothal",
    option_c: "Mohenjodaro",
    option_d: "Kalibangan",
    correct_option: "B",
    explanation: "Lothal was a prominent port city known for its massive dockyard."
  }
];

export default function TestReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { verified } = useAuthStore();
  
  const [testDetails, setTestDetails] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);

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
        .order('order_index', { ascending: true });
        
      if (qErr) throw qErr;
      setQuestions(qData || []);
    } catch (err) {
      console.warn(err);
      setTestDetails({ title: 'Unknown Test' });
    } finally {
      setIsLoading(false);
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
              .update({ status: 'published', scheduled_at: new Date().toISOString() })
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
              <TouchableOpacity style={styles.editBtn}>
                <Ionicons name="pencil" size={16} color={Colors.accent.primary} />
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={styles.questionText}>{q.question_text}</Text>
            
            <View style={styles.optionsList}>
              <View style={[styles.optionRow, q.correct_option === 'A' && styles.optionCorrect]}>
                <View style={styles.optionLetter}><Text style={styles.optionLetterText}>A</Text></View>
                <Text style={styles.optionText}>{q.option_a}</Text>
                {q.correct_option === 'A' && <Ionicons name="checkmark-circle" size={20} color={Colors.status.success} />}
              </View>
              <View style={[styles.optionRow, q.correct_option === 'B' && styles.optionCorrect]}>
                <View style={styles.optionLetter}><Text style={styles.optionLetterText}>B</Text></View>
                <Text style={styles.optionText}>{q.option_b}</Text>
                {q.correct_option === 'B' && <Ionicons name="checkmark-circle" size={20} color={Colors.status.success} />}
              </View>
              <View style={[styles.optionRow, q.correct_option === 'C' && styles.optionCorrect]}>
                <View style={styles.optionLetter}><Text style={styles.optionLetterText}>C</Text></View>
                <Text style={styles.optionText}>{q.option_c}</Text>
                {q.correct_option === 'C' && <Ionicons name="checkmark-circle" size={20} color={Colors.status.success} />}
              </View>
              <View style={[styles.optionRow, q.correct_option === 'D' && styles.optionCorrect]}>
                <View style={styles.optionLetter}><Text style={styles.optionLetterText}>D</Text></View>
                <Text style={styles.optionText}>{q.option_d}</Text>
                {q.correct_option === 'D' && <Ionicons name="checkmark-circle" size={20} color={Colors.status.success} />}
              </View>
            </View>
            
            <View style={styles.explanationBox}>
              <Text style={styles.explanationLabel}>AI Explanation:</Text>
              <Text style={styles.explanationText}>{q.explanation}</Text>
            </View>
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
});

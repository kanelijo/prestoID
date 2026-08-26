import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface Exam {
  id: string;
  name: string;
}

interface SubExam {
  id: string;
  exam_id: string;
  name: string;
  level: string;
  difficulty_type: string;
  syllabus: string;
  strategy: string;
  ai_prompt_metadata: any;
}

const cleanJsonString = (rawStr: string) => {
  let cleaned = rawStr.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json/, '');
  if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```/, '');
  if (cleaned.endsWith('```')) cleaned = cleaned.replace(/```$/, '');
  cleaned = cleaned.trim();

  let insideQuote = false;
  let escaped = false;
  let result = '';

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === '"' && !escaped) {
      insideQuote = !insideQuote;
    }

    if (insideQuote) {
      if (char === '\n') {
        result += '\\n';
      } else if (char === '\r') {
        result += '\\r';
      } else if (char === '\t') {
        result += '\\t';
      } else if (char.charCodeAt(0) < 32) {
        continue;
      } else {
        result += char;
      }
    } else {
      result += char;
    }
    escaped = char === '\\' && !escaped;
  }
  return result;
};

export default function TargetExamStudentScreen() {
  const router = useRouter();
  const { user, studentData } = useAuthStore();

  const [exams, setExams] = useState<Exam[]>([]);
  const [subExams, setSubExams] = useState<Record<string, SubExam[]>>({});
  const [expandedExamId, setExpandedExamId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Practice Selection Details
  const [selectedSubExam, setSelectedSubExam] = useState<SubExam | null>(null);
  const [selectedParentExam, setSelectedParentExam] = useState<Exam | null>(null);
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);

  // Practice configuration
  const [questionCount, setQuestionCount] = useState(10); // Default: 10 Qs

  // Generation loading states
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState('');

  useEffect(() => {
    fetchExams();
  }, [studentData]);

  const fetchExams = async () => {
    let bizId = studentData?.business_id;

    if (!bizId && user?.id) {
      const { data: list } = await supabase
        .from('students')
        .select('business_id')
        .eq('user_id', user.id)
        .limit(1);
      if (list && list.length > 0) {
        bizId = list[0].business_id;
      }
    }

    if (!bizId) {
      setIsLoading(false);
      return;
    }

    try {
      const { data: examList, error: examError } = await supabase
        .from('exams')
        .select('*')
        .eq('business_id', bizId)
        .order('name');

      if (examError) throw examError;
      setExams(examList || []);

      if (examList && examList.length > 0) {
        const { data: subList, error: subError } = await supabase
          .from('sub_exams')
          .select('*')
          .in('exam_id', examList.map((e) => e.id))
          .order('name');

        if (subError) throw subError;

        const subMap: Record<string, SubExam[]> = {};
        (subList || []).forEach((se) => {
          if (!subMap[se.exam_id]) subMap[se.exam_id] = [];
          subMap[se.exam_id].push(se);
        });
        setSubExams(subMap);
      }
    } catch (err: any) {
      console.warn('Failed to load exams:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLaunchPracticeTest = async () => {
    if (!selectedSubExam || !selectedParentExam) return;

    setIsDetailModalVisible(false);
    setIsGenerating(true);
    setGenerationStep('Initializing Zenza AI Engine...');

    try {
      const geminiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
      if (!geminiKey) throw new Error('Missing AI API key credentials.');

      let activeStudent = studentData;
      if (!activeStudent && user?.id) {
        const { data: stList } = await supabase
          .from('students')
          .select('*')
          .eq('user_id', user.id)
          .limit(1);
        if (stList && stList.length > 0) {
          activeStudent = stList[0];
        }
      }
      if (!activeStudent) throw new Error('Student profile not found.');

      await new Promise((r) => setTimeout(r, 600));
      setGenerationStep('Analyzing Syllabus & Strategies...');

      await new Promise((r) => setTimeout(r, 600));
      setGenerationStep(`Formulating ${questionCount} Custom Exam Questions...`);

      const prompt = `Create a multiple-choice practice mock test in standard JSON format for the specific target exam: "${selectedParentExam.name} - ${selectedSubExam.name}".
      
      Ensure you strictly follow the target guidelines:
      - Subject / Subcategory Target: "${selectedSubExam.name}"
      - Difficulty Level: "${selectedSubExam.level}"
      - Question Style Focus: "${selectedSubExam.difficulty_type}"
      - Specific Exam Syllabus guidelines: "${selectedSubExam.syllabus}"
      - Additional specific instructions: "${selectedSubExam.ai_prompt_metadata?.instructions || ''}"
      
      Number of questions to generate: ${questionCount}
      Duration: ${questionCount * 2} minutes.
      Total Marks: ${questionCount * 5}.
      
      Reply strictly with a JSON block. DO NOT use markdown code blocks like \`\`\`json or surrounding text.
      
      JSON Structure:
      {
        "metadata": {
          "title": "${selectedParentExam.name}: ${selectedSubExam.name} Mock Practice",
          "subject": "${selectedSubExam.name}",
          "duration_minutes": ${questionCount * 2},
          "total_marks": ${questionCount * 5},
          "positive_marks": 5,
          "negative_marks": 0
        },
        "questions": [
          {
            "question_text": "...",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "correct_option": 0,
            "explanation": "..."
          }
        ]
      }`;

      const genAI = new GoogleGenerativeAI(geminiKey);
      const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
      let rawText = '';
      let apiSuccess = false;

      for (const m of models) {
        try {
          const model = genAI.getGenerativeModel({ model: m });
          const result = await model.generateContent(prompt);
          rawText = result.response.text();
          if (rawText) {
            apiSuccess = true;
            break;
          }
        } catch (_) {}
      }

      if (!apiSuccess) {
        throw new Error('AI engine is busy. Please try launching again.');
      }

      setGenerationStep('Assembling Practice Test...');
      const cleaned = cleanJsonString(rawText);
      const testData = JSON.parse(cleaned);

      if (!testData.questions || testData.questions.length === 0) {
        throw new Error('Failed to parse practice test questions.');
      }

      const formattedQuestions = testData.questions.map((q: any, idx: number) => ({
        id: `tpq_${Date.now()}_${idx}`,
        question_text: q.question_text,
        options: q.options,
        correct_option: q.correct_option,
        explanation: q.explanation || '',
      }));

      // Insert target practice exam
      const { data: newTest, error: insertErr } = await supabase
        .from('tests')
        .insert({
          business_id: activeStudent.business_id,
          title: testData.metadata.title,
          subject: testData.metadata.subject,
          description: `Target_Exam_Practice_Test:${activeStudent.id}`,
          duration_minutes: testData.metadata.duration_minutes,
          total_marks: questionCount * 5,
          positive_marks: 5,
          negative_marks: 0,
          status: 'published',
          questions: formattedQuestions,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      // Insert legacy test_questions table for backward compatibility
      try {
        const legacyQuestions = formattedQuestions.map((q: any) => ({
          test_id: newTest.id,
          question_text: q.question_text,
          options: q.options,
          correct_option: q.correct_option,
          explanation: q.explanation,
        }));
        await supabase.from('test_questions').insert(legacyQuestions);
      } catch (_) {}

      setIsGenerating(false);
      // Launch test engine
      router.push(`/(student)/test/engine/${newTest.id}`);
    } catch (err: any) {
      setIsGenerating(false);
      Alert.alert('Launch Failure', err.message || 'AI generation failed.');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.accent.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Target Exam Practice</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>
          Select your target exam to view syllabus breakdowns, read winning strategies, and launch AI practice tests matching the exact level and format.
        </Text>

        {exams.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="school-outline" size={40} color={Colors.text.tertiary} />
            <Text style={styles.emptyText}>No target exams configured by your institute yet.</Text>
          </View>
        ) : (
          exams.map((exam) => {
            const isExpanded = expandedExamId === exam.id;
            const subs = subExams[exam.id] || [];

            return (
              <View key={exam.id} style={styles.examCard}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.cardHeaderRow}
                  onPress={() => setExpandedExamId(isExpanded ? null : exam.id)}
                >
                  <View style={styles.iconBox}>
                    <Ionicons name="ribbon-sharp" size={22} color={Colors.accent.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.examName}>{exam.name}</Text>
                    <Text style={styles.examSubCount}>{subs.length} subcategories configured</Text>
                  </View>
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.text.secondary} />
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.subList}>
                    {subs.length === 0 ? (
                      <Text style={styles.noSubText}>No exam syllabus configured yet.</Text>
                    ) : (
                      subs.map((sub) => (
                        <TouchableOpacity
                          key={sub.id}
                          style={styles.subItem}
                          activeOpacity={0.7}
                          onPress={() => {
                            setSelectedParentExam(exam);
                            setSelectedSubExam(sub);
                            setIsDetailModalVisible(true);
                          }}
                        >
                          <View style={{ flex: 1, gap: 4 }}>
                            <Text style={styles.subName}>{sub.name}</Text>
                            <View style={styles.pillRow}>
                              <View style={styles.levelPill}>
                                <Text style={styles.levelPillText}>{sub.level}</Text>
                              </View>
                              <View style={styles.typePill}>
                                <Text style={styles.typePillText}>{sub.difficulty_type}</Text>
                              </View>
                            </View>
                          </View>
                          <Ionicons name="arrow-forward-circle-outline" size={24} color={Colors.accent.primary} />
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Modal 1: Practice details popup (Syllabus, Strategy, Stepper) */}
      <Modal visible={isDetailModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{ paddingVertical: 40 }} showsVerticalScrollIndicator={false}>
            {selectedSubExam && selectedParentExam && (
              <View style={styles.modalCard}>
                <View style={styles.modalHeaderRow}>
                  <Text style={styles.modalTitle}>{selectedSubExam.name}</Text>
                  <TouchableOpacity onPress={() => setIsDetailModalVisible(false)}>
                    <Ionicons name="close" size={24} color={Colors.text.primary} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalExamSub}>Target Exam: {selectedParentExam.name}</Text>

                {/* Syllabus Card */}
                <View style={styles.detailCard}>
                  <Text style={styles.detailCardHeader}>📋 Syllabus Details</Text>
                  <Text style={styles.detailCardText}>
                    {selectedSubExam.syllabus || 'No syllabus breakdown details configured.'}
                  </Text>
                </View>

                {/* Strategy Card */}
                <View style={[styles.detailCard, { backgroundColor: '#FFFEE0' }]}>
                  <Text style={[styles.detailCardHeader, { color: '#B45309' }]}>💡 Winning Strategy & Tips</Text>
                  <Text style={[styles.detailCardText, { color: '#78350F' }]}>
                    {selectedSubExam.strategy || 'No strategies defined. Take practice tests regularly.'}
                  </Text>
                </View>

                {/* Question selector */}
                <View style={styles.selectorCard}>
                  <Text style={styles.selectorLabel}>Configure Practice Size</Text>
                  <View style={styles.countControls}>
                    {[5, 10, 15, 20].map((num) => (
                      <TouchableOpacity
                        key={num}
                        style={[styles.countBtn, questionCount === num && styles.countBtnActive]}
                        onPress={() => setQuestionCount(num)}
                      >
                        <Text style={[styles.countBtnText, questionCount === num && styles.countBtnTextActive]}>
                          {num} Qs
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <TouchableOpacity style={styles.launchBtn} onPress={handleLaunchPracticeTest}>
                  <Ionicons name="play" size={18} color="#FFF" />
                  <Text style={styles.launchBtnText}>Launch AI Practice Test</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Modal 2: Loader Overlay with steps */}
      <Modal visible={isGenerating} transparent animationType="fade">
        <View style={styles.loaderOverlay}>
          <View style={styles.loaderCard}>
            <ActivityIndicator size="large" color={Colors.accent.primary} />
            <Text style={styles.loaderTitle}>Assembling Target Mock Test</Text>
            <Text style={styles.loaderStep}>{generationStep}</Text>
          </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.bg.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
    backgroundColor: '#FFF',
  },
  backButton: {
    padding: 4,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  emptyBox: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: Colors.card.border,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    ...Shadows.sm,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  examCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.card.border,
    padding: 16,
    ...Shadows.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  examName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  examSubCount: {
    fontSize: 11.5,
    color: Colors.text.tertiary,
    marginTop: 2,
  },
  subList: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.bg.secondary,
    paddingTop: 12,
    gap: 10,
  },
  noSubText: {
    fontSize: 12,
    color: Colors.text.tertiary,
    fontStyle: 'italic',
  },
  subItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  subName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 6,
  },
  levelPill: {
    backgroundColor: '#FFF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  levelPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: Colors.accent.primary,
  },
  typePill: {
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typePillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#137333',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  modalCard: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderRadius: 24,
    padding: 20,
    gap: 14,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  modalExamSub: {
    fontSize: 12.5,
    color: Colors.text.secondary,
    marginTop: -8,
    marginBottom: 4,
  },
  detailCard: {
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.card.border,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  detailCardHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  detailCardText: {
    fontSize: 12,
    color: Colors.text.secondary,
    lineHeight: 17,
  },
  selectorCard: {
    paddingVertical: 4,
    gap: 8,
  },
  selectorLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  countControls: {
    flexDirection: 'row',
    gap: 8,
  },
  countBtn: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.card.border,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBtnActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  countBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  countBtnTextActive: {
    color: '#FFF',
  },
  launchBtn: {
    height: 48,
    backgroundColor: Colors.accent.primary,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  launchBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  loaderOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 24,
    width: '80%',
    alignItems: 'center',
    gap: 12,
  },
  loaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  loaderStep: {
    fontSize: 12,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
});

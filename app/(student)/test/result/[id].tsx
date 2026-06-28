import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Gradients, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

type Tab = 'summary' | 'review';

export default function TestResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); // submission id from completed list
  const router = useRouter();
  const { verified, user } = useAuthStore();
  const activeStudentId = user?.id;

  const [isLoading, setIsLoading] = useState(true);
  const [submission, setSubmission] = useState<any>(null);
  const [testDetails, setTestDetails] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('summary');

  useEffect(() => {
    fetchResults();
  }, [id, activeStudentId]);

  const fetchResults = async () => {
    setIsLoading(true);
    try {
      if (!verified || id === 'demo-test-id') {
        setTestDetails({ title: 'MPPSC Mock Test', duration_minutes: 60 });
        setSubmission({
          test_id: 'demo-test-id',
          score: 85,
          total_questions: 2,
          submitted_at: new Date().toISOString(),
          exit_logs: [],
          answers: { 'q1': 0, 'q2': 1 },
        });
        setQuestions([
          { id: 'q1', question_text: 'What was the main feature of the Indus Valley Civilization?', options: ['Town Planning', 'Iron usage', 'Horse chariots', 'Temple architecture'], correct_option: 0 },
          { id: 'q2', question_text: 'Which of these was a major port city?', options: ['Harappa', 'Lothal', 'Mohenjodaro', 'Kalibangan'], correct_option: 1 },
        ]);
        setIsLoading(false);
        return;
      }

      // Get student record
      const { data: student } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', activeStudentId)
        .maybeSingle();
      if (!student) throw new Error('Student not found');

      // The `id` param is the submission_id from the completed list
      const { data: sub, error: subErr } = await supabase
        .from('test_submissions')
        .select('*, tests(*)')
        .eq('id', id)
        .maybeSingle();
      if (subErr) throw subErr;
      if (!sub) throw new Error('Submission not found');
      setSubmission(sub);
      setTestDetails(sub.tests);

      // Load questions for this test
      const { data: qs, error: qErr } = await supabase
        .from('test_questions')
        .select('id, question_text, question_image_url, options, correct_option')
        .eq('test_id', sub.test_id)
        .order('created_at', { ascending: true });
      if (qErr) throw qErr;
      setQuestions(qs || []);

    } catch (err: any) {
      console.warn('Failed to load test results', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || !submission) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]} edges={['top']}>
        <ActivityIndicator size="large" color={Colors.accent.primary} />
      </SafeAreaView>
    );
  }

  const score = submission.score ?? 0;
  const totalQ = submission.total_questions || questions.length || 1;
  const correctCount = Math.round((score / 100) * totalQ);
  const wrongCount = totalQ - correctCount;
  const exitCount = submission.exit_logs?.length ?? 0;

  let scoreColor = Colors.status.success;
  let scoreMsg = 'Excellent! 🎉';
  if (score < 40) { scoreColor = Colors.status.danger; scoreMsg = 'Keep Practising 💪'; }
  else if (score < 75) { scoreColor = Colors.status.warning; scoreMsg = 'Good Effort 👍'; }

  const optLabels = ['A', 'B', 'C', 'D'];

  const renderQuestion = ({ item, index }: { item: any; index: number }) => {
    const studentAnswer = submission.answers?.[item.id];
    const isCorrect = studentAnswer === item.correct_option;
    const isUnattempted = studentAnswer === undefined || studentAnswer === null;

    const borderColor = isUnattempted
      ? Colors.card.border
      : isCorrect ? Colors.status.success : Colors.status.danger;

    return (
      <View style={[styles.qCard, { borderColor }]}>
        {/* Q number + result badge */}
        <View style={styles.qTop}>
          <Text style={styles.qNum}>Q{index + 1}</Text>
          <View style={[
            styles.qBadge,
            { backgroundColor: isUnattempted ? Colors.bg.tertiary : isCorrect ? Colors.status.success + '20' : Colors.status.danger + '20' }
          ]}>
            <Ionicons
              name={isUnattempted ? 'remove-circle-outline' : isCorrect ? 'checkmark-circle' : 'close-circle'}
              size={14}
              color={isUnattempted ? Colors.text.tertiary : isCorrect ? Colors.status.success : Colors.status.danger}
            />
            <Text style={[styles.qBadgeText, {
              color: isUnattempted ? Colors.text.tertiary : isCorrect ? Colors.status.success : Colors.status.danger
            }]}>
              {isUnattempted ? 'Skipped' : isCorrect ? 'Correct' : 'Wrong'}
            </Text>
          </View>
        </View>

        {/* Question content */}
        {item.question_image_url ? (
          <Image source={{ uri: item.question_image_url }} style={styles.qImage} resizeMode="contain" />
        ) : (
          <Text style={styles.qText}>{item.question_text}</Text>
        )}

        {/* Options */}
        <View style={styles.optionsGrid}>
          {(item.options || ['A', 'B', 'C', 'D']).map((opt: string, oIdx: number) => {
            const isStudentChoice = studentAnswer === oIdx;
            const isCorrectOpt = item.correct_option === oIdx;
            let optBg = Colors.bg.tertiary;
            let optBorder = Colors.card.border;
            let optColor = Colors.text.secondary;
            if (isCorrectOpt) { optBg = Colors.status.success + '20'; optBorder = Colors.status.success; optColor = Colors.status.success; }
            else if (isStudentChoice && !isCorrect) { optBg = Colors.status.danger + '20'; optBorder = Colors.status.danger; optColor = Colors.status.danger; }

            return (
              <View key={oIdx} style={[styles.optRow, { backgroundColor: optBg, borderColor: optBorder }]}>
                <Text style={[styles.optLabel, { color: optColor }]}>{optLabels[oIdx]}</Text>
                <Text style={[styles.optText, { color: optColor }]} numberOfLines={2}>{opt}</Text>
                {isCorrectOpt && <Ionicons name="checkmark-circle" size={16} color={Colors.status.success} />}
                {isStudentChoice && !isCorrect && <Ionicons name="close-circle" size={16} color={Colors.status.danger} />}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(student)/test')} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{testDetails?.title || 'Test Result'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, activeTab === 'summary' && styles.tabActive]} onPress={() => setActiveTab('summary')}>
          <Text style={[styles.tabText, activeTab === 'summary' && styles.tabTextActive]}>📊 Summary</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'review' && styles.tabActive]} onPress={() => setActiveTab('review')}>
          <Text style={[styles.tabText, activeTab === 'review' && styles.tabTextActive]}>📝 Review ({questions.length})</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'summary' ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Score ring */}
          <LinearGradient colors={Gradients.primary as [string, string]} style={styles.scoreGrad}>
            <View style={styles.scoreRing}>
              <Text style={[styles.scoreNum, { color: scoreColor }]}>{score}%</Text>
              <Text style={styles.scoreSub}>Score</Text>
            </View>
            <Text style={styles.scoreMsg}>{scoreMsg}</Text>
            <Text style={styles.scoreDate}>
              {new Date(submission.submitted_at || new Date()).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </LinearGradient>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: Colors.status.success }]}>{correctCount}</Text>
              <Text style={styles.statLabel}>Correct</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: Colors.status.danger }]}>{wrongCount}</Text>
              <Text style={styles.statLabel}>Wrong</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statVal}>{totalQ}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
          </View>

          {exitCount > 0 && (
            <View style={styles.warningCard}>
              <Ionicons name="warning" size={18} color={Colors.status.warning} />
              <Text style={styles.warningText}>
                You exited the app {exitCount} time(s) during this test. Your teacher can see these logs.
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.reviewBtn} onPress={() => setActiveTab('review')}>
            <Ionicons name="list" size={18} color={Colors.accent.primary} />
            <Text style={styles.reviewBtnText}>Review All Questions →</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <FlatList
          data={questions}
          renderItem={renderQuestion}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.text.primary, flex: 1, textAlign: 'center' },

  tabs: {
    flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12,
  },
  tab: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    backgroundColor: Colors.bg.secondary, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.card.border,
  },
  tabActive: { backgroundColor: Colors.accent.primary + '15', borderColor: Colors.accent.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.text.secondary },
  tabTextActive: { color: Colors.accent.primary, fontWeight: '800' },

  content: { paddingHorizontal: 16, paddingBottom: 40 },

  scoreGrad: {
    borderRadius: 20, padding: 28, alignItems: 'center', marginBottom: 16, ...Shadows.md,
  },
  scoreRing: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(0,0,0,0.15)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 12, borderWidth: 4, borderColor: 'rgba(255,255,255,0.3)',
  },
  scoreNum: { fontSize: 36, fontWeight: '900' },
  scoreSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  scoreMsg: { fontSize: 18, fontWeight: '800', color: '#FFF', marginBottom: 4 },
  scoreDate: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },

  statsRow: {
    flexDirection: 'row', backgroundColor: Colors.bg.secondary, borderRadius: 16,
    padding: 20, marginBottom: 12, borderWidth: 1, borderColor: Colors.card.border,
  },
  statBox: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 28, fontWeight: '900', color: Colors.text.primary },
  statLabel: { fontSize: 12, color: Colors.text.tertiary, fontWeight: '600', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: Colors.card.border, marginVertical: 4 },

  warningCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.status.warning + '15',
    borderRadius: 12, padding: 14, marginBottom: 12,
  },
  warningText: { flex: 1, fontSize: 13, color: Colors.text.primary, lineHeight: 18 },

  reviewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, backgroundColor: Colors.accent.primary + '12',
    borderRadius: 14, borderWidth: 1, borderColor: Colors.accent.primary + '30',
  },
  reviewBtnText: { fontSize: 15, fontWeight: '700', color: Colors.accent.primary },

  // Question review
  qCard: {
    backgroundColor: Colors.bg.secondary, borderRadius: 16,
    padding: 16, marginBottom: 14, borderWidth: 1.5,
  },
  qTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  qNum: { fontSize: 13, fontWeight: '800', color: Colors.text.tertiary },
  qBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  qBadgeText: { fontSize: 11, fontWeight: '700' },
  qImage: { width: '100%', height: 160, borderRadius: 8, marginBottom: 12, backgroundColor: Colors.bg.tertiary },
  qText: { fontSize: 14, color: Colors.text.primary, fontWeight: '500', lineHeight: 20, marginBottom: 12 },

  optionsGrid: { gap: 6 },
  optRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1,
  },
  optLabel: { fontSize: 13, fontWeight: '800', width: 20 },
  optText: { flex: 1, fontSize: 13, fontWeight: '500' },
});

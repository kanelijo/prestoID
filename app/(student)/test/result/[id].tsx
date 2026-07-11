import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, FlatList, Modal, BackHandler
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Gradients, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

type Tab = 'summary' | 'review' | 'time';

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
  const [expandedExplanations, setExpandedExplanations] = useState<Record<string, boolean>>({});
  const [activeQuestionModal, setActiveQuestionModal] = useState<{ q: any; index: number } | null>(null);

  useEffect(() => {
    fetchResults();
  }, [id, activeStudentId]);

  useEffect(() => {
    const onBackPress = () => {
      if (activeQuestionModal) {
        setActiveQuestionModal(null);
        return true;
      }
      if (activeTab === 'time') {
        setActiveTab('review');
        return true;
      }
      if (activeTab === 'review') {
        setActiveTab('summary');
        return true;
      }
      return false; // let system navigate back to test index
    };

    const handler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => handler.remove();
  }, [activeTab, activeQuestionModal]);

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
          { id: 'q1', question_text: 'What was the main feature of the Indus Valley Civilization?', options: ['Town Planning', 'Iron usage', 'Horse chariots', 'Temple architecture'], correct_option: 0, explanation: 'The Indus Valley Civilization is famous for its town planning, grid systems, and drainage systems.' },
          { id: 'q2', question_text: 'Which of these was a major port city?', options: ['Harappa', 'Lothal', 'Mohenjodaro', 'Kalibangan'], correct_option: 1, explanation: 'Lothal was one of the most prominent cities of the ancient Indus Valley Civilization, located in Gujarat, and served as a major port.' },
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

      // Load questions for this test (including explanation)
      const { data: qs, error: qErr } = await supabase
        .from('test_questions')
        .select('id, question_text, question_image_url, options, correct_option, explanation')
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
  const posMarks = testDetails?.positive_marks ?? 5;
  const negMarks = testDetails?.negative_marks ?? 0;
  const totalPossible = totalQ * posMarks;

  let correctCount = 0;
  let wrongCount = 0;
  let skippedCount = 0;

  questions.forEach((q) => {
    const ans = submission.answers?.[q.id];
    if (ans === undefined || ans === null) {
      skippedCount++;
    } else if (ans === q.correct_option) {
      correctCount++;
    } else {
      wrongCount++;
    }
  });

  const exitCount = submission.exit_logs?.length ?? 0;
  const scorePercentage = totalPossible > 0 ? (score / totalPossible) * 100 : 0;

  let scoreGradColors = ['#11998e', '#38ef7d']; // Green gradient for >=75%
  let scoreMsg = 'Excellent! 🎉';
  if (scorePercentage < 40) {
    scoreGradColors = ['#2b5876', '#4e4376']; // Premium midnight indigo/purple gradient for <40%
    scoreMsg = 'Keep Practising 💪';
  } else if (scorePercentage < 75) {
    scoreGradColors = ['#f12711', '#f5af19']; // Sunset orange/yellow gradient for 40% - 75%
    scoreMsg = 'Good Effort 👍';
  }

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
          <Image source={{ uri: item.question_image_url }} style={styles.qImage as any} resizeMode="contain" />
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

        {/* Time taken & Telemetry Details */}
        {submission.time_logs?.[item.id] !== undefined && (() => {
          const timeLogs = submission.time_logs || {};
          const timeTaken = timeLogs[item.id] || 0;
          const telemetry = timeLogs.telemetry || {};
          const changes = telemetry.changes?.[item.id] || 0;
          const revisits = telemetry.revisits?.[item.id] || 0;

          return (
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.card.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: (changes > 0 || revisits > 1) ? 6 : 0 }}>
                <Ionicons name="time-outline" size={14} color={Colors.text.tertiary} />
                <Text style={{ fontSize: 12, color: Colors.text.tertiary, fontWeight: '500' }}>
                  Time spent: {timeTaken}s
                </Text>
              </View>

              {/* Telemetry Behavioral Indicators */}
              {(changes > 0 || revisits > 1) && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
                  {changes > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="help-buoy-outline" size={13} color="#F57C00" />
                      <Text style={{ fontSize: 11, color: '#F57C00', fontWeight: '600' }}>
                        Changed choice: {changes} time{changes > 1 ? 's' : ''} (Hesitated)
                      </Text>
                    </View>
                  )}
                  {revisits > 1 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="eye-outline" size={13} color={Colors.accent.primary} />
                      <Text style={{ fontSize: 11, color: Colors.accent.primary, fontWeight: '600' }}>
                        Revisited: {revisits} times
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })()}

        {/* AI-Generated Explanation */}
        {item.explanation && (
          <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 12 }}>
            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              onPress={() => setExpandedExplanations(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="bulb-outline" size={16} color={Colors.accent.primary} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.accent.primary }}>Explanation</Text>
              </View>
              <Ionicons 
                name={expandedExplanations[item.id] ? 'chevron-up' : 'chevron-down'} 
                size={16} 
                color={Colors.accent.primary} 
              />
            </TouchableOpacity>
            {expandedExplanations[item.id] && (
              <View style={{ backgroundColor: Colors.accent.primary + '08', borderRadius: 8, padding: 12, marginTop: 8 }}>
                <Text style={{ fontSize: 13, color: Colors.text.secondary, lineHeight: 18 }}>{item.explanation}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderTimeAnalytics = () => {
    const timeLogs = submission.time_logs || {};
    const times = Object.values(timeLogs).map((t: any) => Number(t) || 0);
    const maxTime = Math.max(...times, 1);
    const totalTime = times.reduce((a, b) => a + b, 0);
    const avgTime = questions.length > 0 ? Math.round(totalTime / questions.length) : 0;
    
    let fastestQIdx = -1;
    let fastestTime = Infinity;
    let slowestQIdx = -1;
    let slowestTime = -1;

    questions.forEach((q, idx) => {
      const t = timeLogs[q.id] || 0;
      if (t > 0) {
        if (t < fastestTime) {
          fastestTime = t;
          fastestQIdx = idx;
        }
        if (t > slowestTime) {
          slowestTime = t;
          slowestQIdx = idx;
        }
      }
    });

    const formatSeconds = (secs: number) => {
      if (secs === Infinity || secs < 0) return '–';
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      if (m > 0) return `${m}m ${s}s`;
      return `${secs}s`;
    };

    return (
      <View style={{ paddingTop: 4 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
          <View style={{ flex: 1, minWidth: '45%', backgroundColor: Colors.bg.secondary, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.card.border, alignItems: 'center' }}>
            <Ionicons name="hourglass-outline" size={18} color={Colors.accent.primary} style={{ marginBottom: 4 }} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.text.primary }}>{formatSeconds(totalTime)}</Text>
            <Text style={{ fontSize: 11, color: Colors.text.tertiary, fontWeight: '600', marginTop: 2 }}>Total Time</Text>
          </View>

          <View style={{ flex: 1, minWidth: '45%', backgroundColor: Colors.bg.secondary, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.card.border, alignItems: 'center' }}>
            <Ionicons name="speedometer-outline" size={18} color={Colors.accent.primary} style={{ marginBottom: 4 }} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.text.primary }}>{formatSeconds(avgTime)}</Text>
            <Text style={{ fontSize: 11, color: Colors.text.tertiary, fontWeight: '600', marginTop: 2 }}>Avg Time / Q</Text>
          </View>

          <View style={{ flex: 1, minWidth: '45%', backgroundColor: Colors.bg.secondary, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.card.border, alignItems: 'center' }}>
            <Ionicons name="trending-up" size={18} color={Colors.status.success} style={{ marginBottom: 4 }} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.status.success }}>
              {fastestQIdx !== -1 ? `Q${fastestQIdx + 1} (${formatSeconds(fastestTime)})` : '–'}
            </Text>
            <Text style={{ fontSize: 11, color: Colors.text.tertiary, fontWeight: '600', marginTop: 2 }}>Fastest Q</Text>
          </View>

          <View style={{ flex: 1, minWidth: '45%', backgroundColor: Colors.bg.secondary, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.card.border, alignItems: 'center' }}>
            <Ionicons name="trending-down" size={18} color={Colors.status.danger} style={{ marginBottom: 4 }} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.status.danger }}>
              {slowestQIdx !== -1 ? `Q${slowestQIdx + 1} (${formatSeconds(slowestTime)})` : '–'}
            </Text>
            <Text style={{ fontSize: 11, color: Colors.text.tertiary, fontWeight: '600', marginTop: 2 }}>Slowest Q</Text>
          </View>
        </View>

        <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.text.primary, marginBottom: 12 }}>Time Spent Per Question</Text>
        <View style={{ gap: 10 }}>
          {questions.map((q, idx) => {
            const timeTaken = timeLogs[q.id] || 0;
            const studentAnswer = submission.answers?.[q.id];
            const isCorrect = studentAnswer === q.correct_option;
            const isUnattempted = studentAnswer === undefined || studentAnswer === null;
            
            const barColor = isUnattempted 
              ? '#D1D1D6' 
              : isCorrect ? Colors.status.success : Colors.status.danger;

            const percentage = Math.max(8, (timeTaken / maxTime) * 100);

            return (
              <TouchableOpacity 
                key={q.id} 
                style={{ backgroundColor: Colors.bg.secondary, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.card.border }}
                onPress={() => setActiveQuestionModal({ q, index: idx })}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.text.secondary }}>Q{idx + 1}</Text>
                    <Ionicons 
                      name={isUnattempted ? 'remove-circle-outline' : isCorrect ? 'checkmark-circle' : 'close-circle'} 
                      size={14} 
                      color={isUnattempted ? Colors.text.tertiary : isCorrect ? Colors.status.success : Colors.status.danger} 
                    />
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.text.secondary }}>{timeTaken}s</Text>
                </View>
                
                <View style={{ height: 8, backgroundColor: Colors.bg.tertiary, borderRadius: 4, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: `${percentage}%`, backgroundColor: barColor, borderRadius: 4 }} />
                </View>
              </TouchableOpacity>
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
        <TouchableOpacity style={[styles.tab, activeTab === 'time' && styles.tabActive]} onPress={() => setActiveTab('time')}>
          <Text style={[styles.tabText, activeTab === 'time' && styles.tabTextActive]}>⏱ Time</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'summary' ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Score ring */}
          <LinearGradient colors={scoreGradColors as [string, string] | any} style={styles.scoreGrad}>
            <View style={styles.scoreRing}>
              <Text style={[styles.scoreNum, { color: '#FFFFFF' }]}>
                {score}<Text style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', fontWeight: '500' }}> / {totalPossible}</Text>
              </Text>
              <Text style={styles.scoreSub}>SCORE</Text>
            </View>
            <Text style={styles.scoreMsg}>{scoreMsg}</Text>
            <Text style={styles.scoreDate}>
              Submitted {new Date(submission.submitted_at || new Date()).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
              <Text style={[styles.statVal, { color: Colors.text.secondary }]}>{skippedCount}</Text>
              <Text style={styles.statLabel}>Skipped</Text>
            </View>
          </View>

          {/* Multi-segment progress bar */}
          <View style={{ height: 8, flexDirection: 'row', borderRadius: 4, overflow: 'hidden', marginHorizontal: 4, marginBottom: 20 }}>
            {correctCount > 0 && <View style={{ flex: correctCount, backgroundColor: Colors.status.success }} />}
            {wrongCount > 0 && <View style={{ flex: wrongCount, backgroundColor: Colors.status.danger }} />}
            {skippedCount > 0 && <View style={{ flex: skippedCount, backgroundColor: '#B0BEC5' }} />}
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
      ) : activeTab === 'review' ? (
        <FlatList
          data={questions}
          renderItem={renderQuestion}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {renderTimeAnalytics()}
        </ScrollView>
      )}
      {activeQuestionModal && (
        <Modal visible={true} transparent animationType="slide" onRequestClose={() => setActiveQuestionModal(null)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }} edges={['top', 'bottom']}>
            <View style={{ backgroundColor: Colors.bg.primary, borderRadius: 20, width: '100%', maxHeight: '85%', overflow: 'hidden', borderWidth: 1, borderColor: Colors.card.border }}>
              
              {/* Modal Header */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.card.border }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.text.primary }}>Question {activeQuestionModal.index + 1} Details</Text>
                <TouchableOpacity onPress={() => setActiveQuestionModal(null)} style={{ padding: 4 }}>
                  <Ionicons name="close" size={22} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ padding: 20 }}>
                <View style={[styles.qCard, { borderWidth: 0, padding: 0, marginBottom: 0 }]}>
                  {activeQuestionModal.q.question_image_url ? (
                    <Image source={{ uri: activeQuestionModal.q.question_image_url }} style={styles.qImage as any} resizeMode="contain" />
                  ) : (
                    <Text style={[styles.qText, { marginBottom: 16 }]}>{activeQuestionModal.q.question_text}</Text>
                  )}

                  <View style={styles.optionsGrid}>
                    {(activeQuestionModal.q.options || ['A', 'B', 'C', 'D']).map((opt: string, oIdx: number) => {
                      const studentAnswer = submission.answers?.[activeQuestionModal.q.id];
                      const isStudentChoice = studentAnswer === oIdx;
                      const isCorrectOpt = activeQuestionModal.q.correct_option === oIdx;
                      const isCorrect = studentAnswer === activeQuestionModal.q.correct_option;
                      
                      let optBg = Colors.bg.tertiary;
                      let optBorder = Colors.card.border;
                      let optColor = Colors.text.secondary;
                      if (isCorrectOpt) { optBg = Colors.status.success + '20'; optBorder = Colors.status.success; optColor = Colors.status.success; }
                      else if (isStudentChoice && !isCorrect) { optBg = Colors.status.danger + '20'; optBorder = Colors.status.danger; optColor = Colors.status.danger; }

                      return (
                        <View key={oIdx} style={[styles.optRow, { backgroundColor: optBg, borderColor: optBorder, marginBottom: 6 }]}>
                          <Text style={[styles.optLabel, { color: optColor }]}>{optLabels[oIdx]}</Text>
                          <Text style={[styles.optText, { color: optColor }]} numberOfLines={2}>{opt}</Text>
                          {isCorrectOpt && <Ionicons name="checkmark-circle" size={16} color={Colors.status.success} />}
                          {isStudentChoice && !isCorrect && <Ionicons name="close-circle" size={16} color={Colors.status.danger} />}
                        </View>
                      );
                    })}
                  </View>

                  {activeQuestionModal.q.explanation && (
                    <View style={{ marginTop: 16, backgroundColor: Colors.accent.primary + '08', borderRadius: 8, padding: 12 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.accent.primary, marginBottom: 4 }}>💡 Explanation</Text>
                      <Text style={{ fontSize: 13, color: Colors.text.secondary, lineHeight: 18 }}>{activeQuestionModal.q.explanation}</Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            </View>
          </SafeAreaView>
        </Modal>
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
    borderRadius: 24, padding: 32, alignItems: 'center', marginBottom: 18,
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.2)', ...Shadows.md,
  },
  scoreRing: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16, borderWidth: 2.5, borderColor: 'rgba(255, 255, 255, 0.45)',
    shadowColor: '#FFF', shadowOpacity: 0.15, shadowRadius: 10,
  },
  scoreNum: { fontSize: 42, fontWeight: '900', letterSpacing: -0.5 },
  scoreSub: { fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: '800', letterSpacing: 1.5, marginTop: 2 },
  scoreMsg: { fontSize: 24, fontWeight: '900', color: '#FFF', marginBottom: 6, letterSpacing: -0.2 },
  scoreDate: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },

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

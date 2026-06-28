import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, ScrollView, Image, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Gradients, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';

type Tab = 'leaderboard' | 'participants' | 'questions';

export default function TestAnalyticsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>('leaderboard');
  const [isLoading, setIsLoading] = useState(true);
  const [testTitle, setTestTitle] = useState('');
  const [totalStudents, setTotalStudents] = useState(0);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);

  useEffect(() => {
    loadAnalytics();
  }, [id]);

  const loadAnalytics = async () => {
    setIsLoading(true);
    try {
      // 1. Test details
      const { data: test } = await supabase
        .from('tests')
        .select('title, batch_name, business_id')
        .eq('id', id)
        .single();
      setTestTitle(test?.title || 'Test Analytics');

      // 2. Total enrolled students in this batch/business
      let countQuery = supabase
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', test?.business_id);
      if (test?.batch_name && test.batch_name !== 'All') {
        countQuery = countQuery.eq('batch_name', test.batch_name);
      }
      const { count } = await countQuery;
      setTotalStudents(count || 0);

      // 3. All submissions with student name
      const { data: subs } = await supabase
        .from('test_submissions')
        .select('*, students(name, batch_name, avatar_url)')
        .eq('test_id', id)
        .order('score', { ascending: false });

      setSubmissions(subs || []);

      // 4. Questions for analysis
      const { data: qs } = await supabase
        .from('test_questions')
        .select('id, question_text, question_image_url, correct_option, options')
        .eq('test_id', id)
        .order('created_at', { ascending: true });

      setQuestions(qs || []);
    } catch (err) {
      console.warn('Analytics load error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Derived stats ───────────────────────────────────────────────────────
  const appeared = submissions.length;
  const avgScore = appeared > 0
    ? Math.round(submissions.reduce((s, sub) => s + (sub.score || 0), 0) / appeared)
    : 0;
  const top20 = submissions.slice(0, 20);

  // Per-question accuracy
  const questionStats = questions.map((q, idx) => {
    const total = submissions.length;
    const correct = submissions.filter(sub => {
      const a = sub.answers?.[q.id];
      return a !== undefined && a === q.correct_option;
    }).length;
    return { ...q, idx, correct, total, accuracy: total ? Math.round((correct / total) * 100) : 0 };
  });

  // ─── Medal colour ─────────────────────────────────────────────────────────
  const medalColor = (rank: number) => {
    if (rank === 1) return '#FFD700';
    if (rank === 2) return '#C0C0C0';
    if (rank === 3) return '#CD7F32';
    return Colors.text.tertiary;
  };

  // ─── Renders ──────────────────────────────────────────────────────────────
  const renderLeaderRow = ({ item, index }: { item: any; index: number }) => {
    const rank = index + 1;
    return (
      <View style={[styles.row, rank <= 3 && { backgroundColor: Colors.bg.tertiary, borderColor: medalColor(rank) + '40' }]}>
        <View style={styles.rankBox}>
          {rank <= 3
            ? <Ionicons name="trophy" size={18} color={medalColor(rank)} />
            : <Text style={styles.rankNum}>{rank}</Text>}
        </View>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarInitial}>{(item.students?.name || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName}>{item.students?.name || 'Unknown'}</Text>
          <Text style={styles.rowSub}>{item.students?.batch_name || ''}</Text>
        </View>
        <View style={styles.scorePill}>
          <Text style={styles.scoreText}>{item.score ?? '–'}%</Text>
        </View>
      </View>
    );
  };

  const [selectedStudent, setSelectedStudent] = useState<any>(null);

  const renderParticipantRow = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[styles.row, { paddingRight: 8 }]}
      activeOpacity={0.75}
      onPress={() => setSelectedStudent(item)}
    >
      <View style={styles.avatarPlaceholder}>
        <Text style={styles.avatarInitial}>{(item.students?.name || '?').charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName}>{item.students?.name || 'Unknown'}</Text>
        <Text style={styles.rowSub}>
          Submitted {new Date(item.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
      <Text style={[styles.scoreText, { color: (item.score ?? 0) >= 60 ? Colors.status.success : Colors.status.danger, marginRight: 6 }]}>
        {item.score ?? '–'}%
      </Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.text.tertiary} />
    </TouchableOpacity>
  );

  const renderQuestionRow = ({ item }: { item: any }) => {
    const optLabels = ['A', 'B', 'C', 'D'];
    const barWidth = `${item.accuracy}%`;
    return (
      <View style={styles.qCard}>
        <View style={styles.qHeader}>
          <Text style={styles.qNum}>Q{item.idx + 1}</Text>
          <View style={[styles.accBadge, { backgroundColor: item.accuracy >= 60 ? Colors.status.success + '20' : Colors.status.danger + '20' }]}>
            <Text style={[styles.accText, { color: item.accuracy >= 60 ? Colors.status.success : Colors.status.danger }]}>
              {item.accuracy}% correct
            </Text>
          </View>
        </View>

        {item.question_image_url ? (
          <Image source={{ uri: item.question_image_url }} style={styles.qImage} resizeMode="contain" />
        ) : (
          <Text style={styles.qText} numberOfLines={3}>{item.question_text}</Text>
        )}

        <View style={styles.correctRow}>
          <Text style={styles.correctLabel}>Correct Answer:</Text>
          <View style={styles.correctBadge}>
            <Text style={styles.correctBadgeText}>Option {optLabels[item.correct_option]}</Text>
          </View>
        </View>

        {/* Accuracy bar */}
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: barWidth as any, backgroundColor: item.accuracy >= 60 ? Colors.status.success : Colors.status.danger }]} />
        </View>
        <Text style={styles.barLabel}>{item.correct} / {item.total} students correct</Text>
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]} edges={['top']}>
        <ActivityIndicator size="large" color={Colors.accent.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle} numberOfLines={1}>{testTitle}</Text>
          <Text style={styles.pageSubtitle}>Test Analytics</Text>
        </View>
      </View>

      {/* Stats Row */}
      <LinearGradient colors={Gradients.primary as [string, string]} style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{totalStudents}</Text>
          <Text style={styles.statLabel}>Enrolled</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{appeared}</Text>
          <Text style={styles.statLabel}>Appeared</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{totalStudents > 0 ? Math.round((appeared / totalStudents) * 100) : 0}%</Text>
          <Text style={styles.statLabel}>Turnout</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{avgScore}%</Text>
          <Text style={styles.statLabel}>Avg Score</Text>
        </View>
      </LinearGradient>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['leaderboard', 'participants', 'questions'] as Tab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'leaderboard' ? '🏆 Top 20' : tab === 'participants' ? '👥 All' : '📊 Analysis'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {activeTab === 'leaderboard' && (
        <FlatList
          data={top20}
          renderItem={renderLeaderRow}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No submissions yet</Text>}
        />
      )}

      {activeTab === 'participants' && (
        <FlatList
          data={submissions}
          renderItem={renderParticipantRow}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No submissions yet</Text>}
        />
      )}

      {activeTab === 'questions' && (
        <FlatList
          data={questionStats}
          renderItem={renderQuestionRow}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No questions found</Text>}
        />
      )}
      {/* Student Detail Modal */}
      <Modal
        visible={!!selectedStudent}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setSelectedStudent(null)}
      >
        <SafeAreaView style={styles.container} edges={['top']}>
          {/* Modal Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setSelectedStudent(null)} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color={Colors.text.primary} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.pageTitle} numberOfLines={1}>{selectedStudent?.students?.name || 'Student'}</Text>
              <Text style={styles.pageSubtitle}>Individual Test Analysis</Text>
            </View>
            <View style={[styles.scorePill, { marginRight: 4 }]}>
              <Text style={styles.scoreText}>{selectedStudent?.score ?? '–'}%</Text>
            </View>
          </View>

          {/* Correct / Wrong summary */}
          {selectedStudent && (() => {
            const totalQ = selectedStudent.total_questions || questions.length;
            const correct = Math.round(((selectedStudent.score ?? 0) / 100) * totalQ);
            const wrong = totalQ - correct;
            return (
              <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 12, gap: 8 }}>
                <View style={[styles.statBox, { flex: 1, backgroundColor: Colors.status.success + '15', borderRadius: 12, paddingVertical: 10 }]}>
                  <Text style={[styles.statVal, { color: Colors.status.success, fontSize: 20 }]}>{correct}</Text>
                  <Text style={[styles.statLabel, { color: Colors.status.success }]}>Correct</Text>
                </View>
                <View style={[styles.statBox, { flex: 1, backgroundColor: Colors.status.danger + '15', borderRadius: 12, paddingVertical: 10 }]}>
                  <Text style={[styles.statVal, { color: Colors.status.danger, fontSize: 20 }]}>{wrong}</Text>
                  <Text style={[styles.statLabel, { color: Colors.status.danger }]}>Wrong</Text>
                </View>
                <View style={[styles.statBox, { flex: 1, backgroundColor: Colors.bg.secondary, borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: Colors.card.border }]}>
                  <Text style={[styles.statVal, { fontSize: 20 }]}>{totalQ}</Text>
                  <Text style={styles.statLabel}>Total</Text>
                </View>
              </View>
            );
          })()}

          {/* Question review list */}
          <FlatList
            data={questions}
            keyExtractor={q => q.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
            renderItem={({ item: q, index }) => {
              const optLabels = ['A', 'B', 'C', 'D'];
              const studentAns = selectedStudent?.answers?.[q.id];
              const isCorrect = studentAns === q.correct_option;
              const isSkipped = studentAns === undefined || studentAns === null;
              const borderColor = isSkipped ? Colors.card.border : isCorrect ? Colors.status.success : Colors.status.danger;
              return (
                <View style={[styles.qCard, { borderColor, marginBottom: 12 }]}>
                  <View style={styles.qHeader}>
                    <Text style={styles.qNum}>Q{index + 1}</Text>
                    <View style={[styles.accBadge, {
                      backgroundColor: isSkipped ? Colors.bg.tertiary : isCorrect ? Colors.status.success + '20' : Colors.status.danger + '20'
                    }]}>
                      <Text style={[styles.accText, {
                        color: isSkipped ? Colors.text.tertiary : isCorrect ? Colors.status.success : Colors.status.danger
                      }]}>{isSkipped ? 'Skipped' : isCorrect ? '✓ Correct' : '✗ Wrong'}</Text>
                    </View>
                  </View>
                  {q.question_image_url
                    ? <Image source={{ uri: q.question_image_url }} style={styles.qImage} resizeMode="contain" />
                    : <Text style={styles.qText} numberOfLines={3}>{q.question_text}</Text>
                  }
                  {/* Options */}
                  <View style={{ gap: 5, marginTop: 6 }}>
                    {(q.options || ['A', 'B', 'C', 'D']).map((opt: string, oIdx: number) => {
                      const isStudentPick = studentAns === oIdx;
                      const isCorrectOpt = q.correct_option === oIdx;
                      let bg = Colors.bg.tertiary; let border = Colors.card.border; let col = Colors.text.secondary;
                      if (isCorrectOpt) { bg = Colors.status.success + '20'; border = Colors.status.success; col = Colors.status.success; }
                      else if (isStudentPick && !isCorrect) { bg = Colors.status.danger + '20'; border = Colors.status.danger; col = Colors.status.danger; }
                      return (
                        <View key={oIdx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, backgroundColor: bg, borderWidth: 1, borderColor: border }}>
                          <Text style={{ fontSize: 12, fontWeight: '800', color: col, width: 18 }}>{optLabels[oIdx]}</Text>
                          <Text style={{ flex: 1, fontSize: 12, color: col }} numberOfLines={2}>{opt}</Text>
                          {isCorrectOpt && <Ionicons name="checkmark-circle" size={14} color={Colors.status.success} />}
                          {isStudentPick && !isCorrect && <Ionicons name="close-circle" size={14} color={Colors.status.danger} />}
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={<Text style={styles.emptyText}>No questions found for this test</Text>}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 8 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  pageTitle: { fontSize: 18, fontWeight: '800', color: Colors.text.primary },
  pageSubtitle: { fontSize: 13, color: Colors.text.secondary, fontWeight: '500', marginTop: 2 },

  statsRow: {
    flexDirection: 'row', marginHorizontal: 16, borderRadius: 16,
    paddingVertical: 16, marginBottom: 16, ...Shadows.md,
  },
  statBox: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 22, fontWeight: '900', color: '#FFF' },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '600', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 4 },

  tabs: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 8, gap: 8 },
  tab: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    backgroundColor: Colors.bg.secondary, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.card.border,
  },
  tabActive: { backgroundColor: Colors.accent.primary + '15', borderColor: Colors.accent.primary },
  tabText: { fontSize: 12, fontWeight: '600', color: Colors.text.secondary },
  tabTextActive: { color: Colors.accent.primary, fontWeight: '800' },

  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  emptyText: { textAlign: 'center', color: Colors.text.tertiary, marginTop: 60, fontSize: 15 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bg.secondary, borderRadius: 14,
    padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.card.border,
  },
  rankBox: { width: 28, alignItems: 'center' },
  rankNum: { fontSize: 14, fontWeight: '800', color: Colors.text.secondary },
  avatarPlaceholder: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.accent.primary + '20',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarInitial: { fontSize: 16, fontWeight: '800', color: Colors.accent.primary },
  rowName: { fontSize: 14, fontWeight: '700', color: Colors.text.primary },
  rowSub: { fontSize: 12, color: Colors.text.tertiary, marginTop: 2 },
  scorePill: {
    backgroundColor: Colors.accent.primary + '15',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  scoreText: { fontSize: 14, fontWeight: '800', color: Colors.accent.primary },

  // Question card
  qCard: {
    backgroundColor: Colors.bg.secondary, borderRadius: 16,
    padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.card.border,
  },
  qHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  qNum: { fontSize: 13, fontWeight: '800', color: Colors.text.secondary },
  accBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  accText: { fontSize: 11, fontWeight: '700' },
  qImage: { width: '100%', height: 140, borderRadius: 8, marginBottom: 10, backgroundColor: Colors.bg.tertiary },
  qText: { fontSize: 14, color: Colors.text.primary, fontWeight: '500', marginBottom: 10, lineHeight: 20 },
  correctRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  correctLabel: { fontSize: 12, color: Colors.text.tertiary, fontWeight: '600' },
  correctBadge: { backgroundColor: Colors.status.success + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  correctBadgeText: { fontSize: 12, color: Colors.status.success, fontWeight: '700' },
  barTrack: { height: 6, backgroundColor: Colors.bg.tertiary, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  barLabel: { fontSize: 11, color: Colors.text.tertiary, marginTop: 4 },
});

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

type Tab = 'students' | 'questions';

export default function TestAnalyticsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>('students');
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

      // 3. Fetch submissions robustly
      let finalSubs = [];
      const { data: subs, error: subErr } = await supabase
        .from('test_submissions')
        .select('*, students(name, batch_name, photo_url)')
        .eq('test_id', id)
        .order('score', { ascending: false });

      const needsFallback = subErr || !subs || subs.some((s: any) => !s.students || Array.isArray(s.students));
      
      if (needsFallback) {
        // Fallback if join fails or returns null students
        const { data: basicSubs } = await supabase
          .from('test_submissions')
          .select('*')
          .eq('test_id', id)
          .order('score', { ascending: false });
        if (basicSubs && basicSubs.length > 0) {
          const studentIds = [...new Set(basicSubs.map((s: any) => s.student_id))];
          const { data: studentRecords } = await supabase
            .from('students')
            .select('id, name, batch_name, photo_url')
            .in('id', studentIds);
            
          const studentMap = (studentRecords || []).reduce((acc: any, st: any) => {
            acc[st.id] = {
              ...st,
              avatar_url: st.photo_url || null
            };
            return acc;
          }, {});
          
          finalSubs = basicSubs.map((sub: any) => ({
            ...sub,
            students: studentMap[sub.student_id] || null
          }));
        } else {
          finalSubs = [];
        }
      } else {
        // Use the joined data, but ensure it's not an array
        finalSubs = subs.map((sub: any) => {
          const st = Array.isArray(sub.students) ? sub.students[0] : sub.students;
          return {
            ...sub,
            students: st ? { ...st, avatar_url: st.photo_url || null } : null
          };
        });
      }

      // Resolve any "Unknown" student names via profiles table fallback
      const missingNameSubmissions = finalSubs.filter((s: any) => !s.students || !s.students.name || s.students.name === 'Unknown');
      if (missingNameSubmissions.length > 0) {
        const studentIds = missingNameSubmissions.map((s: any) => s.student_id);
        const { data: studentUserIds } = await supabase
          .from('students')
          .select('id, user_id')
          .in('id', studentIds);
          
        if (studentUserIds && studentUserIds.length > 0) {
          const userIds = studentUserIds.map((s: any) => s.user_id).filter(Boolean);
          const { data: profileRecords } = await supabase
            .from('profiles')
            .select('id, name, avatar_url')
            .in('id', userIds);
            
          if (profileRecords && profileRecords.length > 0) {
            const profileMap = profileRecords.reduce((acc: any, p: any) => {
              acc[p.id] = p;
              return acc;
            }, {});
            const studentUserMap = studentUserIds.reduce((acc: any, s: any) => {
              acc[s.id] = s.user_id;
              return acc;
            }, {});
            
            finalSubs = finalSubs.map((sub: any) => {
              if (!sub.students || !sub.students.name || sub.students.name === 'Unknown') {
                const uId = studentUserMap[sub.student_id];
                const prof = uId ? profileMap[uId] : null;
                if (prof) {
                  return {
                    ...sub,
                    students: {
                      ...(sub.students || {}),
                      name: prof.name || 'Unknown Student',
                      avatar_url: prof.avatar_url || (sub.students?.avatar_url || null)
                    }
                  };
                }
              }
              return sub;
            });
          }
        }
      }

      setSubmissions(finalSubs);

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
  const [selectedStudent, setSelectedStudent] = useState<any>(null);

  const renderLeaderRow = ({ item, index }: { item: any; index: number }) => {
    const rank = index + 1;
    return (
      <TouchableOpacity 
        style={[styles.row, rank <= 3 && { backgroundColor: Colors.bg.tertiary, borderColor: medalColor(rank) + '40' }]}
        activeOpacity={0.75}
        onPress={() => setSelectedStudent(item)}
      >
        <View style={styles.rankBox}>
          {rank <= 3
            ? <Ionicons name="trophy" size={18} color={medalColor(rank)} />
            : <Text style={styles.rankNum}>{rank}</Text>}
        </View>
        {item.students?.avatar_url ? (
          <Image source={{ uri: item.students.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>{(item.students?.name || '?').charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.rowName}>{item.students?.name || 'Unknown'}</Text>
          <Text style={styles.rowSub}>
            {item.students?.batch_name ? `${item.students.batch_name} • ` : ''}
            {new Date(item.submitted_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        <View style={styles.scorePill}>
          <Text style={styles.scoreText}>{item.score ?? '–'}%</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderParticipantRow = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[styles.row, { paddingRight: 8 }]}
      activeOpacity={0.75}
      onPress={() => setSelectedStudent(item)}
    >
      {item.students?.avatar_url ? (
        <Image source={{ uri: item.students.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarInitial}>{(item.students?.name || '?').charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={{ flex: 1, marginLeft: 12 }}>
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

    // Calculate average time spent on this question
    const qTimes = submissions.map(sub => sub.time_logs?.[item.id] || 0).filter(t => t > 0);
    const avgTimeSpent = qTimes.length > 0 
      ? Math.round(qTimes.reduce((a, b) => a + b, 0) / qTimes.length) 
      : 0;

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
          {avgTimeSpent > 0 && (
            <View style={[styles.correctBadge, { backgroundColor: '#f0f0f0', marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 3 }]}>
              <Ionicons name="time-outline" size={12} color="#666" />
              <Text style={[styles.correctBadgeText, { color: '#666' }]}>Avg: {avgTimeSpent}s</Text>
            </View>
          )}
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
          <Text style={styles.statVal}>{appeared}</Text>
          <Text style={styles.statLabel}>Appeared</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statVal}>{avgScore}</Text>
          <Text style={styles.statLabel}>Avg Score</Text>
        </View>
      </LinearGradient>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['students', 'questions'] as Tab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'students' ? '🏆 Leaderboard & Students' : '📊 Analysis'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {activeTab === 'students' && (
        <FlatList
          data={submissions}
          renderItem={(props) => props.index < 20 ? renderLeaderRow(props) : renderParticipantRow(props)}
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
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {selectedStudent?.students?.avatar_url ? (
                <Image source={{ uri: selectedStudent.students.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitial}>{selectedStudent?.students?.name?.[0] || '?'}</Text>
                </View>
              )}
              <View>
                <Text style={styles.pageTitle} numberOfLines={1}>{selectedStudent?.students?.name || 'Unknown Student'}</Text>
                <Text style={styles.pageSubtitle}>Individual Test Analysis</Text>
              </View>
            </View>
            <View style={[styles.scorePill, { marginRight: 4 }]}>
              <Text style={styles.scoreText}>{selectedStudent?.score ?? '–'}%</Text>
            </View>
          </View>

          {/* Correct / Wrong / Skipped summary */}
          {selectedStudent && (() => {
            let correct = 0;
            let wrong = 0;
            let skipped = 0;
            const totalQ = selectedStudent.total_questions || questions.length;
            
            questions.forEach(q => {
              const ans = selectedStudent.answers?.[q.id];
              if (ans === undefined || ans === null) skipped++;
              else if (ans === q.correct_option) correct++;
              else wrong++;
            });

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
                <View style={[styles.statBox, { flex: 1, backgroundColor: '#ECEFF1', borderRadius: 12, paddingVertical: 10 }]}>
                  <Text style={[styles.statVal, { color: '#546E7A', fontSize: 20 }]}>{skipped}</Text>
                  <Text style={[styles.statLabel, { color: '#546E7A' }]}>Skipped</Text>
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
                  
                  {/* Time taken (Visual Progress Bar) */}
                  {selectedStudent?.time_logs?.[q.id] !== undefined && (() => {
                    const timeLogs = selectedStudent?.time_logs || {};
                    const times = Object.values(timeLogs).map((t: any) => Number(t) || 0);
                    const maxTime = Math.max(...times, 1);
                    const timeTaken = timeLogs[q.id] || 0;
                    const barWidthPercentage = Math.max(8, (timeTaken / maxTime) * 100);
                    const barColor = isSkipped 
                      ? '#D1D1D6' 
                      : isCorrect ? Colors.status.success : Colors.status.danger;

                    return (
                      <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.card.border }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Ionicons name="time-outline" size={14} color={Colors.text.tertiary} />
                            <Text style={{ fontSize: 12, color: Colors.text.tertiary, fontWeight: '500' }}>Time spent:</Text>
                          </View>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.text.secondary }}>{timeTaken}s</Text>
                        </View>
                        <View style={{ height: 8, backgroundColor: Colors.bg.tertiary, borderRadius: 4, overflow: 'hidden' }}>
                          <View style={{ height: '100%', width: `${barWidthPercentage}%`, backgroundColor: barColor, borderRadius: 4 }} />
                        </View>
                      </View>
                    );
                  })()}
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

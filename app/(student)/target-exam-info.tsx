import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Gradients, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { getExamAnalytics, EXAM_ANALYTICS_MAP } from '@/constants/examAnalyticsData';

export default function TargetExamInfoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ exam?: string; from?: string }>();
  const { user } = useAuthStore();

  const [selectedExam, setSelectedExam] = useState(params.exam || 'MPPSC');
  const [checkedTopics, setCheckedTopics] = useState<Record<string, boolean>>({});
  const [activeSubTab, setActiveSubTab] = useState<'syllabus' | 'pattern' | 'cutoffs' | 'strategy'>('syllabus');

  // Reliable Back Navigation — returns directly to previous window
  const handleBack = useCallback(() => {
    if (params.from === 'profile') {
      router.replace('/(student)/profile');
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(student)/profile');
    }
  }, [params.from, router]);

  // Load Active Student Target Exam from storage & database
  useEffect(() => {
    const initTargetExam = async () => {
      try {
        if (params.exam) {
          setSelectedExam(params.exam);
          return;
        }
        const stored = await AsyncStorage.getItem('@student_target_exam');
        if (stored) {
          setSelectedExam(stored);
        }
      } catch (e) {
        console.log('[TargetExam] Init notice:', e);
      }
    };
    initTargetExam();
  }, [params.exam]);

  // Load Saved Topic Checklists for selected exam
  useEffect(() => {
    const loadChecklist = async () => {
      try {
        const saved = await AsyncStorage.getItem(`@checklist_${selectedExam}`);
        if (saved) {
          setCheckedTopics(JSON.parse(saved));
        } else {
          setCheckedTopics({});
        }
      } catch (e) {
        console.log('[TargetExam] Load checklist error:', e);
      }
    };
    loadChecklist();
  }, [selectedExam]);

  // Toggle Topic and Save Immediately
  const toggleTopic = async (id: string) => {
    const updated = {
      ...checkedTopics,
      [id]: !checkedTopics[id],
    };
    setCheckedTopics(updated);
    try {
      await AsyncStorage.setItem(`@checklist_${selectedExam}`, JSON.stringify(updated));
    } catch (e) {
      console.log('[TargetExam] Save checklist error:', e);
    }
  };

  // Get Analytics & Readiness calculation
  const analytics = useMemo(() => getExamAnalytics(selectedExam), [selectedExam]);

  const { totalTopics, completedCount, readinessPct, highYieldCompleted, highYieldTotal } = useMemo(() => {
    let total = 0;
    let completed = 0;
    let hyTotal = 0;
    let hyCompleted = 0;

    analytics.syllabus.forEach((group) => {
      group.topics.forEach((t) => {
        total++;
        if (t.isHighYield) hyTotal++;
        if (checkedTopics[t.id]) {
          completed++;
          if (t.isHighYield) hyCompleted++;
        }
      });
    });

    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return {
      totalTopics: total,
      completedCount: completed,
      readinessPct: pct,
      highYieldTotal: hyTotal,
      highYieldCompleted: hyCompleted,
    };
  }, [analytics, checkedTopics]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ─── HEADER WITH RELIABLE BACK NAVIGATION ────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            onPress={handleBack}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color="#111827" />
          </TouchableOpacity>

          <View style={{ flex: 1, justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Text style={styles.headerTitle}>{selectedExam}</Text>
              <View style={styles.activeGoalBadge}>
                <Ionicons name="flag" size={10} color="#AF2800" />
                <Text style={styles.activeGoalBadgeText}>TARGET GOAL</Text>
              </View>
            </View>
            <Text style={styles.headerSubtitle}>Deep Syllabus, Exam Blueprint & Cutoff Intelligence</Text>
          </View>
        </View>

        {/* Sub-Navigation Tabs */}
        <View style={styles.subTabRow}>
          {[
            { id: 'syllabus', label: 'Checklist', icon: 'checkbox-outline' },
            { id: 'pattern', label: 'Pattern', icon: 'reader-outline' },
            { id: 'cutoffs', label: 'Cut-offs', icon: 'stats-chart-outline' },
            { id: 'strategy', label: 'Strategy', icon: 'bulb-outline' },
          ].map((tab) => {
            const isActive = activeSubTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.subTab, isActive && styles.subTabActive]}
                onPress={() => setActiveSubTab(tab.id as any)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={tab.icon as any}
                  size={14}
                  color={isActive ? '#AF2800' : '#6B7280'}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.subTabText, isActive && styles.subTabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.body} contentContainerStyle={{ paddingBottom: 50 }}>
        {/* ─── READINESS HERO CARD ───────────────────────────────────────── */}
        <View style={styles.readinessCard}>
          <LinearGradient
            colors={['#AF2800', '#D9480F']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.readinessGradient}
          >
            <View style={styles.readinessTopRow}>
              <View>
                <Text style={styles.readinessSubtitle}>{analytics.category}</Text>
                <Text style={styles.readinessTitle}>{analytics.examName}</Text>
              </View>
              <View style={styles.readinessScorePill}>
                <Text style={styles.readinessScoreVal}>{readinessPct}%</Text>
                <Text style={styles.readinessScoreLbl}>Ready</Text>
              </View>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${Math.max(readinessPct, 4)}%` }]} />
            </View>

            {/* Quick Metrics */}
            <View style={styles.readinessMetricsRow}>
              <View style={styles.readinessMetricItem}>
                <Ionicons name="checkmark-done" size={13} color="#FFFFFF" />
                <Text style={styles.readinessMetricText}>
                  {completedCount}/{totalTopics} Topics Completed
                </Text>
              </View>
              <View style={styles.readinessMetricItem}>
                <Ionicons name="flame" size={13} color="#FFD166" />
                <Text style={styles.readinessMetricText}>
                  {highYieldCompleted}/{highYieldTotal} High Yield Mastered
                </Text>
              </View>
            </View>

            {/* Target Score Chip */}
            <View style={styles.targetSafePill}>
              <Ionicons name="shield-checkmark" size={13} color="#FFFFFF" />
              <Text style={styles.targetSafeText}>Target Safe Score: {analytics.targetSafeScore}</Text>
            </View>
          </LinearGradient>
        </View>

        {/* ─── 1. SYLLABUS & CHECKLIST TAB ─────────────────────────────────── */}
        {activeSubTab === 'syllabus' && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>High-Yield Syllabus Checklist</Text>
              <Text style={styles.sectionCountText}>Tap to mark done</Text>
            </View>

            {analytics.syllabus.map((block, idx) => (
              <View key={idx} style={styles.subjectBlock}>
                <View style={styles.subjectHeaderRow}>
                  <Ionicons name="book-outline" size={16} color="#AF2800" />
                  <Text style={styles.subjectName}>{block.subject}</Text>
                </View>

                {block.topics.map((t) => {
                  const isChecked = !!checkedTopics[t.id];
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.topicRow, isChecked && styles.topicRowChecked]}
                      onPress={() => toggleTopic(t.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={isChecked ? 'checkbox' : 'square-outline'}
                        size={21}
                        color={isChecked ? '#AF2800' : '#9CA3AF'}
                      />
                      <Text style={[styles.topicName, isChecked && styles.topicNameChecked]}>
                        {t.name}
                      </Text>
                      <View style={[styles.weightBadge, t.isHighYield && styles.weightBadgeHigh]}>
                        <Text style={[styles.weightText, t.isHighYield && styles.weightTextHigh]}>
                          {t.weight}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        )}

        {/* ─── 2. PATTERN & BLUEPRINT TAB ──────────────────────────────────── */}
        {activeSubTab === 'pattern' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{selectedExam} Examination Blueprint</Text>

            {analytics.pattern.map((item, idx) => (
              <View key={idx} style={styles.infoCard}>
                <Text style={styles.cardHeader}>⏱️ {item.title}</Text>
                {item.details.map((det, dIdx) => (
                  <Text key={dIdx} style={styles.cardText}>• {det}</Text>
                ))}
              </View>
            ))}

            <View style={styles.infoCard}>
              <Text style={styles.cardHeader}>🎓 Eligibility & Qualifications</Text>
              {analytics.eligibility.map((el, eIdx) => (
                <Text key={eIdx} style={styles.cardText}>• {el}</Text>
              ))}
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.cardHeader}>⚠️ Negative Marking Rule</Text>
              <Text style={[styles.cardText, { color: '#DC2626', fontWeight: '700' }]}>
                {analytics.negativeMarking}
              </Text>
            </View>
          </View>
        )}

        {/* ─── 3. CUTOFFS & TRENDS TAB ────────────────────────────────────── */}
        {activeSubTab === 'cutoffs' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Historical Category Cut-Offs</Text>
            <Text style={styles.sectionSubtitle}>Score trends across past 3 examination cycles</Text>

            <View style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableCell, styles.tableCellBold]}>Cycle</Text>
                <Text style={[styles.tableCell, styles.tableCellBold]}>UR (Gen)</Text>
                <Text style={[styles.tableCell, styles.tableCellBold]}>OBC</Text>
                <Text style={[styles.tableCell, styles.tableCellBold]}>SC/ST</Text>
              </View>
              {analytics.cutoffs.map((row, idx) => (
                <View key={idx} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { fontWeight: '700' }]}>{row.year}</Text>
                  <Text style={[styles.tableCell, { color: '#AF2800', fontWeight: '800' }]}>{row.general}</Text>
                  <Text style={styles.tableCell}>{row.obc}</Text>
                  <Text style={styles.tableCell}>{row.sc_st}</Text>
                </View>
              ))}
            </View>

            {/* Target Recommendation */}
            <View style={[styles.infoCard, { marginTop: 14, backgroundColor: '#FFE2DB', borderColor: '#AF2800' }]}>
              <Text style={[styles.cardHeader, { color: '#AF2800' }]}>🎯 Safe Score Strategy Recommendation</Text>
              <Text style={[styles.cardText, { color: '#374151' }]}>
                To overcome unpredictable normalization and competition variance, aim for at least{' '}
                <Text style={{ fontWeight: '800', color: '#AF2800' }}>{analytics.targetSafeScore}</Text> in your mock drill practice sessions.
              </Text>
            </View>
          </View>
        )}

        {/* ─── 4. STRATEGY & ROADMAP TAB ──────────────────────────────────── */}
        {activeSubTab === 'strategy' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3-Phase Preparation Blueprint</Text>

            {analytics.phases.map((ph, idx) => (
              <View key={idx} style={styles.phaseCard}>
                <View style={styles.phaseBadgeRow}>
                  <Text style={styles.phaseBadge}>{ph.phase}</Text>
                </View>
                <Text style={styles.phaseTitle}>{ph.title}</Text>
                <Text style={styles.phaseText}>{ph.description}</Text>
              </View>
            ))}

            <View style={styles.infoCard}>
              <Text style={styles.cardHeader}>💡 Mock Drill Advice</Text>
              <Text style={styles.cardText}>{analytics.mockAdvice}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 1,
  },
  activeGoalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFE2DB',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  activeGoalBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#AF2800',
    letterSpacing: 0.4,
  },
  subTabRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: '#F3F4F6',
    marginTop: 6,
  },
  subTab: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subTabActive: {
    borderBottomWidth: 2.5,
    borderColor: '#AF2800',
  },
  subTabText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
  },
  subTabTextActive: {
    color: '#AF2800',
    fontWeight: '800',
  },
  body: {
    flex: 1,
    padding: 16,
  },

  // Readiness Hero Card
  readinessCard: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 16,
    ...Shadows.md,
  },
  readinessGradient: {
    padding: 16,
  },
  readinessTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  readinessSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  readinessTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 2,
  },
  readinessScorePill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
    ...Shadows.sm,
  },
  readinessScoreVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#AF2800',
  },
  readinessScoreLbl: {
    fontSize: 9,
    fontWeight: '800',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  progressBarTrack: {
    height: 7,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
  },
  readinessMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 10,
  },
  readinessMetricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  readinessMetricText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  targetSafePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 6,
    alignSelf: 'flex-start',
  },
  targetSafeText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Sections & Content
  section: {
    marginBottom: 20,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 10,
  },
  sectionCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#AF2800',
  },

  // Subject Block & Topics
  subjectBlock: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Shadows.sm,
  },
  subjectHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderColor: '#F3F4F6',
  },
  subjectName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderColor: '#F9FAFB',
  },
  topicRowChecked: {
    opacity: 0.65,
  },
  topicName: {
    flex: 1,
    color: '#1F2937',
    fontSize: 13,
    marginLeft: 8,
    fontWeight: '500',
  },
  topicNameChecked: {
    textDecorationLine: 'line-through',
    color: '#9CA3AF',
  },
  weightBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  weightBadgeHigh: {
    backgroundColor: '#FFE2DB',
  },
  weightText: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '600',
  },
  weightTextHigh: {
    color: '#AF2800',
    fontWeight: '800',
  },

  // Info Cards
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Shadows.sm,
  },
  cardHeader: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
  },
  cardText: {
    color: '#4B5563',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 3,
  },

  // Table Card
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Shadows.sm,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderColor: '#F3F4F6',
  },
  tableCell: {
    flex: 1,
    color: '#374151',
    fontSize: 12,
    textAlign: 'center',
  },
  tableCellBold: {
    fontWeight: '800',
    color: '#111827',
  },

  // Phase Card
  phaseCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Shadows.sm,
  },
  phaseBadgeRow: {
    marginBottom: 4,
  },
  phaseBadge: {
    color: '#AF2800',
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  phaseTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  phaseText: {
    color: '#4B5563',
    fontSize: 12,
    lineHeight: 18,
  },
});

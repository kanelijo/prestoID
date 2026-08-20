import React, { useState, useEffect } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Gradients } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

const EXAMS = ['MPPSC', 'MP ESB Patwari', 'MP Police SI', 'SSC CGL', 'Banking PO'];

const SYLLABUS_DATA: Record<string, { subject: string; topics: { id: string; name: string; weight: string }[] }[]> = {};

export default function TargetExamInfoScreen() {
  const { user } = useAuthStore();
  const [selectedExam, setSelectedExam] = useState('MPPSC');
  const [checkedTopics, setCheckedTopics] = useState<Record<string, boolean>>({});
  const [activeSubTab, setActiveSubTab] = useState<'syllabus' | 'pattern' | 'cutoffs' | 'strategy'>('syllabus');

  const toggleTopic = (id: string) => {
    setCheckedTopics((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const syllabusList = SYLLABUS_DATA[selectedExam] || SYLLABUS_DATA['MPPSC'];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Target Exam Hub</Text>
        <Text style={styles.headerSubtitle}>Syllabus, Cutoffs & Preparation Roadmap</Text>

        {/* Exam Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.examScroll}>
          {EXAMS.map((ex) => (
            <TouchableOpacity
              key={ex}
              style={[styles.examChip, selectedExam === ex && styles.examChipActive]}
              onPress={() => setSelectedExam(ex)}
            >
              <Text style={[styles.examChipText, selectedExam === ex && styles.examChipTextActive]}>{ex}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Sub-Navigation Tabs */}
        <View style={styles.subTabRow}>
          <TouchableOpacity style={[styles.subTab, activeSubTab === 'syllabus' && styles.subTabActive]} onPress={() => setActiveSubTab('syllabus')}>
            <Text style={[styles.subTabText, activeSubTab === 'syllabus' && styles.subTabTextActive]}>Checklist</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.subTab, activeSubTab === 'pattern' && styles.subTabActive]} onPress={() => setActiveSubTab('pattern')}>
            <Text style={[styles.subTabText, activeSubTab === 'pattern' && styles.subTabTextActive]}>Pattern</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.subTab, activeSubTab === 'cutoffs' && styles.subTabActive]} onPress={() => setActiveSubTab('cutoffs')}>
            <Text style={[styles.subTabText, activeSubTab === 'cutoffs' && styles.subTabTextActive]}>Cut-offs</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.subTab, activeSubTab === 'strategy' && styles.subTabActive]} onPress={() => setActiveSubTab('strategy')}>
            <Text style={[styles.subTabText, activeSubTab === 'strategy' && styles.subTabTextActive]}>Strategy</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.body}>
        {activeSubTab === 'syllabus' && (
          <View style={styles.section}>
            {syllabusList && syllabusList.length > 0 ? syllabusList.map((block, idx) => (
              <View key={idx} style={styles.subjectBlock}>
                <Text style={styles.subjectName}>{block.subject}</Text>
                {block.topics.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.topicRow, checkedTopics[t.id] && styles.topicRowChecked]}
                    onPress={() => toggleTopic(t.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={checkedTopics[t.id] ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={checkedTopics[t.id] ? Colors.accent.primary : Colors.text.tertiary}
                    />
                    <Text style={[styles.topicName, checkedTopics[t.id] && styles.topicNameChecked]}>
                      {t.name}
                    </Text>
                    <View style={styles.weightBadge}>
                      <Text style={styles.weightText}>{t.weight}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )) : (
              <Text style={{color: Colors.text.tertiary, textAlign: 'center', marginTop: 20}}>No syllabus available for this exam yet.</Text>
            )}
          </View>
        )}

        {activeSubTab === 'pattern' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{selectedExam} Exam Pattern & Eligibility</Text>

            <View style={styles.infoCard}>
              <Text style={styles.cardHeader}>⏱️ Prelims Exam Format</Text>
              <Text style={styles.cardText}>• Paper I: General Studies (100 Questions / 200 Marks)</Text>
              <Text style={styles.cardText}>• Paper II: General Aptitude / CSAT (100 Questions / 200 Marks)</Text>
              <Text style={styles.cardText}>• Negative Marking: None (or as per revised rules)</Text>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.cardHeader}>🎓 Eligibility Criteria</Text>
              <Text style={styles.cardText}>• Qualification: Bachelor's Degree in any discipline from a recognized University.</Text>
              <Text style={styles.cardText}>• Age Limit: 21 to 40 Years (Relaxation for SC/ST/OBC/PwD).</Text>
              <Text style={styles.cardText}>• Domicile: Open to MP & all eligible Indian citizens.</Text>
            </View>
          </View>
        )}

        {activeSubTab === 'cutoffs' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Historical Cut-off Trends</Text>

            <View style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableCell, styles.tableCellBold]}>Year</Text>
                <Text style={[styles.tableCell, styles.tableCellBold]}>General</Text>
                <Text style={[styles.tableCell, styles.tableCellBold]}>OBC</Text>
                <Text style={[styles.tableCell, styles.tableCellBold]}>SC/ST</Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableCell}>2024</Text>
                <Text style={styles.tableCell}>162</Text>
                <Text style={styles.tableCell}>158</Text>
                <Text style={styles.tableCell}>142</Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableCell}>2023</Text>
                <Text style={styles.tableCell}>160</Text>
                <Text style={styles.tableCell}>154</Text>
                <Text style={styles.tableCell}>138</Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableCell}>2022</Text>
                <Text style={styles.tableCell}>154</Text>
                <Text style={styles.tableCell}>148</Text>
                <Text style={styles.tableCell}>134</Text>
              </View>
            </View>
          </View>
        )}

        {activeSubTab === 'strategy' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Step-by-Step 3-Phase Strategy</Text>

            <View style={styles.phaseCard}>
              <Text style={styles.phaseBadge}>Phase 1: Foundation (Month 1-3)</Text>
              <Text style={styles.phaseText}>Complete core NCERTs and State GK textbooks. Build strong conceptual clarity in MP History, Polity, and Geography.</Text>
            </View>

            <View style={styles.phaseCard}>
              <Text style={styles.phaseBadge}>Phase 2: Revision & Speed (Month 4-5)</Text>
              <Text style={styles.phaseText}>Solve Previous 10 Years' Question Papers. Take subject-wise sectional quizzes to boost speed & accuracy.</Text>
            </View>

            <View style={styles.phaseCard}>
              <Text style={styles.phaseBadge}>Phase 3: Mock Test Mastery (Last Month)</Text>
              <Text style={styles.phaseText}>Attempt 2 Full-Length Mock Exams weekly. Analyze weak areas and review detailed solution notes.</Text>
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
    backgroundColor: Colors.bg.primary,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderBottomWidth: 1,
    borderColor: Colors.card.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text.primary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.text.tertiary,
    marginTop: 2,
  },
  examScroll: {
    marginTop: 12,
    marginBottom: 10,
  },
  examChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.bg.secondary,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  examChipActive: {
    backgroundColor: Colors.accent.glow,
    borderWidth: 1.5,
    borderColor: Colors.accent.primary,
  },
  examChipText: {
    color: Colors.text.tertiary,
    fontSize: 12,
  },
  examChipTextActive: {
    color: Colors.accent.primary,
    fontWeight: 'bold',
  },
  subTabRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: Colors.card.border,
  },
  subTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  subTabActive: {
    borderBottomWidth: 2,
    borderColor: Colors.accent.primary,
  },
  subTabText: {
    color: Colors.text.tertiary,
    fontSize: 12,
    fontWeight: '600',
  },
  subTabTextActive: {
    color: Colors.accent.primary,
  },
  body: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 12,
    color: Colors.text.tertiary,
    marginBottom: 14,
  },
  subjectBlock: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  subjectName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.accent.primary,
    marginBottom: 10,
  },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: Colors.card.border,
  },
  topicRowChecked: {
    opacity: 0.6,
  },
  topicName: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: 13,
    marginLeft: 10,
  },
  topicNameChecked: {
    textDecorationLine: 'line-through',
    color: Colors.text.tertiary,
  },
  weightBadge: {
    backgroundColor: Colors.bg.tertiary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  weightText: {
    color: Colors.text.tertiary,
    fontSize: 11,
  },
  infoCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  cardHeader: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  cardText: {
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 4,
  },
  tableCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: Colors.bg.tertiary,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: Colors.card.border,
  },
  tableCell: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: 13,
    textAlign: 'center',
  },
  tableCellBold: {
    fontWeight: 'bold',
    color: Colors.accent.primary,
  },
  phaseCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  phaseBadge: {
    color: Colors.accent.primary,
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 6,
  },
  phaseText: {
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 19,
  },
});

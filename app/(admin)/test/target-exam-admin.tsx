import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { scraperSupabase } from '@/lib/scraperSupabase';
import { useAuthStore } from '@/stores/useAuthStore';

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

export default function TargetExamAdminScreen() {
  const router = useRouter();
  const { businessId } = useAuthStore();

  const [exams, setExams] = useState<Exam[]>([]);
  const [subExams, setSubExams] = useState<Record<string, SubExam[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Scraper State
  const [scrapedCategories, setScrapedCategories] = useState<any[]>([]);
  const [scrapedExams, setScrapedExams] = useState<Record<string, any[]>>({});
  const [isScraping, setIsScraping] = useState(false);

  // Modal states for creating/editing Exam Category
  const [isExamModalVisible, setIsExamModalVisible] = useState(false);
  const [examName, setExamName] = useState('');
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);

  // Modal states for Sub-Exam / AI Details
  const [isSubExamModalVisible, setIsSubExamModalVisible] = useState(false);
  const [subExamId, setSubExamId] = useState<string | null>(null);
  const [subExamName, setSubExamName] = useState('');
  const [level, setLevel] = useState('Medium'); // Easy, Medium, Hard
  const [difficultyType, setDifficultyType] = useState('Conceptual'); // Fact-based, Analytical, Conceptual
  const [syllabus, setSyllabus] = useState('');
  const [strategy, setStrategy] = useState('');
  const [aiInstructions, setAiInstructions] = useState('');
  const [activeParentExamId, setActiveParentExamId] = useState<string | null>(null);

  useEffect(() => {
    fetchExams();
    fetchScrapedData();
  }, [businessId]);

  const fetchScrapedData = async () => {
    try {
      setIsScraping(true);
      const { data: cats, error: catError } = await scraperSupabase
        .from('scraped_exam_categories')
        .select('*')
        .order('name');
      if (catError) throw catError;
      
      setScrapedCategories(cats || []);
      
      if (cats && cats.length > 0) {
        const catIds = cats.map((c: any) => c.id);
        const { data: examsData, error: examError } = await scraperSupabase
          .from('scraped_exams')
          .select('*')
          .in('category_id', catIds)
          .order('name');
          
        if (examError) throw examError;
        
        const examMap: Record<string, any[]> = {};
        (examsData || []).forEach((e: any) => {
          if (!examMap[e.category_id]) examMap[e.category_id] = [];
          examMap[e.category_id].push(e);
        });
        setScrapedExams(examMap);
      }
    } catch (err: any) {
      console.log("[TargetExamAdmin] Scraped data notice:", err.message);
    } finally {
      setIsScraping(false);
    }
  };

  const fetchExams = async () => {
    if (!businessId) return;
    setIsLoading(true);
    try {
      const { data: examList, error: examError } = await supabase
        .from('exams')
        .select('*')
        .eq('business_id', businessId)
        .order('name');

      if (examError) {
        console.log('[TargetExamAdmin] Exams table notice:', examError.message);
        setExams([]);
        return;
      }

      setExams(examList || []);

      if (examList && examList.length > 0) {
        const examIds = examList.map((e) => e.id);
        const { data: subList, error: subError } = await supabase
          .from('sub_exams')
          .select('*')
          .in('exam_id', examIds)
          .order('name');

        if (subError) {
          console.warn('[TargetExamAdmin] Sub-exams query notice:', subError.message);
        }

        const subMap: Record<string, SubExam[]> = {};
        (subList || []).forEach((se) => {
          if (!subMap[se.exam_id]) subMap[se.exam_id] = [];
          subMap[se.exam_id].push(se);
        });
        setSubExams(subMap);
      }
    } catch (err: any) {
      console.warn('[TargetExamAdmin] Failed to fetch target exam configuration:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveExam = async () => {
    if (!examName.trim() || !businessId) return;
    try {
      const payload = {
        name: examName.trim(),
        business_id: businessId,
      };

      let error;
      if (selectedExamId) {
        ({ error } = await supabase.from('exams').update(payload).eq('id', selectedExamId));
      } else {
        ({ error } = await supabase.from('exams').insert(payload));
      }

      if (error) throw error;
      
      setIsExamModalVisible(false);
      setExamName('');
      setSelectedExamId(null);
      fetchExams();
    } catch (err: any) {
      Alert.alert('Save Error', err.message);
    }
  };

  const handleDeleteExam = (id: string) => {
    Alert.alert('Confirm Delete', 'Delete this target exam and all subcategories?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('exams').delete().eq('id', id);
            if (error) throw error;
            fetchExams();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  const handleSaveSubExam = async () => {
    if (!subExamName.trim() || !activeParentExamId) return;
    try {
      const payload = {
        exam_id: activeParentExamId,
        name: subExamName.trim(),
        level,
        difficulty_type: difficultyType,
        syllabus,
        strategy,
        ai_prompt_metadata: { instructions: aiInstructions },
      };

      let error;
      if (subExamId) {
        ({ error } = await supabase.from('sub_exams').update(payload).eq('id', subExamId));
      } else {
        ({ error } = await supabase.from('sub_exams').insert(payload));
      }

      if (error) throw error;

      setIsSubExamModalVisible(false);
      resetSubExamForm();
      fetchExams();
    } catch (err: any) {
      Alert.alert('Save Error', err.message);
    }
  };

  const resetSubExamForm = () => {
    setSubExamId(null);
    setSubExamName('');
    setLevel('Medium');
    setDifficultyType('Conceptual');
    setSyllabus('');
    setStrategy('');
    setAiInstructions('');
  };

  const handleDeleteSubExam = (id: string) => {
    Alert.alert('Confirm Delete', 'Delete this subcategory strategy configuration?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('sub_exams').delete().eq('id', id);
            if (error) throw error;
            fetchExams();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
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
        <Text style={styles.headerTitle}>Target Exam Configuration</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Scraped Content Lake UI */}
        <View style={{ backgroundColor: '#1E1E2E', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1.5, borderColor: Colors.accent.primary }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="cloud-download" size={20} color={Colors.accent.primary} />
              <Text style={{ color: Colors.text.primary, fontSize: 15, fontWeight: 'bold' }}>
                Content Lake (Scraped Data)
              </Text>
            </View>
            <TouchableOpacity onPress={fetchScrapedData} disabled={isScraping}>
              <Ionicons name="refresh" size={20} color={isScraping ? Colors.text.secondary : Colors.accent.primary} />
            </TouchableOpacity>
          </View>
          <Text style={{ color: Colors.text.tertiary, fontSize: 12, lineHeight: 17, marginBottom: 14 }}>
            Live view of your separate Supabase scraping database.
          </Text>

          {isScraping && scrapedCategories.length === 0 ? (
            <ActivityIndicator color={Colors.accent.primary} />
          ) : scrapedCategories.length === 0 ? (
            <View style={{ padding: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>
              <Text style={{ color: Colors.text.secondary, fontSize: 12, textAlign: 'center' }}>No scraped data available yet.</Text>
            </View>
          ) : (
            scrapedCategories.map(cat => (
              <View key={cat.id} style={{ marginBottom: 12 }}>
                <Text style={{ color: Colors.text.primary, fontWeight: 'bold', fontSize: 14, marginBottom: 6 }}>
                  {cat.name}
                </Text>
                {scrapedExams[cat.id] && scrapedExams[cat.id].map(exam => (
                  <View key={exam.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, marginBottom: 6 }}>
                    <View>
                      <Text style={{ color: Colors.text.primary, fontSize: 13, fontWeight: '500' }}>{exam.name}</Text>
                      {exam.exam_duration_minutes && (
                        <Text style={{ color: Colors.text.secondary, fontSize: 11, marginTop: 2 }}>Duration: {exam.exam_duration_minutes} mins</Text>
                      )}
                    </View>
                    <TouchableOpacity style={{ backgroundColor: Colors.accent.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}>
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>Import</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ))
          )}
        </View>

        <View style={styles.cardHeader}>
          <Text style={styles.sectionHeader}>Target Exams (Main Categories)</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              setSelectedExamId(null);
              setExamName('');
              setIsExamModalVisible(true);
            }}
          >
            <Ionicons name="add-circle" size={22} color={Colors.accent.primary} />
            <Text style={styles.addButtonText}>Add Exam</Text>
          </TouchableOpacity>
        </View>

        {exams.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No target exams configured yet.</Text>
          </View>
        ) : (
          exams.map((exam) => (
            <View key={exam.id} style={styles.examSection}>
              <View style={styles.examHeaderRow}>
                <Ionicons name="folder-open" size={20} color={Colors.accent.primary} />
                <Text style={styles.examNameText}>{exam.name}</Text>
                <TouchableOpacity
                  onPress={() => {
                    setSelectedExamId(exam.id);
                    setExamName(exam.name);
                    setIsExamModalVisible(true);
                  }}
                  style={styles.headerActionBtn}
                >
                  <Ionicons name="create-outline" size={18} color={Colors.text.secondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteExam(exam.id)} style={styles.headerActionBtn}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>

              {/* Sub-Exams / Sub-backends list */}
              <View style={styles.subExamContainer}>
                {(subExams[exam.id] || []).map((sub) => (
                  <View key={sub.id} style={styles.subExamItem}>
                    <View style={styles.subHeaderRow}>
                      <Text style={styles.subExamName}>{sub.name}</Text>
                      <View style={styles.pillContainer}>
                        <View style={styles.levelPill}>
                          <Text style={styles.levelPillText}>{sub.level}</Text>
                        </View>
                        <View style={styles.typePill}>
                          <Text style={styles.typePillText}>{sub.difficulty_type}</Text>
                        </View>
                      </View>
                    </View>
                    <Text style={styles.subExamMeta} numberOfLines={2}>
                      Syllabus: {sub.syllabus ? sub.syllabus.substring(0, 100) : 'None'}...
                    </Text>
                    <View style={styles.subActionRow}>
                      <TouchableOpacity
                        style={styles.subActionEditBtn}
                        onPress={() => {
                          setSubExamId(sub.id);
                          setSubExamName(sub.name);
                          setLevel(sub.level);
                          setDifficultyType(sub.difficulty_type);
                          setSyllabus(sub.syllabus);
                          setStrategy(sub.strategy);
                          setAiInstructions(sub.ai_prompt_metadata?.instructions || '');
                          setActiveParentExamId(exam.id);
                          setIsSubExamModalVisible(true);
                        }}
                      >
                        <Ionicons name="options-outline" size={14} color={Colors.accent.primary} />
                        <Text style={styles.subActionEditText}>Configure Engine, Strategy & Syllabus</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteSubExam(sub.id)} style={styles.subDeleteBtn}>
                        <Ionicons name="trash-outline" size={14} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                
                <TouchableOpacity
                  style={styles.addSubBtn}
                  onPress={() => {
                    resetSubExamForm();
                    setActiveParentExamId(exam.id);
                    setIsSubExamModalVisible(true);
                  }}
                >
                  <Ionicons name="add" size={16} color={Colors.accent.primary} />
                  <Text style={styles.addSubBtnText}>Add Subcategory (Syllabus/AI Prompt)</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Modal 1: Create/Edit Main Exam Category */}
      <Modal visible={isExamModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{selectedExamId ? 'Edit Exam Target' : 'Create Exam Target'}</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. UPSC CSE, JEE Mains, NEET"
              value={examName}
              onChangeText={setExamName}
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsExamModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveExam}>
                <Text style={styles.saveBtnText}>Save Target</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 2: Create/Edit Sub-Exam details, Syllabus, Strategies, AI config */}
      <Modal visible={isSubExamModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.subModalScroll}>
            <View style={styles.subModalCard}>
              <Text style={styles.modalTitle}>Configure Practice Engine & Strategy</Text>
              
              <Text style={styles.fieldLabel}>Subcategory Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Physics, History, General Mental Ability"
                value={subExamName}
                onChangeText={setSubExamName}
              />

              <Text style={styles.fieldLabel}>Difficulty Level</Text>
              <View style={styles.optionRow}>
                {['Easy', 'Medium', 'Hard'].map((l) => (
                  <TouchableOpacity
                    key={l}
                    style={[styles.optionPill, level === l && styles.optionPillActive]}
                    onPress={() => setLevel(l)}
                  >
                    <Text style={[styles.optionPillText, level === l && styles.optionPillTextActive]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Question Difficulty Focus</Text>
              <View style={styles.optionRow}>
                {['Conceptual', 'Fact-based', 'Analytical'].map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.optionPill, difficultyType === d && styles.optionPillActive]}
                    onPress={() => setDifficultyType(d)}
                  >
                    <Text style={[styles.optionPillText, difficultyType === d && styles.optionPillTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Syllabus Breakdown</Text>
              <TextInput
                style={[styles.textArea, { height: 100 }]}
                placeholder="List topics and chapters students need to cover..."
                value={syllabus}
                onChangeText={setSyllabus}
                multiline
              />

              <Text style={styles.fieldLabel}>Winning Exam Strategy & Tips</Text>
              <TextInput
                style={[styles.textArea, { height: 100 }]}
                placeholder="Provide details on how to crack this section, study timetables, tips..."
                value={strategy}
                onChangeText={setStrategy}
                multiline
              />

              <Text style={styles.fieldLabel}>AI Target Instructions (Engine Feed)</Text>
              <TextInput
                style={[styles.textArea, { height: 100 }]}
                placeholder="Instructions for Gemini. E.g. 'Target UPSC standard questions with high statement complexity, testing historical chronology...'"
                value={aiInstructions}
                onChangeText={setAiInstructions}
                multiline
              />

              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsSubExamModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveSubExam}>
                  <Text style={styles.saveBtnText}>Save Engine Feed</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.accent.primary,
  },
  emptyBox: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: Colors.card.border,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    ...Shadows.sm,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  examSection: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.card.border,
    padding: 16,
    ...Shadows.sm,
    gap: 12,
  },
  examHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  examNameText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text.primary,
    flex: 1,
  },
  headerActionBtn: {
    padding: 4,
    marginLeft: 4,
  },
  subExamContainer: {
    gap: 12,
    borderLeftWidth: 2,
    borderLeftColor: Colors.bg.secondary,
    paddingLeft: 12,
  },
  subExamItem: {
    backgroundColor: Colors.bg.secondary,
    padding: 12,
    borderRadius: 12,
    gap: 6,
  },
  subHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  subExamName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  pillContainer: {
    flexDirection: 'row',
    gap: 4,
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
    fontSize: 10,
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
    fontSize: 10,
    fontWeight: '800',
    color: '#137333',
  },
  subExamMeta: {
    fontSize: 11.5,
    color: Colors.text.secondary,
    lineHeight: 16,
  },
  subActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  subActionEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  subActionEditText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.accent.primary,
  },
  subDeleteBtn: {
    padding: 4,
  },
  addSubBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.accent.primary,
    backgroundColor: Colors.bg.secondary,
    marginTop: 4,
  },
  addSubBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.accent.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  subModalScroll: {
    paddingVertical: 32,
  },
  modalCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  subModalCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 4,
  },
  textInput: {
    height: 44,
    borderWidth: 1,
    borderColor: Colors.card.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13.5,
  },
  textArea: {
    borderWidth: 1,
    borderColor: Colors.card.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    textAlignVertical: 'top',
  },
  optionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionPill: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  optionPillActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  optionPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  optionPillTextActive: {
    color: '#FFF',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg.secondary,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  saveBtn: {
    flex: 2,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent.primary,
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
});

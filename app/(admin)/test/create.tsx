import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

const BATCHES = ['All', 'MPPSC', 'SSC', 'VYAPAM', 'Railway', 'Banking', 'UPSC'];

export default function CreateTestScreen() {
  const router = useRouter();
  const { user, verified, businessId } = useAuthStore();
  
  const [title, setTitle] = useState('');
  const [targetBatch, setTargetBatch] = useState('All');
  const [duration, setDuration] = useState('60');
  const [selectedBank, setSelectedBank] = useState<string | null>(null);
  const [banks, setBanks] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [questionCount, setQuestionCount] = useState(5);
  const [difficulty, setDifficulty] = useState('Medium');

  useEffect(() => {
    if (verified) {
      fetchBanks();
    } else {
      setBanks([
        { id: 'demo-1', name: 'Indus Valley Civilization' },
        { id: 'demo-2', name: 'Cell Structure' }
      ]);
      setSelectedBank('demo-1');
    }
  }, [verified, businessId]);

  const fetchBanks = async () => {
    if (!businessId) return;
    try {
      const { data } = await supabase
        .from('test_banks')
        .select('id, name')
        .eq('business_id', businessId);
      if (data && data.length > 0) {
        setBanks(data);
        setSelectedBank(data[0].id);
      }
    } catch (e) {
      console.warn(e);
    }
  };

  const generateQuestions = (subject: string, count: number, diff: string, testId: string) => {
    const HISTORY_POOL = [
      { question_text: "What was the main feature of the Indus Valley Civilization?", options: ["Town Planning", "Iron usage", "Horse chariots", "Temple architecture"], correct_option: 0, explanation: "Town planning with grid systems was the hallmark of Harappan civilization." },
      { question_text: "Which of these was a major port city of Indus Valley?", options: ["Harappa", "Lothal", "Mohenjodaro", "Kalibangan"], correct_option: 1, explanation: "Lothal was a prominent port city with a massive dockyard." },
      { question_text: "Which metal was unknown to the Indus Valley people?", options: ["Gold", "Silver", "Copper", "Iron"], correct_option: 3, explanation: "Iron was not used by the Harappans; it was introduced later in the Vedic period." },
      { question_text: "Which of the following sites is located in India?", options: ["Harappa", "Mohenjodaro", "Lothal", "Ganweriwala"], correct_option: 2, explanation: "Lothal is located in Gujarat, India, whereas Harappa and Mohenjodaro are in Pakistan." },
      { question_text: "What was the seal of Indus Valley mainly made of?", options: ["Steatite", "Clay", "Copper", "Bronze"], correct_option: 0, explanation: "Steatite was the most common material used to make seals in Harappan civilization." },
      { question_text: "Which animal was not represented on the seals of Harappan culture?", options: ["Cow", "Elephant", "Tiger", "Rhinoceros"], correct_option: 0, explanation: "Cow was not represented on Harappan seals." },
      { question_text: "The Harappan site at Kot Diji is close to which of the following?", options: ["Mohenjodaro", "Harappa", "Lothal", "Kalibangan"], correct_option: 0, explanation: "Kot Diji is near Mohenjodaro in Sindh, Pakistan." },
      { question_text: "Which Harappan site showed evidence of double burial?", options: ["Lothal", "Kalibangan", "Ropar", "Dholavira"], correct_option: 0, explanation: "Joint or double burials were discovered at Lothal." },
      { question_text: "A ploughed field was discovered at which site?", options: ["Kalibangan", "Harappa", "Mohenjodaro", "Lothal"], correct_option: 0, explanation: "Evidence of a ploughed field was found at Kalibangan." },
      { question_text: "Which site has a unique water harvesting system?", options: ["Dholavira", "Harappa", "Lothal", "Banawali"], correct_option: 0, explanation: "Dholavira is famous for its elaborate water management system." },
      { question_text: "Which site has yielded the famous bronze dancing girl?", options: ["Mohenjodaro", "Harappa", "Kalibangan", "Lothal"], correct_option: 0, explanation: "The bronze statue of the dancing girl was found in Mohenjodaro." },
      { question_text: "Which crop was unknown to Harappans?", options: ["Sugarcane", "Wheat", "Barley", "Cotton"], correct_option: 0, explanation: "There is no direct evidence of sugarcane cultivation in Harappan sites." },
      { question_text: "Which deity was worshipped by the Indus Valley people?", options: ["Pashupati Shiva", "Indra", "Varuna", "Vishnu"], correct_option: 0, explanation: "Pashupati (proto-Shiva) seals indicate he was worshipped." },
      { question_text: "Who excavated the Mohenjodaro site first?", options: ["R. D. Banerji", "Daya Ram Sahni", "John Marshall", "Mortimer Wheeler"], correct_option: 0, explanation: "R. D. Banerji discovered Mohenjodaro in 1922." },
      { question_text: "Which script was used by Harappans?", options: ["Pictographic", "Brahmi", "Kharosthi", "Cuneiform"], correct_option: 0, explanation: "The script was pictographic and remains undeciphered." }
    ];

    const SCIENCE_POOL = [
      { question_text: "Which organelle is known as the powerhouse of the cell?", options: ["Mitochondria", "Nucleus", "Ribosome", "Golgi apparatus"], correct_option: 0, explanation: "Mitochondria generates chemical energy (ATP) for the cell." },
      { question_text: "Which of the following is present in plant cells but not in animal cells?", options: ["Cell Wall", "Mitochondria", "Nucleus", "Cytoplasm"], correct_option: 0, explanation: "Cell walls are found in plants for structural support." },
      { question_text: "Who discovered the cell first?", options: ["Robert Hooke", "Leeuwenhoek", "Purkinje", "Robert Brown"], correct_option: 0, explanation: "Robert Hooke discovered cells in cork in 1665." },
      { question_text: "Which organelle is responsible for protein synthesis?", options: ["Ribosome", "Lysosome", "Mitochondria", "Centrosome"], correct_option: 0, explanation: "Ribosomes translate genetic codes into proteins." },
      { question_text: "Which cell organelle is called the suicidal bag?", options: ["Lysosome", "Ribosome", "Golgi body", "Nucleolus"], correct_option: 0, explanation: "Lysosomes contain digestive enzymes that can destroy the cell." },
      { question_text: "Which organelle control cell activities?", options: ["Nucleus", "Mitochondria", "Plastid", "Vacuole"], correct_option: 0, explanation: "The nucleus contains DNA and coordinates cell operations." },
      { question_text: "Which of the following has a single membrane?", options: ["Lysosome", "Mitochondria", "Nucleus", "Chloroplast"], correct_option: 0, explanation: "Lysosomes have a single phospholipid membrane." },
      { question_text: "Cellular respiration takes place in which organelle?", options: ["Mitochondria", "Ribosome", "Golgi complex", "Nucleus"], correct_option: 0, explanation: "Mitochondria is the primary site of aerobic cellular respiration." },
      { question_text: "Which plastid gives green color to plants?", options: ["Chloroplast", "Chromoplast", "Leucoplast", "Amyloplast"], correct_option: 0, explanation: "Chloroplast contains chlorophyll which gives the green color." },
      { question_text: "What is the structural unit of life?", options: ["Cell", "Tissue", "Organ", "Organism"], correct_option: 0, explanation: "A cell is the basic structural and functional unit of life." }
    ];

    const bankName = banks.find(b => b.id === selectedBank)?.name || '';
    const pool = bankName.toLowerCase().includes('cell') || subject.toLowerCase().includes('cell') ? SCIENCE_POOL : HISTORY_POOL;

    // Shuffle pool and slice
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, count);

    // Apply difficulty modifiers
    return selected.map(q => {
      let modText = q.question_text;
      if (diff === 'Easy') {
        modText = `[Easy] Direct: ${q.question_text}`;
      } else if (diff === 'Hard') {
        modText = `[Hard] Analytical: ${q.question_text}`;
      }
      return {
        test_id: testId,
        question_text: modText,
        options: q.options,
        correct_option: q.correct_option,
        explanation: q.explanation
      };
    });
  };

  const handleGenerate = async () => {
    if (!title.trim() || !duration || !selectedBank) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    setIsGenerating(true);

    try {
      if (!verified || !businessId) {
        // Simulate AI generation delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Push to mock review
        router.push('/(admin)/test/review/demo-test-id');
        return;
      }

      // Create the test record (Draft)
      const { data: newTest, error: testErr } = await supabase
        .from('tests')
        .insert({
          business_id: businessId,
          title,
          batch_name: targetBatch === 'All' ? null : targetBatch,
          duration_minutes: parseInt(duration),
          total_marks: questionCount,
          status: 'draft',
        })
        .select()
        .single();

      if (testErr) throw testErr;

      // Simulate AI generating questions from the selected bank
      await new Promise(resolve => setTimeout(resolve, 1500)); // artificial delay

      const targetBankName = banks.find(b => b.id === selectedBank)?.name || '';
      const dummyQuestions = generateQuestions(targetBankName, questionCount, difficulty, newTest.id);

      const { error: qErr } = await supabase.from('test_questions').insert(dummyQuestions);
      if (qErr) throw qErr;

      // Navigate to the Review screen to review AI generated questions
      router.push(`/(admin)/test/review/${newTest.id}`);

    } catch (err: any) {
      Alert.alert('Generation Failed', err.message);
      setIsGenerating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New AI Test</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        
        <View style={styles.card}>
          <Text style={sectionTitleStyle}>Test Details</Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Test Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Weekly History Mock"
              placeholderTextColor={Colors.text.tertiary}
              value={title}
              onChangeText={setTitle}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputContainer, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Duration (mins) *</Text>
              <TextInput
                style={styles.input}
                placeholder="60"
                keyboardType="numeric"
                placeholderTextColor={Colors.text.tertiary}
                value={duration}
                onChangeText={setDuration}
              />
            </View>
            <View style={[styles.inputContainer, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Target Batch *</Text>
              <View style={styles.batchPicker}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {BATCHES.map(b => (
                    <TouchableOpacity 
                      key={b} 
                      style={[styles.batchChip, targetBatch === b && styles.batchChipActive]}
                      onPress={() => setTargetBatch(b)}
                    >
                      <Text style={[styles.batchChipText, targetBatch === b && styles.batchChipTextActive]}>{b}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={sectionTitleStyle}>AI Generation Options</Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Number of Questions</Text>
            <View style={styles.selectorRow}>
              {[5, 10, 15, 20].map(count => (
                <TouchableOpacity
                  key={count}
                  style={[styles.selectorChip, questionCount === count && styles.selectorChipActive]}
                  onPress={() => setQuestionCount(count)}
                >
                  <Text style={[styles.selectorChipText, questionCount === count && styles.selectorChipTextActive]}>
                    {count}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Difficulty Level</Text>
            <View style={styles.selectorRow}>
              {['Easy', 'Medium', 'Hard'].map(level => (
                <TouchableOpacity
                  key={level}
                  style={[styles.selectorChip, difficulty === level && styles.selectorChipActive]}
                  onPress={() => setDifficulty(level)}
                >
                  <Text style={[styles.selectorChipText, difficulty === level && styles.selectorChipTextActive]}>
                    {level}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={sectionTitleStyle}>AI Generation Source</Text>
          <Text style={styles.desc}>Select the uploaded material the AI should read to generate questions.</Text>
          
          {banks.length === 0 ? (
            <TouchableOpacity style={styles.emptyBankWarning} onPress={() => router.push('/(admin)/test/banks')}>
              <Ionicons name="warning-outline" size={20} color={Colors.status.warning} />
              <Text style={styles.emptyBankText}>No Test Banks found. Tap to upload syllabus material first.</Text>
            </TouchableOpacity>
          ) : (
            banks.map(bank => (
              <TouchableOpacity 
                key={bank.id} 
                style={[styles.bankOption, selectedBank === bank.id && styles.bankOptionActive]}
                onPress={() => setSelectedBank(bank.id)}
              >
                <View style={styles.radio}>
                  {selectedBank === bank.id && <View style={styles.radioInner} />}
                </View>
                <Ionicons name="document-text" size={20} color={selectedBank === bank.id ? Colors.accent.primary : Colors.text.tertiary} />
                <Text style={[styles.bankName, selectedBank === bank.id && styles.bankNameActive]}>{bank.name}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.generateBtn, (!title || !selectedBank || isGenerating) && styles.generateBtnDisabled]} 
          onPress={handleGenerate}
          disabled={!title || !selectedBank || isGenerating}
        >
          {isGenerating ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="sparkles" size={20} color="#FFF" />
              <Text style={styles.generateBtnText}>Generate with AI</Text>
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
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  card: {
    backgroundColor: Colors.bg.secondary,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 16,
  },
  desc: {
    fontSize: 13,
    color: Colors.text.secondary,
    marginBottom: 16,
  },
  inputContainer: {
    marginBottom: 16,
    gap: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  input: {
    backgroundColor: Colors.bg.primary,
    borderWidth: 1,
    borderColor: Colors.card.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 15,
    color: Colors.text.primary,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  batchPicker: {
    height: 48,
    justifyContent: 'center',
  },
  batchChip: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.bg.primary,
    borderWidth: 1,
    borderColor: Colors.card.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  batchChipActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  batchChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.text.secondary,
  },
  batchChipTextActive: {
    color: '#FFF',
    fontWeight: '600',
  },
  selectorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  selectorChip: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.bg.primary,
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
  bankOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.bg.primary,
    borderWidth: 1,
    borderColor: Colors.card.border,
    marginBottom: 8,
    gap: 12,
  },
  bankOptionActive: {
    borderColor: Colors.accent.primary,
    backgroundColor: Colors.accent.primary + '0A',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.text.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.accent.primary,
  },
  bankName: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text.primary,
  },
  bankNameActive: {
    fontWeight: '700',
    color: Colors.accent.primary,
  },
  emptyBankWarning: {
    flexDirection: 'row',
    backgroundColor: Colors.status.warning + '15',
    padding: 12,
    borderRadius: 8,
    gap: 8,
    alignItems: 'center',
  },
  emptyBankText: {
    flex: 1,
    fontSize: 13,
    color: Colors.status.warning,
    fontWeight: '600',
  },
  footer: {
    padding: 20,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: Colors.card.border,
    backgroundColor: Colors.bg.primary,
  },
  generateBtn: {
    flexDirection: 'row',
    backgroundColor: Colors.accent.primary,
    height: 54,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  generateBtnDisabled: {
    opacity: 0.5,
  },
  generateBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
});

const sectionTitleStyle = styles.sectionTitle;

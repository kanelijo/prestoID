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
  const { user, verified } = useAuthStore();
  
  const [title, setTitle] = useState('');
  const [targetBatch, setTargetBatch] = useState('All');
  const [duration, setDuration] = useState('60');
  const [selectedBank, setSelectedBank] = useState<string | null>(null);
  const [banks, setBanks] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

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
  }, [verified]);

  const fetchBanks = async () => {
    try {
      const { data } = await supabase.from('test_banks').select('id, name');
      if (data && data.length > 0) {
        setBanks(data);
        setSelectedBank(data[0].id);
      }
    } catch (e) {
      console.warn(e);
    }
  };

  const handleGenerate = async () => {
    if (!title.trim() || !duration || !selectedBank) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    setIsGenerating(true);

    try {
      if (!verified) {
        // Simulate AI generation delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Push to mock review
        router.push('/(admin)/test/review/demo-test-id');
        return;
      }

      // 1. Fetch institute_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('institute_id')
        .eq('id', user?.id)
        .single();

      if (!profile?.institute_id) throw new Error("Could not find institute ID");

      // 2. Create the test record (Draft)
      const { data: newTest, error: testErr } = await supabase
        .from('tests')
        .insert({
          institute_id: profile.institute_id,
          title,
          target_batches: targetBatch === 'All' ? BATCHES.slice(1) : [targetBatch],
          duration_minutes: parseInt(duration),
          status: 'draft',
          // scheduled_at omitted for now, can be set later
        })
        .select()
        .single();

      if (testErr) throw testErr;

      // 3. Simulate AI generating questions from the selected bank
      // In a real app, this would trigger an Edge Function calling OpenAI/Gemini
      // For MVP, we insert dummy AI-generated questions directly
      await new Promise(resolve => setTimeout(resolve, 1500)); // artificial delay

      const dummyQuestions = [
        {
          test_id: newTest.id,
          question_text: "What was the main feature of the Indus Valley Civilization?",
          option_a: "Town Planning",
          option_b: "Iron usage",
          option_c: "Horse chariots",
          option_d: "Temple architecture",
          correct_option: "A",
          explanation: "The Indus Valley Civilization is best known for its advanced urban town planning and drainage systems.",
          order_index: 1
        },
        {
          test_id: newTest.id,
          question_text: "Which of these was a major port city of Indus Valley?",
          option_a: "Harappa",
          option_b: "Lothal",
          option_c: "Mohenjodaro",
          option_d: "Kalibangan",
          correct_option: "B",
          explanation: "Lothal was a prominent port city known for its massive dockyard.",
          order_index: 2
        }
      ];

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
          <Text style={styles.sectionTitle}>Test Details</Text>
          
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
          <Text style={styles.sectionTitle}>AI Generation Source</Text>
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

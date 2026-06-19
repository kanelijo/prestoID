import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, AppState, AppStateStatus, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

const GRACE_PERIOD_MS = 20000; // 20 seconds grace period for app exits

export default function TestEngineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { verified, user } = useAuthStore();
  const activeStudentId = user?.id;
  
  const appState = useRef(AppState.currentState);
  const backgroundTime = useRef<number | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [testDetails, setTestDetails] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  
  // Timer State
  const [timeLeft, setTimeLeft] = useState<number>(0); // in seconds
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Analytics
  const [exitLogs, setExitLogs] = useState<any[]>([]);

  useEffect(() => {
    loadTest();
  }, [id]);

  useEffect(() => {
    // App switch detection
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [id, questions.length]);

  useEffect(() => {
    // Timer interval
    if (timeLeft <= 0 && testDetails) {
      if (!isSubmitting) {
        Alert.alert('Time Up!', 'Your test duration has ended. Auto-submitting your answers.');
        submitTest('time_up');
      }
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, testDetails]);

  const loadTest = async () => {
    setIsLoading(true);
    try {
      // Check if there's a saved session
      const savedSessionStr = await AsyncStorage.getItem(`test_session_${id}`);
      let savedSession = null;
      if (savedSessionStr) {
        savedSession = JSON.parse(savedSessionStr);
      }

      if (!verified || id === 'demo-test-id') {
        setTestDetails({ id: 'demo-test-id', title: 'MPPSC Mock Test', duration_minutes: 60 });
        setQuestions([
          { id: 'q1', question_text: 'What was the main feature of the Indus Valley Civilization?', option_a: 'Town Planning', option_b: 'Iron usage', option_c: 'Horse chariots', option_d: 'Temple architecture', correct_option: 'A' },
          { id: 'q2', question_text: 'Which of these was a major port city of Indus Valley?', option_a: 'Harappa', option_b: 'Lothal', option_c: 'Mohenjodaro', option_d: 'Kalibangan', correct_option: 'B' }
        ]);
        setTimeLeft(savedSession?.timeLeft || 60 * 60);
        setAnswers(savedSession?.answers || {});
        setExitLogs(savedSession?.exitLogs || []);
        setIsLoading(false);
        return;
      }

      // Fetch from DB
      const { data: test, error: tErr } = await supabase.from('tests').select('*').eq('id', id).single();
      if (tErr) throw tErr;

      const { data: qs, error: qErr } = await supabase.from('test_questions').select('*').eq('test_id', id).order('order_index');
      if (qErr) throw qErr;

      setTestDetails(test);
      setQuestions(qs || []);
      
      if (savedSession) {
        setTimeLeft(savedSession.timeLeft);
        setAnswers(savedSession.answers);
        setExitLogs(savedSession.exitLogs);
      } else {
        setTimeLeft(test.duration_minutes * 60);
      }
    } catch (err: any) {
      Alert.alert('Error loading test', err.message);
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  const saveSessionProgress = async (currentAnswers: Record<string, string>, currentTimeLeft: number, currentLogs: any[]) => {
    try {
      await AsyncStorage.setItem(`test_session_${id}`, JSON.stringify({
        answers: currentAnswers,
        timeLeft: currentTimeLeft,
        exitLogs: currentLogs
      }));
    } catch (e) {
      console.warn('Failed to save test session locally');
    }
  };

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (appState.current.match(/active/) && nextAppState.match(/inactive|background/)) {
      // App went to background
      backgroundTime.current = Date.now();
    } else if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      // App came back to foreground
      if (backgroundTime.current) {
        const timeAway = Date.now() - backgroundTime.current;
        
        // Log the exit
        const newLog = { time: new Date().toISOString(), type: 'app_switch', duration_ms: timeAway };
        const newLogs = [...exitLogs, newLog];
        setExitLogs(newLogs);
        
        if (timeAway > GRACE_PERIOD_MS) {
          Alert.alert(
            'Violation Detected',
            `You left the test for ${(timeAway/1000).toFixed(1)} seconds, which exceeds the ${GRACE_PERIOD_MS/1000}s grace period. Your test is being auto-submitted.`,
            [{ text: 'OK', onPress: () => submitTest('violation', newLogs) }]
          );
        } else {
          Alert.alert(
            'Warning',
            `You left the test for ${(timeAway/1000).toFixed(1)} seconds. Do not leave the app or your test will be auto-submitted.`,
            [{ text: 'I Understand' }]
          );
          // Deduct time away from the timer to prevent pausing the timer cheat
          setTimeLeft(prev => Math.max(0, prev - Math.floor(timeAway / 1000)));
          saveSessionProgress(answers, Math.max(0, timeLeft - Math.floor(timeAway / 1000)), newLogs);
        }
      }
      backgroundTime.current = null;
    }
    appState.current = nextAppState;
  };

  const selectOption = (questionId: string, option: string) => {
    const newAnswers = { ...answers, [questionId]: option };
    setAnswers(newAnswers);
    saveSessionProgress(newAnswers, timeLeft, exitLogs);
  };

  const handleNext = () => {
    if (currentQIndex < questions.length - 1) {
      setCurrentQIndex(currentQIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentQIndex > 0) {
      setCurrentQIndex(currentQIndex - 1);
    }
  };

  const handleManualSubmit = () => {
    Alert.alert('Submit Test', 'Are you sure you want to submit your test? You cannot change your answers after submission.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Submit', onPress: () => submitTest('manual') }
    ]);
  };

  const submitTest = async (reason: string, finalLogs: any[] = exitLogs) => {
    setIsSubmitting(true);
    try {
      // 1. Grade the test locally
      let score = 0;
      questions.forEach(q => {
        if (answers[q.id] === q.correct_option) score++;
      });
      const finalScore = Math.round((score / questions.length) * 100);

      if (!verified || id === 'demo-test-id') {
        await AsyncStorage.removeItem(`test_session_${id}`);
        Alert.alert('Demo Submitted', `You scored ${finalScore}%`);
        router.replace(`/(student)/test/result/${id}`);
        return;
      }

      // 2. Upload to Supabase
      const { error } = await supabase.from('test_submissions').insert({
        test_id: id,
        student_id: activeStudentId,
        answers,
        score: finalScore,
        total_questions: questions.length,
        exit_logs: finalLogs,
        submitted_at: new Date().toISOString(),
      });

      if (error) throw error;

      // 3. Cleanup local state
      await AsyncStorage.removeItem(`test_session_${id}`);
      
      // 4. Navigate to Results
      router.replace(`/(student)/test/result/${id}`);
      
    } catch (err: any) {
      // Offline fallback
      Alert.alert('Submission Failed', 'Could not sync with server. Your results are saved locally and will sync when online.');
      router.replace('/(student)/test');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (isLoading || !testDetails) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.accent.primary} />
      </SafeAreaView>
    );
  }

  const currentQ = questions[currentQIndex];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>{testDetails.title}</Text>
        <View style={styles.timerBadge}>
          <Ionicons name="time-outline" size={16} color={timeLeft < 300 ? Colors.status.danger : Colors.text.primary} />
          <Text style={[styles.timerText, timeLeft < 300 && { color: Colors.status.danger }]}>
            {formatTime(timeLeft)}
          </Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressFill, { width: `${((currentQIndex + 1) / questions.length) * 100}%` }]} />
      </View>
      <Text style={styles.progressText}>Question {currentQIndex + 1} of {questions.length}</Text>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Question */}
        <View style={styles.questionCard}>
          <Text style={styles.questionText}>{currentQ.question_text}</Text>
        </View>

        {/* Options */}
        <View style={styles.optionsList}>
          {['A', 'B', 'C', 'D'].map(optKey => {
            const isSelected = answers[currentQ.id] === optKey;
            const optValue = currentQ[`option_${optKey.toLowerCase()}`];
            
            return (
              <TouchableOpacity
                key={optKey}
                style={[styles.optionRow, isSelected && styles.optionSelected]}
                activeOpacity={0.7}
                onPress={() => selectOption(currentQ.id, optKey)}
              >
                <View style={[styles.optionLetter, isSelected && styles.optionLetterSelected]}>
                  <Text style={[styles.optionLetterText, isSelected && styles.optionLetterTextSelected]}>{optKey}</Text>
                </View>
                <Text style={styles.optionText}>{optValue}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Footer Navigation */}
      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.navBtn, currentQIndex === 0 && styles.navBtnDisabled]} 
          onPress={handlePrev}
          disabled={currentQIndex === 0}
        >
          <Ionicons name="chevron-back" size={24} color={currentQIndex === 0 ? Colors.text.tertiary : Colors.text.primary} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.submitBtn}
          onPress={handleManualSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
             <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitBtnText}>Submit Test</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.navBtn, currentQIndex === questions.length - 1 && styles.navBtnDisabled]} 
          onPress={handleNext}
          disabled={currentQIndex === questions.length - 1}
        >
          <Ionicons name="chevron-forward" size={24} color={currentQIndex === questions.length - 1 ? Colors.text.tertiary : Colors.text.primary} />
        </TouchableOpacity>
      </View>

      {/* Offline Banner Overlay (Optional visual cue) */}
      {/* Handled centrally by _layout, but we could add a "Saving locally" indicator here */}
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
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    marginRight: 16,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.tertiary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  timerText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  progressContainer: {
    height: 4,
    backgroundColor: Colors.bg.tertiary,
    width: '100%',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.accent.primary,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.tertiary,
    textAlign: 'center',
    paddingVertical: 12,
  },
  content: {
    padding: 16,
    gap: 20,
    paddingBottom: 40,
  },
  questionCard: {
    marginBottom: 8,
  },
  questionText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    lineHeight: 26,
  },
  optionsList: {
    gap: 12,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  optionSelected: {
    borderColor: Colors.accent.primary,
    backgroundColor: Colors.accent.primary + '0A',
  },
  optionLetter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.bg.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionLetterSelected: {
    backgroundColor: Colors.accent.primary,
  },
  optionLetterText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  optionLetterTextSelected: {
    color: '#FFF',
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    color: Colors.text.primary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.card.border,
    backgroundColor: Colors.bg.primary,
  },
  navBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.bg.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navBtnDisabled: {
    opacity: 0.5,
  },
  submitBtn: {
    flex: 1,
    marginHorizontal: 16,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
});

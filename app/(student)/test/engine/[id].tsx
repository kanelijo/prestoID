import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, AppState, ActivityIndicator, Dimensions, FlatList, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useQuizStore } from '@/stores/useQuizStore';
import * as Haptics from 'expo-haptics';
import { activateKeepAwake, deactivateKeepAwake } from 'expo-keep-awake';

const { width: windowWidth } = Dimensions.get('window');

// Use basic requestAnimationFrame for reliable physics timer without triggering reanimated crashes
const GRACE_PERIOD_MS = 20000;

export default function ZenZaTestEngineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { verified, user } = useAuthStore();
  
  const { answers, setAnswer, submitToLocal, clearAnswers } = useQuizStore();
  
  const [testDetails, setTestDetails] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [isStarted, setIsStarted] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const endTimeRef = useRef<number>(0);
  const reqFrameRef = useRef<number>(0);

  const flatListRef = useRef<FlatList>(null);
  const appState = useRef(AppState.currentState);
  const backgroundTime = useRef<number | null>(null);
  const timeLogsRef = useRef<Record<string, number>>({});
  const changesRef = useRef<Record<string, number>>({});
  const revisitsRef = useRef<Record<string, number>>({});
  const autoAdvanceTimeoutRef = useRef<any>(null);
  const lastTimeRef = useRef<number>(Date.now());
  const hasSubmitted = useRef<boolean>(false);
  // Only true between startTimer() and submitTest() — NOT during analysis/review
  const isTestActive = useRef<boolean>(false);

  useEffect(() => {
    loadTest();
    return () => {
      cancelAnimationFrame(reqFrameRef.current);
      if (autoAdvanceTimeoutRef.current) {
        clearTimeout(autoAdvanceTimeoutRef.current);
      }
    };
  }, [id]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!isStarted || hasSubmitted.current) return;

    const tick = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((endTimeRef.current - now) / 1000));
      setTimeLeft(remaining);
      
      if (remaining > 0) {
        reqFrameRef.current = requestAnimationFrame(tick);
      } else {
        submitTest('time_up');
      }
    };

    const handleTimerAppStateChange = (nextState: string) => {
      if (nextState === 'active') {
        reqFrameRef.current = requestAnimationFrame(tick);
      } else {
        cancelAnimationFrame(reqFrameRef.current);
      }
    };

    reqFrameRef.current = requestAnimationFrame(tick);
    const sub = AppState.addEventListener('change', handleTimerAppStateChange);

    return () => {
      cancelAnimationFrame(reqFrameRef.current);
      sub.remove();
    };
  }, [isStarted]);

  const handleAppStateChange = (nextAppState: any) => {
    // Only enforce anti-cheat when a live test is actively in progress
    if (!isTestActive.current || hasSubmitted.current) return;
    
    if (appState.current.match(/active/) && nextAppState.match(/inactive|background/)) {
      backgroundTime.current = Date.now();
    } else if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      if (backgroundTime.current) {
        const timeAway = Date.now() - backgroundTime.current;
        lastTimeRef.current += timeAway; // Deduct time spent in background from question timer
        if (timeAway > GRACE_PERIOD_MS) {
          Alert.alert('Violation Detected', 'You left the test for too long. Auto-submitting.');
          submitTest('violation');
        } else {
          Alert.alert('Warning', 'Do not leave the app during a test.');
        }
      }
      backgroundTime.current = null;
    }
    appState.current = nextAppState;
  };

  const loadTest = async () => {
    try {
      // Setup demo test if needed
      if (!verified || id === 'demo-test-id') {
        setTestDetails({ id: 'demo', title: 'ZenZa AI Mock', duration_minutes: 60, positive_marks: 5, negative_marks: 0 });
        setQuestions([
          { id: 'q1', question_text: 'What is the primary advantage of a RAG pipeline?', options: ['It uses 100% internet data', 'It prevents hallucinations by locking context', 'It is slower but more creative', 'It replaces the teacher'], correct_option: 1 },
          { id: 'q2', question_text: 'Why do we use FlatList instead of PagerView for tests?', options: ['It has a nice background', 'It is web-only', 'Zero latency native view controllers', 'Better cross-platform compatibility'], correct_option: 3 }
        ]);
        setIsLoading(false);
        return;
      }

      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        const { data: st } = await supabase.from('students').select('id').eq('user_id', currentUser.id).maybeSingle();
        if (st) setStudentId(st.id);
      }

      // Fetch Real Test
      const { data: test, error: tErr } = await supabase.from('tests').select('*').eq('id', id).single();
      if (tErr) throw tErr;
      
      const { data: qData, error: qErr } = await supabase.from('test_questions').select('*').eq('test_id', id).order('created_at');
      if (qErr) throw qErr;

      setTestDetails(test);
      setQuestions(qData || []);

      // Check if there is an active running state for this test
      const cachedStateStr = await AsyncStorage.getItem(`@active_test_state_${id}`);
      if (cachedStateStr) {
        const cachedState = JSON.parse(cachedStateStr);
        if (cachedState.isStarted) {
          const now = Date.now();
          const remaining = Math.max(0, Math.floor((cachedState.endTime - now) / 1000));
          if (remaining > 0) {
            // Load local answers into quiz store first
            await useQuizStore.getState().loadFromLocal(id);
            
            endTimeRef.current = cachedState.endTime;
            timeLogsRef.current = cachedState.timeLogs || {};
            changesRef.current = cachedState.changes || {};
            revisitsRef.current = cachedState.revisits || {};
            isTestActive.current = true;
            activateKeepAwake();
            setCurrentQIndex(cachedState.currentQIndex || 0);
            setTimeLeft(remaining);
            setIsStarted(true);
            
            // Scroll to cached question index
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({ index: cachedState.currentQIndex || 0, animated: false });
            }, 150);
          } else {
            // Time has expired while the app was closed
            await useQuizStore.getState().loadFromLocal(id);
            endTimeRef.current = cachedState.endTime;
            timeLogsRef.current = cachedState.timeLogs || {};
            changesRef.current = cachedState.changes || {};
            revisitsRef.current = cachedState.revisits || {};
            setIsStarted(true);
            setTimeLeft(0);
            setTimeout(() => {
              submitTest('time_up');
            }, 150);
          }
        }
      }
      setIsLoading(false);
    } catch (e) {
      console.warn(e);
      Alert.alert('Error', 'Failed to load test');
    }
  };

  const saveActiveTestState = async (updatedFields: Partial<{ endTime: number, currentQIndex: number, timeLogs: Record<string, number>, changes: Record<string, number>, revisits: Record<string, number> }>) => {
    try {
      const key = `@active_test_state_${id}`;
      const existingStr = await AsyncStorage.getItem(key);
      const existing = existingStr ? JSON.parse(existingStr) : { testId: id, isStarted: true, currentQIndex: 0, timeLogs: {}, changes: {}, revisits: {} };
      const merged = { ...existing, ...updatedFields };
      await AsyncStorage.setItem(key, JSON.stringify(merged));
    } catch (err) {
      console.warn('Failed to save active test state to cache:', err);
    }
  };

  const clearActiveTestState = async () => {
    try {
      await AsyncStorage.removeItem(`@active_test_state_${id}`);
      const { documentDirectory, getInfoAsync, deleteAsync } = require('expo-file-system/legacy');
      const path = `${documentDirectory}test_${id}_progress.json`;
      const info = await getInfoAsync(path);
      if (info.exists) {
        await deleteAsync(path);
      }
    } catch (err) {
      console.warn('Failed to clear active test state:', err);
    }
  };

  const startTimer = (durationMinutes: number) => {
    endTimeRef.current = Date.now() + (durationMinutes * 60 * 1000);
    isTestActive.current = true; // Mark test as live — anti-cheat now active
    activateKeepAwake();          // Prevent screen from sleeping during test
    setIsStarted(true);

    // Initialize first question revisit count to 1
    if (questions[0]) {
      revisitsRef.current[questions[0].id] = 1;
    }

    saveActiveTestState({ 
      endTime: endTimeRef.current,
      changes: changesRef.current,
      revisits: revisitsRef.current
    });
  };

  const navigateToQuestion = (newIndex: number) => {
    if (newIndex === currentQIndex) return;
    
    const now = Date.now();
    const elapsedMs = now - lastTimeRef.current;
    
    if (questions[currentQIndex]) {
      const currentQId = questions[currentQIndex].id;
      timeLogsRef.current[currentQId] = (timeLogsRef.current[currentQId] || 0) + elapsedMs;
    }

    // Track page revisit
    if (questions[newIndex]) {
      const targetQId = questions[newIndex].id;
      revisitsRef.current[targetQId] = (revisitsRef.current[targetQId] || 0) + 1;
    }
    
    lastTimeRef.current = now;
    setCurrentQIndex(newIndex);
    flatListRef.current?.scrollToIndex({ index: newIndex, animated: true });
    saveActiveTestState({ 
      currentQIndex: newIndex, 
      timeLogs: timeLogsRef.current,
      changes: changesRef.current,
      revisits: revisitsRef.current
    });
  };

  const handleSelectOption = (qId: string, index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Track answer change (hesitation indicator)
    const previousAns = answers[qId];
    if (previousAns !== undefined && previousAns !== null && previousAns !== index) {
      changesRef.current[qId] = (changesRef.current[qId] || 0) + 1;
    }

    setAnswer(qId, index);
    submitToLocal(id);
    
    // Clear any pending auto-advance to prevent jumping multiple pages on fast clicks
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
    }

    // Auto-advance
    if (currentQIndex < questions.length - 1) {
      autoAdvanceTimeoutRef.current = setTimeout(() => {
        navigateToQuestion(currentQIndex + 1);
      }, 300);
    }
  };

  const submitTest = async (reason: string = 'manual') => {
    if (hasSubmitted.current) return;
    hasSubmitted.current = true;
    await clearActiveTestState();
    isTestActive.current = false; // Deactivate anti-cheat so post-test review is safe
    deactivateKeepAwake();         // Allow screen to sleep again after test
    cancelAnimationFrame(reqFrameRef.current);
    
    // Finalize time for the current question before submitting
    const now = Date.now();
    const elapsedMs = now - lastTimeRef.current;
    if (questions[currentQIndex]) {
      const qId = questions[currentQIndex].id;
      timeLogsRef.current[qId] = (timeLogsRef.current[qId] || 0) + elapsedMs;
    }
    
    // Convert ms to seconds
    const timeLogsSeconds: Record<string, any> = {};
    for (const [qId, ms] of Object.entries(timeLogsRef.current)) {
      timeLogsSeconds[qId] = Math.round(ms / 1000);
    }

    // Embed behavioral telemetry inside the time_logs JSONB object
    timeLogsSeconds['telemetry'] = {
      changes: changesRef.current,
      revisits: revisitsRef.current
    };

    const latestAnswers = useQuizStore.getState().answers;

    if (id === 'demo') {
      clearAnswers();
      router.replace(`/(student)/test/result/${id}`);
      return;
    }

    // Calculate score using test metadata or defaults
    const posMarks = testDetails?.positive_marks ?? 5;
    const negMarks = testDetails?.negative_marks ?? 0;
    
    let totalScore = 0;
    questions.forEach((q) => {
      const studentAns = latestAnswers[q.id];
      if (studentAns !== undefined && studentAns !== null) {
        if (studentAns === q.correct_option) {
          totalScore += posMarks;
        } else {
          totalScore -= negMarks;
        }
      }
    });

    try {
      const { data: newSub, error } = await supabase
        .from('test_submissions')
        .upsert({
          test_id: id,
          student_id: studentId,
          answers: latestAnswers,
          time_logs: timeLogsSeconds,
          score: totalScore,
          total_questions: questions.length
        }, { onConflict: 'test_id, student_id' })
        .select('id')
        .single();
        
      if (error) throw error;
      
      clearAnswers();
      // Pass the *submission* ID to the results page, not the test ID
      router.replace(`/(student)/test/result/${newSub.id}`);
    } catch (err: any) {
      console.warn('Submission Error:', err);
      hasSubmitted.current = false; // Reset so they can retry submitting!
      Alert.alert('Error', 'Failed to submit test. Please check connection and try again.');
    }
  };

  if (isLoading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={Colors.accent.primary} /></View>;
  }

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isLowTime = timeLeft < 300; // less than 5 min

  if (!isStarted) {
    const posMarks = testDetails?.positive_marks ?? 5;
    const negMarks = testDetails?.negative_marks ?? 0;
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'space-between', padding: 24, backgroundColor: '#F8F9FA' }]}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 20 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.accent.primary + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 24 }}>
            <Ionicons name="document-text" size={40} color={Colors.accent.primary} />
          </View>
          
          <Text style={{ fontSize: 24, fontWeight: '800', color: Colors.text.primary, textAlign: 'center', marginBottom: 8 }}>
            {testDetails?.title || 'Online Mock Test'}
          </Text>
          <Text style={{ fontSize: 14, color: Colors.text.secondary, textAlign: 'center', marginBottom: 32 }}>
            Please read the instructions carefully before starting the test.
          </Text>

          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', borderWidth: 1, borderColor: '#EBEBEB', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="help-circle-outline" size={20} color={Colors.accent.primary} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: Colors.text.tertiary, fontWeight: '600', textTransform: 'uppercase' }}>Total Questions</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.text.primary }}>{questions.length} Multiple Choice Questions</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="time-outline" size={20} color={Colors.accent.primary} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: Colors.text.tertiary, fontWeight: '600', textTransform: 'uppercase' }}>Test Duration</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.text.primary }}>{testDetails?.duration_minutes || 60} Minutes</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="gift-outline" size={20} color={Colors.accent.primary} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: Colors.text.tertiary, fontWeight: '600', textTransform: 'uppercase' }}>Marking Scheme</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.text.primary }}>
                  +{posMarks} for Correct, {negMarks > 0 ? `-${negMarks} for Incorrect` : '0 Negative Marking'}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'flex-start', borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 16, marginTop: 8 }}>
              <Ionicons name="warning-outline" size={20} color={Colors.status.warning} style={{ marginRight: 12, marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: Colors.status.warning, fontWeight: '700', textTransform: 'uppercase' }}>Exit Warning</Text>
                <Text style={{ fontSize: 13, color: Colors.text.secondary, lineHeight: 18 }}>
                  Do not lock your device or exit the app during the test. Doing so for more than 20 seconds will trigger automatic submission.
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={{ gap: 12, paddingBottom: 10, width: '100%' }}>
          <TouchableOpacity 
            style={{ backgroundColor: Colors.accent.primary, paddingVertical: 16, borderRadius: 14, alignItems: 'center', shadowColor: Colors.accent.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 }}
            onPress={() => {
              setIsStarted(true);
              lastTimeRef.current = Date.now();
              startTimer(testDetails?.duration_minutes || 60);
            }}
          >
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Start Test</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={{ paddingVertical: 14, alignItems: 'center' }}
            onPress={() => router.back()}
          >
            <Text style={{ color: Colors.text.secondary, fontSize: 15, fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const getSubmissionStats = () => {
    let answered = 0;
    let skipped = 0;
    questions.forEach(q => {
      const ans = answers[q.id];
      if (ans !== undefined && ans !== null) {
        answered++;
      } else {
        skipped++;
      }
    });
    return { answered, skipped };
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressText}>Question {currentQIndex + 1} of {questions.length}</Text>
          <View style={[styles.timerBadge, isLowTime && styles.timerLow]}>
            <Ionicons name="time-outline" size={16} color={isLowTime ? '#fff' : Colors.text.primary} />
            <Text style={[styles.timerText, isLowTime && styles.timerTextLow]}>{formatTime(timeLeft)}</Text>
          </View>
        </View>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${((currentQIndex + 1) / questions.length) * 100}%` }]} />
        </View>
      </View>

      <FlatList 
        ref={flatListRef}
        data={questions}
        keyExtractor={q => q.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        getItemLayout={(data, index) => ({
          length: windowWidth,
          offset: windowWidth * index,
          index,
        })}
        onMomentumScrollEnd={(e) => {
          const newIndex = Math.round(e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width);
          if (newIndex !== currentQIndex) {
            const now = Date.now();
            const elapsedMs = now - lastTimeRef.current;
            if (questions[currentQIndex]) {
              const prevQId = questions[currentQIndex].id;
              timeLogsRef.current[prevQId] = (timeLogsRef.current[prevQId] || 0) + elapsedMs;
            }
            lastTimeRef.current = now;
            setCurrentQIndex(newIndex);
          }
        }}
        renderItem={({ item: q }) => (
          <View style={[styles.page, { width: windowWidth }]}>
            <View style={styles.questionCard}>
              <Text style={styles.questionText}>{q.question_text}</Text>
              
              <View style={styles.optionsList}>
                {q.options.map((opt: string, oIdx: number) => {
                  const isSelected = answers[q.id] === oIdx;
                  return (
                    <TouchableOpacity 
                      key={oIdx}
                      style={[styles.optionBtn, isSelected && styles.optionSelected]}
                      onPress={() => handleSelectOption(q.id, oIdx)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.radio, isSelected && styles.radioSelected]}>
                        {isSelected && <View style={styles.radioDot} />}
                      </View>
                      <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        )}
      />

      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.navBtn} 
          onPress={() => {
            const newIndex = Math.max(0, currentQIndex - 1);
            navigateToQuestion(newIndex);
          }}
          disabled={currentQIndex === 0}
        >
          <Ionicons name="chevron-back" size={24} color={currentQIndex === 0 ? '#ccc' : Colors.accent.primary} />
          <Text style={[styles.navText, currentQIndex === 0 && {color: '#ccc'}]}>Previous</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.submitBtn} onPress={() => setShowSubmitConfirm(true)}>
          <Text style={styles.submitBtnText}>Submit Test</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.navBtn}
          onPress={() => {
            const newIndex = Math.min(questions.length - 1, currentQIndex + 1);
            navigateToQuestion(newIndex);
          }}
          disabled={currentQIndex === questions.length - 1}
        >
          <Text style={[styles.navText, currentQIndex === questions.length - 1 && {color: '#ccc'}]}>Next</Text>
          <Ionicons name="chevron-forward" size={24} color={currentQIndex === questions.length - 1 ? '#ccc' : Colors.accent.primary} />
        </TouchableOpacity>
      </View>

      <Modal visible={showSubmitConfirm} transparent animationType="fade" onRequestClose={() => setShowSubmitConfirm(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 340, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.text.primary, marginBottom: 12, textAlign: 'center' }}>Submit Test</Text>
            <Text style={{ fontSize: 14, color: Colors.text.secondary, textAlign: 'center', marginBottom: 20 }}>Are you sure you want to submit? Here is your test summary:</Text>
            
            {(() => {
              const { answered, skipped } = getSubmissionStats();
              return (
                <View style={{ gap: 10, marginBottom: 24, backgroundColor: '#f9f9f9', padding: 16, borderRadius: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, color: Colors.text.secondary, fontWeight: '600' }}>Total Questions:</Text>
                    <Text style={{ fontSize: 13, color: Colors.text.primary, fontWeight: '800' }}>{questions.length}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, color: Colors.status.success, fontWeight: '600' }}>Attempted:</Text>
                    <Text style={{ fontSize: 13, color: Colors.status.success, fontWeight: '800' }}>{answered}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, color: Colors.text.tertiary, fontWeight: '600' }}>Skipped:</Text>
                    <Text style={{ fontSize: 13, color: Colors.text.tertiary, fontWeight: '800' }}>{skipped}</Text>
                  </View>
                </View>
              );
            })()}

            <View style={{ gap: 10 }}>
              <TouchableOpacity 
                style={{ backgroundColor: Colors.status.success, paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
                onPress={() => {
                  setShowSubmitConfirm(false);
                  submitTest('manual');
                }}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Yes, Submit Test</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={{ paddingVertical: 12, alignItems: 'center' }}
                onPress={() => setShowSubmitConfirm(false)}
              >
                <Text style={{ color: Colors.text.secondary, fontSize: 14, fontWeight: '600' }}>Go Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  progressText: { fontSize: 16, fontWeight: '700', color: Colors.text.primary },
  timerBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  timerLow: { backgroundColor: Colors.status.warning },
  timerText: { marginLeft: 6, fontWeight: '600', color: Colors.text.primary },
  timerTextLow: { color: '#fff' },
  progressBarBg: { height: 6, backgroundColor: '#eee', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: Colors.accent.primary },
  pagerView: { flex: 1 },
  page: { flex: 1, padding: 16 },
  questionCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  questionText: { fontSize: 18, fontWeight: '600', color: '#222', marginBottom: 24, lineHeight: 28 },
  optionsList: { gap: 12 },
  optionBtn: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#eee', backgroundColor: '#fafafa' },
  optionSelected: { borderColor: Colors.accent.primary, backgroundColor: '#f0f5ff' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#ccc', marginRight: 16, justifyContent: 'center', alignItems: 'center' },
  radioSelected: { borderColor: Colors.accent.primary },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.accent.primary },
  optionText: { flex: 1, fontSize: 16, color: '#444' },
  optionTextSelected: { color: Colors.accent.primary, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee' },
  navBtn: { flexDirection: 'row', alignItems: 'center', padding: 8 },
  navText: { fontSize: 16, fontWeight: '600', color: Colors.accent.primary, marginHorizontal: 4 },
  submitBtn: { backgroundColor: Colors.status.success, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  submitBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});

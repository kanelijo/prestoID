import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, AppState, ActivityIndicator, Dimensions, FlatList, Modal, Platform, BackHandler } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useQuizStore } from '@/stores/useQuizStore';
import { getTestFromLocal, saveTestToLocal, saveTestProgressToLocal } from '@/lib/localDb';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { CustomAlert } from '@/components/CustomAlert';
import { sendExamHeartbeat, logCBTTelemetryForBigQuery } from '@/lib/firestore';

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const endTimeRef = useRef<number>(0);
  const reqFrameRef = useRef<number>(0);

  const flatListRef = useRef<FlatList>(null);
  const appState = useRef(AppState.currentState);
  const backgroundTime = useRef<number | null>(null);
  const timeLogsRef = useRef<Record<string, number>>({});
  const changesRef = useRef<Record<string, number>>({});
  const revisitsRef = useRef<Record<string, number>>({});
  const autoAdvanceTimeoutRef = useRef<any>(null);
  const channelRef = useRef<any>(null);
  const lastTimeRef = useRef<number>(Date.now());
  const hasSubmitted = useRef<boolean>(false);
  // Only true between startTimer() and submitTest() — NOT during analysis/review
  const isTestActive = useRef<boolean>(false);

  useFocusEffect(
    useCallback(() => {
      // 1. Reset all state hooks to default values
      setTestDetails(null);
      setQuestions([]);
      setIsLoading(true);
      setCurrentQIndex(0);
      setIsStarted(false);
      setShowSubmitConfirm(false);
      setTimeLeft(0);
      setIsSubmitting(false);

      // 2. Reset all ref containers to default values
      endTimeRef.current = 0;
      reqFrameRef.current = 0;
      backgroundTime.current = null;
      timeLogsRef.current = {};
      changesRef.current = {};
      revisitsRef.current = {};
      lastTimeRef.current = Date.now();
      hasSubmitted.current = false;
      isTestActive.current = false;

      // 3. Clear active answers in quiz store
      clearAnswers();

      // 4. Load the new test details
      loadTest();

      return () => {
        cancelAnimationFrame(reqFrameRef.current);
        if (autoAdvanceTimeoutRef.current) {
          clearTimeout(autoAdvanceTimeoutRef.current);
        }
      };
    }, [id])
  );

  useEffect(() => {
    // Listen for realtime status changes for this specific test
    let isMounted = true;
    let createdChannel: any = null;

    if (id && typeof id === 'string' && id !== 'demo-test-id') {
      const initRealtime = async () => {
        const topicName = `public:tests:id=eq.${id}`;
        const existing = supabase.getChannels().find(ch => ch.topic === `realtime:${topicName}` || ch.topic === topicName);
        if (existing) {
          await supabase.removeChannel(existing);
        }
        if (!isMounted) return;

        let studentName = user?.full_name || 'Anonymous Student';
        let studentAvatar = user?.avatar_url || null;

        if (user?.id) {
          const { data: st } = await supabase.from('students').select('name, photo_url').eq('user_id', user.id).maybeSingle();
          if (st) {
            if (st.name) studentName = st.name;
            if (st.photo_url) studentAvatar = st.photo_url;
          }
        }

        const channel = supabase.channel(topicName, {
          config: { presence: { key: user?.id || 'anonymous' } }
        });

        channel.on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'tests', filter: `id=eq.${id}` },
          (payload) => {
            if (payload.new && isMounted) {
              setTestDetails((prev: any) => ({ ...prev, ...payload.new }));
            }
          }
        );

        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && isMounted) {
            channelRef.current = channel;
            createdChannel = channel;
            await channel.track({
              user_id: user?.id,
              name: studentName,
              avatar: studentAvatar,
              status: isStarted ? 'writing' : 'waiting',
              online_at: new Date().toISOString(),
            });
          }
        });
      };

      initRealtime();

      return () => {
        isMounted = false;
        if (channelRef.current) {
          const ch = channelRef.current;
          channelRef.current = null;
          ch.untrack().finally(() => {
            supabase.removeChannel(ch);
          });
        } else if (createdChannel) {
          createdChannel.untrack().finally(() => {
            supabase.removeChannel(createdChannel);
          });
        }
      };
    }
  }, [isStarted, user?.id]);

  // Handle Android Hardware Back Button
  useEffect(() => {
    const onBackPress = () => {
      if (!isStarted) {
        if (useAuthStore.getState().activeEnvironment === 'public') {
          router.replace('/(student)/public-tests');
        } else {
          router.replace('/(student)/test');
        }
        return true;
      } else {
        setShowSubmitConfirm(true);
        return true;
      }
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [isStarted]);

  // Re-track presence when isStarted changes to update status to 'writing'
  useEffect(() => {
    if (channelRef.current && user?.id) {
      channelRef.current.track({
        user_id: user.id,
        name: user.full_name || 'Student',
        avatar: user.avatar_url || null,
        status: isStarted ? 'writing' : 'waiting',
        online_at: new Date().toISOString(),
      });
    }
  }, [isStarted]);

  // Auto-start test when status becomes 'live' while student is waiting
  useEffect(() => {
    if (!isStarted && testDetails?.status === 'live' && verified) {
      setIsStarted(true);
      lastTimeRef.current = Date.now();
      startTimer(testDetails?.duration_minutes || testDetails?.time_limit || 60);
    }
  }, [testDetails?.status, isStarted, verified]);

  // Polling fallback every 3 seconds while waiting for teacher to start test
  useEffect(() => {
    if (!isStarted && id && id !== 'demo-test-id' && (!testDetails || testDetails.status === 'scheduled')) {
      const interval = setInterval(async () => {
        const { data } = await supabase.from('tests').select('*').eq('id', id).maybeSingle();
        if (data && data.status) {
          setTestDetails((prev: any) => ({ ...prev, ...data }));
        }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isStarted, id, testDetails?.status]);

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

  // ─── LIVE PROCTORING HEARTBEAT (FIRESTORE) ───────────
  useEffect(() => {
    if (!isStarted || hasSubmitted.current || !id || id === 'demo') return;

    const interval = setInterval(() => {
      const activeStudent = studentId || useAuthStore.getState().studentData?.id || user?.id;
      if (!activeStudent) return;

      const answeredCount = Object.keys(useQuizStore.getState().answers).length;

      sendExamHeartbeat({
        testId: String(id),
        studentId: activeStudent,
        studentName: useAuthStore.getState().studentData?.name || user?.email?.split('@')[0] || 'Student',
        currentQuestionIndex: currentQIndex,
        totalAnswered: answeredCount,
        timeRemainingSeconds: timeLeft,
        networkStatus: 'online',
        lastHeartbeat: Date.now(),
        isCompleted: false,
      }).catch(_ => {});
    }, 5000);

    return () => clearInterval(interval);
  }, [isStarted, id, studentId, currentQIndex, timeLeft]);

  const exitLogsRef = useRef<any[]>([]);
  const exitTimerRef = useRef<any>(null);

  const handleAppStateChange = (nextAppState: any) => {
    // Only enforce anti-cheat when a live test is actively in progress
    if (!isTestActive.current || hasSubmitted.current) return;
    
    if (appState.current.match(/active/) && nextAppState.match(/inactive|background/)) {
      backgroundTime.current = Date.now();
      const exitTimeISO = new Date().toISOString();
      exitLogsRef.current.push({ timestamp: exitTimeISO, type: 'app_exit' });
      saveActiveTestState({}); // Saves lastActiveTime timestamp automatically

      // Start 40-second warning countdown timer before auto-submitting
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      exitTimerRef.current = setTimeout(() => {
        if (!hasSubmitted.current) {
          submitTest('violation_40s_exit');
        }
      }, 40000);
    } else if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }

      if (backgroundTime.current) {
        const timeAwayMs = Date.now() - backgroundTime.current;
        const durationSec = Math.round(timeAwayMs / 1000);
        lastTimeRef.current += timeAwayMs; // Deduct time spent in background from question timer
        
        // Update last exit log entry with duration
        if (exitLogsRef.current.length > 0) {
          exitLogsRef.current[exitLogsRef.current.length - 1].duration_seconds = durationSec;
        }

        if (durationSec >= 40) {
          CustomAlert.alert('Violation Detected', 'You left the test for more than 40 seconds. Auto-submitting.');
          submitTest('violation_40s_exit');
        } else {
          CustomAlert.alert(
            'Anti-Cheat Warning ⚠️',
            `You exited the exam app for ${durationSec}s. This app switch has been logged for teacher review.`
          );
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
          { id: 'q1', question_text: 'What is the primary advantage of a RAG pipeline?', options: ['It uses 100% internet data', 'It prevents hallucinations by locking context', 'It is slower but more creative', 'It replaces the teacher'] },
          { id: 'q2', question_text: 'Why do we use FlatList instead of PagerView for tests?', options: ['It has a nice background', 'It is web-only', 'Zero latency native view controllers', 'Better cross-platform compatibility'] }
        ]);
        setIsLoading(false);
        return;
      }

      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        const { data: st } = await supabase.from('students').select('id').eq('user_id', currentUser.id).maybeSingle();
        if (st) setStudentId(st.id);
      }

      // Fetch Test (Try Local SQLite Engine SSOT first for 0ms launch & offline mode)
      let test: any = getTestFromLocal(String(id));
      if (!test || test.status === 'scheduled' || test.status === 'live') {
        const { data: remoteTest, error: tErr } = await supabase.from('tests').select('*').eq('id', id).single();
        if (tErr) throw tErr;
        test = remoteTest;
        saveTestToLocal(String(id), test);
      }
      
      let finalQuestions: any[] = [];
      if (test.questions && Array.isArray(test.questions) && test.questions.length > 0) {
        finalQuestions = test.questions;
      } else {
        // 🔒 SECURITY FIX: Exclude correct_option and explanation from client question fetch
        const { data: qData } = await supabase
          .from('test_questions')
          .select('id, test_id, question_text, option_a, option_b, option_c, option_d, topic_tag, order_index')
          .eq('test_id', id)
          .order('created_at');
        finalQuestions = qData || [];
      }

      setTestDetails(test);
      setQuestions(finalQuestions);

      // Check if there is an active running state for this test
      const cachedStateStr = await AsyncStorage.getItem(`@active_test_state_${id}`);
      if (cachedStateStr) {
        const cachedState = JSON.parse(cachedStateStr);
        if (cachedState.isStarted) {
          const now = Date.now();
          let updatedEndTime = cachedState.endTime;
          
          if (test.status === 'live' && test.start_time) {
            const absoluteStartTime = new Date(test.start_time).getTime();
            const duration = test.duration_minutes || test.time_limit || 60;
            if (!isNaN(absoluteStartTime)) {
              updatedEndTime = absoluteStartTime + (duration * 60 * 1000);
            }
          }

          const remaining = Math.max(0, Math.floor((updatedEndTime - now) / 1000));
          if (remaining > 0) {
            // Load local answers into quiz store first
            await useQuizStore.getState().loadFromLocal(id);
            
            endTimeRef.current = updatedEndTime;
            timeLogsRef.current = cachedState.timeLogs || {};
            changesRef.current = cachedState.changes || {};
            revisitsRef.current = cachedState.revisits || {};
            isTestActive.current = true;
            activateKeepAwakeAsync();
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
            endTimeRef.current = updatedEndTime;
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
      CustomAlert.alert('Error', 'Failed to load test');
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
      const path = `${FileSystem.documentDirectory}test_${id}_progress.json`;
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) {
        await FileSystem.deleteAsync(path);
      }
    } catch (err) {
      console.warn('Failed to clear active test state:', err);
    }
  };

  const startTimer = (durationMinutes: number) => {
    if (testDetails?.status === 'live' && testDetails?.start_time) {
      // Global clock sync: calculate exact end time based on test's absolute start_time
      const absoluteStartTime = new Date(testDetails.start_time).getTime();
      endTimeRef.current = absoluteStartTime + (durationMinutes * 60 * 1000);
      
      // Fallback: If user joins exactly after test ended (or Date parse failed)
      if (!isNaN(endTimeRef.current) && Date.now() >= endTimeRef.current) {
         submitTest(false);
         return;
      }
    } else {
      endTimeRef.current = Date.now() + (durationMinutes * 60 * 1000);
    }

    isTestActive.current = true; // Mark test as live — anti-cheat now active
    activateKeepAwakeAsync();          // Prevent screen from sleeping during test
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

    const now = Date.now();
    const elapsedMs = now - lastTimeRef.current;

    // Track answer change (hesitation indicator)
    const previousAns = answers[qId];
    if (previousAns !== undefined && previousAns !== null && previousAns !== index) {
      changesRef.current[qId] = (changesRef.current[qId] || 0) + 1;
    }

    setAnswer(qId, index);
    submitToLocal(id);

    // ─── STREAM COGNITIVE TELEMETRY TO BIGQUERY ───────────
    if (id && id !== 'demo') {
      const activeStudent = studentId || useAuthStore.getState().studentData?.id || user?.id || 'guest';
      const totalDurationSec = (testDetails?.duration_minutes || 60) * 60;
      const progressRatio = totalDurationSec > 0 ? Math.min(1.0, Math.max(0, 1 - (timeLeft / totalDurationSec))) : 0;

      logCBTTelemetryForBigQuery({
        eventId: `${id}_${activeStudent}_${qId}_${now}`,
        testId: String(id),
        studentId: activeStudent,
        studentName: useAuthStore.getState().studentData?.name || user?.email?.split('@')[0] || 'Student',
        subject: testDetails?.subject || 'General',
        eventType: previousAns !== undefined ? 'OPTION_CHANGE' : 'OPTION_SELECT',
        questionId: qId,
        questionNumber: currentQIndex + 1,
        selectedOptionIndex: index,
        previousOptionIndex: previousAns ?? null,
        timeSpentOnQuestionSeconds: Math.round(((timeLogsRef.current[qId] || 0) + elapsedMs) / 1000),
        remainingTimeSeconds: timeLeft,
        hesitationTimeMs: elapsedMs,
        optionFlipCount: changesRef.current[qId] || 0,
        isRevisit: (revisitsRef.current[qId] || 1) > 1,
        isEgoTrap: ((timeLogsRef.current[qId] || 0) + elapsedMs) > 240000,
        rapidGuessDetected: elapsedMs < 3500,
        examProgressRatio: Number(progressRatio.toFixed(2)),
        timestamp: now,
      }).catch(_ => {});
    }
    
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
    setIsSubmitting(true);
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

    // Send final completion heartbeat to Firestore
    if (id && id !== 'demo') {
      const activeStudent = studentId || useAuthStore.getState().studentData?.id || user?.id;
      if (activeStudent) {
        sendExamHeartbeat({
          testId: String(id),
          studentId: activeStudent,
          studentName: useAuthStore.getState().studentData?.name || user?.email?.split('@')[0] || 'Student',
          currentQuestionIndex: currentQIndex,
          totalAnswered: Object.keys(latestAnswers).length,
          timeRemainingSeconds: 0,
          networkStatus: 'online',
          lastHeartbeat: Date.now(),
          isCompleted: true,
        }).catch(_ => {});
      }
    }

    if (id === 'demo') {
      clearAnswers();
      setIsSubmitting(false);
      router.replace(`/(student)/test/result/${id}`);
      return;
    }

    let activeStudentId = studentId || useAuthStore.getState().studentData?.id;
    if (!activeStudentId) {
      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        const { data: st } = await supabase.from('students').select('id').eq('user_id', currentUser.id).maybeSingle();
        if (st) {
          activeStudentId = st.id;
        }
      }
    }

    if (!activeStudentId) {
      setIsSubmitting(false);
      hasSubmitted.current = false;
      setTimeout(() => {
        CustomAlert.alert('Error', 'Unable to verify your student profile. Please ensure you are logged in correctly.');
      }, 400);
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

    let correctCount = 0;
    let wrongCount = 0;
    let skippedCount = 0;
    questions.forEach((q) => {
      const studentAns = latestAnswers[q.id];
      if (studentAns === undefined || studentAns === null) {
        skippedCount++;
      } else if (studentAns === q.correct_option) {
        correctCount++;
      } else {
        wrongCount++;
      }
    });

    let retryCount = 0;
    const maxRetries = 4;
    let success = false;
    let newSubId = null;
    let lastError = null;

    while (retryCount < maxRetries && !success) {
      try {
        // 🔒 SECURE SERVER-SIDE EVALUATION & RANK CALCULATION VIA RPC
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('submit_test_answers', {
          p_test_id: id,
          p_student_id: activeStudentId,
          p_answers: latestAnswers,
          p_time_logs: timeLogsSeconds,
          p_exit_logs: exitLogsRef.current || []
        });

        if (rpcErr) throw rpcErr;

        if (rpcRes && rpcRes.length > 0) {
          newSubId = rpcRes[0].submission_id;
          totalScore = rpcRes[0].final_score;
        }

        success = true;
      } catch (err) {
        lastError = err;
        retryCount++;
        if (retryCount < maxRetries) {
          const delay = 400 * Math.pow(2, retryCount);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // 1. Buffer attempt progress into local SQLite engine (ACID persistence)
    saveTestProgressToLocal(String(id), activeStudentId, latestAnswers, timeLogsSeconds, totalScore, questions.length, success);

    if (success && newSubId) {
      clearAnswers();
      setIsSubmitting(false);
      router.replace(`/(student)/test/result/${newSubId}`);
    } else {
      console.warn('Supabase submission failed. Saving attempt offline:', lastError);
      try {
        const stored = await AsyncStorage.getItem('@offline_test_submissions');
        const queue = stored ? JSON.parse(stored) : [];
        queue.push({
          test_id: id,
          student_id: activeStudentId,
          answers: latestAnswers,
          time_logs: timeLogsSeconds,
          score: totalScore,
          total_questions: questions.length
        });
        await AsyncStorage.setItem('@offline_test_submissions', JSON.stringify(queue));
      } catch (e) {
        console.warn('Failed to cache offline test submission:', e);
      }

      clearAnswers();
      setIsSubmitting(false);
      router.replace({
        pathname: `/(student)/test/result/offline`,
        params: {
          testId: String(id),
          score: totalScore,
          total: questions.length,
          correct: correctCount,
          wrong: wrongCount,
          skipped: skippedCount,
          testTitle: testDetails?.title || 'Online Mock Test',
          answers: JSON.stringify(latestAnswers),
          timeLogs: JSON.stringify(timeLogsSeconds)
        }
      });
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
      <SafeAreaView style={[styles.container, { paddingHorizontal: 20, paddingTop: 12, paddingBottom: Platform.OS === 'android' ? 8 : 16, backgroundColor: '#F8F9FA' }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 16 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.accent.primary + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 12, marginTop: 4 }}>
            <Ionicons name="document-text" size={28} color={Colors.accent.primary} />
          </View>
          
          <Text style={{ fontSize: 20, fontWeight: '800', color: Colors.text.primary, textAlign: 'center', marginBottom: 4 }}>
            {testDetails?.title || 'Online Mock Test'}
          </Text>
          <Text style={{ fontSize: 13, color: Colors.text.secondary, textAlign: 'center', marginBottom: 16 }}>
            Please read the instructions carefully before starting the test.
          </Text>

          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, width: '100%', borderWidth: 1, borderColor: '#EBEBEB', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="help-circle-outline" size={18} color={Colors.accent.primary} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, color: Colors.text.tertiary, fontWeight: '600', textTransform: 'uppercase' }}>Total Questions</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text.primary }}>{questions.length} Multiple Choice Questions</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="time-outline" size={18} color={Colors.accent.primary} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, color: Colors.text.tertiary, fontWeight: '600', textTransform: 'uppercase' }}>Test Duration</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text.primary }}>{testDetails?.duration_minutes || 60} Minutes</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="gift-outline" size={18} color={Colors.accent.primary} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, color: Colors.text.tertiary, fontWeight: '600', textTransform: 'uppercase' }}>Marking Scheme</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text.primary }}>
                  +{posMarks} for Correct, {negMarks > 0 ? `-${negMarks} for Incorrect` : '0 Negative Marking'}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'flex-start', borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 12, marginTop: 6 }}>
              <Ionicons name="warning-outline" size={18} color={Colors.status.warning} style={{ marginRight: 10, marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, color: Colors.status.warning, fontWeight: '700', textTransform: 'uppercase' }}>Exit Warning</Text>
                <Text style={{ fontSize: 12, color: Colors.text.secondary, lineHeight: 16 }}>
                  Do not lock your device or exit the app during the test. Doing so for more than 20 seconds will trigger automatic submission.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>

        <View style={{ gap: 8, paddingBottom: 0, width: '100%' }}>
          {testDetails?.status === 'scheduled' ? (
            <View style={{ backgroundColor: Colors.bg.secondary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={Colors.accent.primary} style={{ marginBottom: 4 }} />
              <Text style={{ color: Colors.text.primary, fontSize: 16, fontWeight: '700' }}>Waiting for Teacher...</Text>
              <Text style={{ color: Colors.text.secondary, fontSize: 12, marginTop: 4 }}>The test will start automatically</Text>
            </View>
          ) : (
            <TouchableOpacity 
              style={{ backgroundColor: Colors.accent.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center', shadowColor: Colors.accent.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 }}
              onPress={() => {
                setIsStarted(true);
                lastTimeRef.current = Date.now();
                startTimer(testDetails?.duration_minutes || testDetails?.time_limit || 60);
              }}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Start Test</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity 
            style={{ paddingVertical: 10, alignItems: 'center' }}
            onPress={() => {
              if (useAuthStore.getState().activeEnvironment === 'public') {
                router.replace('/(student)/public-tests');
              } else {
                router.replace('/(student)/test');
              }
            }}
          >
            <Text style={{ color: Colors.text.secondary, fontSize: 14, fontWeight: '600' }}>Cancel</Text>
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
        extraData={answers}
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
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingBottom: 10 }}>
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
              </ScrollView>
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
      {isSubmitting && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.accent.primary} />
          <Text style={styles.loadingOverlayText}>Submitting your test, please wait...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  progressText: { fontSize: 15, fontWeight: '700', color: '#111827' },
  timerBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F2F5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  timerLow: { backgroundColor: '#EF4444' },
  timerText: { marginLeft: 6, fontWeight: '700', color: '#111827' },
  timerTextLow: { color: '#FFFFFF' },
  progressBarBg: { height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: Colors.accent.primary },
  pagerView: { flex: 1 },
  page: { flex: 1, padding: 16 },
  questionCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', padding: 20 },
  questionText: { fontSize: 17, fontWeight: '600', color: '#111827', marginBottom: 20, lineHeight: 28, paddingVertical: 4, includeFontPadding: false },
  optionsList: { gap: 10 },
  optionBtn: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  optionSelected: { borderColor: Colors.accent.primary, backgroundColor: '#FFF1ED' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#9CA3AF', marginRight: 14, justifyContent: 'center', alignItems: 'center' },
  radioSelected: { borderColor: Colors.accent.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.accent.primary },
  optionText: { flex: 1, fontSize: 15, color: '#374151', lineHeight: 24, paddingVertical: 4, includeFontPadding: false },
  optionTextSelected: { color: Colors.accent.primary, fontWeight: '700' },
  footer: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 16, 
    paddingTop: 10, 
    paddingBottom: Platform.OS === 'android' ? 12 : 24, 
    backgroundColor: '#FFFFFF', 
    borderTopWidth: 1, 
    borderTopColor: '#E5E7EB' 
  },
  navBtn: { flexDirection: 'row', alignItems: 'center', padding: 6 },
  navText: { fontSize: 14, fontWeight: '600', color: Colors.accent.primary, marginHorizontal: 4 },
  submitBtn: { backgroundColor: '#10B981', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  submitBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  loadingOverlayText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
});

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Animated, BackHandler, ScrollView,
  Modal, TextInput, Alert, Linking, KeyboardAvoidingView, Platform, Switch
} from 'react-native';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { usePrefetchStore } from '@/stores/usePrefetchStore';
import { useFeatureFlags } from '@/stores/useFeatureFlags';
import RazorpayCheckout from 'react-native-razorpay';
import { 
  saveTestToLocal,
  saveChatMessageToLocal,
  getChatHistoryFromLocal,
  getChatSessionsFromLocal,
  deleteChatSessionFromLocal
} from '@/lib/localDb';

// ─── Subject → Canonical Mapping, Emojis, and Colors (Bilingual) ─────────────
const SUBJECT_META: { canonical: string; keywords: string[]; emoji: string; color: string }[] = [
  { canonical: 'Mathematics', keywords: ['math', 'maths', 'mathematics', 'arithmetic', 'algebra', 'calculus', 'quantitative', 'ganit', 'गणित'], emoji: '📐', color: '#4E6AFF' },
  { canonical: 'Physics', keywords: ['physics', 'bhautik', 'भौतिकी'], emoji: '⚛️', color: '#7C3AED' },
  { canonical: 'Chemistry', keywords: ['chemistry', 'chem', 'rasayan', 'रसायन'], emoji: '🧪', color: '#059669' },
  { canonical: 'Biology', keywords: ['biology', 'bio', 'botany', 'zoology', 'life science', 'jeev', 'जीव विज्ञान'], emoji: '🌿', color: '#16A34A' },
  { canonical: 'History', keywords: ['history', 'medieval', 'ancient', 'modern history', 'itihas', 'itihaas', 'इतिहास'], emoji: '📜', color: '#D97706' },
  { canonical: 'Geography', keywords: ['geography', 'geo', 'map', 'environment', 'ecology', 'bhugol', 'भूगोल'], emoji: '🌍', color: '#0891B2' },
  { canonical: 'English', keywords: ['english', 'grammar', 'comprehension', 'vocabulary', 'language', 'angreji', 'अंग्रेजी'], emoji: '📖', color: '#BE185D' },
  { canonical: 'Reasoning', keywords: ['reasoning', 'logical', 'verbal', 'non-verbal', 'aptitude', 'intelligence', 'tarkshakti', 'reasing', 'तर्कशक्ति'], emoji: '🧠', color: '#DC2626' },
  { canonical: 'Science', keywords: ['science', 'general science', 'vigyan', 'विज्ञान'], emoji: '🔬', color: '#0284C7' },
  { canonical: 'Polity', keywords: ['polity', 'constitution', 'civics', 'governance', 'political', 'samvidhan', 'संविधान'], emoji: '⚖️', color: '#7C3AED' },
  { canonical: 'Economics', keywords: ['economics', 'economy', 'finance', 'banking', 'arthshastra', 'अर्थशास्त्र'], emoji: '📊', color: '#EA580C' },
  { canonical: 'Current Affairs', keywords: ['current affairs', 'gk', 'general knowledge', 'general awareness', 'samanya gyan', 'सामान्य ज्ञान'], emoji: '📰', color: '#0F766E' },
  { canonical: 'Computer Science', keywords: ['computer', 'it', 'technology', 'programming', 'software', 'संगणक'], emoji: '💻', color: '#2563EB' },
  { canonical: 'Hindi', keywords: ['hindi', 'sanskrit', 'urdu', 'marathi', 'regional language', 'language', 'हिन्दी'], emoji: '🗣️', color: '#9333EA' },
];

function getCanonicalSubject(subject: string | null | undefined): string {
  if (!subject || !subject.trim()) return 'General';
  const lower = subject.trim().toLowerCase();
  for (const entry of SUBJECT_META) {
    if (entry.keywords.some(k => lower.includes(k) || k.includes(lower))) {
      return entry.canonical;
    }
  }
  // Fallback to capitalizing the custom subject name
  return subject.trim().charAt(0).toUpperCase() + subject.trim().slice(1);
}

function getSubjectMeta(canonicalSubject: string): { emoji: string; color: string } {
  for (const entry of SUBJECT_META) {
    if (entry.canonical === canonicalSubject) {
      return { emoji: entry.emoji, color: entry.color };
    }
  }
  return { emoji: '📋', color: '#6B7280' };
}

// ─── Subject Category Card ───────────────────────────────────────────────────
function SubjectCard({
  subject, count, isNew, onPress
}: { subject: string; count: number; isNew: boolean; onPress: () => void }) {
  const { emoji, color } = getSubjectMeta(subject);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => Animated.spring(scaleAnim, { toValue: 0.95, useNativeDriver: true, speed: 30 }).start();
  const handlePressOut = () => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 30 }).start();

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], width: '47%', marginBottom: 14 }}>
      <TouchableOpacity
        style={[styles.subjectCard, { borderColor: color + '30' }]}
        activeOpacity={1}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <View style={[styles.subjectCardStrip, { backgroundColor: color }]} />
        <View style={styles.subjectCardBody}>
          <Text style={styles.subjectEmoji}>{emoji}</Text>
          <Text style={styles.subjectName} numberOfLines={2}>{subject}</Text>
          <View style={styles.subjectFooter}>
            <Text style={[styles.subjectCount, { color }]}>{count} test{count !== 1 ? 's' : ''}</Text>
            {isNew && (
              <View style={[styles.newBadge, { backgroundColor: color }]}>
                <Text style={styles.newBadgeText}>{count}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Pending Test Card ───────────────────────────────────────────────────────
function PendingTestCard({ item, onPress }: { item: any; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.testCard} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.cardHeader}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>PENDING</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.text.tertiary} />
      </View>
      <Text style={styles.testTitle}>{item.title}</Text>
      <View style={styles.cardFooter}>
        <View style={styles.footerItem}>
          <Ionicons name="time-outline" size={15} color={Colors.text.secondary} />
          <Text style={styles.footerText}>{item.duration_minutes} mins</Text>
        </View>
        <View style={styles.footerItem}>
          <Ionicons name="calendar-outline" size={15} color={Colors.text.secondary} />
          <Text style={styles.footerText}>
            {item.scheduled_at ? new Date(item.scheduled_at).toLocaleDateString() : 'Available Now'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Completed Test Card ─────────────────────────────────────────────────────
function CompletedTestCard({ item, onPress }: { item: any; onPress: () => void }) {
  const score = item.score;
  const scoreColor = score >= 75 ? '#16A34A' : score >= 40 ? '#D97706' : Colors.accent.primary;
  return (
    <TouchableOpacity style={[styles.testCard, { borderColor: Colors.card.border }]} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.cardHeader}>
        <View style={[styles.badge, { backgroundColor: '#16A34A15' }]}>
          <Text style={[styles.badgeText, { color: '#16A34A' }]}>COMPLETED</Text>
        </View>
        {score !== null && score !== undefined ? (
          <Text style={[styles.scoreText, { color: scoreColor }]}>{score}%</Text>
        ) : (
          <Text style={[styles.scoreText, { color: Colors.text.tertiary, fontSize: 12 }]}>Grading…</Text>
        )}
      </View>
      <Text style={styles.testTitle}>{item.tests?.title || 'Unknown Test'}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.footerText}>
          Submitted {new Date(item.submitted_at || item.created_at).toLocaleDateString()}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="analytics-outline" size={13} color={Colors.accent.primary} />
          <Text style={{ fontSize: 11, color: Colors.accent.primary, fontWeight: '700' }}>View Analysis</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// Helper to escape unescaped control characters in JSON values
const cleanJsonString = (rawStr: string) => {
  let cleaned = rawStr.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json/, '');
  if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```/, '');
  if (cleaned.endsWith('```')) cleaned = cleaned.replace(/```$/, '');
  cleaned = cleaned.trim();

  let insideQuote = false;
  let escaped = false;
  let result = '';

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === '"' && !escaped) {
      insideQuote = !insideQuote;
    }

    if (insideQuote) {
      if (char === '\n') {
        result += '\\n';
      } else if (char === '\r') {
        result += '\\r';
      } else if (char === '\t') {
        result += '\\t';
      } else if (char.charCodeAt(0) < 32) {
        continue;
      } else {
        result += char;
      }
    } else {
      result += char;
    }

    if (char === '\\' && !escaped) {
      escaped = true;
    } else {
      escaped = false;
    }
  }
  return result;
};

// Helper to render basic markdown bold (**bold text**) inside React Native Text elements
const renderMarkdownText = (text: string, isUser: boolean) => {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const boldText = part.slice(2, -2);
      return (
        <Text key={index} style={{ fontWeight: 'bold', color: isUser ? '#FFF' : '#1A1C1E' }}>
          {boldText}
        </Text>
      );
    }
    return part;
  });
};

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function StudentTestScreen() {
  const router = useRouter();
  const { verified, user } = useAuthStore();
  const { fetchStudentPendingTestCount } = useNotificationStore();
  const { isFeatureActive } = useFeatureFlags();
  const activeStudentId = user?.id;

  const [activeTab, setActiveTab] = useState<'pending' | 'completed' | 'ai'>('pending');
  const prefetch = usePrefetchStore();
  const [pendingTests, setPendingTests] = useState<any[]>(prefetch.testsReady ? prefetch.pendingTests : []);
  const [completedTests, setCompletedTests] = useState<any[]>(prefetch.testsReady ? prefetch.completedTests : []);
  const [isLoading, setIsLoading] = useState(!prefetch.testsReady);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Student AI practice test states
  const [aiQuota, setAiQuota] = useState<number | null>(null);
  const [coachingCategory, setCoachingCategory] = useState<string>('Board');
  const [practiceTests, setPracticeTests] = useState<any[]>([]);
  const [practiceSubmissions, setPracticeSubmissions] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [selectedUpiApp, setSelectedUpiApp] = useState<'gpay' | 'phonepe' | 'paytm'>('gpay');
  const [showTargetExamPrompt, setShowTargetExamPrompt] = useState(false);

  // Zenza AI Chatbot States
  const [chatModalVisible, setChatModalVisible] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInputText, setChatInputText] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [selectedPracticeSubject, setSelectedPracticeSubject] = useState<string | null>(null);
  const [teacherTopics, setTeacherTopics] = useState<any[]>([]);

  // Zenza AI History & Settings States
  const [currentChatId, setCurrentChatId] = useState<string>(`chat_${Date.now()}`);
  const [chatSessions, setChatSessions] = useState<any[]>([]);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [chatLanguage, setChatLanguage] = useState<'Auto' | 'English' | 'Hindi' | 'Hinglish'>('Auto');
  const [chatDifficulty, setChatDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const chatFlatListRef = useRef<any>(null);

  // Generator Config Form States
  const [generatorModalVisible, setGeneratorModalVisible] = useState(false);
  const [genSubject, setGenSubject] = useState('');
  const [isCustomSubject, setIsCustomSubject] = useState(false);
  const [customSubjectText, setCustomSubjectText] = useState('');
  const [genTopic, setGenTopic] = useState('');
  const [genQuestionsCountText, setGenQuestionsCountText] = useState('5');
  const [genDurationText, setGenDurationText] = useState('10');
  const [genDifficulty, setGenDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');

  // Pulse animation for skeleton loading
  const skeletonPulse = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (isLoading) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(skeletonPulse, {
            toValue: 0.7,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(skeletonPulse, {
            toValue: 0.3,
            duration: 900,
            useNativeDriver: true,
          }),
        ])
      );
      anim.start();
      return () => anim.stop();
    }
  }, [isLoading]);

  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [visitedSubjects, setVisitedSubjects] = useState<Set<string>>(new Set());
  const VISITED_KEY = `visited_subjects_${activeStudentId}`;

  const loadVisited = async () => {
    try {
      const raw = await AsyncStorage.getItem(VISITED_KEY);
      if (raw) setVisitedSubjects(new Set(JSON.parse(raw)));
    } catch {}
  };

  const markVisited = async (subject: string) => {
    const updated = new Set(visitedSubjects);
    updated.add(subject);
    setVisitedSubjects(updated);
    try {
      await AsyncStorage.setItem(VISITED_KEY, JSON.stringify([...updated]));
    } catch {}
  };

const SUBJECTS_BY_CATEGORY: Record<string, string[]> = {
  'Government': ['General Studies', 'Quantitative Aptitude', 'Reasoning', 'English', 'Current Affairs', 'Computer Knowledge'],
  'Medical': ['Biology', 'Physics', 'Chemistry', 'Anatomy', 'Physiology'],
  'Engineering': ['Mathematics', 'Physics', 'Chemistry', 'Computer Science'],
  'Board': ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English', 'History', 'Geography', 'Civics', 'Economics', 'Accountancy', 'Business Studies']
};

  const loadAiQuotaAndTests = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const store = useAuthStore.getState();
      const currentUserId = user?.id || store.user?.id;
      let student = store.studentData || null;

      if (!student && currentUserId) {
        const { data: studentsList } = await supabase
          .from('students')
          .select('id, batch_name, business_id')
          .eq('user_id', currentUserId)
          .limit(1);
        if (studentsList && studentsList.length > 0) {
          student = studentsList[0];
        }
      }

      if (!student) return;
      const studentId = student.id;
      const bizId = student.business_id;

      // 1. Fetch coaching metadata to determine coaching category
      const { data: biz } = await supabase
        .from('businesses')
        .select('metadata')
        .eq('id', bizId)
        .maybeSingle();

      const bizCategory = biz?.metadata?.category || 'Board';
      setCoachingCategory(bizCategory);

      // Set initial subject selection dynamically
      const subjects = SUBJECTS_BY_CATEGORY[bizCategory] || SUBJECTS_BY_CATEGORY['Board'];
      if (!genSubject && subjects.length > 0) {
        setGenSubject(subjects[0]);
      }

      // 2. Fetch successful payments of ₹1 for AI tests
      const { data: payments } = await supabase
        .from('payments')
        .select('id')
        .eq('student_id', studentId)
        .eq('status', 'success')
        .ilike('transaction_id', 'AI_TESTS_5_LIMIT:%');

      // Check local storage fallback for payment counts
      const fallbackPayCountStr = await AsyncStorage.getItem(`@local_ai_payment_count_${studentId}`);
      const fallbackPayCount = fallbackPayCountStr ? parseInt(fallbackPayCountStr, 10) : 0;
      
      const paymentCount = Math.max(payments ? payments.length : 0, fallbackPayCount);
      const totalPurchased = paymentCount * 5;

      // 3. Fetch all AI practice tests generated by this student
      const { data: generatedTests } = await supabase
        .from('tests')
        .select('*')
        .eq('business_id', bizId)
        .eq('status', 'published')
        .neq('is_deleted', true)
        .eq('description', `AI_Practice_Test:${studentId}`);

      const fallbackGenCountStr = await AsyncStorage.getItem(`@local_ai_generated_count_${studentId}`);
      const fallbackGenCount = fallbackGenCountStr ? parseInt(fallbackGenCountStr, 10) : 0;

      const totalGenerated = Math.max(generatedTests ? generatedTests.length : 0, fallbackGenCount);
      const remainingQuota = Math.max(0, totalPurchased - totalGenerated);

      setAiQuota(remainingQuota);

      if (generatedTests) {
        setPracticeTests(generatedTests);
        await AsyncStorage.setItem(`@local_ai_generated_count_${studentId}`, String(generatedTests.length));
      }

      // 4. Fetch submissions for these tests
      const { data: subs } = await supabase
        .from('test_submissions')
        .select('*, tests(*)')
        .eq('student_id', studentId);

       if (subs) {
         setPracticeSubmissions(subs);
       }

       // 5. Fetch teacher-set topics / chapters (from test_banks table)
       const { data: topicsData } = await supabase
         .from('test_banks')
         .select('*')
         .eq('business_id', bizId)
         .order('created_at', { ascending: false });

       if (topicsData) {
         setTeacherTopics(topicsData);
       }
     } catch (e) {
      console.warn("loadAiQuotaAndTests error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const executeMockPayment = async (student: any) => {
    setPaymentLoading(true);
    try {
      const timestamp = Date.now();
      const txnId = `AI_TESTS_5_LIMIT:${timestamp}`;

      await supabase
        .from('payments')
        .insert({
          business_id: student.business_id,
          student_id: student.id,
          amount: 1,
          status: 'success',
          transaction_id: txnId,
        });

      const currentPayCountStr = await AsyncStorage.getItem(`@local_ai_payment_count_${student.id}`);
      const currentPayCount = currentPayCountStr ? parseInt(currentPayCountStr, 10) : 0;
      await AsyncStorage.setItem(`@local_ai_payment_count_${student.id}`, String(currentPayCount + 1));

      setPaymentSuccess(true);
      setTimeout(() => {
        setPaymentLoading(false);
        setPaymentSuccess(false);
        setPaymentModalVisible(false);
        loadAiQuotaAndTests();
      }, 1500);
    } catch (e: any) {
      console.warn("Mock payment failed:", e);
      setPaymentLoading(false);
    }
  };

  const handlePayNow = async () => {
    const razorpayKey = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID;

    const store = useAuthStore.getState();
    const currentUserId = user?.id || store.user?.id;
    let student = store.studentData || null;

    if (!student && currentUserId) {
      const { data: studentsList } = await supabase
        .from('students')
        .select('id, name, email, phone, business_id')
        .eq('user_id', currentUserId)
        .limit(1);
      if (studentsList && studentsList.length > 0) {
        student = studentsList[0];
      }
    }

    if (!student) {
      Alert.alert("Error", "Student profile not found.");
      return;
    }

    if (!razorpayKey) {
      Alert.alert("Configuration Error", "Payment gateway is not configured. Please contact support.");
      return;
    }

    setPaymentLoading(true);

    try {
      const razorpaySecret = process.env.EXPO_PUBLIC_RAZORPAY_SECRET_KEY;
      if (!razorpaySecret) {
        throw new Error("Razorpay Secret Key is not configured");
      }

      // Inline Base64 encoder (avoids native dependency issues)
      const encodeBase64 = (str: string) => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        let result = '';
        let i = 0;
        while (i < str.length) {
          const c1 = str.charCodeAt(i++);
          const c2 = i < str.length ? str.charCodeAt(i++) : NaN;
          const c3 = i < str.length ? str.charCodeAt(i++) : NaN;
          const byte1 = c1 >> 2;
          const byte2 = ((c1 & 3) << 4) | (isNaN(c2) ? 0 : c2 >> 4);
          const byte3 = isNaN(c2) ? 64 : (((c2 & 15) << 2) | (isNaN(c3) ? 0 : c3 >> 6));
          const byte4 = isNaN(c3) ? 64 : c3 & 63;
          result +=
            chars.charAt(byte1) +
            chars.charAt(byte2) +
            (byte3 === 64 ? '=' : chars.charAt(byte3)) +
            (byte4 === 64 ? '=' : chars.charAt(byte4));
        }
        return result;
      };

      const authHeader = 'Basic ' + encodeBase64(`${razorpayKey}:${razorpaySecret}`);

      // 1. Create Razorpay order — if this fails, offer demo mode
      let orderId: string;
      try {
        const orderResponse = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: 100, // ₹1.00 in paise
            currency: 'INR',
            receipt: 'rcpt_' + Date.now(),
          }),
        });

        if (!orderResponse.ok) {
          const errText = await orderResponse.text();
          throw new Error(`Order creation failed: ${errText}`);
        }
        const orderData = await orderResponse.json();
        orderId = orderData.id;
      } catch (orderErr: any) {
        console.warn("Razorpay order creation failed:", orderErr);
        setPaymentLoading(false);
        Alert.alert("Payment Gateway Unavailable", "Could not connect to payment gateway. Please check your internet and try again.");
        return;
      }

      // 2. Open native Razorpay SDK
      RazorpayCheckout.open({
        description: 'Zenza AI Practice Tests Pack (5 Tests)',
        image: 'https://i.imgur.com/3g7ujGE.png',
        currency: 'INR',
        key: razorpayKey,
        amount: 100,
        name: 'Zenza AI Practice Tests',
        order_id: orderId,
        prefill: {
          email: student.email || 'student@gmail.com',
          contact: student.phone || '9999999999',
          name: student.name || 'Student',
        },
        theme: { color: '#4F46E5' },
      } as any)
        .then(async (data: any) => {
          const paymentId = data.razorpay_payment_id;
          if (!paymentId) throw new Error("No payment ID returned from Razorpay SDK");

          const txnId = `AI_TESTS_5_LIMIT:${paymentId}`;
          try {
            await supabase.from('payments').insert({
              business_id: student.business_id,
              student_id: student.id,
              amount: 1,
              status: 'success',
              transaction_id: txnId,
            });

            const currentPayCountStr = await AsyncStorage.getItem(
              `@local_ai_payment_count_${student.id}`
            );
            const currentPayCount = currentPayCountStr ? parseInt(currentPayCountStr, 10) : 0;
            await AsyncStorage.setItem(
              `@local_ai_payment_count_${student.id}`,
              String(currentPayCount + 1)
            );

            setPaymentSuccess(true);
            await loadAiQuotaAndTests(true);

            setTimeout(() => {
              setPaymentLoading(false);
              setPaymentSuccess(false);
              setPaymentModalVisible(false);
            }, 2500);
          } catch (e: any) {
            console.warn("Failed to save transaction to Supabase on native checkout:", e);
            Alert.alert("Database Error", "Failed to update your quota. Please contact support with payment ID: " + paymentId);
            setPaymentLoading(false);
          }
        })
        .catch((error: any) => {
          console.warn("Razorpay Native SDK Checkout Error:", error);
          setPaymentLoading(false);
          // code 0 or 'cancel' in description = user simply closed the sheet
          const userCancelled =
            error?.code === 0 ||
            String(error?.description || '').toLowerCase().includes('cancel');
          if (!userCancelled) {
            Alert.alert("Payment Failed", "Payment could not be processed. Please try again.");
          }
        });

    } catch (err: any) {
      console.warn("Error initiating Razorpay checkout:", err);
      setPaymentLoading(false);
      Alert.alert("Payment Error", err.message || "Failed to initiate payment. Please try again.");
    }
  };

  const CHAT_SYSTEM_PROMPT = `You are "Zenza AI", a friendly, helpful, and highly intelligent AI study assistant. Your goal is to help the student configure and generate a personalized practice multiple-choice test.

Available Subjects for this coaching center (Category: ${coachingCategory}):
${(SUBJECTS_BY_CATEGORY[coachingCategory] || SUBJECTS_BY_CATEGORY['Board']).join(', ')}

Chat Flow:
1. Guide the student to choose a subject, topic, number of questions, difficulty level, and duration in minutes.
2. Keep your replies very short, concise, and friendly. Avoid long explanations or conversational fillers. Speak in 1-2 sentences maximum until you generate the test.
3. Once you and the student have aligned on the test configuration, or the student says "generate the test", "let's start", or similar, you MUST generate the test questions and output them at the end of your message wrapped inside a <generate_test>...</generate_test> XML tag.

Within <generate_test>, output a standard JSON block with this structure:
{
  "title": "[Subject] Practice: [Topic]",
  "subject": "[Subject name]",
  "duration_minutes": [duration in minutes, e.g. 15],
  "questions": [
    {
      "question_text": "Question content...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_option": 0,
      "explanation": "Brief explanation of the answer..."
    }
  ]
}

Enforce the following critical rules for questions:
- Match the selected count of questions.
- Exponents/powers: Write using Unicode superscript characters (e.g. x², y³). DO NOT use '^' or '*'.
- Fractions: Write inside parenthesis, e.g., "(2/3)".
- Square Roots: Use the '√' character, e.g., "√(7)".
- Ensure the JSON is valid and properly escaped. Do not wrap the JSON inside markdown code blocks (like \`\`\`json) inside the <generate_test> tag. Just output the raw JSON.`;

  const handleStartChat = () => {
    const sessions = getChatSessionsFromLocal();
    setChatSessions(sessions);

    let activeId = currentChatId;
    const existingHistory = getChatHistoryFromLocal(activeId);
    if (existingHistory.length > 0) {
      setChatMessages(existingHistory);
    } else {
      const greetingText = "Hello! I am Zenza AI, your personal study assistant. What topic or subject would you like to practice today? You can specify the subject, difficulty, duration, or number of questions!";
      const greeting = { role: 'model', text: greetingText, testData: null };
      setChatMessages([greeting]);
      saveChatMessageToLocal(activeId, 'model', greetingText, null);
      setChatSessions(getChatSessionsFromLocal());
    }
    setChatModalVisible(true);
  };

  const handleStartNewChatSession = () => {
    const newId = `chat_${Date.now()}`;
    setCurrentChatId(newId);

    const greetingText = "Hello! I am Zenza AI, your personal study assistant. What topic or subject would you like to practice today? You can specify the subject, difficulty, duration, or number of questions!";
    const greeting = { role: 'model', text: greetingText, testData: null };
    setChatMessages([greeting]);
    saveChatMessageToLocal(newId, 'model', greetingText, null);

    setChatSessions(getChatSessionsFromLocal());
  };

  const handleSwitchChatSession = (chatId: string) => {
    setCurrentChatId(chatId);
    const history = getChatHistoryFromLocal(chatId);
    setChatMessages(history);
    setDrawerVisible(false);
  };

  const handleDeleteChatSession = (chatId: string) => {
    deleteChatSessionFromLocal(chatId);
    const sessions = getChatSessionsFromLocal();
    setChatSessions(sessions);

    if (currentChatId === chatId) {
      const newId = `chat_${Date.now()}`;
      setCurrentChatId(newId);
      const greetingText = "Hello! I am Zenza AI, your personal study assistant. What topic or subject would you like to practice today?";
      const greeting = { role: 'model', text: greetingText, testData: null };
      setChatMessages([greeting]);
      saveChatMessageToLocal(newId, 'model', greetingText, null);
      setChatSessions(getChatSessionsFromLocal());
    }
  };

  const handleSendMessageToAi = async () => {
    if (!chatInputText.trim() || chatLoading) return;

    const userMessageText = chatInputText.trim();
    setChatInputText('');
    
    const updatedMessages = [...chatMessages, { role: 'user', text: userMessageText }];
    setChatMessages(updatedMessages);
    saveChatMessageToLocal(currentChatId, 'user', userMessageText, null);
    setChatSessions(getChatSessionsFromLocal());
    setChatLoading(true);

    try {
      const geminiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
      if (!geminiKey) throw new Error("Missing AI API key");

      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const switchInstructions = `
CRITICAL ACTIVE CONFIGURATION:
1. Target Difficulty Level is: ${chatDifficulty} (Create questions matching this difficulty level strictly).
2. Target Language Selection:
${
  chatLanguage === 'Auto'
    ? 'Analyze the student\'s conversation language history. If they speak or request in Hindi, you MUST write responses and generated test questions in Hindi (Devanagari). If they speak in Hinglish (Hindi written in Roman text), write responses and generated test questions in Hinglish or Hindi. If they speak in English, write in English. Match their active language automatically.'
    : `You MUST write all conversational responses and generated test questions, options, and explanations strictly in ${chatLanguage}.`
}
`;

      const promptParts = [
        { text: CHAT_SYSTEM_PROMPT },
        { text: switchInstructions },
        ...updatedMessages.map(msg => ({
          text: `${msg.role === 'user' ? 'User' : 'Zenza AI'}: ${msg.text}`
        })),
        { text: "Zenza AI:" }
      ];

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: promptParts }]
      });

      const responseText = result.response.text();
      if (!responseText) throw new Error("No response from AI.");

      let parsedMessageText = responseText;
      let generatedTestData = null;

      const xmlStartTag = '<generate_test>';
      const xmlEndTag = '</generate_test>';
      const startIndex = responseText.indexOf(xmlStartTag);
      const endIndex = responseText.indexOf(xmlEndTag);

      if (startIndex !== -1 && endIndex !== -1) {
        parsedMessageText = responseText.substring(0, startIndex) + responseText.substring(endIndex + xmlEndTag.length);
        const rawJson = responseText.substring(startIndex + xmlStartTag.length, endIndex).trim();
        const cleanedJson = cleanJsonString(rawJson);
        try {
          const parsed = JSON.parse(cleanedJson);
          if (parsed && parsed.questions && parsed.questions.length > 0) {
            generatedTestData = parsed;
          }
        } catch (err) {
          console.warn("Failed to parse AI test payload:", err);
        }
      }

      const modelResponseText = parsedMessageText.trim();
      setChatMessages([
        ...updatedMessages,
        { role: 'model', text: modelResponseText, testData: generatedTestData }
      ]);
      saveChatMessageToLocal(currentChatId, 'model', modelResponseText, generatedTestData);
      setChatSessions(getChatSessionsFromLocal());

    } catch (e: any) {
      console.warn("Zenza AI Chat Error:", e);
      const errResponseText = `Sorry, I encountered an error: ${e.message || "Please try again."}`;
      setChatMessages([
        ...updatedMessages,
        { role: 'model', text: errResponseText }
      ]);
      saveChatMessageToLocal(currentChatId, 'model', errResponseText, null);
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    if (chatModalVisible && chatMessages.length > 0) {
      setTimeout(() => {
        chatFlatListRef.current?.scrollToEnd({ animated: true });
      }, 150);
    }
  }, [chatMessages, chatModalVisible]);

  const handleStartPracticeTest = async (testData: any) => {
    const currentQuota = aiQuota !== null ? aiQuota : 0;
    if (currentQuota <= 0) {
      Alert.alert(
        "Unlock AI Practice Pack",
        "You have completed all your practice tests. Please unlock 5 more tests for only ₹1 to continue!",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Buy Pack (₹1)", onPress: () => setPaymentModalVisible(true) }
        ]
      );
      return;
    }

    setChatLoading(true);
    try {
      const store = useAuthStore.getState();
      const currentUserId = user?.id || store.user?.id;
      let student = store.studentData || null;

      if (!student && currentUserId) {
        const { data: studentsList } = await supabase
          .from('students')
          .select('id, name, email, phone, business_id')
          .eq('user_id', currentUserId)
          .limit(1);
        if (studentsList && studentsList.length > 0) {
          student = studentsList[0];
        }
      }

      if (!student) throw new Error("Student profile not found.");

      const aiQuestions = testData.questions.map((q: any, idx: number) => ({
        id: q.id || `pq_${Date.now()}_${idx}`,
        question_text: q.question_text,
        options: q.options,
        correct_option: q.correct_option,
        explanation: q.explanation || ''
      }));

      // Insert practice test into Supabase
      const { data: newTest, error: insertErr } = await supabase
        .from('tests')
        .insert({
          business_id: student.business_id,
          title: testData.title || `AI Practice: ${testData.subject}`,
          subject: testData.subject || 'Practice',
          description: `AI_Practice_Test:${student.id}`,
          duration_minutes: testData.duration_minutes || 15,
          total_marks: aiQuestions.length * 5,
          positive_marks: 5,
          negative_marks: 0,
          status: 'published',
          questions: aiQuestions
        })
        .select()
        .single();

      if (insertErr || !newTest) {
        throw new Error(insertErr?.message || "Failed to save generated test.");
      }

      // Try inserting into legacy test_questions for backwards compatibility
      try {
        const legacyQuestions = aiQuestions.map((q: any, index: number) => ({
          test_id: newTest.id,
          question_text: q.question_text,
          options: q.options,
          correct_option: q.correct_option,
          explanation: q.explanation || '',
          sort_order: index
        }));
        await supabase.from('test_questions').insert(legacyQuestions);
      } catch (_) {}

      // Increment local count to track quota decrement
      const currentGenCountStr = await AsyncStorage.getItem(`@local_ai_generated_count_${student.id}`);
      const currentGenCount = currentGenCountStr ? parseInt(currentGenCountStr, 10) : 0;
      await AsyncStorage.setItem(`@local_ai_generated_count_${student.id}`, String(currentGenCount + 1));

      // Close chatbot and load tests
      setChatModalVisible(false);
      await loadAiQuotaAndTests(true);

      // Launch test engine!
      router.push(`/(student)/test/engine/${newTest.id}`);

    } catch (err: any) {
      console.warn("Failed to launch practice test:", err);
      Alert.alert("Error", err.message || "Failed to start practice test.");
    } finally {
      setChatLoading(false);
    }
  };

  const downloadPracticeTestPdf = async (testItem: any) => {
    try {
      const qHtml = testItem.questions.map((q: any, idx: number) => `
        <div class="question-card" style="margin-bottom: 24px; page-break-inside: avoid; background: #fff; padding: 16px; border: 1px solid #eee; border-radius: 8px;">
          <p style="font-weight: bold; margin-bottom: 12px; font-size: 16px;">Q${idx + 1}. ${q.question_text}</p>
          <div class="options-list" style="margin-left: 12px; margin-bottom: 12px;">
            ${q.options.map((opt: string, oIdx: number) => `
              <div style="margin-bottom: 6px; font-size: 14px;">
                <strong>${String.fromCharCode(65 + oIdx)}.</strong> ${opt}
              </div>
            `).join('')}
          </div>
          <p style="font-size: 13px; color: #666; margin-top: 10px; border-top: 1px dotted #ccc; padding-top: 8px;">
            <strong>Correct Answer:</strong> Option ${String.fromCharCode(65 + q.correct_option)} <br/>
            ${q.explanation ? `<strong>Explanation:</strong> ${q.explanation}` : ''}
          </p>
        </div>
      `).join('');

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${testItem.title}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; color: #333; padding: 24px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #AF2800; padding-bottom: 15px; }
            .meta-box { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 24px; font-size: 14px; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 style="margin: 0 0 8px 0; color: #AF2800; font-size: 24px;">Zenza AI Practice Test</h1>
            <p style="margin: 0; font-size: 14px; color: #666;">Generated dynamically by Zenza AI</p>
          </div>
          
          <div class="meta-box">
            <strong>Subject:</strong> ${testItem.subject}<br/>
            <strong>Title:</strong> ${testItem.title}<br/>
            <strong>Duration:</strong> ${testItem.duration_minutes} minutes<br/>
            <strong>Total Questions:</strong> ${testItem.questions ? testItem.questions.length : 0} Qs
          </div>

          <h3 style="color:#AF2800; border-bottom:1px solid #eee; padding-bottom:6px; margin-bottom: 20px;">Questions & Solutions</h3>
          ${qHtml}
        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      const pdfName = `${testItem.title.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}_Practice.pdf`;
      const targetUri = `${FileSystem.documentDirectory}${pdfName}`;
      await FileSystem.moveAsync({ from: uri, to: targetUri });

      await Sharing.shareAsync(targetUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Download Practice Test PDF',
        UTI: 'com.adobe.pdf'
      });
    } catch (err: any) {
      console.warn("PDF generation error:", err);
      Alert.alert("Error", "Failed to generate test PDF.");
    }
  };

  const handleGenerateTest = async () => {
    const finalSubject = isCustomSubject ? customSubjectText.trim() : genSubject;
    if (!finalSubject) {
      Alert.alert("Subject Required", "Please select a subject or enter a custom one.");
      return;
    }
    if (!genTopic.trim()) {
      Alert.alert("Topic Required", "Please enter a topic or concept to generate the test on.");
      return;
    }

    const qCount = parseInt(genQuestionsCountText, 10);
    if (isNaN(qCount) || qCount <= 0 || qCount > 100) {
      Alert.alert("Invalid Question Count", "Please enter a valid number of questions (1-100).");
      return;
    }

    const duration = parseInt(genDurationText, 10);
    if (isNaN(duration) || duration <= 0 || duration > 300) {
      Alert.alert("Invalid Duration", "Please enter a valid duration in minutes (1-300).");
      return;
    }

    setGeneratorModalVisible(false);
    setIsGenerating(true);

    try {
      const store = useAuthStore.getState();
      const currentUserId = user?.id || store.user?.id;
      let student = store.studentData || null;

      if (!student && currentUserId) {
        const { data: studentsList } = await supabase
          .from('students')
          .select('id, batch_name, business_id')
          .eq('user_id', currentUserId)
          .limit(1);
        if (studentsList && studentsList.length > 0) {
          student = studentsList[0];
        }
      }

      if (!student) throw new Error("Student profile not found.");

      const geminiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
      if (!geminiKey) throw new Error("Missing AI API key");

      const prompt = `Create a multiple-choice practice test in standard JSON format. Reply strictly with a JSON block. DO NOT use markdown formatting like \`\`\`json or surrounding conversational text.

Parameters:
- Subject: "${finalSubject}"
- Topic: "${genTopic}"
- Number of Questions: ${qCount}
- Difficulty: "${genDifficulty}"

Required JSON format:
{
  "is_test_ready": true,
  "metadata": {
    "title": "${finalSubject} Practice: ${genTopic}",
    "subject": "${finalSubject}",
    "duration_minutes": ${duration},
    "total_marks": ${qCount * 5},
    "positive_marks": 5,
    "negative_marks": 0
  },
  "questions": [
    {
      "question_text": "Give the question text here...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_option": 0,
      "explanation": "Provide a brief solution explanation..."
    }
  ]
}

CRITICAL MATH FORMATTING RULES:
1. Exponents: Write exponents/powers using standard Unicode superscript notation (e.g. x², y³, aⁿ). DO NOT use '^' or '*'.
2. Fractions: Write fractions with parenthesis, e.g. "(2/3)".
3. Square Roots: Use the Unicode square root symbol '√' (e.g., "√(7)").`;

      const genAI = new GoogleGenerativeAI(geminiKey);
      const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

      let rawResponseText = "";
      let success = false;

      for (const modelName of modelsToTry) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(prompt);
          rawResponseText = result.response.text();
          if (rawResponseText) {
            success = true;
            break;
          }
        } catch (_) {}
      }

      if (!success) {
        throw new Error("Unable to contact Gemini AI generation server. Please try again.");
      }

      const cleaned = cleanJsonString(rawResponseText);
      const testData = JSON.parse(cleaned);
      if (!testData.questions || testData.questions.length === 0) {
        throw new Error("Invalid test questions format returned by AI.");
      }

      const aiQuestions = testData.questions.map((q: any, idx: number) => ({
        id: q.id || `pq_${Date.now()}_${idx}`,
        question_text: q.question_text,
        options: q.options,
        correct_option: q.correct_option,
        explanation: q.explanation || ''
      }));

      // Insert practice test
      const { data: newTest, error: insertErr } = await supabase
        .from('tests')
        .insert({
          business_id: student.business_id,
          title: testData.metadata.title,
          subject: testData.metadata.subject,
          description: `AI_Practice_Test:${student.id}`,
          duration_minutes: duration,
          total_marks: qCount * 5,
          positive_marks: 5,
          negative_marks: 0,
          status: 'published',
          questions: aiQuestions
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      // Legacy test_questions table for backward compatibility
      try {
        const legacyQuestions = aiQuestions.map((q: any) => ({
          test_id: newTest.id,
          question_text: q.question_text,
          options: q.options,
          correct_option: q.correct_option,
          explanation: q.explanation
        }));
        await supabase.from('test_questions').insert(legacyQuestions);
      } catch (_) {}

      // Increment local count to track quota decrement
      const currentGenCountStr = await AsyncStorage.getItem(`@local_ai_generated_count_${student.id}`);
      const currentGenCount = currentGenCountStr ? parseInt(currentGenCountStr, 10) : 0;
      await AsyncStorage.setItem(`@local_ai_generated_count_${student.id}`, String(currentGenCount + 1));

      // Reload and launch!
      await loadAiQuotaAndTests(true);
      router.push(`/(student)/test/engine/${newTest.id}`);

    } catch (e: any) {
      console.warn("handleGenerateTest error:", e);
      Alert.alert("AI Creator Error", e.message || "Failed to generate practice test. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const fetchTests = async (silent = false) => {
    if (!silent) setIsLoading(true);

    try {
      const store = useAuthStore.getState();
      const currentUserId = user?.id || store.user?.id;

      // 1. Resolve Student Profile (with store fallback)
      let student = store.studentData || null;
      if (currentUserId) {
        const { data: studentsList } = await supabase
          .from('students')
          .select('id, batch_name, business_id')
          .eq('user_id', currentUserId)
          .limit(1);

        if (studentsList && studentsList.length > 0) {
          student = studentsList[0];
        }
      }

      // 2. Fetch Published Tests
      let testQuery = supabase
        .from('tests')
        .select('*')
        .eq('status', 'published')
        .neq('is_deleted', true)
        .order('created_at', { ascending: false });

      if (student?.business_id) {
        testQuery = testQuery.eq('business_id', student.business_id);
      }

      const { data: allTests, error: testErr } = await testQuery;
      if (testErr) throw testErr;

      // 3. Filter by batch matching (generous case-insensitive comparison)
      const studentBatch = String(student?.batch_name || '').toLowerCase().trim();
      const applicableTests = (allTests || []).filter((t: any) => {
        if (t.description && t.description.startsWith('AI_Practice_Test:')) {
          return false;
        }
        if (!t.batch_name || t.batch_name === 'All') return true;
        const testBatch = Array.isArray(t.batch_name) 
          ? String(t.batch_name[0] || '').toLowerCase().trim() 
          : String(t.batch_name).toLowerCase().trim();
        
        if (!studentBatch || !testBatch) return true; // If student batch is unset, show all published tests
        return testBatch === studentBatch || testBatch === 'all';
      });

      // Pre-cache published tests into local SQLite engine for 0ms launch & offline readiness
      applicableTests.forEach((t: any) => saveTestToLocal(t.id, t));

      // 4. Fetch Student Submissions (Ordered Newer to Older)
      let safeSubmissions: any[] = [];
      const studentIdToQuery = student?.id;
      if (studentIdToQuery) {
        const { data: submissions } = await supabase
          .from('test_submissions')
          .select('*, tests(*)')
          .eq('student_id', studentIdToQuery)
          .order('submitted_at', { ascending: false });

        if (submissions) {
          safeSubmissions = submissions;
        } else {
          const { data: fallbackSubs } = await supabase
            .from('test_submissions')
            .select('*')
            .eq('student_id', studentIdToQuery)
            .order('submitted_at', { ascending: false });
          safeSubmissions = fallbackSubs || [];
        }
      }

      const takenTestIds = new Set((safeSubmissions || []).map((s: any) => s.test_id));
      const pending = applicableTests
        .filter((t: any) => !takenTestIds.has(t.id))
        .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      const sortedCompleted = (safeSubmissions || []).sort((a: any, b: any) => {
        const dateA = new Date(a.submitted_at || a.created_at || 0).getTime();
        const dateB = new Date(b.submitted_at || b.created_at || 0).getTime();
        return dateB - dateA;
      });

      setPendingTests(pending);
      setCompletedTests(sortedCompleted);
    } catch (err) {
      console.warn("fetchTests error:", err);
      setPendingTests([]);
      setCompletedTests([]);
    } finally {
      setIsLoading(false); // Always clear loading — silent only suppresses the initial spinner show, not the clear
      setIsRefreshing(false);
    }
  };


  const syncOfflineSubmissions = async () => {
    try {
      const stored = await AsyncStorage.getItem('@offline_test_submissions');
      if (!stored) return;
      const queue = JSON.parse(stored);
      if (!Array.isArray(queue) || queue.length === 0) return;

      const remainingQueue: any[] = [];
      for (const sub of queue) {
        try {
          const { error } = await supabase
            .from('test_submissions')
            .upsert({
              test_id: sub.test_id,
              student_id: sub.student_id,
              answers: sub.answers,
              time_logs: sub.time_logs,
              score: sub.score,
              total_questions: sub.total_questions
            }, { onConflict: 'test_id, student_id' });
          if (error) throw error;
        } catch (err) {
          console.warn('Failed to sync offline submission:', err);
          remainingQueue.push(sub);
        }
      }
      
      if (remainingQueue.length === 0) {
        await AsyncStorage.removeItem('@offline_test_submissions');
      } else {
        await AsyncStorage.setItem('@offline_test_submissions', JSON.stringify(remainingQueue));
      }
      fetchTests(true);
    } catch (e) {
      console.warn('Offline sync error:', e);
    }
  };


  useFocusEffect(
    useCallback(() => {
      syncOfflineSubmissions().catch(() => {});
      fetchTests(true);
      loadVisited();
      if (activeStudentId) fetchStudentPendingTestCount(activeStudentId);
      if (isFeatureActive('target_exam_test')) {
        setShowTargetExamPrompt(true);
      }

      const onBackPress = () => {
        if (selectedSubject) {
          setSelectedSubject(null);
          return true;
        }
        if (selectedPracticeSubject) {
          setSelectedPracticeSubject(null);
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [verified, activeStudentId, selectedSubject, selectedPracticeSubject])
  );

  useEffect(() => {
    if (verified && activeStudentId) {
      syncOfflineSubmissions().catch(() => {});
      if (activeTab === 'ai') {
        loadAiQuotaAndTests(true).catch(() => {});
      } else {
        fetchTests(true).catch(() => {});
      }
    }

    // Native checkout manages transactions directly within handlePayNow
  }, [verified, activeStudentId, activeTab]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    if (activeTab === 'ai') {
      await loadAiQuotaAndTests(true);
    } else {
      await fetchTests(true);
    }
    setIsRefreshing(false);
  };

  // Build subject categories based on active tab
  const activeTests = activeTab === 'pending' ? pendingTests : completedTests;
  const subjectMap = new Map<string, any[]>();
  for (const t of activeTests) {
    const testItem = activeTab === 'completed' ? t.tests : t;
    const rawSubject = testItem?.subject;
    const canonicalSubj = getCanonicalSubject(rawSubject);
    if (!subjectMap.has(canonicalSubj)) {
      subjectMap.set(canonicalSubj, []);
    }
    subjectMap.get(canonicalSubj)!.push(t);
  }
  const categories = [...subjectMap.entries()].sort((a, b) => b[1].length - a[1].length);
  const rawDrilled = selectedSubject ? (subjectMap.get(selectedSubject) || []) : [];
  const drilledTests = rawDrilled.sort((a: any, b: any) => {
    const timeA = new Date(a.submitted_at || a.created_at || a.tests?.created_at || 0).getTime();
    const timeB = new Date(b.submitted_at || b.created_at || b.tests?.created_at || 0).getTime();
    return timeB - timeA;
  });

  const renderAiPracticeTab = () => {
    if (aiQuota === null) {
      return (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, gap: 15, paddingTop: 10 }} showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity: skeletonPulse, width: 150, height: 18, borderRadius: 4, backgroundColor: '#E0E0E0', marginVertical: 5 }} />
          <Animated.View style={{ opacity: skeletonPulse, width: '100%', height: 160, borderRadius: 20, backgroundColor: '#E0E0E0' }} />
        </ScrollView>
      );
    }

    if (aiQuota === 0) {
      return (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
          <View style={styles.bannerCard}>
            <LinearGradient
              colors={['#6366F1', '#4F46E5']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.bannerGradient}
            >
              <View style={styles.bannerHeaderRow}>
                <Ionicons name="sparkles" size={16} color="#FFF" />
                <Text style={styles.bannerBadgeText}>AI PRACTICE PACK</Text>
              </View>
              <Text style={styles.bannerTitle}>Unlock AI Practice Tests</Text>
              <Text style={styles.bannerDesc}>
                Generate highly personalized multiple-choice tests instantly using Gemini AI. Custom subjects, topics, and instant solutions!
              </Text>
              
              <View style={styles.priceRow}>
                <Text style={styles.rupeeSymbol}>₹</Text>
                <Text style={styles.priceNumber}>1</Text>
                <Text style={styles.priceSuffix}>for 5 Tests</Text>
              </View>

              <TouchableOpacity 
                style={styles.bannerButton}
                onPress={() => {
                  setSelectedUpiApp('gpay');
                  setPaymentModalVisible(true);
                }}
              >
                <Text style={styles.bannerButtonText}>Pay ₹1 to Unlock Now</Text>
                <Ionicons name="arrow-forward" size={16} color="#4F46E5" />
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </ScrollView>
      );
    }

    if (selectedPracticeSubject) {
      const filteredPracticeTests = practiceTests.filter(t => getCanonicalSubject(t.subject) === selectedPracticeSubject);
      
      // Get all unique topic names from the teacher's list
      const teacherTopicNames = teacherTopics.map((tp: any) => tp.name.trim());
      
      // Determine what tests map to what topics
      // Group tests by topic
      const topicGroups: Record<string, typeof filteredPracticeTests> = {};
      
      // Initialize groups for all teacher-defined topics
      teacherTopicNames.forEach(tName => {
        topicGroups[tName] = [];
      });
      
      // Place tests into their respective topic groups
      filteredPracticeTests.forEach(test => {
        let matchedTopic = 'Other / General';
        if (test.title.includes('Practice: ')) {
          const testTopicPart = test.title.split('Practice: ')[1].trim();
          const match = teacherTopicNames.find(tName => tName.toLowerCase() === testTopicPart.toLowerCase());
          if (match) {
            matchedTopic = match;
          } else {
            matchedTopic = testTopicPart;
          }
        }
        
        if (!topicGroups[matchedTopic]) {
          topicGroups[matchedTopic] = [];
        }
        topicGroups[matchedTopic].push(test);
      });

      // Sort topics: teacher topics first, then other topics with tests
      const sortedTopics = [
        ...teacherTopicNames,
        ...Object.keys(topicGroups).filter(tName => !teacherTopicNames.includes(tName))
      ];

      return (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => setSelectedPracticeSubject(null)}
          >
            <Ionicons name="arrow-back" size={16} color={Colors.accent.primary} />
            <Text style={styles.backButtonText}>Back to Subjects</Text>
          </TouchableOpacity>

          <Text style={styles.drilledSubjectHeader}>{selectedPracticeSubject} Practice Topics</Text>
          <Text style={{ fontSize: 13, color: Colors.text.secondary, marginBottom: 20, marginTop: -4 }}>
            Select a topic to view practice tests or generate a new one with Zenza AI.
          </Text>

          {sortedTopics.map((topicName) => {
            const testsInTopic = topicGroups[topicName] || [];
            return (
              <View key={topicName} style={styles.topicSectionCard}>
                <View style={styles.topicSectionHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.topicSectionTitle}>{topicName}</Text>
                    <Text style={styles.topicSectionSub}>{testsInTopic.length} Practice Test{testsInTopic.length !== 1 ? 's' : ''}</Text>
                  </View>
                  <TouchableOpacity 
                    style={styles.topicGenerateBtn}
                    onPress={() => {
                      setGenSubject(selectedPracticeSubject);
                      setGenTopic(topicName);
                      setIsCustomSubject(false);
                      setGeneratorModalVisible(true);
                    }}
                  >
                    <Ionicons name="sparkles" size={12} color="#FFF" />
                    <Text style={styles.topicGenerateBtnText}>AI Gen</Text>
                  </TouchableOpacity>
                </View>

                {testsInTopic.length > 0 ? (
                  <View style={{ marginTop: 12, gap: 10 }}>
                    {testsInTopic.map((t) => {
                      const submission = practiceSubmissions.find(s => s.test_id === t.id);
                      return (
                        <View key={t.id} style={styles.practiceTestCardInside}>
                          <View style={{ flex: 1, paddingRight: 8 }}>
                            <Text style={styles.practiceTitleInside} numberOfLines={2}>{t.title}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <Ionicons name="time-outline" size={11} color={Colors.text.secondary} />
                                <Text style={styles.practiceMetaTextInside}>{t.duration_minutes} mins</Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <Ionicons name="help-circle-outline" size={11} color={Colors.text.secondary} />
                                <Text style={styles.practiceMetaTextInside}>{t.questions ? t.questions.length : 5} Qs</Text>
                              </View>
                            </View>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <TouchableOpacity 
                              style={styles.downloadPdfIconBtnInside}
                              onPress={() => downloadPracticeTestPdf(t)}
                            >
                              <Ionicons name="download-outline" size={16} color={Colors.accent.primary} />
                            </TouchableOpacity>

                            {submission ? (
                              <TouchableOpacity 
                                style={styles.reviewButtonInside}
                                onPress={() => router.push(`/(student)/test/result/${t.id}`)}
                              >
                                <Text style={styles.reviewButtonTextInside}>{Math.round(submission.score)}/{t.total_marks}</Text>
                                <Ionicons name="chevron-forward" size={12} color={Colors.accent.primary} />
                              </TouchableOpacity>
                            ) : (
                              <TouchableOpacity 
                                style={styles.startPracticeButtonInside}
                                onPress={() => router.push(`/(student)/test/engine/${t.id}`)}
                              >
                                <Text style={styles.startPracticeTextInside}>Start</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.emptyTopicContainer}>
                    <Text style={styles.emptyTopicText}>No practice tests generated for this topic yet.</Text>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      );
    }

    // Group practice tests by subject
    const practiceSubjectMap = new Map<string, any[]>();
    for (const t of practiceTests) {
      const canonical = getCanonicalSubject(t.subject);
      if (!practiceSubjectMap.has(canonical)) {
        practiceSubjectMap.set(canonical, []);
      }
      practiceSubjectMap.get(canonical)!.push(t);
    }
    const practiceCategories = [...practiceSubjectMap.entries()].sort((a, b) => b[1].length - a[1].length);

    return (
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        <View style={styles.quotaCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="sparkles-sharp" size={20} color={Colors.accent.primary} />
              <Text style={styles.quotaTitle}>AI Practice Quota</Text>
            </View>
            <View style={styles.quotaPill}>
              <Text style={styles.quotaPillText}>{aiQuota} Remaining</Text>
            </View>
          </View>
          <Text style={styles.quotaDesc}>
            Talk to Zenza AI to generate a custom practice test dynamically.
          </Text>
          
          <TouchableOpacity 
            style={styles.generateButton}
            onPress={handleStartChat}
          >
            <Ionicons name="sparkles" size={20} color="#FFF" />
            <Text style={styles.generateButtonText}>Generate Test with Zenza AI</Text>
          </TouchableOpacity>
        </View>

        {isFeatureActive('target_exam_test') && (
          <TouchableOpacity 
            style={[styles.quotaCard, { marginTop: 16, backgroundColor: '#FFF', borderColor: Colors.accent.primary }]}
            onPress={() => router.push('/(student)/test/target-exam-student')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ionicons name="school" size={22} color={Colors.accent.primary} />
              <Text style={[styles.quotaTitle, { color: Colors.text.primary }]}>Target Exam Preparation</Text>
            </View>
            <Text style={[styles.quotaDesc, { color: Colors.text.secondary }]}>
              Practice targeted mock exams, view syllabus details, and access cracking strategies curated by your institute.
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.accent.primary }}>Explore Targets</Text>
              <Ionicons name="arrow-forward" size={14} color={Colors.accent.primary} />
            </View>
          </TouchableOpacity>
        )}

        <TouchableOpacity 
          style={styles.buyMoreRow}
          onPress={() => {
            setSelectedUpiApp('gpay');
            setPaymentModalVisible(true);
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={styles.miniRupeeCircle}>
              <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 14 }}>₹</Text>
            </View>
            <View>
              <Text style={styles.buyMoreTitle}>Get another 5 tests</Text>
              <Text style={styles.buyMoreDesc}>Add 5 more tests to your quota for just ₹1</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.text.tertiary} />
        </TouchableOpacity>

        <View style={{ marginTop: 24 }}>
          <Text style={styles.sectionHeader}>My Practice Subjects</Text>
          
          {practiceCategories.length === 0 ? (
            <View style={styles.emptyPracticeCard}>
              <Ionicons name="journal-outline" size={40} color={Colors.text.tertiary} style={{ marginBottom: 8 }} />
              <Text style={styles.emptyPracticeText}>No practice tests generated yet.</Text>
              <Text style={styles.emptyPracticeDesc}>Click the sparkles button above to talk to Zenza AI and generate a test!</Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 12 }}>
              {practiceCategories.map(([subj, tests]) => (
                <SubjectCard
                  key={subj}
                  subject={subj}
                  count={tests.length}
                  isNew={false}
                  onPress={() => setSelectedPracticeSubject(subj)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.bg.primary }]} edges={['top']}>
        {/* Skeleton Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 15, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Animated.View style={{ opacity: skeletonPulse, width: 80, height: 26, borderRadius: 6, backgroundColor: '#E0E0E0' }} />
          <Animated.View style={{ opacity: skeletonPulse, width: 40, height: 40, borderRadius: 20, backgroundColor: '#E0E0E0' }} />
        </View>

        {/* Skeleton Tab Bar */}
        <View style={{ marginHorizontal: 20, marginVertical: 15, height: 50, borderRadius: 14, backgroundColor: '#F1F3F5', padding: 4, flexDirection: 'row', gap: 4 }}>
          <Animated.View style={{ opacity: skeletonPulse, flex: 1, height: '100%', borderRadius: 10, backgroundColor: '#FFF' }} />
          <Animated.View style={{ opacity: skeletonPulse, flex: 1, height: '100%', borderRadius: 10, backgroundColor: '#E0E0E0' }} />
        </View>

        {/* Skeleton Subject Grid */}
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, gap: 15 }} showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity: skeletonPulse, width: 150, height: 18, borderRadius: 4, backgroundColor: '#E0E0E0', marginVertical: 5 }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {[1, 2, 3, 4].map((i) => (
              <View key={i} style={{ width: '48%', height: 140, borderRadius: 20, padding: 15, backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#F1F3F5', gap: 12 }}>
                <Animated.View style={{ opacity: skeletonPulse, width: 44, height: 44, borderRadius: 12, backgroundColor: '#E0E0E0' }} />
                <Animated.View style={{ opacity: skeletonPulse, width: '80%', height: 16, borderRadius: 4, backgroundColor: '#E0E0E0' }} />
                <Animated.View style={{ opacity: skeletonPulse, width: '40%', height: 12, borderRadius: 3, backgroundColor: '#E0E0E0' }} />
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        {selectedSubject ? (
          <TouchableOpacity style={styles.backRow} onPress={() => setSelectedSubject(null)}>
            <Ionicons name="chevron-back" size={24} color={Colors.accent.primary} />
            <Text style={styles.backText}>{selectedSubject}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.headerTitle}>Tests</Text>
        )}
      </View>

      {/* Tab Bar — only at root level */}
      {!selectedSubject && !selectedPracticeSubject && (
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'pending' && styles.tabActive]}
            onPress={() => setActiveTab('pending')}
          >
            <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>
              Pending ({pendingTests.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'completed' && styles.tabActive]}
            onPress={() => setActiveTab('completed')}
          >
            <Text style={[styles.tabText, activeTab === 'completed' && styles.tabTextActive]}>
              Completed ({completedTests.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'ai' && styles.tabActive]}
            onPress={() => setActiveTab('ai')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="sparkles" size={14} color={activeTab === 'ai' ? Colors.accent.primary : Colors.text.tertiary} />
              <Text style={[styles.tabText, activeTab === 'ai' && styles.tabTextActive]}>
                AI Practice
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {activeTab === 'ai' ? (
        renderAiPracticeTab()
      ) : selectedSubject ? (
        <View style={{ flex: 1 }} key="drilled_subject_container">
          <FlatList
            key="drilled_subject_tests_list"
            data={drilledTests}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[Colors.accent.primary]} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons 
                  name={activeTab === 'pending' ? "checkmark-circle-outline" : "document-text-outline"} 
                  size={48} 
                  color={Colors.text.tertiary} 
                />
                <Text style={styles.emptyTitle}>
                  {activeTab === 'pending' ? 'All Done!' : 'No Completed Tests'}
                </Text>
                <Text style={styles.emptyDesc}>
                  {activeTab === 'pending' 
                    ? 'No pending tests in this subject.' 
                    : 'You haven\'t completed any tests in this subject yet.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              activeTab === 'pending' ? (
                <PendingTestCard item={item} onPress={() => router.push(`/(student)/test/engine/${item.id}`)} />
              ) : (
                <CompletedTestCard item={item} onPress={() => router.push(`/(student)/test/result/${item.id}`)} />
              )
            )}
          />
        </View>
      ) : (
        /* Subject Category Grid */
        <View style={{ flex: 1 }} key="subject_grid_container">
          <FlatList
            key={`subject_category_grid_list_${activeTab}`}
            data={categories}
            keyExtractor={([subject]) => subject}
            numColumns={2}
            columnWrapperStyle={styles.categoryRow}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[Colors.accent.primary]} />}
            ListHeaderComponent={
              categories.length > 0 ? (
                <View style={styles.gridHeader}>
                  <Text style={styles.gridHeaderText}>
                    {activeTab === 'pending' 
                      ? `${pendingTests.length} test${pendingTests.length !== 1 ? 's' : ''} pending · ${categories.length} subject${categories.length !== 1 ? 's' : ''}`
                      : `${completedTests.length} test${completedTests.length !== 1 ? 's' : ''} completed · ${categories.length} subject${categories.length !== 1 ? 's' : ''}`}
                  </Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons 
                  name={activeTab === 'pending' ? "ribbon-outline" : "document-text-outline"} 
                  size={52} 
                  color={Colors.text.tertiary} 
                />
                <Text style={styles.emptyTitle}>
                  {activeTab === 'pending' ? 'All Caught Up!' : 'No Completed Tests'}
                </Text>
                <Text style={styles.emptyDesc}>
                  {activeTab === 'pending' 
                    ? 'No pending tests. Check back later.' 
                    : 'Take a test to see your results grouped by subject here.'}
                </Text>
              </View>
            }
            renderItem={({ item: [subject, tests] }) => (
              <SubjectCard
                subject={subject}
                count={tests.length}
                isNew={activeTab === 'pending' && !visitedSubjects.has(subject)}
                onPress={() => {
                  if (activeTab === 'pending') {
                    markVisited(subject);
                  }
                  setSelectedSubject(subject);
                }}
              />
            )}
          />
        </View>
      )}

      {/* Target Exam Prompt Modal */}
      <Modal visible={showTargetExamPrompt} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 24, gap: 16 }}>
            <View style={{ alignItems: 'center', gap: 10 }}>
              <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#E8F0FE', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="school" size={26} color={Colors.accent.primary} />
              </View>
              <Text style={{ fontSize: 16.5, fontWeight: '800', color: Colors.text.primary, textAlign: 'center' }}>Target Exam Preparation</Text>
              <Text style={{ fontSize: 13, color: Colors.text.secondary, textAlign: 'center', lineHeight: 18 }}>
                Your institute has uploaded dedicated syllabus breakdowns, strategies, and AI practice mock exams. Would you like to practice them now?
              </Text>
            </View>

            <View style={{ gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                style={{ height: 44, borderRadius: 12, backgroundColor: Colors.accent.primary, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => {
                  setShowTargetExamPrompt(false);
                  router.push('/(student)/test/target-exam-student');
                }}
              >
                <Text style={{ color: '#FFF', fontSize: 13.5, fontWeight: '700' }}>Yes, Go to Target Exams</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ height: 44, borderRadius: 12, backgroundColor: Colors.bg.secondary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.card.border }}
                onPress={() => setShowTargetExamPrompt(false)}
              >
                <Text style={{ color: Colors.text.secondary, fontSize: 13.5, fontWeight: '700' }}>Later / Standard Tests</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Payment Checkout Modal (Simulated Razorpay/UPI) */}
      <Modal visible={paymentModalVisible} transparent animationType="slide" onRequestClose={() => setPaymentModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 }}>
            <View style={{ width: 40, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: Colors.text.primary }}>Checkout</Text>
              <TouchableOpacity onPress={() => setPaymentModalVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color={Colors.text.secondary} />
              </TouchableOpacity>
            </View>

            {paymentSuccess ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
                <Ionicons name="checkmark-circle" size={80} color="#10B981" />
                <Text style={{ fontSize: 22, fontWeight: '800', color: Colors.text.primary, marginTop: 16 }}>Payment Successful!</Text>
                <Text style={{ fontSize: 14, color: Colors.text.secondary, marginTop: 6 }}>5 Practice tests added to your quota.</Text>
              </View>
            ) : (
              <View>
                <View style={{ backgroundColor: '#F8F9FA', padding: 16, borderRadius: 16, marginBottom: 20 }}>
                  <Text style={{ fontSize: 13, color: Colors.text.secondary }}>AI Practice Tests Pack (5 Tests)</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.text.primary }}>Total Amount</Text>
                    <Text style={{ fontSize: 24, fontWeight: '900', color: Colors.accent.primary }}>₹1.00</Text>
                  </View>
                </View>

                <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text.primary, marginBottom: 12 }}>Select UPI Application</Text>
                <View style={{ gap: 10, marginBottom: 24 }}>
                  <TouchableOpacity 
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: selectedUpiApp === 'gpay' ? '#4F46E5' : '#E9ECEF', backgroundColor: selectedUpiApp === 'gpay' ? '#EEF2FF' : '#FFF' }}
                    onPress={() => setSelectedUpiApp('gpay')}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Ionicons name="logo-google" size={20} color="#4285F4" />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text.primary }}>Google Pay</Text>
                    </View>
                    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#4F46E5', alignItems: 'center', justifyContent: 'center' }}>
                      {selectedUpiApp === 'gpay' && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#4F46E5' }} />}
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: selectedUpiApp === 'phonepe' ? '#4F46E5' : '#E9ECEF', backgroundColor: selectedUpiApp === 'phonepe' ? '#EEF2FF' : '#FFF' }}
                    onPress={() => setSelectedUpiApp('phonepe')}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Ionicons name="wallet-outline" size={20} color="#5F259F" />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text.primary }}>PhonePe</Text>
                    </View>
                    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#4F46E5', alignItems: 'center', justifyContent: 'center' }}>
                      {selectedUpiApp === 'phonepe' && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#4F46E5' }} />}
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: selectedUpiApp === 'paytm' ? '#4F46E5' : '#E9ECEF', backgroundColor: selectedUpiApp === 'paytm' ? '#EEF2FF' : '#FFF' }}
                    onPress={() => setSelectedUpiApp('paytm')}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Ionicons name="cash-outline" size={20} color="#00B9F5" />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text.primary }}>Paytm UPI</Text>
                    </View>
                    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#4F46E5', alignItems: 'center', justifyContent: 'center' }}>
                      {selectedUpiApp === 'paytm' && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#4F46E5' }} />}
                    </View>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity 
                  style={{ backgroundColor: '#4F46E5', paddingVertical: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
                  onPress={handlePayNow}
                >
                  <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '700' }}>Pay ₹1.00 Securely</Text>
                  <Ionicons name="shield-checkmark" size={16} color="#FFF" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* AI Test Configuration Form Modal */}
      <Modal visible={generatorModalVisible} transparent animationType="slide" onRequestClose={() => setGeneratorModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, maxHeight: '90%' }}>
            <View style={{ width: 40, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: Colors.text.primary }}>AI Practice Config</Text>
              <TouchableOpacity onPress={() => setGeneratorModalVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color={Colors.text.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginBottom: 20 }}>
              {/* Subject Selector */}
              <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text.primary, marginBottom: 8 }}>Select Subject</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {((SUBJECTS_BY_CATEGORY[coachingCategory] || SUBJECTS_BY_CATEGORY['Board'])).map((sub) => (
                  <TouchableOpacity 
                    key={sub}
                    style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5, borderColor: (!isCustomSubject && genSubject === sub) ? Colors.accent.primary : '#E9ECEF', backgroundColor: (!isCustomSubject && genSubject === sub) ? Colors.accent.primary + '10' : '#FFF' }}
                    onPress={() => {
                      setIsCustomSubject(false);
                      setGenSubject(sub);
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: (!isCustomSubject && genSubject === sub) ? Colors.accent.primary : Colors.text.secondary }}>{sub}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity 
                  style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5, borderColor: isCustomSubject ? Colors.accent.primary : '#E9ECEF', backgroundColor: isCustomSubject ? Colors.accent.primary + '10' : '#FFF' }}
                  onPress={() => setIsCustomSubject(true)}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: isCustomSubject ? Colors.accent.primary : Colors.text.secondary }}>Custom Subject...</Text>
                </TouchableOpacity>
              </View>

              {isCustomSubject && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.text.secondary, marginBottom: 6 }}>Custom Subject Name *</Text>
                  <TextInput
                    style={{ height: 44, borderRadius: 10, borderWidth: 1.5, borderColor: '#E9ECEF', paddingHorizontal: 12, fontSize: 14, color: Colors.text.primary, backgroundColor: '#F8F9FA' }}
                    placeholder="Enter custom subject"
                    placeholderTextColor={Colors.text.tertiary}
                    value={customSubjectText}
                    onChangeText={setCustomSubjectText}
                  />
                </View>
              )}

              {/* Topic text input */}
              <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text.primary, marginBottom: 8 }}>Topic / Concept *</Text>
              <TextInput
                style={{ height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: '#E9ECEF', paddingHorizontal: 14, fontSize: 14, color: Colors.text.primary, backgroundColor: '#F8F9FA', marginBottom: 20 }}
                placeholder="e.g. Laws of Motion, Fractions, Acids & Bases"
                placeholderTextColor={Colors.text.tertiary}
                value={genTopic}
                onChangeText={setGenTopic}
              />

              {/* Difficulty selector */}
              <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text.primary, marginBottom: 8 }}>Difficulty Level</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                {['Easy', 'Medium', 'Hard'].map((diff) => (
                  <TouchableOpacity 
                    key={diff}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: genDifficulty === diff ? Colors.accent.primary : '#E9ECEF', backgroundColor: genDifficulty === diff ? Colors.accent.primary + '10' : '#FFF', alignItems: 'center' }}
                    onPress={() => setGenDifficulty(diff as any)}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: genDifficulty === diff ? Colors.accent.primary : Colors.text.secondary }}>{diff}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Question Count selector */}
              <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text.primary, marginBottom: 8 }}>Number of Questions *</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {['5', '10', '15', '20', '25', '30'].map((num) => (
                  <TouchableOpacity 
                    key={num}
                    style={{ paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1.5, borderColor: genQuestionsCountText === num ? Colors.accent.primary : '#E9ECEF', backgroundColor: genQuestionsCountText === num ? Colors.accent.primary + '10' : '#FFF' }}
                    onPress={() => setGenQuestionsCountText(num)}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: genQuestionsCountText === num ? Colors.accent.primary : Colors.text.secondary }}>{num}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={{ height: 44, borderRadius: 10, borderWidth: 1.5, borderColor: '#E9ECEF', paddingHorizontal: 12, fontSize: 14, color: Colors.text.primary, backgroundColor: '#F8F9FA', marginBottom: 20 }}
                placeholder="Or enter custom question count..."
                placeholderTextColor={Colors.text.tertiary}
                keyboardType="numeric"
                value={genQuestionsCountText}
                onChangeText={setGenQuestionsCountText}
              />

              {/* Time Duration selector */}
              <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text.primary, marginBottom: 8 }}>Time Duration (Minutes) *</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {['10', '15', '20', '30', '45', '60'].map((mins) => (
                  <TouchableOpacity 
                    key={mins}
                    style={{ paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1.5, borderColor: genDurationText === mins ? Colors.accent.primary : '#E9ECEF', backgroundColor: genDurationText === mins ? Colors.accent.primary + '10' : '#FFF' }}
                    onPress={() => setGenDurationText(mins)}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: genDurationText === mins ? Colors.accent.primary : Colors.text.secondary }}>{mins}m</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={{ height: 44, borderRadius: 10, borderWidth: 1.5, borderColor: '#E9ECEF', paddingHorizontal: 12, fontSize: 14, color: Colors.text.primary, backgroundColor: '#F8F9FA', marginBottom: 20 }}
                placeholder="Or enter custom duration in minutes..."
                placeholderTextColor={Colors.text.tertiary}
                keyboardType="numeric"
                value={genDurationText}
                onChangeText={setGenDurationText}
              />
            </ScrollView>

            <TouchableOpacity 
              style={{ backgroundColor: Colors.accent.primary, paddingVertical: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
              onPress={handleGenerateTest}
            >
              <Ionicons name="sparkles" size={16} color="#FFF" />
              <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '700' }}>Generate Practice Test</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* AI Generative Process Progress Overlay */}
      <Modal visible={isGenerating} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 28, width: '100%', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={Colors.accent.primary} />
            <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.text.primary, marginTop: 20 }}>Creating Practice Test...</Text>
            <Text style={{ fontSize: 13, color: Colors.text.secondary, marginTop: 6, textAlign: 'center', lineHeight: 18 }}>
              Gemini AI is parsing the topic: "{genTopic}" and creating {genQuestionsCountText} customized multiple-choice questions...
            </Text>
            <View style={{ width: '100%', height: 4, backgroundColor: '#E9ECEF', borderRadius: 2, marginTop: 24, overflow: 'hidden' }}>
              <Animated.View style={{ height: '100%', width: '70%', backgroundColor: Colors.accent.primary, borderRadius: 2 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Zenza AI Chatbot Modal */}
      <Modal
        visible={chatModalVisible}
        animationType="slide"
        onRequestClose={() => setChatModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <SafeAreaView style={styles.chatContainer} edges={['top', 'bottom']}>
            {/* Header */}
            <View style={styles.chatHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TouchableOpacity onPress={() => setDrawerVisible(true)} style={styles.chatHeaderIconBtn}>
                  <Ionicons name="menu" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setChatModalVisible(false)} style={styles.chatCloseBtn}>
                  <Ionicons name="close" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              <View style={styles.chatHeaderTitleContainer}>
                <View style={styles.chatHeaderIconCircle}>
                  <Ionicons name="sparkles" size={16} color="#FFF" />
                </View>
                <View>
                  <Text style={styles.chatHeaderTitle}>Zenza AI</Text>
                  <Text style={styles.chatHeaderSubtitle}>Practice Assistant</Text>
                </View>
              </View>

              <TouchableOpacity onPress={handleStartNewChatSession} style={styles.chatHeaderIconBtn}>
                <Ionicons name="add" size={26} color={Colors.accent.primary} />
              </TouchableOpacity>
            </View>

            {/* Segmented Selectors Bar */}
            <View style={styles.switchesBar}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, alignItems: 'center', paddingRight: 20 }}>
                {/* Language Picker */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.switchLabel}>Lang:</Text>
                  <View style={styles.segmentContainer}>
                    {(['Auto', 'English', 'Hindi', 'Hinglish'] as const).map((lang) => {
                      const isActive = chatLanguage === lang;
                      return (
                        <TouchableOpacity
                          key={lang}
                          style={[styles.segmentItem, isActive && styles.segmentItemActive]}
                          onPress={() => setChatLanguage(lang)}
                        >
                          <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                            {lang}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.switchDivider} />

                {/* Difficulty Picker */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.switchLabel}>Diff:</Text>
                  <View style={styles.segmentContainer}>
                    {(['Easy', 'Medium', 'Hard'] as const).map((diff) => {
                      const isActive = chatDifficulty === diff;
                      return (
                        <TouchableOpacity
                          key={diff}
                          style={[styles.segmentItem, isActive && styles.segmentItemActive]}
                          onPress={() => setChatDifficulty(diff)}
                        >
                          <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                            {diff}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </ScrollView>
            </View>

            {/* Messages List */}
            <FlatList
              ref={chatFlatListRef}
              data={chatMessages}
              keyExtractor={(_, index) => `chat_msg_${index}`}
              contentContainerStyle={styles.chatMessagesList}
              onContentSizeChange={() => chatFlatListRef.current?.scrollToEnd({ animated: true })}
              onLayout={() => chatFlatListRef.current?.scrollToEnd({ animated: true })}
              renderItem={({ item }) => {
                const isUser = item.role === 'user';
                return (
                  <View style={[styles.chatBubbleContainer, isUser ? styles.chatBubbleUserAlign : styles.chatBubbleAiAlign]}>
                    {!isUser && (
                      <View style={styles.chatBubbleAiAvatar}>
                        <Ionicons name="sparkles-sharp" size={12} color="#FFF" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={[styles.chatBubble, isUser ? styles.chatBubbleUser : styles.chatBubbleAi]}>
                        <Text style={isUser ? styles.chatTextUser : styles.chatTextAi}>
                          {renderMarkdownText(item.text, isUser)}
                        </Text>
                      </View>
                      
                      {/* Render generated test data block if present */}
                      {item.testData && (
                        <View style={styles.generatedTestContainer}>
                          <LinearGradient
                            colors={['#ECF0FF', '#F4F6FF']}
                            style={styles.generatedTestCard}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <Ionicons name="checkmark-circle" size={16} color={Colors.accent.primary} />
                              <Text style={styles.generatedTestReadyText}>PRACTICE TEST READY</Text>
                            </View>
                            <Text style={styles.generatedTestTitle}>{item.testData.title}</Text>
                            <View style={styles.generatedTestMetaRow}>
                              <Text style={styles.generatedTestMetaVal}>{item.testData.questions?.length || 5} Qs</Text>
                              <Text style={styles.generatedTestMetaVal}>•</Text>
                              <Text style={styles.generatedTestMetaVal}>{item.testData.duration_minutes || 15} mins</Text>
                            </View>
                            <TouchableOpacity
                              style={styles.generatedTestBtn}
                              onPress={() => handleStartPracticeTest(item.testData)}
                            >
                              <Text style={styles.generatedTestBtnText}>Start Test</Text>
                              <Ionicons name="play" size={14} color="#FFF" />
                            </TouchableOpacity>
                          </LinearGradient>
                        </View>
                      )}
                    </View>
                  </View>
                );
              }}
            />

            {/* Chat Loader */}
            {chatLoading && (
              <View style={styles.chatLoadingIndicatorContainer}>
                <ActivityIndicator size="small" color={Colors.accent.primary} />
                <Text style={styles.chatLoadingText}>Zenza AI is thinking...</Text>
              </View>
            )}

            {/* Bottom input bar */}
            <View style={styles.chatInputBar}>
              <TextInput
                style={styles.chatInput}
                value={chatInputText}
                onChangeText={setChatInputText}
                placeholder="Tell Zenza AI what topic to practice..."
                placeholderTextColor={Colors.text.tertiary}
                onSubmitEditing={handleSendMessageToAi}
              />
              <TouchableOpacity
                style={[styles.chatSendBtn, !chatInputText.trim() && styles.chatSendBtnDisabled]}
                onPress={handleSendMessageToAi}
                disabled={!chatInputText.trim()}
              >
                <Ionicons name="send" size={18} color="#FFF" />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>

        {/* History side-drawer panel overlay */}
        {drawerVisible && (
          <View style={styles.drawerOverlay}>
            <TouchableOpacity style={styles.drawerDismissArea} activeOpacity={1} onPress={() => setDrawerVisible(false)} />
            <SafeAreaView style={styles.drawerPanel}>
              <View style={styles.drawerHeader}>
                <Text style={styles.drawerTitle}>Chat History</Text>
                <TouchableOpacity onPress={() => setDrawerVisible(false)}>
                  <Ionicons name="close" size={22} color={Colors.text.secondary} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.drawerScroll} showsVerticalScrollIndicator={false}>
                {chatSessions.length === 0 ? (
                  <Text style={styles.drawerEmptyText}>No previous chats</Text>
                ) : (
                  chatSessions.map((session) => {
                    const isActive = currentChatId === session.chatId;
                    return (
                      <View key={session.chatId} style={[styles.drawerItem, isActive && styles.drawerItemActive]}>
                        <TouchableOpacity 
                          style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 14 }}
                          onPress={() => handleSwitchChatSession(session.chatId)}
                        >
                          <Text style={[styles.drawerItemSnippet, isActive && styles.drawerItemTextActive]} numberOfLines={1}>
                            {session.snippet}
                          </Text>
                          <Text style={styles.drawerItemDate}>
                            {new Date(session.lastActivity).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                          style={styles.drawerItemDeleteBtn}
                          onPress={() => handleDeleteChatSession(session.chatId)}
                        >
                          <Ionicons name="trash-outline" size={16} color={Colors.text.tertiary} />
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </SafeAreaView>
          </View>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  header: { paddingHorizontal: 20, paddingVertical: 12 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: Colors.text.primary },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontSize: 20, fontWeight: '700', color: Colors.text.primary },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
  },
  tab: { paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Colors.accent.primary },
  tabText: { fontSize: 15, fontWeight: '600', color: Colors.text.tertiary },
  tabTextActive: { color: Colors.accent.primary, fontWeight: '700' },
  gridContent: { paddingHorizontal: 16, paddingBottom: 40 },
  categoryRow: { justifyContent: 'space-between' },
  gridHeader: { paddingHorizontal: 4, paddingVertical: 10, marginBottom: 4 },
  gridHeaderText: { fontSize: 13, color: Colors.text.secondary, fontWeight: '500' },
  subjectCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 12,
    borderWidth: 1.5,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#281713',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  subjectCardStrip: { height: 4, width: '100%' },
  subjectCardBody: { padding: 12 },
  subjectEmoji: { fontSize: 24, marginBottom: 4 },
  subjectName: { fontSize: 12.5, fontWeight: '700', color: Colors.text.primary, marginBottom: 6, lineHeight: 16 },
  subjectFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subjectCount: { fontSize: 11, fontWeight: '600' },
  newBadge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  newBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  testCard: {
    backgroundColor: Colors.bg.secondary,
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.accent.primary + '30',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  badge: { backgroundColor: Colors.accent.primary + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '800', color: Colors.accent.primary },
  testTitle: { fontSize: 17, fontWeight: '700', color: Colors.text.primary, marginBottom: 14, lineHeight: 22 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  footerItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  footerText: { fontSize: 12, color: Colors.text.secondary, fontWeight: '500' },
  scoreText: { fontSize: 16, fontWeight: '800' },
  emptyState: { paddingTop: 80, alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text.primary, marginTop: 16 },
  emptyDesc: { fontSize: 14, color: Colors.text.secondary, marginTop: 8, textAlign: 'center' },
  bannerCard: { borderRadius: 24, overflow: 'hidden', marginTop: 10, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
  bannerGradient: { padding: 24, alignItems: 'flex-start' },
  bannerHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 12 },
  bannerBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  bannerTitle: { fontSize: 24, fontWeight: '800', color: '#FFF', marginBottom: 8 },
  bannerDesc: { fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 18, marginBottom: 20 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 24 },
  rupeeSymbol: { fontSize: 32, fontWeight: '800', color: '#FFF' },
  priceNumber: { fontSize: 64, fontWeight: '900', color: '#FFF', lineHeight: 68 },
  priceSuffix: { fontSize: 18, fontWeight: '700', color: 'rgba(255,255,255,0.9)', marginLeft: 8 },
  bannerButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF', paddingVertical: 14, paddingHorizontal: 20, borderRadius: 16, width: '100%', justifyContent: 'center' },
  bannerButtonText: { color: '#7C4DFF', fontSize: 16, fontWeight: '700' },
  quotaCard: { backgroundColor: Colors.bg.secondary, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: '#F1F3F5', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, marginBottom: 16 },
  quotaTitle: { fontSize: 16, fontWeight: '700', color: Colors.text.primary },
  quotaPill: { backgroundColor: Colors.accent.primary + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  quotaPillText: { fontSize: 12, fontWeight: '800', color: Colors.accent.primary },
  quotaDesc: { fontSize: 13, color: Colors.text.secondary, lineHeight: 18, marginBottom: 16 },
  generateButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.accent.primary, paddingVertical: 14, borderRadius: 14 },
  generateButtonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  buyMoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8F9FA', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#E9ECEF' },
  miniRupeeCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.accent.primary, alignItems: 'center', justifyContent: 'center' },
  buyMoreTitle: { fontSize: 14, fontWeight: '700', color: Colors.text.primary },
  buyMoreDesc: { fontSize: 11, color: Colors.text.secondary, marginTop: 1 },
  sectionHeader: { fontSize: 18, fontWeight: '800', color: Colors.text.primary, marginBottom: 12 },
  emptyPracticeCard: { alignItems: 'center', justifyContent: 'center', padding: 30, borderStyle: 'dashed', borderWidth: 1.5, borderColor: '#CED4DA', borderRadius: 20, marginTop: 10 },
  emptyPracticeText: { fontSize: 14, fontWeight: '700', color: Colors.text.primary, marginTop: 10 },
  emptyPracticeDesc: { fontSize: 11, color: Colors.text.secondary, marginTop: 4, textAlign: 'center' },
  practiceTestCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bg.secondary, padding: 16, borderRadius: 16, borderLeftWidth: 4, borderLeftColor: Colors.accent.primary, marginBottom: 10, borderWidth: 1, borderColor: '#F1F3F5' },
  practiceSubject: { fontSize: 10, fontWeight: '800', color: Colors.accent.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  practiceTitle: { fontSize: 14, fontWeight: '700', color: Colors.text.primary, marginTop: 2 },
  practiceMetaText: { fontSize: 11, color: Colors.text.secondary, fontWeight: '500' },
  startPracticeButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.accent.primary, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  startPracticeButtonText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  reviewButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.accent.primary + '30' },
  reviewButtonText: { color: Colors.accent.primary, fontSize: 12, fontWeight: '700' },

  // Zenza AI Chatbot & Drilled practice styles
  chatContainer: { flex: 1, backgroundColor: '#F8F9FA' },
  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  chatCloseBtn: { padding: 4 },
  chatHeaderTitleContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chatHeaderIconCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.accent.primary, alignItems: 'center', justifyContent: 'center' },
  chatHeaderTitle: { fontSize: 16, fontWeight: '800', color: Colors.text.primary },
  chatHeaderSubtitle: { fontSize: 11, color: Colors.text.secondary },
  chatMessagesList: { padding: 16, gap: 16, paddingBottom: 40 },
  chatBubbleContainer: { flexDirection: 'row', gap: 10, width: '100%' },
  chatBubbleUserAlign: { justifyContent: 'flex-end' },
  chatBubbleAiAlign: { justifyContent: 'flex-start' },
  chatBubbleAiAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.accent.primary, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  chatBubble: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, maxWidth: '85%' },
  chatBubbleUser: { backgroundColor: Colors.accent.primary, borderTopRightRadius: 4 },
  chatBubbleAi: { backgroundColor: '#FFF', borderTopLeftRadius: 4, borderWidth: 1, borderColor: '#ECEFF1' },
  chatTextUser: { color: '#FFF', fontSize: 14, lineHeight: 20 },
  chatTextAi: { color: Colors.text.primary, fontSize: 14, lineHeight: 20 },
  chatLoadingIndicatorContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  chatLoadingText: { fontSize: 12, color: Colors.text.secondary },
  chatInputBar: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#ECEFF1' },
  chatInput: { flex: 1, height: 44, borderRadius: 22, backgroundColor: '#F1F3F5', paddingHorizontal: 18, fontSize: 14, color: Colors.text.primary },
  chatSendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.accent.primary, alignItems: 'center', justifyContent: 'center' },
  chatSendBtnDisabled: { backgroundColor: Colors.accent.primary + '40' },
  generatedTestContainer: { marginTop: 10, maxWidth: '85%' },
  generatedTestCard: { padding: 14, borderRadius: 16, borderWidth: 1, borderColor: Colors.accent.primary + '30' },
  generatedTestReadyText: { fontSize: 10, fontWeight: '800', color: Colors.accent.primary, letterSpacing: 0.5 },
  generatedTestTitle: { fontSize: 14, fontWeight: '700', color: Colors.text.primary, marginTop: 4 },
  generatedTestMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 12 },
  generatedTestMetaVal: { fontSize: 11, color: Colors.text.secondary, fontWeight: '500' },
  generatedTestBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.accent.primary, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10 },
  generatedTestBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, marginBottom: 16 },
  backButtonText: { fontSize: 14, fontWeight: '700', color: Colors.accent.primary },
  drilledSubjectHeader: { fontSize: 20, fontWeight: '800', color: Colors.text.primary, marginBottom: 16 },
  downloadPdfIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.accent.primary + '10', alignItems: 'center', justifyContent: 'center' },
  startPracticeText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  chatHeaderIconBtn: { padding: 4, alignItems: 'center', justifyContent: 'center' },
  switchesBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  switchRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  switchLabel: { fontSize: 12, fontWeight: '700', color: Colors.text.secondary },
  switchDivider: { width: 1, height: 24, backgroundColor: '#E2E8F0', marginHorizontal: 12 },
  drawerOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.4)', flexDirection: 'row', zIndex: 1000 },
  drawerDismissArea: { flex: 1 },
  drawerPanel: { width: 280, height: '100%', backgroundColor: '#FFF', elevation: 16, shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.1, shadowRadius: 10 },
  drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  drawerTitle: { fontSize: 18, fontWeight: '800', color: Colors.text.primary },
  drawerScroll: { padding: 12, gap: 10 },
  drawerEmptyText: { fontSize: 12, color: Colors.text.tertiary, textAlign: 'center', marginTop: 40 },
  drawerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, borderWidth: 1, borderColor: '#ECEFF1', backgroundColor: '#F8F9FA' },
  drawerItemActive: { borderColor: Colors.accent.primary + '50', backgroundColor: Colors.accent.primary + '08' },
  drawerItemSnippet: { fontSize: 13, fontWeight: '600', color: Colors.text.primary },
  drawerItemTextActive: { color: Colors.accent.primary, fontWeight: '700' },
  drawerItemDate: { fontSize: 10, color: Colors.text.tertiary, marginTop: 4 },
  drawerItemDeleteBtn: { padding: 14, alignSelf: 'stretch', justifyContent: 'center' },
  segmentContainer: { flexDirection: 'row', backgroundColor: '#F1F3F5', borderRadius: 8, padding: 2, gap: 2 },
  segmentItem: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: 'transparent' },
  segmentItemActive: { backgroundColor: '#FFF', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 1 },
  segmentText: { fontSize: 11, color: Colors.text.secondary, fontWeight: '600' },
  segmentTextActive: { color: Colors.accent.primary, fontWeight: '700' },
  topicSectionCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ECEFF1',
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  topicSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#ECEFF1',
    paddingBottom: 12,
  },
  topicSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  topicSectionSub: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  topicGenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.accent.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  topicGenerateBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  practiceTestCardInside: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bg.primary,
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent.primary,
    borderWidth: 1,
    borderColor: '#F1F3F5',
  },
  practiceTitleInside: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  practiceMetaTextInside: {
    fontSize: 10,
    color: Colors.text.secondary,
  },
  downloadPdfIconBtnInside: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewButtonInside: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.accent.primary + '20',
  },
  reviewButtonTextInside: {
    color: Colors.accent.primary,
    fontSize: 10,
    fontWeight: '700',
  },
  startPracticeButtonInside: {
    backgroundColor: Colors.accent.primary,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startPracticeTextInside: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyTopicContainer: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTopicText: {
    fontSize: 11,
    color: Colors.text.tertiary,
    fontStyle: 'italic',
  },
});




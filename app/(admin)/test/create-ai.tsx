import { useState, useEffect, useRef } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Keyboard, Animated, Easing, AppState, StatusBar } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { APP_CONFIG } from '@/constants/config';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { scheduleLocalNotification } from '@/lib/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Line } from 'react-native-svg';

type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
  parts?: any[]; // Keep the exact parts (text + inlineData) for Gemini history
  isTestReady?: boolean;
  testData?: any;
};

const SYSTEM_PROMPT = `You are KanelFlow's AI Test Creator. You help teachers create multiple-choice tests.
Ask clarifying questions if the teacher's request is missing key details (Topic, Duration in minutes, Target Batch (e.g., All, MPPSC, SSC), Number of Questions, Difficulty).
When you have all the necessary information and the teacher says they are ready to generate, or asks you to generate, you MUST reply strictly with a JSON block in this exact format, without any surrounding conversational text (do not use Markdown code blocks like \`\`\`json, just output the raw JSON):

{
  "is_test_ready": true,
  "metadata": { "title": "...", "subject": "Mathematics", "duration_minutes": 10, "batch_name": "All", "total_marks": 10, "positive_marks": 5, "negative_marks": 0 },
  "questions": [
    { "question_text": "...", "options": ["A","B","C","D"], "correct_option": 0, "explanation": "..." }
  ]
}

For the "subject" field, use a clear, short subject name that describes the topic of the test (e.g., "Mathematics", "Physics", "Chemistry", "Biology", "History", "Geography", "English", "Reasoning", "General Science", "Polity", "Economics"). Pick the most accurate subject based on the test topic.
DO NOT output the JSON until the teacher confirms they want to create the test. Chat normally until then.
If the teacher provides a PDF/Document attachment, base your questions strictly on that document.
Assume each question has 5 positive marks and 0 negative marks, unless the teacher specifies otherwise. Output these as numbers in positive_marks and negative_marks.

CRITICAL MATH FORMATTING RULES (For question_text, options, and explanation):
1. Exponents & Powers: DO NOT write exponents/powers using '*' or '^' (e.g., do NOT write "X*2" or "X^2"). Instead, ALWAYS use standard Unicode superscript characters (e.g., "x²", "y³", "aⁿ").
2. Fractions & Division: DO NOT write confusing nested flat division slashes. For fractions, write them clearly with parentheses (e.g., "(2/3)" or "2 upon 3"). For complex fraction divisions like (5+5+5+5/5) whole upon (3+3+3+3)/3, write it clearly using clear phrasing, e.g. "(5 + 5 + 5 + 5/5) divided by (3 + 3 + 3 + 3)/3" or similar explicit representation.
3. Square Roots & Nested Roots: For square roots/underroots, use the Unicode square root symbol '√' with clear brackets. For an infinite nested sum of underroots (like underroot 7 + underroot 7 ... to infinity), write it exactly as: "√(7 + √(7 + √(7 + ... to infinity)))".
4. Standard Math Symbols: Use standard Unicode math symbols where appropriate (e.g., '∞' for infinity, '÷' for division, '×' for multiplication, '≠' for not equal, '±' for plus-minus).`;

type AgentStep = {
  text: string;
  status: 'loading' | 'success' | 'file';
};

const AGENT_PHASES = [
  { text: "I'm thinking about the test parameters and target batch...", duration: 2500, type: 'text' },
  { text: "Analyzing the knowledge base for relevant topics and context...", duration: 3000, type: 'text' },
  { text: "Structuring the questions and balancing difficulty...", duration: 3500, type: 'text' },
  { text: "Generating schema.json", duration: 3000, type: 'file' },
  { text: "Validating test data format against the required JSON structure...", duration: 2500, type: 'text' },
  { text: "Still working on it...", duration: 15000, type: 'text' }
];

function AgenticThoughtProcess() {
  const [modalVisible, setModalVisible] = useState(false);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [currentLabel, setCurrentLabel] = useState("Thought process");
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 3500,
        easing: Easing.linear,
        useNativeDriver: true
      })
    ).start();
  }, []);

  useEffect(() => {
    let mounted = true;
    let stepIndex = 0;

    const runPhases = async () => {
      while (stepIndex < AGENT_PHASES.length && mounted) {
        const phase = AGENT_PHASES[stepIndex];
        
        if (stepIndex === 0) setCurrentLabel("Thought process");
        else if (phase.type === 'file') setCurrentLabel("Creating test data...");
        else if (stepIndex === AGENT_PHASES.length - 1) setCurrentLabel("Still working on it...");
        
        setSteps(prev => [...prev, { text: phase.text, status: 'loading' }]);
        
        await new Promise(r => setTimeout(r, phase.duration));
        if (!mounted) return;

        setSteps(prev => {
          const next = [...prev];
          next[next.length - 1].status = phase.type === 'file' ? 'file' : 'success';
          return next;
        });

        stepIndex++;
      }
    };
    
    runPhases();
    return () => { mounted = false; };
  }, []);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  return (
    <>
      <TouchableOpacity 
        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, gap: 12, backgroundColor: 'transparent' }} 
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <Animated.View style={{ transform: [{ rotate: spin }] }}>
          <Svg width="22" height="22" viewBox="0 0 24 24">
             <Line x1="12" y1="2" x2="12" y2="6" stroke="#c86a51" strokeWidth="2.5" strokeLinecap="round" />
             <Line x1="12" y1="18" x2="12" y2="22" stroke="#c86a51" strokeWidth="2.5" strokeLinecap="round" />
             <Line x1="2" y1="12" x2="6" y2="12" stroke="#c86a51" strokeWidth="2.5" strokeLinecap="round" />
             <Line x1="18" y1="12" x2="22" y2="12" stroke="#c86a51" strokeWidth="2.5" strokeLinecap="round" />
             <Line x1="4.93" y1="4.93" x2="7.76" y2="7.76" stroke="#c86a51" strokeWidth="2.5" strokeLinecap="round" />
             <Line x1="16.24" y1="16.24" x2="19.07" y2="19.07" stroke="#c86a51" strokeWidth="2.5" strokeLinecap="round" />
             <Line x1="4.93" y1="19.07" x2="7.76" y2="16.24" stroke="#c86a51" strokeWidth="2.5" strokeLinecap="round" />
             <Line x1="16.24" y1="7.76" x2="19.07" y2="4.93" stroke="#c86a51" strokeWidth="2.5" strokeLinecap="round" />
          </Svg>
        </Animated.View>
        <Text style={{ fontSize: 16, color: '#888', fontStyle: currentLabel.includes('Still') ? 'italic' : 'normal', fontWeight: '500' }}>
          {currentLabel} <Ionicons name="chevron-forward" size={14} color="#aaa" style={{ marginLeft: 4 }} />
        </Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 40, maxHeight: '85%' }}>
            
            <View style={{ width: 40, height: 4, backgroundColor: '#ddd', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color="#444" />
              </TouchableOpacity>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#111' }}>Summary</Text>
              <View style={{ width: 32 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {steps.map((step, idx) => {
                const isLast = idx === steps.length - 1;
                return (
                  <View key={idx} style={{ flexDirection: 'row', marginBottom: isLast ? 0 : 0 }}>
                    <View style={{ width: 32, alignItems: 'center', marginRight: 16 }}>
                      {!isLast && <View style={{ position: 'absolute', top: 12, bottom: -28, width: 2, backgroundColor: '#f0f0f0' }} />}
                      {step.status === 'file' ? (
                        <View style={{ width: 24, height: 24, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', zIndex: 2 }}>
                          <Ionicons name="document-text-outline" size={16} color="#222" />
                        </View>
                      ) : step.status === 'success' ? (
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#d0d0d0', zIndex: 2, marginTop: 6 }} />
                      ) : (
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#ddd', zIndex: 2, marginTop: 6 }} />
                      )}
                    </View>

                    <View style={{ flex: 1, paddingBottom: 28, justifyContent: 'flex-start', paddingTop: step.status === 'file' ? 2 : 0 }}>
                      <Text style={{ 
                        fontSize: 16, 
                        color: step.status === 'file' ? '#111' : '#444', 
                        fontWeight: step.status === 'file' ? '700' : '400',
                        lineHeight: 22
                      }}>
                        {step.text}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function renderMessageText(text: string | undefined | null) {
  if (!text || typeof text !== 'string') return null;
  
  const boldParts = text.split(/(\*\*.*?\*\*)/g);
  
  return boldParts.map((bPart, bIndex) => {
    if (bPart.startsWith('**') && bPart.endsWith('**')) {
      return <Text key={bIndex} style={{ fontWeight: 'bold' }}>{bPart.slice(2, -2)}</Text>;
    }
    
    const italicParts = bPart.split(/(\*.*?\*)/g);
    return italicParts.map((iPart, iIndex) => {
      if (iPart.startsWith('*') && iPart.endsWith('*') && iPart.length > 2) {
         return <Text key={`${bIndex}-${iIndex}`} style={{ fontStyle: 'italic' }}>{iPart.slice(1, -1)}</Text>;
      }
      return <Text key={`${bIndex}-${iIndex}`}>{iPart}</Text>;
    });
  });
}

export default function CreateAITestChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, verified, businessId } = useAuthStore();
  
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'model', text: "Hi! I'm your AI Test Creator. 🤖\n\nConfigure the target batch, difficulty, and duration at the top, then tell me what topic or chapter you want to generate the test on!" }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  const [banks, setBanks] = useState<any[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);
  const [localAttachments, setLocalAttachments] = useState<{ uri: string; mimeType: string; base64: string; name: string }[]>([]);
  const [pastTestsContext, setPastTestsContext] = useState<string>('');
  const [showBankModal, setShowBankModal] = useState(false);

  // Selector Settings States
  const [batches, setBatches] = useState<string[]>(['All']);
  const [selectedBatch, setSelectedBatch] = useState('All');
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [duration, setDuration] = useState('30');
  
  const scrollViewRef = useRef<ScrollView>(null);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      appStateRef.current = nextAppState;
    });
    return () => subscription.remove();
  }, []);

  // Fetch coaching center batches
  useEffect(() => {
    const fetchBatches = async () => {
      if (!businessId) return;
      try {
        const { data, error } = await supabase
          .from('batches')
          .select('name')
          .eq('business_id', businessId);
        if (!error && data) {
          setBatches(['All', ...data.map((b: any) => b.name)]);
        }
      } catch (err) {
        console.warn('Failed to fetch batches in AI creator:', err);
      }
    };
    fetchBatches();
  }, [businessId]);

  // Persistent Chat History Loader
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const key = `@ai_creator_messages_${businessId || 'default'}`;
        const stored = await AsyncStorage.getItem(key);
        if (stored) {
          setMessages(JSON.parse(stored));
        }
      } catch (e) {
        console.warn('Failed to load chat history:', e);
      }
    };
    if (businessId) {
      loadHistory();
    }
  }, [businessId]);

  // Persistent Chat History Saver
  useEffect(() => {
    const saveHistory = async () => {
      try {
        const key = `@ai_creator_messages_${businessId || 'default'}`;
        if (messages.length === 1 && messages[0].id === '1') return; // Skip initial state
        await AsyncStorage.setItem(key, JSON.stringify(messages));
      } catch (e) {
        console.warn('Failed to save chat history:', e);
      }
    };
    if (businessId && messages.length > 0) {
      saveHistory();
    }
  }, [messages, businessId]);

  useFocusEffect(
    useCallback(() => {
      if (verified && businessId) {
        fetchBanks();
        fetchPastTestsContext();
      }
    }, [verified, businessId])
  );

  const fetchPastTestsContext = async () => {
    if (!businessId) return;
    try {
      const { data: pastTests, error } = await supabase
        .from('tests')
        .select(`
          id,
          title,
          subject,
          duration_minutes,
          test_questions (
            question_text,
            options,
            correct_option
          )
        `)
        .eq('business_id', businessId)
        .neq('is_deleted', true)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      if (pastTests && pastTests.length > 0) {
        let contextText = "\n\n=== TEACHER'S HISTORICAL TESTS (DATABASE MEMORY) ===\n";
        contextText += "You have direct memory access to the teacher's past created tests. Use this to compare new requests, analyze patterns, or modify past tests:\n";
        pastTests.forEach((test, idx) => {
          contextText += `\n[Test #${idx + 1}] Title: "${test.title}", Subject: "${test.subject}", Duration: ${test.duration_minutes} mins\n`;
          const questions = (test.test_questions || []) as any[];
          contextText += `Questions (${questions.length}):\n`;
          questions.forEach((q, qIdx) => {
            contextText += `  Q${qIdx + 1}: "${q.question_text}" | Options: [${q.options?.join(', ')}] | Correct Option Index: ${q.correct_option}\n`;
          });
        });
        contextText += "\n=====================================================\n";
        setPastTestsContext(contextText);
      }
    } catch (e) {
      console.warn('Failed to fetch past tests context for AI memory:', e);
    }
  };

  const fetchBanks = async () => {
    try {
      const deletedIdsRaw = await AsyncStorage.getItem('@deleted_test_bank_ids');
      const deletedIds: string[] = deletedIdsRaw ? JSON.parse(deletedIdsRaw) : [];

      const { data: testBanksData } = await supabase
        .from('test_banks')
        .select('id, name, file_url')
        .eq('business_id', businessId);

      const { data: studyMaterialsData } = await supabase
        .from('study_materials')
        .select('id, title, file_url')
        .eq('business_id', businessId);

      const combined: any[] = [];
      if (testBanksData) {
        combined.push(...testBanksData
          .filter(tb => !deletedIds.includes(tb.id))
          .map(tb => ({ id: tb.id, name: tb.name, file_url: tb.file_url, type: 'test_bank' }))
        );
      }
      if (studyMaterialsData) {
        combined.push(...studyMaterialsData
          .filter(sm => !deletedIds.includes(sm.id))
          .map(sm => ({ id: sm.id, name: sm.title, file_url: sm.file_url, type: 'study_material' }))
        );
      }
      setBanks(combined);
    } catch (e) {
      console.warn('Failed to load study materials bank:', e);
    }
  };

  // Removed chatSession and initChat as we now use manual memory bucket

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    });
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/plain'],
        copyToCacheDirectory: true,
        multiple: true
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        if (localAttachments.length + result.assets.length > 5) {
          Alert.alert('Limit Exceeded', 'You can select up to 5 attachments in total.');
          return;
        }

        const newAttachments = [...localAttachments];
        for (const file of result.assets) {
          const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' });
          newAttachments.push({
            uri: file.uri,
            mimeType: file.mimeType || 'application/pdf',
            base64,
            name: file.name
          });
        }
        setLocalAttachments(newAttachments);
        setSelectedBankId(null);
        setShowBankModal(false);
      }
    } catch (e) {
      Alert.alert('Error picking document', (e as Error).message);
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        if (localAttachments.length + result.assets.length > 5) {
          Alert.alert('Limit Exceeded', 'You can select up to 5 attachments in total.');
          return;
        }

        const newAttachments = [...localAttachments];
        for (const file of result.assets) {
          let base64 = file.base64;
          if (!base64) {
            base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' });
          }
          newAttachments.push({
            uri: file.uri,
            mimeType: 'image/jpeg',
            base64: base64!,
            name: file.fileName || 'Attached Image'
          });
        }
        setLocalAttachments(newAttachments);
        setSelectedBankId(null);
        setShowBankModal(false);
      }
    } catch (e) {
      Alert.alert('Error picking image', (e as Error).message);
    }
  };

  const handleSend = async () => {
    if (!input.trim() && !selectedBankId && localAttachments.length === 0) return;

    const userText = input.trim();
    const bank = banks.find(b => b.id === selectedBankId);
    
    let displayMsg = userText;
    if (localAttachments.length > 0) {
      const names = localAttachments.map(a => a.name).join(', ');
      displayMsg = `📎 [Attached ${localAttachments.length} file(s): ${names}]\n` + userText;
    } else if (bank) {
      displayMsg = `📎 [Attached: ${bank.name}]\n` + userText;
    }

    const parts: any[] = [];
    if (userText) parts.push({ text: userText });
    
    if (localAttachments.length > 0) {
      for (const att of localAttachments) {
        parts.push({
          inlineData: {
            data: att.base64,
            mimeType: att.mimeType
          }
        });
      }
      parts.push({ text: "\n\nPlease base your questions on these attached files." });
    } else if (bank && bank.file_url) {
      const localUri = FileSystem.cacheDirectory + 'temp_chat_' + Date.now();
      const downloadRes = await FileSystem.downloadAsync(bank.file_url, localUri);
      const base64Data = await FileSystem.readAsStringAsync(downloadRes.uri, { encoding: FileSystem.EncodingType.Base64 });
      
      let mimeType = 'application/pdf'; 
      const contentTypeHeader = downloadRes.headers['Content-Type'] || downloadRes.headers['content-type'];
      if (contentTypeHeader) {
        mimeType = contentTypeHeader.split(';')[0].trim();
      } else if (!bank.file_url.toLowerCase().includes('.pdf')) {
        mimeType = 'image/jpeg';
      }

      parts.push({
         inlineData: {
           data: base64Data,
           mimeType: mimeType
         }
      });
      parts.push({ text: "\n\nPlease base your questions on this attached document." });
    } else if (bank) {
      parts.push({ text: `\n\n(Note: The user attached the topic '${bank.name}' but there is no file content available. Create questions based on this topic.)` });
    }

    const newUserMsg: Message = { 
        id: Date.now().toString(), 
        role: 'user', 
        text: displayMsg || 'Please use this attachment.',
        parts: parts.length > 0 ? parts : [{ text: displayMsg }]
    };
    setMessages(prev => [...prev, newUserMsg]);
    setInput('');
    setIsTyping(true);
    
    try {
      let groqSupported = true;
      if (localAttachments.length > 0 || (bank && bank.file_url)) {
        groqSupported = false; 
      }
      
      setLocalAttachments([]); // Clear local attachments after queueing
      setSelectedBankId(null);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

       const actualMessages = messages.filter(m => m.id !== '1');
       const overrideInstruction = `\n\n[OVERRIDE CONFIGURATION]
You must enforce these specific parameter configurations in the test metadata:
- Target Batch: "${selectedBatch}" (The metadata.batch_name field MUST be set exactly to this value)
- Difficulty Level: "${difficulty}" (Modify question complexity accordingly)
- Duration in minutes: ${duration} (The metadata.duration_minutes field MUST be set exactly to this value)
`;
       const systemPromptWithContext = SYSTEM_PROMPT + overrideInstruction + pastTestsContext;

      const geminiHistory = [
        { role: 'user', parts: [{ text: systemPromptWithContext }] },
        { role: 'model', parts: [{ text: "Understood! I will act as the AI Test Creator." }] },
        ...actualMessages.map(m => ({
          role: m.role === 'model' ? 'model' : 'user',
          parts: m.parts || [{ text: m.text }]
        })),
        { role: 'user', parts: parts.length > 0 ? parts : [{ text: displayMsg }] } 
      ];

      const recentMessages = actualMessages.slice(-4);
      const groqHistory = [
        { role: 'system', content: systemPromptWithContext },
        { role: 'assistant', content: "Understood! I will act as the AI Test Creator." },
        ...recentMessages.map(m => ({
          role: m.role === 'model' ? 'assistant' : 'user',
          content: m.text
        })),
        { role: 'user', content: userText || "Process the attached file." } // Groq only gets text
      ];
      
      let responseText = "";

      // 1. Direct Client Call using Official Google Generative AI SDK (Tested & Verified)
      const attemptDirectGemini = async (modelName: string) => {
        const storedKey = await AsyncStorage.getItem('custom_gemini_key');
        const geminiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || storedKey || APP_CONFIG.geminiApiKey;
        if (!geminiKey) throw new Error("Missing Gemini API Key.");
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent({ contents: geminiHistory });
        return result.response.text();
      };

      const attemptDirectGroq = async () => {
        const storedGroqKey = await AsyncStorage.getItem('custom_groq_key');
        const groqKey = process.env.EXPO_PUBLIC_GROQ_API_KEY || storedGroqKey;
        if (!groqKey) throw new Error("Missing Groq API Key.");
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${groqKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: groqHistory,
            temperature: 0.4
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || "Groq Error");
        return data.choices[0].message.content;
      };

      const modelsToTry = [
        "gemini-3.5-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-2.5-pro",
      ];

      let geminiSuccess = false;
      let lastGeminiError = "";
      for (const mName of modelsToTry) {
        try {
          console.log(`[AI Waterfall] Generating with Gemini: ${mName}...`);
          responseText = await attemptDirectGemini(mName);
          geminiSuccess = true;
          break;
        } catch (mErr: any) {
          lastGeminiError = mErr?.message || String(mErr);
          console.warn(`[AI Waterfall] ${mName} failed:`, lastGeminiError);
        }
      }

      // 2. Fallback to Supabase Edge Function if direct SDK failed
      if (!geminiSuccess) {
        try {
          console.log("[AI Waterfall] Attempting Supabase Edge Function...");
          const { data: edgeData, error: edgeError } = await supabase.functions.invoke('zenza-ai-chat', {
            body: { geminiHistory, groqHistory, groqSupported }
          });
          if (!edgeError && edgeData?.responseText) {
            responseText = edgeData.responseText;
            geminiSuccess = true;
          }
        } catch (edgeErr) {
          console.warn("[AI Waterfall] Edge function fallback failed:", edgeErr);
        }
      }

      // 3. Fallback to Groq if still not resolved
      if (!geminiSuccess && !responseText) {
        try {
          console.log("[AI Waterfall] Attempting Groq Llama 3.3 70B...");
          responseText = await attemptDirectGroq();
        } catch (groqErr: any) {
          console.error("[AI Waterfall] All models failed:", groqErr?.message || groqErr);
          throw new Error(lastGeminiError || "AI service is currently busy. Please check your connection.");
        }
      }
      
      let cleanedText = responseText.trim();
      let isTest = false;
      let testData = null;
      let outText = responseText;
      
      const jsonStart = cleanedText.indexOf('{');
      const jsonEnd = cleanedText.lastIndexOf('}');
      
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        const possibleJson = cleanedText.substring(jsonStart, jsonEnd + 1);
        try {
          const parsed = JSON.parse(possibleJson);
          if (parsed.is_test_ready && parsed.metadata && parsed.questions) {
            isTest = true;
            testData = parsed;
            
            // Remove the raw JSON block from the user's chat view
            let textWithoutJson = cleanedText.replace(possibleJson, '').trim();
            textWithoutJson = textWithoutJson.replace(/```json/g, '').replace(/```/g, '').trim();
            
            outText = textWithoutJson || "I've prepared your test! Click below to review and publish it.";
          }
        } catch(e) {
          // JSON parse failed, it was probably just conversational brackets
        }
      }

      setMessages(prev => [...prev, {
        id: Date.now().toString() + 'model',
        role: 'model',
        text: outText,
        isTestReady: isTest,
        testData: testData
      }]);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

      if (appStateRef.current !== 'active') {
        scheduleLocalNotification(
          "🤖 AI Test Creator",
          outText.length > 80 ? `${outText.substring(0, 80)}...` : outText
        );
      }

    } catch (err: any) {
      const errorMsg = err?.message || "Sorry, I encountered an error. Please check your Gemini API key or connection and try again.";
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: `⚠️ ${errorMsg}` }]);
      console.warn(err);
      if (appStateRef.current !== 'active') {
        scheduleLocalNotification(
          "🤖 AI Test Creator",
          errorMsg
        );
      }
    } finally {
      setIsTyping(false);
    }
  };

  const handlePublish = async (testData: any) => {
    try {
      if (!businessId) throw new Error("Business ID missing");
      
      const aiQuestions = testData.questions.map((q: any, idx: number) => ({
        id: q.id || `q_${Date.now()}_${idx}`,
        question_text: q.question_text,
        options: q.options,
        correct_option: q.correct_option,
        explanation: q.explanation || ''
      }));

      let newTest: any = null;

      // Try inserting with JSONB questions column first
      const res1 = await supabase
        .from('tests')
        .insert({
          business_id: businessId,
          title: testData.metadata.title || 'AI Generated Test',
          subject: testData.metadata.subject || 'General',
          batch_name: testData.metadata.batch_name === 'All' ? null : testData.metadata.batch_name,
          duration_minutes: testData.metadata.duration_minutes || 30,
          total_marks: testData.metadata.total_marks || (testData.questions.length * (testData.metadata.positive_marks || 5)),
          positive_marks: testData.metadata.positive_marks ?? 5,
          negative_marks: testData.metadata.negative_marks ?? 0,
          status: 'draft',
          questions: aiQuestions
        })
        .select()
        .single();

      if (res1.error) {
        console.warn('questions column missing in schema cache, executing legacy insert:', res1.error.message);
        // Fallback: insert without questions column
        const res2 = await supabase
          .from('tests')
          .insert({
            business_id: businessId,
            title: testData.metadata.title || 'AI Generated Test',
            subject: testData.metadata.subject || 'General',
            batch_name: testData.metadata.batch_name === 'All' ? null : testData.metadata.batch_name,
            duration_minutes: testData.metadata.duration_minutes || 30,
            total_marks: testData.metadata.total_marks || (testData.questions.length * (testData.metadata.positive_marks || 5)),
            positive_marks: testData.metadata.positive_marks ?? 5,
            negative_marks: testData.metadata.negative_marks ?? 0,
            status: 'draft',
          })
          .select()
          .single();

        if (res2.error) throw res2.error;
        newTest = res2.data;
      } else {
        newTest = res1.data;
      }
      
      // Always insert to test_questions table for legacy backward compatibility
      try {
        const legacyQuestions = aiQuestions.map((q: any) => ({
          test_id: newTest.id,
          question_text: q.question_text,
          options: q.options,
          correct_option: q.correct_option,
          explanation: q.explanation
        }));
        await supabase.from('test_questions').insert(legacyQuestions);
      } catch (e) {
        console.warn('Legacy test_questions insert ignored:', e);
      }
      
      router.push(`/(admin)/test/review/${newTest.id}`);
    } catch(e: any) {
      Alert.alert("Error publishing test", e.message);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.push('/(admin)/test')}>
          <Ionicons name="close" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Test Creator</Text>
        <TouchableOpacity 
          style={{ padding: 4 }} 
          onPress={() => {
            Alert.alert(
              'Reset Chat',
              'Are you sure you want to clear the conversation history?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Reset',
                  style: 'destructive',
                  onPress: async () => {
                    const key = `@ai_creator_messages_${businessId || 'default'}`;
                    await AsyncStorage.removeItem(key);
                    setMessages([
                      { id: '1', role: 'model', text: "Hi! I'm your AI Test Creator. 🤖\n\nConfigure the target batch, difficulty, and duration at the top, then tell me what topic or chapter you want to generate the test on!" }
                    ]);
                  }
                }
              ]
            );
          }}
        >
          <Ionicons name="trash-outline" size={22} color={Colors.status.danger} />
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        {/* Sleek Parameter Configuration Toggles Panel */}
        <View style={styles.settingsBar}>
          {/* Target Batch Row */}
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Target Batch:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.settingsScroll}>
              {batches.map(b => (
                <TouchableOpacity 
                  key={b} 
                  style={[styles.settingPill, selectedBatch === b && styles.settingPillActive]} 
                  onPress={() => setSelectedBatch(b)}
                >
                  <Text style={[styles.settingPillText, selectedBatch === b && styles.settingPillTextActive]}>{b}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          
          {/* Difficulty & Duration Row */}
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 8, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsLabel}>Difficulty:</Text>
              <View style={styles.difficultyContainer}>
                {(['Easy', 'Medium', 'Hard'] as const).map(diff => (
                  <TouchableOpacity 
                    key={diff} 
                    style={[styles.diffTab, difficulty === diff && styles.diffTabActive]} 
                    onPress={() => setDifficulty(diff)}
                  >
                    <Text style={[styles.diffTabText, difficulty === diff && styles.diffTabTextActive]}>{diff}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            
            <View style={{ width: 110 }}>
              <Text style={styles.settingsLabel}>Duration:</Text>
              <View style={styles.durationInputContainer}>
                <TextInput
                  style={styles.durationInput}
                  value={duration}
                  onChangeText={setDuration}
                  keyboardType="number-pad"
                  maxLength={3}
                />
                <Text style={styles.durationSuffix}>mins</Text>
              </View>
            </View>
          </View>
        </View>

        <ScrollView 
          ref={scrollViewRef}
          contentContainerStyle={styles.chatContainer} 
          showsVerticalScrollIndicator={false}
        >
          {messages.map(msg => (
            <View key={msg.id} style={[
              styles.bubble, 
              msg.role === 'user' ? styles.userBubble : styles.modelBubble
            ]}>
              <Text selectable={true} style={[styles.bubbleText, msg.role === 'user' && styles.userBubbleText]}>
                {renderMessageText(msg.text)}
              </Text>
              
              {msg.isTestReady && msg.testData && (
                <View style={styles.testCard}>
                  <Text style={styles.testCardTitle}>{msg.testData.metadata.title}</Text>
                  <Text style={styles.testCardMeta}>⏱ {msg.testData.metadata.duration_minutes} mins  •  📝 {msg.testData.questions.length} Questions</Text>
                  <TouchableOpacity style={styles.publishBtn} onPress={() => handlePublish(msg.testData)}>
                    <Text style={styles.publishBtnText}>Review & Publish</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
          {isTyping && (
            <View style={[styles.bubble, styles.modelBubble]}>
              <AgenticThoughtProcess />
            </View>
          )}
        </ScrollView>

        <View style={styles.inputWrapper}>
          {/* Show either local attachments OR bank attachment */}
          {selectedBankId && (
            <View style={styles.attachmentBadge}>
              <Ionicons name="document-text" size={12} color="#FFF" />
              <Text style={styles.attachmentBadgeText} numberOfLines={1}>
                {banks.find(b => b.id === selectedBankId)?.name || 'Document'}
              </Text>
              <TouchableOpacity onPress={() => setSelectedBankId(null)}>
                <Ionicons name="close-circle" size={14} color="#FFF" />
              </TouchableOpacity>
            </View>
          )}

          {localAttachments.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {localAttachments.map((att, idx) => (
                <View key={idx} style={styles.attachmentBadge}>
                  <Ionicons name="image" size={12} color="#FFF" />
                  <Text style={styles.attachmentBadgeText} numberOfLines={1}>
                    {att.name}
                  </Text>
                  <TouchableOpacity onPress={() => {
                    setLocalAttachments(prev => prev.filter((_, i) => i !== idx));
                  }}>
                    <Ionicons name="close-circle" size={14} color="#FFF" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <View style={styles.inputArea}>
            <TouchableOpacity style={styles.attachBtn} onPress={() => setShowBankModal(true)}>
              <Ionicons name="attach" size={26} color={Colors.text.secondary} />
            </TouchableOpacity>
            <TextInput
              style={styles.textInput}
              placeholder="Ask AI to create a test..."
              placeholderTextColor={Colors.text.tertiary}
              multiline
              value={input}
              onChangeText={setInput}
            />
            <TouchableOpacity 
              style={[styles.sendBtn, (!input.trim() && !selectedBankId && localAttachments.length === 0) && { opacity: 0.5 }]} 
              onPress={handleSend}
              disabled={(!input.trim() && !selectedBankId && localAttachments.length === 0) || isTyping}
            >
              <Ionicons name="arrow-up" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
      {Platform.OS === 'android' && <View style={{ height: keyboardHeight }} />}

      {/* Bank Selection Modal */}
      <Modal visible={showBankModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Attach Study Material</Text>
            
            <ScrollView style={{ maxHeight: 400 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text.tertiary, marginBottom: 8, marginTop: 4 }}>FROM DEVICE</Text>
              <TouchableOpacity style={styles.bankItem} onPress={pickDocument}>
                <Ionicons name="document-outline" size={24} color={Colors.status.info} />
                <Text style={styles.bankItemText}>Pick PDF or Document</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.bankItem} onPress={pickImage}>
                <Ionicons name="image-outline" size={24} color={Colors.status.success} />
                <Text style={styles.bankItemText}>Pick Image or Photo</Text>
              </TouchableOpacity>

              <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text.tertiary, marginBottom: 8, marginTop: 24 }}>FROM SAVED BANKS</Text>
              {banks.length === 0 ? (
                <Text style={styles.emptyText}>No materials found. Upload in Test Banks first.</Text>
              ) : (
                banks.map(bank => (
                  <TouchableOpacity 
                    key={bank.id} 
                    style={styles.bankItem}
                    onPress={() => {
                      setSelectedBankId(bank.id);
                      setLocalAttachments([]);
                      setShowBankModal(false);
                    }}
                  >
                    <Ionicons name="document-text-outline" size={24} color={Colors.accent.primary} />
                    <Text style={styles.bankItemText}>{bank.name}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setShowBankModal(false)}>
              <Text style={styles.closeModalBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
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
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
  },
  backButton: { padding: 4 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  chatContainer: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
  },
  bubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 16,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.accent.primary,
    borderBottomRightRadius: 4,
  },
  modelBubble: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.bg.secondary,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  bubbleText: {
    fontSize: 15,
    color: Colors.text.primary,
    lineHeight: 22,
  },
  userBubbleText: {
    color: '#FFF',
  },
  inputWrapper: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.card.border,
    backgroundColor: Colors.bg.primary,
  },
  attachmentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent.secondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
    marginBottom: 8,
    gap: 6,
    maxWidth: '80%',
  },
  attachmentBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  attachBtn: {
    padding: 8,
    marginBottom: 4,
  },
  textInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: Colors.bg.secondary,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: Colors.text.primary,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  testCard: {
    marginTop: 12,
    backgroundColor: Colors.bg.primary,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.accent.primary + '40',
  },
  testCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  testCardMeta: {
    fontSize: 13,
    color: Colors.text.secondary,
    marginBottom: 16,
  },
  publishBtn: {
    backgroundColor: Colors.accent.primary,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  publishBtnText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.bg.primary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 16,
  },
  bankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
    gap: 12,
  },
  bankItemText: {
    fontSize: 16,
    color: Colors.text.primary,
  },
  emptyText: {
    color: Colors.text.tertiary,
    textAlign: 'center',
    marginVertical: 24,
  },
  closeModalBtn: {
    marginTop: 24,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    borderRadius: 12,
  },
  closeModalBtnText: {
    fontWeight: '600',
    color: Colors.text.primary,
  },
  quickReplyContainer: {
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  qrHeader: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  qrLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  qrRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  qrChip: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  qrChipText: {
    color: '#FFF',
    fontSize: 12,
  },
  qrSubmitBtn: {
    marginTop: 16,
    backgroundColor: '#FFF',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  qrSubmitText: {
    color: Colors.accent.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  thinkingContainer: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    minWidth: 150,
  },
  thinkingText: {
    color: Colors.text.secondary,
    fontStyle: 'italic',
    fontSize: 13,
  },
  settingsBar: {
    backgroundColor: Colors.bg.secondary,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
    minWidth: 70,
  },
  settingsScroll: {
    gap: 6,
    paddingRight: 12,
  },
  settingPill: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.card.border,
    backgroundColor: Colors.bg.primary,
  },
  settingPillActive: {
    borderColor: Colors.accent.primary,
    backgroundColor: Colors.accent.primary + '10',
  },
  settingPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  settingPillTextActive: {
    color: Colors.accent.primary,
  },
  difficultyContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.bg.primary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.card.border,
    padding: 2,
    gap: 2,
  },
  diffTab: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  diffTabActive: {
    backgroundColor: Colors.accent.primary,
  },
  diffTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  diffTabTextActive: {
    color: '#FFF',
  },
  durationInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.primary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.card.border,
    paddingHorizontal: 8,
    height: 32,
  },
  durationInput: {
    flex: 1,
    fontSize: 12,
    color: Colors.text.primary,
    padding: 0,
    textAlign: 'center',
    fontWeight: '700',
  },
  durationSuffix: {
    fontSize: 10,
    color: Colors.text.tertiary,
    marginLeft: 4,
    fontWeight: '600',
  },
});

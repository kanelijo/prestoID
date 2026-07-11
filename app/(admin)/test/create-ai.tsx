import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(process.env.EXPO_PUBLIC_GEMINI_API_KEY || "");
import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Keyboard, Animated, Easing, AppState, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { scheduleLocalNotification } from '@/lib/notifications';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Line } from 'react-native-svg';

type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
  isTestReady?: boolean;
  testData?: any;
};

const SYSTEM_PROMPT = `You are KanelFlow's AI Test Creator. You help teachers create multiple-choice tests.
Ask clarifying questions if the teacher's request is missing key details (Topic, Duration in minutes, Target Batch (e.g., All, MPPSC, SSC), Number of Questions, Difficulty).
When you have all the necessary information and the teacher says they are ready to generate, or asks you to generate, you MUST reply strictly with a JSON block in this exact format, without any surrounding conversational text (do not use Markdown code blocks like \`\`\`json, just output the raw JSON):

{
  "is_test_ready": true,
  "metadata": { "title": "...", "duration_minutes": 10, "batch_name": "All", "total_marks": 10, "positive_marks": 5, "negative_marks": 0 },
  "questions": [
    { "question_text": "...", "options": ["A","B","C","D"], "correct_option": 0, "explanation": "..." }
  ]
}

DO NOT output the JSON until the teacher confirms they want to create the test. Chat normally until then.
If the teacher provides a PDF/Document attachment, base your questions strictly on that document.
Assume each question has 5 positive marks and 0 negative marks, unless the teacher specifies otherwise. Output these as numbers in positive_marks and negative_marks.`;

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
  const { user, verified, businessId } = useAuthStore();
  
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'model', text: "Hi! I'm your AI Test Creator. 🤖\n\nTell me what topic you want the test on, how long it should be, and how many questions you need!" }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  const [banks, setBanks] = useState<any[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);
  const [localAttachment, setLocalAttachment] = useState<{ uri: string; mimeType: string; base64: string; name: string } | null>(null);
  const [showBankModal, setShowBankModal] = useState(false);
  
  const scrollViewRef = useRef<ScrollView>(null);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      appStateRef.current = nextAppState;
    });
    return () => subscription.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (verified && businessId) {
        fetchBanks();
      }
    }, [verified, businessId])
  );

  const fetchBanks = async () => {
    try {
      const { data } = await supabase
        .from('test_banks')
        .select('id, name, file_url')
        .eq('business_id', businessId);
      if (data) setBanks(data);
    } catch (e) {
      console.warn(e);
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
        copyToCacheDirectory: true
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' });
        setLocalAttachment({ uri: file.uri, mimeType: file.mimeType || 'application/pdf', base64, name: file.name });
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
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        setLocalAttachment({ uri: file.uri, mimeType: 'image/jpeg', base64: file.base64!, name: 'Attached Image' });
        setSelectedBankId(null);
        setShowBankModal(false);
      }
    } catch (e) {
      Alert.alert('Error picking image', (e as Error).message);
    }
  };

  const handleSend = async () => {
    if (!input.trim() && !selectedBankId && !localAttachment) return;
    if (!process.env.EXPO_PUBLIC_GEMINI_API_KEY) {
      Alert.alert('Missing API Key', 'Please add EXPO_PUBLIC_GEMINI_API_KEY to your .env file.');
      return;
    }

    const userText = input.trim();
    const bank = banks.find(b => b.id === selectedBankId);
    
    let displayMsg = userText;
    if (localAttachment) {
      displayMsg = `📎 [Attached: ${localAttachment.name}]\n` + userText;
    } else if (bank) {
      displayMsg = `📎 [Attached: ${bank.name}]\n` + userText;
    }

    const newUserMsg: Message = { id: Date.now().toString(), role: 'user', text: displayMsg || 'Please use this attachment.' };
    setMessages(prev => [...prev, newUserMsg]);
    setInput('');
    setIsTyping(true);
    

    try {
      let groqSupported = true;
      const parts: any[] = [];
      if (userText) parts.push({ text: userText });
      
      if (localAttachment) {
        groqSupported = false; // Groq does not support files natively
        parts.push({
           inlineData: {
             data: localAttachment.base64,
             mimeType: localAttachment.mimeType
           }
        });
        parts.push({ text: "\n\nPlease base your questions on this attached file." });
      } else if (bank && bank.file_url) {
        groqSupported = false; // Groq does not support PDFs natively
        const localUri = FileSystem.cacheDirectory + 'temp_chat_' + Date.now();
        const downloadRes = await FileSystem.downloadAsync(bank.file_url, localUri);
        const base64Data = await FileSystem.readAsStringAsync(downloadRes.uri, { encoding: FileSystem.EncodingType.Base64 });
        
        let mimeType = 'application/pdf'; // Default
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
      
      // Clear attachment state after compiling parts
      setLocalAttachment(null);
      setSelectedBankId(null);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

      // Filter out the initial greeting message to prevent Gemini 400 Bad Request (duplicate model roles)
      const actualMessages = messages.filter(m => m.id !== '1');

      // 1. Build Gemini Memory Bucket
      const geminiHistory = [
        { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
        { role: 'model', parts: [{ text: "Understood! I will act as the AI Test Creator." }] },
        ...actualMessages.map(m => ({
          role: m.role === 'model' ? 'model' : 'user',
          parts: [{ text: m.text }]
        })),
        { role: 'user', parts } // The current message with parts
      ];

      // 2. Build Groq Memory Bucket (Truncated to avoid 6000 TPM limit on Free Tier)
      const recentMessages = actualMessages.slice(-4);
      const groqHistory = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'assistant', content: "Understood! I will act as the AI Test Creator." },
        ...recentMessages.map(m => ({
          role: m.role === 'model' ? 'assistant' : 'user',
          content: m.text
        })),
        { role: 'user', content: userText || "Process the attached file." } // Groq only gets text
      ];
      
      let responseText = "";

      const attemptGemini = async (modelName: string) => {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent({ contents: geminiHistory });
        return result.response.text();
      };

      const attemptGroq = async () => {
        const groqKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
        if (!groqKey) throw new Error("Missing EXPO_PUBLIC_GROQ_API_KEY");
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${groqKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages: groqHistory,
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || "Groq Error");
        return data.choices[0].message.content;
      };

      // --- FAILOVER WATERFALL ---
      try {
        console.log("Attempt 1: Gemini 2.0 Flash");
        responseText = await attemptGemini("gemini-2.0-flash");
      } catch (err1) {
        console.warn("Gemini 2.0 Flash failed:", err1);
        try {
          console.log("Attempt 2: Gemini 1.5 Flash");
          responseText = await attemptGemini("gemini-1.5-flash");
        } catch (err2) {
          console.warn("Gemini 1.5 Flash failed:", err2);
          try {
            console.log("Attempt 3: Gemini 1.5 Pro");
            responseText = await attemptGemini("gemini-1.5-pro");
          } catch (err3) {
            console.warn("Gemini 1.5 Pro failed:", err3);
            if (groqSupported) {
              try {
                console.log("Attempt 4: Groq Llama 3.1");
                responseText = await attemptGroq();
              } catch (err4) {
                console.error("Groq failed:", err4);
                throw new Error("Your text is too large for the Backup AI Server. Please reduce the length and try again, or wait for Google to stabilize.");
              }
            } else {
              throw new Error("Gemini AI is overloaded. Groq cannot process the attached PDF.");
            }
          }
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
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "Sorry, I encountered an error. Please try again." }]);
      console.warn(err);
      if (appStateRef.current !== 'active') {
        scheduleLocalNotification(
          "🤖 AI Test Creator",
          "Sorry, I encountered an error. Please try again."
        );
      }
    } finally {
      setIsTyping(false);
    }
  };

  const handlePublish = async (testData: any) => {
    try {
      if (!businessId) throw new Error("Business ID missing");
      
      const { data: newTest, error: testErr } = await supabase
        .from('tests')
        .insert({
          business_id: businessId,
          title: testData.metadata.title || 'AI Generated Test',
          batch_name: testData.metadata.batch_name === 'All' ? null : testData.metadata.batch_name,
          duration_minutes: testData.metadata.duration_minutes || 30,
          total_marks: testData.metadata.total_marks || (testData.questions.length * (testData.metadata.positive_marks || 5)),
          positive_marks: testData.metadata.positive_marks ?? 5,
          negative_marks: testData.metadata.negative_marks ?? 0,
          status: 'draft',
        })
        .select()
        .single();
        
      if (testErr) throw testErr;
      
      const aiQuestions = testData.questions.map((q: any) => ({
         test_id: newTest.id,
         question_text: q.question_text,
         options: q.options,
         correct_option: q.correct_option,
         explanation: q.explanation
      }));
      
      const { error: qErr } = await supabase.from('test_questions').insert(aiQuestions);
      if (qErr) throw qErr;
      
      router.push(`/(admin)/test/review/${newTest.id}`);
    } catch(e: any) {
      Alert.alert("Error publishing test", e.message);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'ios' ? ['top'] : []}>
      {Platform.OS === 'android' && <StatusBar translucent={false} backgroundColor="#FFF8F6" />}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Test Creator</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ flex: 1 }}>
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
          {/* Show either local attachment OR bank attachment */}
          {(selectedBankId || localAttachment) && (
            <View style={styles.attachmentBadge}>
              <Ionicons name="document-text" size={12} color="#FFF" />
              <Text style={styles.attachmentBadgeText} numberOfLines={1}>
                {localAttachment ? localAttachment.name : banks.find(b => b.id === selectedBankId)?.name || 'Document'}
              </Text>
              <TouchableOpacity onPress={() => {
                setSelectedBankId(null);
                setLocalAttachment(null);
              }}>
                <Ionicons name="close-circle" size={14} color="#FFF" />
              </TouchableOpacity>
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
              style={[styles.sendBtn, (!input.trim() && !selectedBankId && !localAttachment) && { opacity: 0.5 }]} 
              onPress={handleSend}
              disabled={(!input.trim() && !selectedBankId && !localAttachment) || isTyping}
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
                      setLocalAttachment(null);
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
  }
});

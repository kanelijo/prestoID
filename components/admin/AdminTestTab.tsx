import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, RefreshControl, ScrollView, Modal, BackHandler, Animated } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Shadows, Gradients } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { usePrefetchStore } from '@/stores/usePrefetchStore';
import { sendPushNotification, fetchStudentPushTokens, CHANNELS } from '@/lib/notifications';
import { CustomAlert } from '@/components/CustomAlert';
import { useFeatureFlags } from '@/stores/useFeatureFlags';

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
  return subject.trim().charAt(0).toUpperCase() + subject.trim().slice(1);
}

function getSubjectMeta(canonicalSubject: string): { emoji: string; color: string } {
  for (const entry of SUBJECT_META) {
    if (entry.canonical === canonicalSubject) {
      return { emoji: entry.emoji, color: entry.color };
    }
  }
  return { emoji: '📚', color: '#6B7280' };
}

// Temporary mock data for UI fallback
const MOCK_TESTS = [
  { id: '1', title: 'MPPSC Prelims Mock 1', subject: 'History', batch_name: 'MPPSC', duration_minutes: 60, status: 'published', scheduled_at: new Date(Date.now() + 86400000).toISOString(), created_at: new Date().toISOString() },
  { id: '2', title: 'SSC CGL Tier 1', subject: 'Mathematics', batch_name: 'SSC', duration_minutes: 60, status: 'draft', scheduled_at: null, created_at: new Date(Date.now() - 10000).toISOString() },
  { id: '3', title: 'Weekly Current Affairs', subject: 'Current Affairs', batch_name: 'All', duration_minutes: 30, status: 'completed', scheduled_at: new Date(Date.now() - 86400000).toISOString(), created_at: new Date(Date.now() - 100000).toISOString() },
];

export default function AdminTestScreen() {
  const router = useRouter();
  const { verified, businessId } = useAuthStore();
  const { isFeatureActive } = useFeatureFlags();
  const prefetch = usePrefetchStore.getState();
  const [tests, setTests] = useState<any[]>(prefetch.adminTests || []);
  const [isLoading, setIsLoading] = useState(!prefetch.testsReady && tests.length === 0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeSegment, setActiveSegment] = useState<'generator' | 'tests'>('generator');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [testToMove, setTestToMove] = useState<any>(null);
  const [downloadingTestId, setDownloadingTestId] = useState<string | null>(null);

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

  const fetchTests = async (silent = false) => {
    if (!silent) setIsLoading(true);
    if (!businessId) {
      setTests(MOCK_TESTS);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('tests')
        .select('*')
        .eq('business_id', businessId)
        .neq('is_deleted', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTests(data || []);
    } catch (err: any) {
      console.warn('Failed to load tests:', err);
      // Fallback to mock data only if table doesn't exist yet
      if (err?.code === '42P01') {
        setTests(MOCK_TESTS);
      } else {
        setTests([]);
      }
    } finally {
      setIsLoading(false); // Always clear loading — silent only suppresses the initial spinner show, not the clear
      setIsRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchTests(true);

      const onBackPress = () => {
        if (selectedSubject !== null) {
          setSelectedSubject(null);
          return true;
        }
        if (activeSegment === 'tests') {
          setActiveSegment('generator');
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [verified, businessId, selectedSubject, activeSegment])
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    await fetchTests(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return Colors.status.info;
      case 'completed': return Colors.status.success;
      case 'draft': return Colors.text.secondary;
      default: return Colors.text.secondary;
    }
  };

  const deleteTest = async (testId: string, title: string) => {
    CustomAlert.alert(
      'Delete Test',
      `Delete "${title}"? This will permanently remove all questions and student submissions.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('tests').delete().eq('id', testId);
              if (error) throw error;
              setTests(prev => prev.filter(t => t.id !== testId));
            } catch (err: any) {
              console.warn('Delete error:', err);
              CustomAlert.alert('Error', 'Failed to delete test. Please make sure you have run the database cascade migration.');
            }
          },
        },
      ]
    );
  };

  const downloadTestPaperPDF = async (testItem: any) => {
    try {
      setDownloadingTestId(testItem.id);
      const isSharingAvail = await Sharing.isAvailableAsync();
      if (!isSharingAvail) {
        Alert.alert('Error', 'Sharing is not available on this device');
        return;
      }

      // Fetch questions (check JSONB on test item first, fallback to test_questions)
      let qData: any[] = [];
      if (testItem.questions && Array.isArray(testItem.questions) && testItem.questions.length > 0) {
        qData = testItem.questions;
      } else {
        const { data: legacyQs } = await supabase
          .from('test_questions')
          .select('*')
          .eq('test_id', testItem.id)
          .order('created_at');
        qData = legacyQs || [];
      }

      if (!qData || qData.length === 0) {
        Alert.alert('Error', 'No questions found for this test.');
        return;
      }

      const optLabels = ['A', 'B', 'C', 'D'];
      const { user, businessName, avatarUrl: logoUrl } = useAuthStore.getState();
      const dateStr = testItem.scheduled_at 
        ? new Date(testItem.scheduled_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      
      const contactInfo = user?.phone || user?.email || 'N/A';

      // 1. Generate Plain Questions HTML
      const questionsHTML = qData.map((q, idx) => {
        const hasLongOption = q.options?.some((opt: string) => opt.length > 25) || false;
        const optionWidth = hasLongOption ? '100%' : '48%';

        const optionsHTML = (q.options || ['A', 'B', 'C', 'D']).map((opt: string, oIdx: number) => {
          return `
            <span class="option-item" style="width: ${optionWidth};">
              <strong>${optLabels[oIdx]})</strong> ${opt}
            </span>
          `;
        }).join('');

        return `
          <div class="q-card">
            <div class="q-text">
              <strong>${idx + 1}.</strong> ${q.question_text}
            </div>
            ${q.question_image_url ? `<img src="${q.question_image_url}" style="max-width:100%; height:auto; margin-bottom:8px; display:block; border-radius:4px;" />` : ''}
            <div class="options-row">
              ${optionsHTML}
            </div>
          </div>
        `;
      }).join('');

      // 2. Generate Answer Key HTML
      const answerKeyGridHTML = qData.map((q, idx) => {
        return `
          <div class="key-cell">
            <strong>Q${idx + 1}:</strong> ${optLabels[q.correct_option] || 'N/A'}
          </div>
        `;
      }).join('');

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            @page {
              size: A4;
              margin: 20mm 15mm 20mm 15mm;
            }
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 0; color: #333; margin: 0; position: relative; min-height: 100%; }
            .header-container { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #AF2800; padding-bottom: 12px; margin-bottom: 16px; }
            .logo-placeholder { width: 45px; height: 45px; border-radius: 22px; object-fit: cover; }
            .logo-text-placeholder { width: 45px; height: 45px; border-radius: 22px; background-color: #AF2800; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px; }
            .header-center { flex: 1; text-align: center; margin: 0 16px; }
            .coaching-title { font-size: 20px; font-weight: bold; color: #AF2800; margin: 0; text-transform: uppercase; }
            .header-right { text-align: right; font-size: 10px; color: #666; line-height: 1.4; max-width: 200px; }
            
            .test-banner-wrapper { text-align: center; margin-bottom: 20px; }
            .test-banner { display: inline-block; background-color: #111; color: #fff; font-size: 11px; font-weight: bold; padding: 4px 14px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
            
            .questions-wrapper {
              column-count: 2;
              column-gap: 24px;
            }
            .q-card {
              break-inside: avoid;
              page-break-inside: avoid;
              margin-bottom: 16px;
              border-bottom: 1px solid #f0f0f0;
              padding-bottom: 10px;
            }
            .q-text { font-size: 12px; font-weight: bold; margin-bottom: 6px; line-height: 1.4; }
            .options-row { display: flex; flex-direction: row; flex-wrap: wrap; margin-top: 4px; justify-content: space-between; row-gap: 6px; }
            .option-item { font-size: 11px; color: #333; box-sizing: border-box; }
            
            .page-break {
              page-break-before: always;
              break-before: page;
            }
            
            .key-title { font-size: 16px; font-weight: bold; color: #AF2800; text-align: center; margin-bottom: 20px; border-bottom: 2px solid #AF2800; padding-bottom: 8px; }
            .key-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; max-width: 500px; margin: 0 auto; }
            .key-cell { border: 1px solid #ddd; border-radius: 6px; padding: 8px; text-align: center; font-size: 12px; background-color: #f9f9f9; }
            
            .footer-watermark { position: fixed; bottom: -12mm; left: 0; right: 0; text-align: center; font-size: 9px; color: #9CA3AF; font-weight: bold; border-top: 1px solid #E5E7EB; padding-top: 6px; }
          </style>
        </head>
        <body>
          <div class="header-container">
            ${logoUrl 
              ? `<img src="${logoUrl}" class="logo-placeholder" />` 
              : `<div class="logo-text-placeholder">${(businessName || 'Z').charAt(0).toUpperCase()}</div>`
            }
            <div class="header-center">
              <div class="coaching-title">${businessName || 'Zenza Academy'}</div>
            </div>
            <div class="header-right">
              <strong>Mob:</strong> ${contactInfo}<br/>
              <strong>Date:</strong> ${dateStr}
            </div>
          </div>
          
          <div class="test-banner-wrapper">
            <div class="test-banner">TEST PAPER - ${testItem.title}</div>
          </div>
          
          <div class="questions-wrapper">
            ${questionsHTML}
          </div>
          
          <div class="page-break">
            <div class="header-container">
              ${logoUrl 
                ? `<img src="${logoUrl}" class="logo-placeholder" />` 
                : `<div class="logo-text-placeholder">${(businessName || 'Z').charAt(0).toUpperCase()}</div>`
              }
              <div class="header-center">
                <div class="coaching-title">${businessName || 'Zenza Academy'}</div>
              </div>
              <div class="header-right">
                <strong>Mob:</strong> ${contactInfo}<br/>
                <strong>Date:</strong> ${dateStr}
              </div>
            </div>
            
            <div class="test-banner-wrapper">
              <div class="test-banner">OFFICIAL ANSWER KEY</div>
            </div>
            
            <div class="key-title">ANSWER KEY</div>
            
            <div class="key-grid">
              ${answerKeyGridHTML}
            </div>
          </div>

          <div class="footer-watermark">Zenza Learning Platform</div>
        </body>
        </html>
      `;

      // Render to PDF
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      
      // Share/Save PDF
      const pdfName = `${(testItem.title || 'Test_Paper').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}_Paper.pdf`;
      const targetUri = `${FileSystem.documentDirectory}${pdfName}`;
      await FileSystem.moveAsync({ from: uri, to: targetUri });
      
      await Sharing.shareAsync(targetUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Download Test PDF',
        UTI: 'com.adobe.pdf'
      });
    } catch (err: any) {
      console.warn('Failed to download test paper PDF:', err);
      Alert.alert('Error', err.message || 'Failed to download test paper PDF.');
    } finally {
      setDownloadingTestId(null);
    }
  };

  const handleLongPress = (item: any) => {
    const options: any[] = [
      { text: 'Cancel', style: 'cancel' },
      {
        text: '📄 Download Test Paper PDF',
        onPress: () => downloadTestPaperPDF(item),
      },
      {
        text: '📂 Move Category',
        onPress: () => {
          setTestToMove(item);
          setShowSubjectModal(true);
        }
      },
      {
        text: '🗑️ Delete Test',
        style: 'destructive',
        onPress: () => deleteTest(item.id, item.title),
      },
    ];

    if (item.status === 'draft') {
      options.splice(1, 0, {
        text: '🚀 Publish Test',
        onPress: async () => {
          try {
            await supabase.from('tests').update({ status: 'published' }).eq('id', item.id);
            setTests(prev => prev.map(t => t.id === item.id ? { ...t, status: 'published' } : t));

            try {
              const targetBatch = item.batch_name;
              const { user } = useAuthStore.getState();
              if (businessId) {
                const tokens = await fetchStudentPushTokens(businessId, user?.id, targetBatch);
                if (tokens.length > 0) {
                  await sendPushNotification(
                    tokens,
                    'New Test Published 📝',
                    `A new test "${item.title || 'Mock Test'}" has been published. Duration: ${item.duration_minutes || 60} mins.`,
                    { screen: 'test', testId: item.id },
                    1,
                    CHANNELS.tests
                  );
                }
              }
            } catch (pushErr) {
              console.warn('Failed to send push notifications via quick publish:', pushErr);
            }

          } catch (err) {
            CustomAlert.alert('Error', 'Failed to publish test.');
          }
        },
      });
    }

    if (item.status === 'published') {
      options.splice(1, 0, {
        text: '✅ Mark as Completed',
        onPress: async () => {
          try {
            await supabase.from('tests').update({ status: 'completed' }).eq('id', item.id);
            setTests(prev => prev.map(t => t.id === item.id ? { ...t, status: 'completed' } : t));
          } catch (err) {
            CustomAlert.alert('Error', 'Failed to update test status.');
          }
        },
      });
    }

    CustomAlert.alert(item.title, 'Choose an action', options);
  };

  const renderTest = ({ item }: { item: any }) => {
    const statusColor = getStatusColor(item.status);
    
    return (
      <TouchableOpacity 
        style={styles.testCard}
        activeOpacity={0.7}
        onPress={() => {
          if (item.status === 'draft') {
            router.push(`/(admin)/test/review/${item.id}`);
          } else {
            router.push(`/(admin)/test/analytics/${item.id}`);
          }
        }}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={400}
      >
        <View style={styles.cardHeader}>
          <View style={styles.batchBadge}>
            <Text style={styles.batchText}>{item.batch_name || 'All'}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '15' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{item.status.toUpperCase()}</Text>
          </View>
        </View>
        
        <Text style={styles.testTitle}>{item.title}</Text>
        
        <View style={styles.cardFooter}>
          <View style={styles.footerItem}>
            <Ionicons name="time-outline" size={14} color={Colors.text.tertiary} />
            <Text style={styles.footerText}>{item.duration_minutes} mins</Text>
          </View>
          {item.scheduled_at && (
            <View style={styles.footerItem}>
              <Ionicons name="calendar-outline" size={14} color={Colors.text.tertiary} />
              <Text style={styles.footerText}>
                {new Date(item.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', gap: 8 }}>
            <TouchableOpacity 
              onPress={() => downloadTestPaperPDF(item)}
              disabled={downloadingTestId !== null}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#FFF5F2',
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: '#FFDDDF',
                gap: 4
              }}
            >
              {downloadingTestId === item.id ? (
                <ActivityIndicator size="small" color={Colors.accent.primary} style={{ transform: [{ scale: 0.8 }] }} />
              ) : (
                <Ionicons name="download-outline" size={12} color={Colors.accent.primary} />
              )}
              <Text style={{ fontSize: 10, color: Colors.accent.primary, fontWeight: '700' }}>
                {downloadingTestId === item.id ? 'Loading' : 'Download'}
              </Text>
            </TouchableOpacity>
            {item.status !== 'draft' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="bar-chart-outline" size={12} color={Colors.accent.primary} />
                <Text style={{ fontSize: 10, color: Colors.accent.primary, fontWeight: '700' }}>Analytics</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderFolder = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.folderCard} 
      activeOpacity={0.8} 
      onPress={() => setSelectedSubject(item.name)}
    >
      <View style={[styles.folderIconBg, { backgroundColor: item.color + '15' }]}>
        <Text style={{ fontSize: 24 }}>{item.emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.folderTitle}>{item.name}</Text>
        <Text style={styles.folderSubtitle}>{item.count} {item.count === 1 ? 'Test' : 'Tests'}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.text.tertiary} />
    </TouchableOpacity>
  );

  // Group tests into categories
  const subjectMap = new Map<string, any[]>();
  for (const t of tests) {
    const canonicalSubj = getCanonicalSubject(t.subject);
    if (!subjectMap.has(canonicalSubj)) {
      subjectMap.set(canonicalSubj, []);
    }
    subjectMap.get(canonicalSubj)!.push(t);
  }

  const categories = Array.from(subjectMap.entries()).map(([name, items]) => ({
    name,
    count: items.length,
    ...getSubjectMeta(name)
  }));

  const filteredTests = selectedSubject 
    ? tests.filter(t => getCanonicalSubject(t.subject) === selectedSubject)
    : [];

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.bg.primary }]} edges={['top']}>
        {/* Skeleton Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 15, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Animated.View style={{ opacity: skeletonPulse, width: 100, height: 26, borderRadius: 6, backgroundColor: '#E0E0E0' }} />
          <Animated.View style={{ opacity: skeletonPulse, width: 40, height: 40, borderRadius: 20, backgroundColor: '#E0E0E0' }} />
        </View>

        {/* Skeleton Segment Controller */}
        <View style={{ marginHorizontal: 20, marginVertical: 15, height: 50, borderRadius: 14, backgroundColor: '#F1F3F5', padding: 4, flexDirection: 'row', gap: 4 }}>
          <Animated.View style={{ opacity: skeletonPulse, flex: 1, height: '100%', borderRadius: 10, backgroundColor: '#FFF' }} />
          <Animated.View style={{ opacity: skeletonPulse, flex: 1, height: '100%', borderRadius: 10, backgroundColor: '#E0E0E0' }} />
        </View>

        {/* Skeleton Body Grid */}
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, gap: 15 }} showsVerticalScrollIndicator={false}>
          {/* Section title */}
          <Animated.View style={{ opacity: skeletonPulse, width: 180, height: 18, borderRadius: 4, backgroundColor: '#E0E0E0', marginVertical: 5 }} />
          
          {/* Quick AI Creator card */}
          <Animated.View style={{ opacity: skeletonPulse, width: '100%', height: 130, borderRadius: 20, backgroundColor: '#E0E0E0' }} />

          {/* Subject list placeholders */}
          <Animated.View style={{ opacity: skeletonPulse, width: 140, height: 18, borderRadius: 4, backgroundColor: '#E0E0E0', marginTop: 10, marginBottom: 5 }} />
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
        <View>
          <Text style={styles.title}>AI Test Engine</Text>
          <Text style={styles.subtitle}>Generate and manage tests</Text>
        </View>
        <TouchableOpacity style={styles.bankButton} onPress={() => router.push('/(admin)/test/banks')}>
          <Ionicons name="library-outline" size={20} color={Colors.accent.primary} />
        </TouchableOpacity>
      </View>

      {!verified && (
        <View style={styles.testModeBanner}>
          <Ionicons name="construct-outline" size={16} color="#FFF" />
          <Text style={styles.testModeText}>Test Mode (Awaiting Verification)</Text>
        </View>
      )}

      {/* Segment Tab Selector */}
      <View style={styles.segmentContainer}>
        <TouchableOpacity 
          style={[styles.segmentBtn, activeSegment === 'generator' && styles.segmentBtnActive]} 
          onPress={() => setActiveSegment('generator')}
        >
          <Text style={[styles.segmentText, activeSegment === 'generator' && styles.segmentTextActive]}>
            🤖 AI Generator
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.segmentBtn, activeSegment === 'tests' && styles.segmentBtnActive]} 
          onPress={() => {
            setActiveSegment('tests');
            setSelectedSubject(null);
          }}
        >
          <Text style={[styles.segmentText, activeSegment === 'tests' && styles.segmentTextActive]}>
            📝 Generated Tests
          </Text>
        </TouchableOpacity>
      </View>

      {activeSegment === 'generator' ? (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          <TouchableOpacity 
            style={styles.creatorCard} 
            activeOpacity={0.85}
            onPress={() => router.push('/(admin)/test/create-ai')}
          >
            <LinearGradient
              colors={['#4E6AFF10', '#7C3AED10']}
              style={styles.creatorCardGrad}
            >
              <View style={styles.creatorIconContainer}>
                <Ionicons name="chatbubbles-outline" size={28} color={Colors.accent.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.creatorTitle}>Execute AI Test Generator</Text>
                <Text style={styles.creatorDesc}>
                  Discuss, upload textbooks or syllabus sheets, and generate structured exams using persistent conversational AI memory.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.accent.primary} style={{ marginLeft: 8 }} />
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.creatorCard, { marginTop: 16 }]} 
            activeOpacity={0.85}
            onPress={() => router.push('/(admin)/test/create-manual')}
          >
            <View style={[styles.creatorCardGrad, { backgroundColor: '#F9FAFB' }]}>
              <View style={[styles.creatorIconContainer, { backgroundColor: '#E5E7EB' }]}>
                <Ionicons name="create-outline" size={28} color={Colors.text.secondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.creatorTitle, { color: Colors.text.primary }]}>Manual Test Creator</Text>
                <Text style={styles.creatorDesc}>
                  Build standard multiple choice question sets manually step-by-step without AI assistance.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.text.secondary} style={{ marginLeft: 8 }} />
            </View>
          </TouchableOpacity>

          {isFeatureActive('target_exam_test') && (
            <TouchableOpacity 
              style={[styles.creatorCard, { marginTop: 16 }]} 
              activeOpacity={0.85}
              onPress={() => router.push('/(admin)/test/target-exam-admin')}
            >
              <LinearGradient
                colors={['#E8F0FE', '#E6F4EA']}
                style={styles.creatorCardGrad}
              >
                <View style={[styles.creatorIconContainer, { backgroundColor: '#FFF' }]}>
                  <Ionicons name="school-outline" size={28} color={Colors.accent.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.creatorTitle}>Target Exam Configurations</Text>
                  <Text style={styles.creatorDesc}>
                    Define syllabuses, winning strategies, and fine-tune AI engine prompts for specific exam targets.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.accent.primary} style={{ marginLeft: 8 }} />
              </LinearGradient>
            </TouchableOpacity>
          )}

          {/* LIVE SCHEDULED TESTS SECTION */}
          <View style={{ marginTop: 24, paddingHorizontal: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Animated.View style={{ 
                width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF3B30', marginRight: 8,
                opacity: skeletonPulse 
              }} />
              <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.text.primary }}>
                Live & Scheduled Tests
              </Text>
            </View>

            {tests.filter(t => t.status === 'scheduled' || t.status === 'live').length === 0 ? (
              <View style={[styles.creatorCard, { backgroundColor: '#F9FAFB', alignItems: 'center', padding: 20 }]}>
                <Ionicons name="time-outline" size={32} color={Colors.text.tertiary} />
                <Text style={{ color: Colors.text.secondary, marginTop: 8, fontSize: 13, textAlign: 'center' }}>
                  No live or scheduled tests. Publish a test as "Schedule Live Test" to see it here.
                </Text>
              </View>
            ) : (
              tests.filter(t => t.status === 'scheduled' || t.status === 'live').map(liveTest => (
                <TouchableOpacity 
                  key={liveTest.id}
                  style={[styles.creatorCard, { marginBottom: 12, borderWidth: 1, borderColor: liveTest.status === 'live' ? '#FF3B30' : Colors.card.border }]}
                  activeOpacity={0.8}
                  onPress={() => router.push(`/(admin)/test/live-dashboard/${liveTest.id}`)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.text.primary }}>{liveTest.title}</Text>
                      <Text style={{ fontSize: 12, color: Colors.text.secondary, marginTop: 4 }}>
                        {new Date(liveTest.start_time).toLocaleString()} • {liveTest.duration_minutes} mins
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      {liveTest.status === 'scheduled' ? (
                        <View style={{ backgroundColor: '#F2F2F7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.text.secondary }}>WAITING</Text>
                        </View>
                      ) : (
                        <View style={{ backgroundColor: '#FF3B3015', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#FF3B3030' }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#FF3B30' }}>LIVE NOW</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>

        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: 20 }}>
          {selectedSubject === null ? (
            <FlatList
              data={categories}
              renderItem={renderFolder}
              keyExtractor={item => item.name}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 100 }}
              refreshControl={
                <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[Colors.accent.primary]} />
              }
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="document-text-outline" size={48} color={Colors.text.tertiary} />
                  <Text style={styles.emptyTitle}>No Tests Yet</Text>
                  <Text style={styles.emptyDesc}>Use the AI Generator tab to create your first test.</Text>
                </View>
              }
            />
          ) : (
            <View style={{ flex: 1 }}>
              <View style={styles.folderHeader}>
                <TouchableOpacity style={styles.backToFolders} onPress={() => setSelectedSubject(null)}>
                  <Ionicons name="arrow-back" size={16} color={Colors.accent.primary} />
                  <Text style={styles.backToFoldersText}>Folders</Text>
                </TouchableOpacity>
                <Text style={styles.folderHeaderText}>{selectedSubject}</Text>
              </View>

              <FlatList
                data={filteredTests}
                renderItem={renderTest}
                keyExtractor={item => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 100 }}
                refreshControl={
                  <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[Colors.accent.primary]} />
                }
              />
            </View>
          )}
        </View>
      )}

      {/* Subject Selection Modal */}
      <Modal visible={showSubjectModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Move to Category</Text>
            <Text style={styles.modalSubtitle}>Select a subject for "{testToMove?.title}"</Text>
            
            <ScrollView style={{ maxHeight: 350, marginVertical: 12 }}>
              {SUBJECT_META.map(sub => (
                <TouchableOpacity
                  key={sub.canonical}
                  style={styles.modalSubjectItem}
                  onPress={async () => {
                    if (!testToMove) return;
                    try {
                      const { error } = await supabase
                        .from('tests')
                        .update({ subject: sub.canonical })
                        .eq('id', testToMove.id);
                      if (error) throw error;
                      
                      setTests(prev => prev.map(t => t.id === testToMove.id ? { ...t, subject: sub.canonical } : t));
                      setSelectedSubject(null); // Reset active folder filter
                      setShowSubjectModal(false);
                      setTestToMove(null);
                      CustomAlert.alert('Success', `Moved test to ${sub.canonical}`);
                    } catch (e: any) {
                      CustomAlert.alert('Error', 'Failed to move test: ' + e.message);
                    }
                  }}
                >
                  <Text style={{ fontSize: 20 }}>{sub.emoji}</Text>
                  <Text style={styles.modalSubjectText}>{sub.canonical}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity 
              style={styles.modalCloseBtn}
              onPress={() => {
                setShowSubjectModal(false);
                setTestToMove(null);
              }}
            >
              <Text style={styles.modalCloseBtnText}>Cancel</Text>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    marginBottom: 10,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.text.secondary,
    marginTop: 4,
    fontWeight: '500',
  },
  bankButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.card.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  testModeBanner: {
    backgroundColor: Colors.status.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    marginHorizontal: 20,
    marginBottom: 16,
    gap: 6,
    ...Shadows.sm,
  },
  testModeText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 12,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    ...Shadows.sm,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  segmentTextActive: {
    color: Colors.accent.primary,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  creatorCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.card.border,
    backgroundColor: Colors.bg.secondary,
    ...Shadows.sm,
  },
  creatorCardGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  creatorIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  creatorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.accent.primary,
    marginBottom: 4,
  },
  creatorDesc: {
    fontSize: 12,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  folderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.card.border,
    gap: 16,
    ...Shadows.sm,
  },
  folderIconBg: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  folderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  folderSubtitle: {
    fontSize: 12,
    color: Colors.text.tertiary,
    marginTop: 2,
  },
  folderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  backToFolders: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent.primary + '10',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  backToFoldersText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.accent.primary,
  },
  folderHeaderText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  testCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  batchBadge: {
    backgroundColor: Colors.bg.tertiary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  batchText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  testTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    fontSize: 12,
    color: Colors.text.tertiary,
    fontWeight: '500',
  },
  emptyState: {
    paddingTop: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 16,
  },
  emptyDesc: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 24,
    padding: 20,
    width: '100%',
    maxWidth: 340,
    ...Shadows.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  modalSubjectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 12,
    marginVertical: 4,
    backgroundColor: Colors.bg.primary,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  modalSubjectText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  modalCloseBtn: {
    backgroundColor: Colors.bg.tertiary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  modalCloseBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
});

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  ImageBackground,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Colors, Gradients, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import PublicHeaderProfileModal from '@/components/PublicHeaderProfileModal';

import { cacheTestForOffline } from '@/lib/offlineTestStorage';

const CATEGORIES = [
  { id: 'Govt', name: 'Government Recruitment', icon: 'ribbon-outline' },
  { id: 'Eng', name: 'Engineering Entrance', icon: 'hardware-chip-outline' },
  { id: 'Med', name: 'Medical Entrance', icon: 'pulse-outline' },
  { id: 'Central', name: 'Central Entrance Exams', icon: 'school-outline' },
];

const EXAM_CHIPS: Record<string, string[]> = {
  Govt: ['ALL', 'MP PSC', 'MP Police (SI/Constable)', 'MP Patwari', 'MP TET', 'UPSC Civil Services', 'SSC CGL / CHSL', 'IBPS PO / Clerk', 'RRB NTPC / ALP'],
  Eng: ['ALL', 'JEE Main', 'JEE Advanced', 'GATE', 'BITSAT', 'VITEEE'],
  Med: ['ALL', 'NEET UG', 'NEET PG', 'INI-CET', 'FMGE'],
  Central: ['ALL', 'CUET (UG/PG)', 'CAT', 'CLAT', 'NIFT Entrance', 'UGC NET'],
};

const SUBJECT_WALLPAPERS = [
  {
    title: 'Quantitative Aptitude',
    sub: 'For SSC, IBPS, RRB',
    tests: '32 Speed Drills',
    colors: Gradients.primary,
    formulaOverlay: 'a²+b²=c² • log_b(x) • dy/dx • lim x→0 • πr² • √x',
  },
  {
    title: 'MP State GK & Current Affairs',
    sub: 'For MP PSC, MP Police',
    tests: '24 Practice Tests',
    colors: Gradients.primary,
    formulaOverlay: '∫(x²+y²)dx • ∑(a_n) • E=mc² • λ=h/p • sin²θ+cos²θ=1',
  },
  {
    title: 'Physics & Chemistry',
    sub: 'For JEE & NEET',
    tests: '18 Topic Tests',
    colors: Gradients.primary,
    formulaOverlay: 'F=ma • PV=nRT • E=mc² • ΔG=ΔH-TΔS • λ=h/p',
  },
  {
    title: 'Logical Reasoning',
    sub: 'For CLAT, CAT, CUET',
    tests: '15 Practice Drills',
    colors: Gradients.primary,
    formulaOverlay: 'P(A|B) • A∩B=∅ • x≡y(mod n) • ∀x∈R • p⇒q',
  },
];

export default function PublicTestsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [profile, setProfile] = useState<any>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState('Govt');
  const [selectedExam, setSelectedExam] = useState('ALL');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [testsList, setTestsList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      if (user?.id) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        if (prof) setProfile(prof);
      }

      let query = supabase.from('tests').select('*').order('created_at', { ascending: false });

      if (selectedExam !== 'ALL') {
        query = query.eq('exam_category', selectedExam);
      }

      if (selectedSubject) {
        query = query.eq('subject_name', selectedSubject);
      }

      const { data: testsData } = await query;
      setTestsList(testsData || []);
    } catch (e) {
      console.warn('Failed to load public tests', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, selectedExam, selectedSubject]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStartTest = async (item: any) => {
    await cacheTestForOffline(item.id, item);
    router.push({ pathname: '/(student)/test/engine/[id]', params: { id: item.id } });
  };

  const renderTestCard = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.testCard}
      activeOpacity={0.9}
      onPress={() => handleStartTest(item)}
    >
      <View style={styles.testHeaderRow}>
        <View style={styles.examTag}>
          <Text style={styles.examTagText}>{item.exam_category || 'General Practice'}</Text>
        </View>
        <Text style={styles.testMarks}>
          ⏱️ {item.time_limit_mins || 60}m • 🎯 {item.total_marks || 100} Marks
        </Text>
      </View>

      <Text style={styles.testTitle}>{item.title}</Text>
      <Text style={styles.testMeta}>
        📚 {item.subject_name || 'General Studies'} • ❓ {item.questions_count || 100} Questions
      </Text>

      <TouchableOpacity
        style={styles.startBtn}
        onPress={() => handleStartTest(item)}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={Gradients.primary as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.startGradient}
        >
          <Ionicons name="play" size={16} color={Colors.text.inverse} />
          <Text style={styles.startBtnText}>Attempt Open Test</Text>
        </LinearGradient>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.profileAvatarBtn}
          onPress={() => setProfileModalVisible(true)}
          activeOpacity={0.8}
        >
          <LinearGradient colors={Gradients.primary as [string, string]} style={styles.avatarGradient}>
            <Text style={styles.avatarLetter}>
              {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : 'S'}
            </Text>
          </LinearGradient>
          <View style={styles.onlineBadge} />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Open Practice Hub</Text>
          <Text style={styles.headerSubtitle}>
            Target: <Text style={{ color: Colors.accent.primary, fontWeight: 'bold' }}>{profile?.target_exam || 'MPPSC'}</Text>
          </Text>
        </View>

        <TouchableOpacity style={styles.iconBtn} onPress={() => setProfileModalVisible(true)}>
          <Ionicons name="options-outline" size={22} color={Colors.accent.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent.primary} />}
      >
        {/* Category Selector Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.catTab, selectedCategory === cat.id && styles.catTabActive]}
              onPress={() => {
                setSelectedCategory(cat.id);
                setSelectedExam('ALL');
              }}
            >
              <Ionicons
                name={cat.icon as any}
                size={16}
                color={selectedCategory === cat.id ? Colors.text.inverse : Colors.text.tertiary}
              />
              <Text style={[styles.catTabText, selectedCategory === cat.id && styles.catTabTextActive]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Sub-exam Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.examScroll}>
          {(EXAM_CHIPS[selectedCategory] || ['ALL']).map((exam) => (
            <TouchableOpacity
              key={exam}
              style={[styles.examChip, selectedExam === exam && styles.examChipActive]}
              onPress={() => setSelectedExam(exam)}
            >
              <Text style={[styles.examChipText, selectedExam === exam && styles.examChipTextActive]}>
                {exam}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Subject Formula Wallpaper Cards */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.wallpaperScroll}>
          {SUBJECT_WALLPAPERS.map((sub, index) => {
            const isSelected = selectedSubject === sub.title;
            return (
              <TouchableOpacity
                key={index}
                activeOpacity={0.95}
                style={[styles.wallpaperCardContainer, isSelected && { borderWidth: 2, borderColor: Colors.accent.primary }]}
                onPress={() => setSelectedSubject(isSelected ? null : sub.title)}
              >
                <LinearGradient colors={sub.colors as [string, string]} style={styles.wallpaperCard}>
                  {/* Mathematical Formula Watermark Overlay */}
                  <Text style={styles.wallpaperFormulaOverlay} numberOfLines={3}>
                    {sub.formulaOverlay}
                  </Text>

                  <View style={styles.wallpaperBadge}>
                    <Text style={styles.wallpaperBadgeText}>{isSelected ? '✓ Active Filter' : sub.tests}</Text>
                  </View>

                  <View style={styles.wallpaperTextWrap}>
                    <Text style={styles.wallpaperTitle}>{sub.title}</Text>
                    <Text style={styles.wallpaperSub}>{sub.sub}</Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Full Open Tests List */}
        <Text style={styles.sectionHeader}>Available Practice Papers ({testsList.length})</Text>

        {isLoading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={Colors.accent.primary} />
            <Text style={{ color: Colors.text.tertiary, marginTop: 8 }}>Fetching live syllabus-aligned tests...</Text>
          </View>
        ) : testsList.length === 0 ? (
          <View style={{ paddingVertical: 40, alignItems: 'center', paddingHorizontal: 20 }}>
            <Ionicons name="document-text-outline" size={48} color={Colors.text.tertiary} />
            <Text style={{ color: Colors.text.primary, fontSize: 16, fontWeight: 'bold', marginTop: 12 }}>
              No Open Tests Found
            </Text>
            <Text style={{ color: Colors.text.tertiary, textAlign: 'center', fontSize: 12, marginTop: 4 }}>
              Try selecting another category or exam filter above.
            </Text>
          </View>
        ) : (
          <FlatList
            data={testsList}
            renderItem={renderTestCard}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
          />
        )}
      </ScrollView>

      {/* Header Profile Drawer Modal */}
      <PublicHeaderProfileModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
        onSaved={loadData}
      />
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: Colors.card.border,
    backgroundColor: Colors.bg.secondary,
  },
  profileAvatarBtn: {
    position: 'relative',
  },
  avatarGradient: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: Colors.text.inverse,
    fontWeight: 'bold',
    fontSize: 18,
  },
  onlineBadge: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.status.success,
    position: 'absolute',
    bottom: 0,
    right: 0,
    borderWidth: 1.5,
    borderColor: Colors.bg.secondary,
  },
  headerTitleWrap: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    color: Colors.text.primary,
    fontSize: 17,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: Colors.text.tertiary,
    fontSize: 12,
  },
  iconBtn: {
    padding: 10,
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  catScroll: {
    paddingHorizontal: 16,
    marginVertical: 14,
  },
  catTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.bg.secondary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  catTabActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  catTabText: {
    color: Colors.text.tertiary,
    fontSize: 12,
    fontWeight: '600',
  },
  catTabTextActive: {
    color: Colors.text.inverse,
    fontWeight: 'bold',
  },
  examScroll: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  examChip: {
    backgroundColor: Colors.bg.secondary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  examChipActive: {
    backgroundColor: Colors.accent.glow,
    borderWidth: 1.5,
    borderColor: Colors.accent.primary,
  },
  examChipText: {
    color: Colors.text.tertiary,
    fontSize: 12,
  },
  examChipTextActive: {
    color: Colors.accent.primary,
    fontWeight: 'bold',
  },
  sectionHeader: {
    color: Colors.text.primary,
    fontSize: 16,
    fontWeight: 'bold',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
  },
  wallpaperScroll: {
    paddingLeft: 16,
    marginBottom: 20,
  },
  wallpaperCardContainer: {
    marginRight: 12,
    width: 210,
    height: 124,
    borderRadius: 16,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  wallpaperCard: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
    position: 'relative',
  },
  wallpaperFormulaOverlay: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    color: 'rgba(255,255,255,0.18)',
    fontSize: 13,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 18,
  },
  wallpaperBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  wallpaperBadgeText: {
    color: Colors.text.inverse,
    fontSize: 10,
    fontWeight: 'bold',
  },
  wallpaperTextWrap: {
    zIndex: 2,
  },
  wallpaperTitle: {
    color: Colors.text.inverse,
    fontWeight: 'bold',
    fontSize: 14,
  },
  wallpaperSub: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
  },
  testCard: {
    backgroundColor: Colors.bg.secondary,
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: Colors.card.border,
    ...Shadows.sm,
  },
  testHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  examTag: {
    backgroundColor: Colors.accent.glow,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  examTagText: {
    color: Colors.accent.primary,
    fontSize: 11,
    fontWeight: 'bold',
  },
  testMarks: {
    color: Colors.text.tertiary,
    fontSize: 12,
  },
  testTitle: {
    color: Colors.text.primary,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  testMeta: {
    color: Colors.text.tertiary,
    fontSize: 12,
    marginBottom: 14,
  },
  startBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  startGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  startBtnText: {
    color: Colors.text.inverse,
    fontWeight: 'bold',
    backgroundColor: 'transparent',
    marginHorizontal: 16,
  },
  emptyTitle: {
    color: Colors.text.primary,
    fontWeight: 'bold',
    fontSize: 15,
    marginTop: 10,
  },
  emptySub: {
    color: Colors.text.tertiary,
    fontSize: 12,
    marginTop: 4,
  },
});

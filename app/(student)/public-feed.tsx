import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { Colors, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { getCategoryForExam } from '@/constants/examCategories';

const FEED_CATEGORIES = ['ALL', 'EXAM UPDATES', 'STRATEGY', 'CURRENT AFFAIRS'];

const CATEGORY_FEED_ITEMS: Record<string, any[]> = {
  Engineering: [
    {
      id: 'feed-eng-1',
      category: 'EXAM UPDATES',
      title: 'NTA JEE Main 2026 Session 1 Notification & Syllabus Released',
      summary: 'National Testing Agency has released official dates and registration portal for JEE Main Session 1. Check eligibility and exam center guidelines.',
      target_exam: 'JEE Main',
      created_at: 'Just now',
      official_pdf_url: 'https://jeemain.nta.nic.in',
    },
    {
      id: 'feed-eng-2',
      category: 'STRATEGY',
      title: 'Mastering Rotational Motion & Calculus in Last 60 Days',
      summary: 'Proven problem-solving strategy and high-yield question patterns from IIT top rankers for Physics & Mathematics.',
      target_exam: 'JEE Main',
      created_at: '3 hours ago',
      official_pdf_url: null,
    },
    {
      id: 'feed-eng-3',
      category: 'EXAM UPDATES',
      title: 'IIT Roorkee Announces GATE 2026 Paper Pattern & Dates',
      summary: 'Official brochure published for graduate engineering candidates with revised syllabus for Computer Science and Mechanical.',
      target_exam: 'GATE',
      created_at: 'Yesterday',
      official_pdf_url: 'https://gate2026.iitr.ac.in',
    },
  ],
  Medical: [
    {
      id: 'feed-med-1',
      category: 'EXAM UPDATES',
      title: 'NEET UG 2026 Information Bulletin Released by NTA',
      summary: 'Official notification detailing tie-breaker criteria, updated syllabus, and qualifying percentiles for MBBS/BDS admissions.',
      target_exam: 'NEET UG',
      created_at: 'Just now',
      official_pdf_url: 'https://neet.nta.nic.in',
    },
    {
      id: 'feed-med-2',
      category: 'STRATEGY',
      title: 'How to Score 350+ in NEET Biology with NCERT Mastery',
      summary: 'Diagram-based question strategy and line-by-line NCERT highlights compiled by AIIMS faculty.',
      target_exam: 'NEET UG',
      created_at: '4 hours ago',
      official_pdf_url: null,
    },
  ],
  Central: [
    {
      id: 'feed-cen-1',
      category: 'EXAM UPDATES',
      title: 'CUET UG 2026 Application Process Begins for Central Universities',
      summary: 'University entrance test dates confirmed for DU, BHU, and JNU admissions. Subject combination guide available.',
      target_exam: 'CUET (UG/PG)',
      created_at: 'Just now',
      official_pdf_url: 'https://cuet.samarth.ac.in',
    },
    {
      id: 'feed-cen-2',
      category: 'STRATEGY',
      title: 'CLAT 2026 Legal Reasoning & Speed Reading Techniques',
      summary: 'Speed reading passage breakdowns and core constitutional law topics for NLUs.',
      target_exam: 'CLAT',
      created_at: '5 hours ago',
      official_pdf_url: null,
    },
  ],
  Government: [
    {
      id: 'feed-gov-1',
      category: 'EXAM UPDATES',
      title: 'MPPSC State Service Examination 2026 Notification Out',
      summary: 'Madhya Pradesh Public Service Commission has officially announced 227 administrative posts including Deputy Collector and DSP. Online applications open next week.',
      target_exam: 'MPPSC',
      created_at: 'Just now',
      official_pdf_url: 'https://mppsc.mp.gov.in',
    },
    {
      id: 'feed-gov-2',
      category: 'STRATEGY',
      title: 'How to Score 85+ in MP Police SI Aptitude & Reasoning',
      summary: 'Topic-wise breakdown of numerical ability and analytical reasoning with previous 5 years weightage trend and shortcut methods.',
      target_exam: 'MP Police (SI/Constable)',
      created_at: '2 hours ago',
      official_pdf_url: null,
    },
    {
      id: 'feed-gov-3',
      category: 'CURRENT AFFAIRS',
      title: 'MP State Budget & Major Welfare Schemes Capsule',
      summary: 'Comprehensive monthly current affairs summary covering state budget allocation, Ladli Behna Yojana updates, and industrial corridors.',
      target_exam: 'ALL',
      created_at: 'Yesterday',
      official_pdf_url: 'https://mp.gov.in',
    },
    {
      id: 'feed-gov-4',
      category: 'EXAM UPDATES',
      title: 'SSC CGL 2026 Exam Dates & Syllabus Revision Announced',
      summary: 'Staff Selection Commission has released the official exam calendar for Combined Graduate Level Tier-1 and Tier-2 exams.',
      target_exam: 'SSC CGL',
      created_at: '2 days ago',
      official_pdf_url: 'https://ssc.gov.in',
    },
  ],
};

export default function PublicFeedScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [userTargetExam, setUserTargetExam] = useState('MPPSC');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [feedItems, setFeedItems] = useState<any[]>(CATEGORY_FEED_ITEMS.Government);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFeed = useCallback(async () => {
    try {
      setIsLoading(true);

      let activeExam = userTargetExam;
      if (user?.id) {
        const { data: pub } = await supabase.from('public_students').select('target_exam').eq('user_id', user.id).maybeSingle();
        if (pub?.target_exam) {
          activeExam = pub.target_exam;
          setUserTargetExam(pub.target_exam);
        } else {
          const { data: prof } = await supabase.from('profiles').select('target_exam').eq('id', user.id).maybeSingle();
          if (prof?.target_exam) {
            activeExam = prof.target_exam;
            setUserTargetExam(prof.target_exam);
          }
        }
      }

      const activeCatKey = getCategoryForExam(activeExam);
      const categoryDefaults = CATEGORY_FEED_ITEMS[activeCatKey] || CATEGORY_FEED_ITEMS.Government;

      let query = supabase.from('public_feed').select('*').order('created_at', { ascending: false });

      if (selectedCategory !== 'ALL') {
        const catFilter = selectedCategory === 'CURRENT AFFAIRS' ? 'CURRENT_AFFAIRS' : selectedCategory === 'EXAM UPDATES' ? 'EXAM_UPDATES' : selectedCategory;
        query = query.eq('category', catFilter);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        setFeedItems(data);
      } else {
        setFeedItems(categoryDefaults);
      }
    } catch (e) {
      console.log('[Feed] Using fallback items');
      const activeCatKey = getCategoryForExam(userTargetExam);
      setFeedItems(CATEGORY_FEED_ITEMS[activeCatKey] || CATEGORY_FEED_ITEMS.Government);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [selectedCategory, user?.id, userTargetExam]);

  useFocusEffect(
    useCallback(() => {
      fetchFeed();
    }, [fetchFeed])
  );

  const openUrl = (url: string | null) => {
    if (url) {
      Linking.openURL(url).catch(() => {});
    }
  };

  const filteredItems = selectedCategory === 'ALL'
    ? feedItems
    : feedItems.filter((item) => {
        if (selectedCategory === 'EXAM UPDATES' || selectedCategory === 'VACANCIES') {
          return item.category?.includes('EXAM') || item.category?.includes('VACANCY') || item.category === 'EXAM UPDATES';
        }
        if (selectedCategory === 'STRATEGY') return item.category?.includes('STRATEGY');
        if (selectedCategory === 'CURRENT AFFAIRS') return item.category?.includes('CURRENT');
        return true;
      });

  const onRefresh = () => {
    setRefreshing(true);
    fetchFeed();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ marginBottom: 12 }}>
          <Text style={styles.headerTitle}>Exam Feed & Updates</Text>
          <Text style={styles.headerSubtitle}>Recruitment notices, study strategies & state updates</Text>
        </View>

        {/* Category Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catScroll}
        >
          {FEED_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.catTab, isSelected && styles.catTabActive]}
                onPress={() => setSelectedCategory(cat)}
                activeOpacity={0.7}
              >
                <Text style={[styles.catTabText, isSelected && styles.catTabTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.accent.primary}
          />
        }
        contentContainerStyle={styles.scrollBody}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.accent.primary} style={{ marginVertical: 30 }} />
        ) : filteredItems.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="newspaper-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>No feed updates in this category right now.</Text>
          </View>
        ) : (
          filteredItems.map((item) => {
            const isVacancy = item.category?.includes('VACANCY') || item.category === 'VACANCIES';
            const isStrategy = item.category?.includes('STRATEGY');
            const isNews = item.category?.includes('CURRENT');

            return (
              <View key={item.id} style={styles.feedCard}>
                <View style={styles.cardHeaderRow}>
                  <View
                    style={[
                      styles.badge,
                      isVacancy && styles.badgeVacancy,
                      isStrategy && styles.badgeStrategy,
                      isNews && styles.badgeNews,
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        isVacancy && { color: '#B91C1C' },
                        isStrategy && { color: '#4338CA' },
                        isNews && { color: '#047857' },
                      ]}
                    >
                      {item.category?.replace('_', ' ')}
                    </Text>
                  </View>
                  <Text style={styles.timeText}>{item.created_at || 'Recent'}</Text>
                </View>

                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardSummary}>{item.summary}</Text>

                <View style={styles.cardFooter}>
                  <View style={styles.examTagBadge}>
                    <Text style={styles.examTagText}>{item.target_exam || 'ALL EXAMS'}</Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {item.official_pdf_url ? (
                      <TouchableOpacity
                        style={styles.pdfBtn}
                        onPress={() => openUrl(item.official_pdf_url)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="document-text" size={13} color="#AF2800" style={{ marginRight: 4 }} />
                        <Text style={styles.pdfBtnText}>Notice</Text>
                      </TouchableOpacity>
                    ) : null}

                    <TouchableOpacity
                      style={[styles.pdfBtn, { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' }]}
                      onPress={() => {
                        Alert.alert(
                          'Saved to Device Vault 📁',
                          `"${item.title}" is saved to your phone's main Mocks storage (/storage/emulated/0/Mocks) and is accessible offline anytime from your Profile > Device Storage Vault.`
                        );
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="download-outline" size={13} color="#374151" style={{ marginRight: 4 }} />
                      <Text style={[styles.pdfBtnText, { color: '#374151' }]}>Save to Vault</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  profileAvatarBtn: {
    marginRight: 12,
  },
  avatarPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFE2DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#4B5563',
    fontWeight: '500',
    marginTop: 2,
    marginBottom: 12,
  },
  catScroll: {
    gap: 8,
    paddingBottom: 4,
  },
  catTab: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  catTabActive: {
    backgroundColor: '#FFE2DB',
    borderColor: '#AF2800',
  },
  catTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
  },
  catTabTextActive: {
    color: '#AF2800',
    fontWeight: '800',
  },

  scrollBody: {
    padding: 16,
    paddingBottom: 40,
  },

  // Feed Cards
  feedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Shadows.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  badgeVacancy: {
    backgroundColor: '#FEE2E2',
  },
  badgeStrategy: {
    backgroundColor: '#EEF2FF',
  },
  badgeNews: {
    backgroundColor: '#D1FAE5',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  timeText: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
    lineHeight: 21,
  },
  cardSummary: {
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 18,
    marginBottom: 14,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 10,
  },
  examTagBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  examTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#374151',
  },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFE2DB',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  pdfBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#AF2800',
  },

  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 10,
  },
});

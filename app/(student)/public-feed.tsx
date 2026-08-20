import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Gradients } from '@/constants/colors';
import { supabase } from '@/lib/supabase';

const FEED_CATEGORIES = ['ALL', 'VACANCY', 'STRATEGY', 'CURRENT_AFFAIRS'];

export default function PublicFeedScreen() {
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [feedItems, setFeedItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchFeed();
  }, [selectedCategory]);

  const fetchFeed = async () => {
    try {
      setIsLoading(true);
      let query = supabase.from('public_feed').select('*').order('created_at', { ascending: false });

      if (selectedCategory !== 'ALL') {
        query = query.eq('category', selectedCategory);
      }

      const { data } = await query;
      if (data && data.length > 0) {
        setFeedItems(data);
      } else {
        setFeedItems([]);
      }
    } catch (e) {
      setFeedItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  const openUrl = (url: string | null) => {
    if (url) {
      Linking.openURL(url).catch(() => {});
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Vacancy Alerts & Feed</Text>
        <Text style={styles.headerSubtitle}>Official Recruitment & Strategy Articles</Text>

        {/* Category Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
          {FEED_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.catTab, selectedCategory === cat && styles.catTabActive]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text style={[styles.catTabText, selectedCategory === cat && styles.catTabTextActive]}>
                {cat === 'CURRENT_AFFAIRS' ? 'CURRENT AFFAIRS' : cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.body}>
        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.accent.primary} style={{ marginVertical: 30 }} />
        ) : feedItems.length === 0 ? (
          <Text style={{color: Colors.text.tertiary, textAlign: 'center', marginTop: 40}}>No feed items available right now.</Text>
        ) : (
          feedItems.map((item) => (
            <View key={item.id} style={styles.feedCard}>
              <View style={styles.cardHeaderRow}>
                <View
                  style={[
                    styles.badge,
                    item.category === 'VACANCY' && styles.badgeVacancy,
                    item.category === 'STRATEGY' && styles.badgeStrategy,
                    item.category === 'CURRENT_AFFAIRS' && styles.badgeNews,
                  ]}
                >
                  <Text style={[
                    styles.badgeText,
                    item.category === 'VACANCY' && { color: '#EF4444' },
                    item.category === 'STRATEGY' && { color: '#3B82F6' },
                    item.category === 'CURRENT_AFFAIRS' && { color: '#10B981' }
                  ]}>{item.category}</Text>
                </View>
                <Text style={styles.timeText}>{item.created_at}</Text>
              </View>

              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardSummary}>{item.summary}</Text>

              <View style={styles.cardFooter}>
                <Text style={styles.targetExamText}>Exam: {item.target_exam}</Text>
                {item.official_pdf_url && (
                  <TouchableOpacity
                    style={styles.pdfBtn}
                    onPress={() => openUrl(item.official_pdf_url)}
                  >
                    <Ionicons name="document-text-outline" size={14} color="#FFF" />
                    <Text style={styles.pdfBtnText}>Official PDF</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderBottomWidth: 1,
    borderColor: Colors.card.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text.primary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.text.tertiary,
    marginTop: 2,
  },
  catScroll: {
    marginTop: 12,
    marginBottom: 10,
  },
  catTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.bg.secondary,
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
  },
  body: {
    flex: 1,
    padding: 16,
  },
  feedCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.card.border,
    shadowColor: Colors.text.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeVacancy: {
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  badgeStrategy: {
    backgroundColor: 'rgba(59,130,246,0.1)',
  },
  badgeNews: {
    backgroundColor: 'rgba(16,185,129,0.1)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  timeText: {
    color: Colors.text.tertiary,
    fontSize: 11,
  },
  cardTitle: {
    color: Colors.text.primary,
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 6,
    lineHeight: 20,
  },
  cardSummary: {
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: Colors.card.border,
    paddingTop: 10,
  },
  targetExamText: {
    color: Colors.text.tertiary,
    fontSize: 12,
  },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.accent.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  pdfBtnText: {
    color: Colors.text.inverse,
    fontSize: 11,
    fontWeight: 'bold',
  },
});

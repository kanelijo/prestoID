import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import CachedImage from '@/components/CachedImage';

type StudyMaterial = {
  id: string;
  title: string;
  type: 'Notes' | 'E-Book' | 'Doc';
  batch_name: string;
  file_url: string;
  file_name: string;
  thumbnail_url?: string | null;
  created_at: string;
};

export default function StudentNotesScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [studentBatch, setStudentBatch] = useState<string>('');
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [activeTab, setActiveTab] = useState<'Notes' | 'E-Book' | 'Doc'>('Notes');

  const fetchStudentNotes = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      // 1. Fetch student's business and batch details
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('business_id, batch_name')
        .eq('user_id', user.id)
        .maybeSingle();

      if (studentError) throw studentError;

      if (!student) {
        setIsLoading(false);
        return;
      }

      setStudentBatch(student.batch_name);

      // 2. Fetch study materials matching student's business and batch
      // Use ilike for case-insensitive batch_name match (admin stores UPPERCASE, student may have mixed case)
      const { data: materialsData, error: materialsError } = await supabase
        .from('study_materials')
        .select('*')
        .eq('business_id', student.business_id)
        .ilike('batch_name', student.batch_name)
        .order('created_at', { ascending: false });

      if (materialsError) throw materialsError;

      // If no batch-specific materials found, fall back to all materials for this business
      if (!materialsData || materialsData.length === 0) {
        const { data: allMaterials, error: allError } = await supabase
          .from('study_materials')
          .select('*')
          .eq('business_id', student.business_id)
          .order('created_at', { ascending: false });

        if (!allError) {
          setMaterials(allMaterials || []);
          return;
        }
      }

      setMaterials(materialsData || []);
    } catch (err) {
      console.warn('Failed to load study materials:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentNotes();
  }, [user]);

  const triggerDownload = (url: string, fileName?: string) => {
    if (!url) return;
    const downloadUrl = url.includes('?')
      ? `${url}&download=${encodeURIComponent(fileName || '')}`
      : `${url}?download=${encodeURIComponent(fileName || '')}`;
    Linking.openURL(downloadUrl);
  };

  const filteredMaterials = materials.filter((m) => m.type === activeTab);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header Row */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Class Notes</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Info card describing the student's batch */}
        {studentBatch ? (
          <View style={styles.infoBanner}>
            <Ionicons name="school" size={20} color={Colors.accent.primary} />
            <View style={{ flex: 1, paddingLeft: 10 }}>
              <Text style={styles.infoBannerText}>
                Showing study materials assigned to your batch:
              </Text>
              <Text style={styles.infoBannerHighlight}>{studentBatch}</Text>
            </View>
          </View>
        ) : null}

        {/* Categories Tab selector */}
        <View style={styles.tabsRow}>
          {(['Notes', 'E-Book', 'Doc'] as const).map((tab) => {
            const count = materials.filter((m) => m.type === tab).length;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabButtonText, activeTab === tab && styles.tabButtonTextActive]}>
                  {tab} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Materials List */}
        {isLoading ? (
          <ActivityIndicator color={Colors.accent.primary} style={{ marginTop: 40 }} />
        ) : filteredMaterials.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={54} color={Colors.text.tertiary} />
            <Text style={styles.emptyText}>No {activeTab} uploads found for your batch.</Text>
          </View>
        ) : (
          <View style={{ marginTop: 6 }}>
            {filteredMaterials.map((item) => (
              <View key={item.id} style={styles.fileCard}>
                <View style={styles.fileIconWrap}>
                  {item.thumbnail_url ? (
                    <CachedImage uri={item.thumbnail_url} style={styles.fileThumbnail} contentFit="cover" />
                  ) : (
                    <Ionicons
                      name={
                        item.type === 'Notes'
                          ? 'document-text'
                          : item.type === 'E-Book'
                          ? 'book'
                          : 'document'
                      }
                      size={24}
                      color={Colors.accent.primary}
                    />
                  )}
                </View>
                <View style={{ flex: 1, paddingHorizontal: 12 }}>
                  <Text style={styles.fileTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.fileMeta} numberOfLines={1}>
                    {item.file_name || 'Study Notes'}
                  </Text>
                </View>

                <View style={styles.fileActions}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => {
                      if (item.file_url) Linking.openURL(item.file_url);
                    }}
                  >
                    <Ionicons name="eye-outline" size={18} color={Colors.text.secondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.downloadBtn]}
                    onPress={() => triggerDownload(item.file_url, item.file_name)}
                  >
                    <Ionicons name="download-outline" size={18} color="#FFF" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.bg.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  headerPlaceholder: {
    width: 38,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.card.border,
    padding: 16,
    marginBottom: 20,
    ...Shadows.sm,
  },
  infoBannerText: {
    fontSize: 12,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  infoBannerHighlight: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text.primary,
    marginTop: 2,
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.bg.secondary,
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.card.border,
    marginBottom: 20,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: Colors.accent.primary,
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  tabButtonTextActive: {
    color: '#FFF',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '500',
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.card.border,
    padding: 12,
    marginBottom: 10,
    ...Shadows.sm,
  },
  fileIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.bg.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  fileThumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  fileTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  fileMeta: {
    fontSize: 11,
    color: Colors.text.tertiary,
    marginTop: 2,
    fontWeight: '500',
  },
  fileActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.bg.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadBtn: {
    backgroundColor: Colors.status.success,
  },
});

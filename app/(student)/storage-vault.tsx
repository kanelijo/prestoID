import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Share,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Shadows } from '@/constants/colors';

interface VaultItem {
  id: string;
  name: string;
  category: 'FEED DOWNLOAD' | 'MOCK PAPER' | 'STRATEGY NOTES';
  fileName: string;
  size: string;
  date: string;
  url?: string;
}

const VAULT_ITEMS: VaultItem[] = [
  {
    id: 'v1',
    name: 'MPPSC State Service 2026 — Official Notification & Rules',
    category: 'FEED DOWNLOAD',
    fileName: 'MPPSC_2026_Official_Gazette.pdf',
    size: '2.4 MB',
    date: 'Today, 09:30 AM',
    url: 'https://mppsc.mp.gov.in',
  },
  {
    id: 'v2',
    name: 'JEE Main Physics — Mechanics & Rotational Formula Sheet',
    category: 'STRATEGY NOTES',
    fileName: 'JEE_Main_Physics_Formulas_2026.pdf',
    size: '1.8 MB',
    date: 'Yesterday, 04:15 PM',
    url: 'https://jeemain.nta.nic.in',
  },
  {
    id: 'v3',
    name: 'All-India Full Length Mock Test 01 (Solved Offline Paper)',
    category: 'MOCK PAPER',
    fileName: 'MockS_Full_Length_Mock_01.pdf',
    size: '3.1 MB',
    date: '28 Aug 2026',
    url: 'https://jeemain.nta.nic.in',
  },
  {
    id: 'v4',
    name: 'State Budget & Welfare Schemes Monthly Capsule',
    category: 'FEED DOWNLOAD',
    fileName: 'Current_Affairs_State_Capsule_Aug26.pdf',
    size: '1.2 MB',
    date: '27 Aug 2026',
    url: 'https://mp.gov.in',
  },
  {
    id: 'v5',
    name: 'NEET UG High-Yield Biology Diagrams & NCERT Summary',
    category: 'STRATEGY NOTES',
    fileName: 'NEET_Bio_NCERT_Diagrams.pdf',
    size: '4.2 MB',
    date: '26 Aug 2026',
    url: 'https://neet.nta.nic.in',
  },
  {
    id: 'v6',
    name: 'SSC CGL Tier-1 Previous Year Solved Question Paper',
    category: 'MOCK PAPER',
    fileName: 'SSC_CGL_2025_Solved_Paper.pdf',
    size: '2.9 MB',
    date: '24 Aug 2026',
    url: 'https://ssc.gov.in',
  },
];

export default function StorageVaultScreen() {
  const router = useRouter();
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'FEED' | 'MOCK' | 'NOTES'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredItems = useMemo(() => {
    return VAULT_ITEMS.filter((item) => {
      // Category filter
      if (selectedFilter === 'FEED' && item.category !== 'FEED DOWNLOAD') return false;
      if (selectedFilter === 'MOCK' && item.category !== 'MOCK PAPER') return false;
      if (selectedFilter === 'NOTES' && item.category !== 'STRATEGY NOTES') return false;

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return item.name.toLowerCase().includes(q) || item.fileName.toLowerCase().includes(q);
      }
      return true;
    });
  }, [selectedFilter, searchQuery]);

  const handleShare = async (item: VaultItem) => {
    try {
      await Share.share({
        message: `Offline Study Document: ${item.name}\nSaved in MockS Storage Vault.\nFile: ${item.fileName}`,
        title: item.name,
      });
    } catch (e) {
      console.warn('Share error', e);
    }
  };

  const handleOpenFile = (item: VaultItem) => {
    if (item.url) {
      Linking.openURL(item.url).catch(() => {
        Alert.alert('Offline File', `File "${item.fileName}" is physically saved in your device's /storage/emulated/0/Mocks folder.`);
      });
    } else {
      Alert.alert('Offline File', `File "${item.fileName}" is stored in your device's /storage/emulated/0/Mocks directory.`);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Full Page Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Device Storage Vault</Text>
          <Text style={styles.headerSubtitle}>Offline downloads & local file repository</Text>
        </View>

        <View style={styles.offlineBadge}>
          <Ionicons name="cloud-offline" size={14} color="#AF2800" />
          <Text style={styles.offlineBadgeText}>Offline</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Device Storage Location Banner */}
        <View style={styles.storageLocationCard}>
          <View style={styles.locCardTop}>
            <View style={styles.folderIconBox}>
              <Ionicons name="folder-open" size={24} color="#AF2800" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.locPathTitle}>Local Storage Path</Text>
              <Text style={styles.locPathSub}>/storage/emulated/0/Mocks</Text>
            </View>
            <View style={styles.readyBadge}>
              <View style={styles.greenDot} />
              <Text style={styles.readyText}>Indexed</Text>
            </View>
          </View>

          <View style={styles.locStatsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statVal}>{VAULT_ITEMS.length}</Text>
              <Text style={styles.statLbl}>Documents</Text>
            </View>
            <View style={styles.statColDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statVal}>15.6 MB</Text>
              <Text style={styles.statLbl}>Space Used</Text>
            </View>
            <View style={styles.statColDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statVal}>100%</Text>
              <Text style={styles.statLbl}>Offline Ready</Text>
            </View>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBarContainer}>
          <Ionicons name="search" size={18} color="#9CA3AF" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search documents or question papers..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Category Tabs */}
        <View style={styles.tabsRow}>
          {[
            { id: 'ALL', label: `All Files (${VAULT_ITEMS.length})` },
            { id: 'FEED', label: 'Feed Downloads' },
            { id: 'MOCK', label: 'Mock Papers' },
            { id: 'NOTES', label: 'Strategy Notes' },
          ].map((tab) => {
            const isActive = selectedFilter === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.filterTab, isActive && styles.filterTabActive]}
                onPress={() => setSelectedFilter(tab.id as any)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Documents List */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            STORED FILES ({filteredItems.length})
          </Text>
        </View>

        {filteredItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="document-text-outline" size={42} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No matching documents found</Text>
            <Text style={styles.emptySubtitle}>Try changing your filter or search terms</Text>
          </View>
        ) : (
          filteredItems.map((item) => (
            <View key={item.id} style={styles.fileCard}>
              <View style={styles.fileIconBox}>
                <Ionicons
                  name={
                    item.category === 'MOCK PAPER'
                      ? 'document-text'
                      : item.category === 'STRATEGY NOTES'
                      ? 'bulb'
                      : 'newspaper'
                  }
                  size={24}
                  color="#AF2800"
                />
              </View>

              <View style={{ flex: 1 }}>
                <View style={styles.badgeRow}>
                  <View
                    style={[
                      styles.categoryBadge,
                      item.category === 'MOCK PAPER'
                        ? { backgroundColor: '#FEE2E2' }
                        : item.category === 'STRATEGY NOTES'
                        ? { backgroundColor: '#FEF3C7' }
                        : { backgroundColor: '#E0E7FF' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryBadgeText,
                        item.category === 'MOCK PAPER'
                          ? { color: '#B91C1C' }
                          : item.category === 'STRATEGY NOTES'
                          ? { color: '#B45309' }
                          : { color: '#4338CA' },
                      ]}
                    >
                      {item.category}
                    </Text>
                  </View>
                  <Text style={styles.fileSizeText}>{item.size}</Text>
                </View>

                <Text style={styles.fileNameText}>{item.name}</Text>
                <Text style={styles.physicalFileText}>
                  📁 {item.fileName} • {item.date}
                </Text>

                <View style={styles.actionButtonsRow}>
                  <TouchableOpacity
                    style={styles.openActionBtn}
                    onPress={() => handleOpenFile(item)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="eye-outline" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                    <Text style={styles.openActionText}>Open File</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.shareActionBtn}
                    onPress={() => handleShare(item)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="share-social-outline" size={14} color="#374151" style={{ marginRight: 4 }} />
                    <Text style={styles.shareActionText}>Share</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}

        {/* Info Note */}
        <View style={styles.infoNotice}>
          <Ionicons name="shield-checkmark" size={20} color="#16A34A" style={{ marginRight: 10 }} />
          <Text style={styles.infoNoticeText}>
            <Text style={{ fontWeight: '800' }}>Offline First Storage:</Text> All items in your vault remain saved in the phone's physical storage. You can view, revise, and practice tests without internet connection.
          </Text>
        </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
    marginTop: 1,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFE2DB',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  offlineBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#AF2800',
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  // Location Card
  storageLocationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 14,
    ...Shadows.sm,
  },
  locCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  folderIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#FFE2DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  locPathTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  locPathSub: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    marginTop: 2,
  },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  greenDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#16A34A',
  },
  readyText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#16A34A',
  },
  locStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingVertical: 12,
  },
  statCol: {
    alignItems: 'center',
  },
  statVal: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
  },
  statLbl: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '600',
  },
  statColDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E5E7EB',
  },

  // Search Bar
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    height: 46,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
  },

  // Filter Tabs
  tabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterTabActive: {
    backgroundColor: '#FFE2DB',
    borderColor: '#AF2800',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  filterTabTextActive: {
    color: '#AF2800',
    fontWeight: '800',
  },

  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#6B7280',
    letterSpacing: 0.5,
  },

  // File Card
  fileCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
    ...Shadows.sm,
  },
  fileIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFF1F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  fileSizeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  fileNameText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    lineHeight: 18,
    marginBottom: 4,
  },
  physicalFileText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
    marginBottom: 10,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  openActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#AF2800',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  openActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  shareActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  shareActionText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '700',
  },

  emptyCard: {
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#374151',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },

  infoNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  infoNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#166534',
    lineHeight: 17,
  },
});

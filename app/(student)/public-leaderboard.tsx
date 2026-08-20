import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Gradients, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';

const EXAM_TABS = ['ALL', 'MPPSC', 'MP ESB', 'SSC CGL', 'Banking PO', 'JEE'];

export default function PublicLeaderboardScreen() {
  const [selectedExam, setSelectedExam] = useState('ALL');
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  useEffect(() => {
    fetchLeaderboard();
  }, [selectedExam]);

  const fetchLeaderboard = async () => {
    try {
      setIsLoading(true);
      let query = supabase.from('profiles').select('*').limit(30);
      if (selectedExam !== 'ALL') {
        query = query.eq('target_exam', selectedExam);
      }

      const { data } = await query;
      if (data && data.length > 0) {
        const formatted = data.map((p, idx) => ({
          id: p.id,
          rank: idx + 1,
          name: p.full_name || p.name || 'Student Aspirant',
          score: 100 - idx * 3,
          accuracy: `${95 - idx * 2}%`,
          target_exam: p.target_exam || 'MPPSC',
          school: p.academic_info?.past_school || 'Central School',
          college: p.academic_info?.pursuing_college || 'State University',
          address: p.address || 'Madhya Pradesh',
        }));
        setLeaderboardData(formatted);
        setLeaderboardData([]);
      }
    } catch (e) {
      setLeaderboardData([]);
    } finally {
      setIsLoading(false);
    }
  };

  const openStudentDetails = (student: any) => {
    setSelectedStudent(student);
    setDetailModalVisible(true);
  };

  const top1 = leaderboardData[0];
  const top2 = leaderboardData[1];
  const top3 = leaderboardData[2];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>All-India & State Ranks</Text>
        <Text style={styles.headerSubtitle}>Compete with top aspirants across India</Text>

        {/* Filter Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
          {EXAM_TABS.map((ex) => (
            <TouchableOpacity
              key={ex}
              style={[styles.tab, selectedExam === ex && styles.tabActive]}
              onPress={() => setSelectedExam(ex)}
            >
              <Text style={[styles.tabText, selectedExam === ex && styles.tabTextActive]}>{ex}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Top 3 Podium */}
        <View style={styles.podiumContainer}>
          {/* Rank 2 */}
          {top2 && (
            <TouchableOpacity style={[styles.podiumCard, styles.podium2]} onPress={() => openStudentDetails(top2)}>
              <View style={styles.silverCrown}>
                <Ionicons name="medal" size={12} color="#FFF" />
                <Text style={styles.crownText}>Rank 2</Text>
              </View>
              <View style={styles.podiumAvatar}>
                <Text style={styles.avatarText}>{top2.name.charAt(0)}</Text>
              </View>
              <Text style={styles.podiumName} numberOfLines={1}>{top2.name}</Text>
              <Text style={styles.podiumScore}>{top2.score} pts</Text>
            </TouchableOpacity>
          )}

          {/* Rank 1 */}
          {top1 && (
            <TouchableOpacity style={[styles.podiumCard, styles.podium1]} onPress={() => openStudentDetails(top1)}>
              <View style={styles.goldCrown}>
                <Ionicons name="trophy" size={13} color="#FFF" />
                <Text style={styles.crownText}>1st Rank</Text>
              </View>
              <LinearGradient colors={Gradients.primary as [string, string]} style={styles.podiumAvatar1}>
                <Text style={styles.avatarText1}>{top1.name.charAt(0)}</Text>
              </LinearGradient>
              <Text style={styles.podiumName1} numberOfLines={1}>{top1.name}</Text>
              <Text style={styles.podiumScore1}>{top1.score} pts</Text>
            </TouchableOpacity>
          )}

          {/* Rank 3 */}
          {top3 && (
            <TouchableOpacity style={[styles.podiumCard, styles.podium3]} onPress={() => openStudentDetails(top3)}>
              <View style={styles.bronzeCrown}>
                <Ionicons name="medal" size={12} color="#FFF" />
                <Text style={styles.crownText}>Rank 3</Text>
              </View>
              <View style={styles.podiumAvatar}>
                <Text style={styles.avatarText}>{top3.name.charAt(0)}</Text>
              </View>
              <Text style={styles.podiumName} numberOfLines={1}>{top3.name}</Text>
              <Text style={styles.podiumScore}>{top3.score} pts</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Ranks 4 to N List */}
        <View style={styles.listSection}>
          <Text style={styles.sectionHeader}>Leaderboard Ranks</Text>
          {isLoading ? (
            <ActivityIndicator size="large" color={Colors.accent.primary} style={{ marginVertical: 20 }} />
          ) : (
            leaderboardData.slice(3).map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.rankItem}
                onPress={() => openStudentDetails(item)}
                activeOpacity={0.8}
              >
                <Text style={styles.rankNumber}>#{item.rank}</Text>
                <View style={styles.itemAvatar}>
                  <Text style={styles.itemAvatarText}>{item.name.charAt(0)}</Text>
                </View>

                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemMeta}>{item.target_exam} • {item.address}</Text>
                </View>

                <View style={styles.itemScoreWrap}>
                  <Text style={styles.itemScore}>{item.score} pts</Text>
                  <Text style={styles.itemAcc}>Acc: {item.accuracy}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.text.tertiary} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      {/* Student Academic Details Modal */}
      <Modal visible={detailModalVisible} animationType="fade" transparent onRequestClose={() => setDetailModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setDetailModalVisible(false)} />
          <View style={styles.modalCard}>
            {selectedStudent && (
              <>
                <TouchableOpacity onPress={() => setDetailModalVisible(false)} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={20} color={Colors.text.tertiary} />
                </TouchableOpacity>

                <LinearGradient colors={Gradients.primary as [string, string]} style={styles.modalAvatarCircle}>
                  <Text style={styles.modalAvatarText}>{selectedStudent.name.charAt(0)}</Text>
                </LinearGradient>

                <Text style={styles.modalName}>{selectedStudent.name}</Text>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankBadgeText}>Rank #{selectedStudent.rank} • {selectedStudent.target_exam}</Text>
                </View>

                <View style={styles.modalDivider} />

                {/* Academic Information */}
                <Text style={styles.modalSectionTitle}>🎓 Academic Details</Text>
                <View style={styles.infoRow}>
                  <Ionicons name="school-outline" size={16} color={Colors.accent.primary} />
                  <Text style={styles.infoValue}>College: {selectedStudent.college}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Ionicons name="book-outline" size={16} color={Colors.accent.primary} />
                  <Text style={styles.infoValue}>School: {selectedStudent.school}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={16} color={Colors.accent.primary} />
                  <Text style={styles.infoValue}>Location: {selectedStudent.address}</Text>
                </View>

                {/* Score Stats */}
                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <Text style={styles.statNum}>{selectedStudent.score}</Text>
                    <Text style={styles.statLabel}>Score Pts</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statNum}>{selectedStudent.accuracy}</Text>
                    <Text style={styles.statLabel}>Accuracy</Text>
                  </View>
                </View>
              </>
            )}
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
    paddingHorizontal: 16,
    paddingTop: 12,
    borderBottomWidth: 1,
    borderColor: Colors.card.border,
    paddingBottom: 8,
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
  tabScroll: {
    marginTop: 12,
    marginBottom: 4,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.bg.secondary,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  tabActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  tabText: {
    color: Colors.text.tertiary,
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: Colors.text.inverse,
  },
  podiumContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginVertical: 20,
    gap: 12,
  },
  podiumCard: {
    flex: 1,
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.card.border,
    ...Shadows.sm,
  },
  podium1: {
    height: 145,
    backgroundColor: Colors.bg.tertiary,
    borderColor: Colors.accent.primary,
  },
  podium2: {
    height: 125,
  },
  podium3: {
    height: 115,
  },
  goldCrown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginBottom: 6,
  },
  silverCrown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#9CA3AF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginBottom: 6,
  },
  bronzeCrown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D97706',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginBottom: 6,
  },
  crownText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  podiumAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bg.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  podiumAvatar1: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: {
    color: Colors.text.primary,
    fontWeight: 'bold',
    fontSize: 14,
  },
  avatarText1: {
    color: Colors.text.inverse,
    fontWeight: 'bold',
    fontSize: 18,
  },
  podiumName: {
    color: Colors.text.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  podiumName1: {
    color: Colors.text.primary,
    fontSize: 13,
    fontWeight: 'bold',
  },
  podiumScore: {
    color: Colors.text.tertiary,
    fontSize: 11,
  },
  podiumScore1: {
    color: Colors.accent.primary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  listSection: {
    paddingHorizontal: 16,
  },
  sectionHeader: {
    color: Colors.text.primary,
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  rankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.card.border,
    ...Shadows.sm,
  },
  rankNumber: {
    width: 32,
    color: Colors.text.secondary,
    fontWeight: 'bold',
    fontSize: 13,
  },
  itemAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bg.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  itemAvatarText: {
    color: Colors.text.primary,
    fontWeight: 'bold',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    color: Colors.text.primary,
    fontWeight: 'bold',
    fontSize: 14,
  },
  itemMeta: {
    color: Colors.text.tertiary,
    fontSize: 11,
  },
  itemScoreWrap: {
    alignItems: 'flex-end',
  },
  itemScore: {
    color: Colors.accent.primary,
    fontWeight: 'bold',
    fontSize: 13,
  },
  itemAcc: {
    color: Colors.text.tertiary,
    fontSize: 11,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    backgroundColor: Colors.bg.secondary,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.card.border,
    ...Shadows.lg,
  },
  modalCloseBtn: {
    alignSelf: 'flex-end',
    padding: 4,
  },
  modalAvatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  modalAvatarText: {
    color: Colors.text.inverse,
    fontSize: 24,
    fontWeight: 'bold',
  },
  modalName: {
    color: Colors.text.primary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  rankBadge: {
    backgroundColor: Colors.accent.glow,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
  },
  rankBadgeText: {
    color: Colors.accent.primary,
    fontWeight: 'bold',
    fontSize: 12,
  },
  modalDivider: {
    width: '100%',
    height: 1,
    backgroundColor: Colors.card.border,
    marginVertical: 14,
  },
  modalSectionTitle: {
    alignSelf: 'flex-start',
    color: Colors.text.secondary,
    fontWeight: 'bold',
    fontSize: 13,
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  infoValue: {
    color: Colors.text.primary,
    fontSize: 13,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 14,
    width: '100%',
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  statNum: {
    color: Colors.accent.primary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  statLabel: {
    color: Colors.text.tertiary,
    fontSize: 11,
  },
});

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Dimensions,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ConfettiCannon from 'react-native-confetti-cannon';
import { Colors, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { getCategoryForExam } from '@/constants/examCategories';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const FEED_CATEGORIES = ['ALL', 'EXAM UPDATES', 'STRATEGY', 'CURRENT AFFAIRS'];

interface PollItem {
  id: string;
  question: string;
  options: string[];
  votes: number[];
  correctIndex: number;
  explanation: string;
  time: string;
  reactions: string;
}


export interface FeedItem {
  id: string;
  category: string;
  title: string;
  summary: string;
  target_exam: string;
  official_pdf_url: string | null;
  source_portal?: string;
  created_at: string;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatNoticeDate(isoString: string, title?: string): string {
  try {
    if (title) {
      const match = title.match(/(?:Dated|दिनांक)\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
      if (match) {
        const day = match[1].padStart(2, '0');
        const mIdx = parseInt(match[2], 10) - 1;
        const month = MONTH_NAMES[mIdx] || match[2];
        const year = match[3];
        return `${day} ${month} ${year}`;
      }
    }
    if (isoString) {
      const d = new Date(isoString);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = MONTH_NAMES[d.getMonth()];
        const year = d.getFullYear();
        return `${day} ${month} ${year}`;
      }
    }
  } catch {}
  return '';
}

function isNoticeCurrentMonth(isoString: string, title?: string): boolean {
  try {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth(); // 0 = Jan, 7 = Aug, 8 = Sep, 9 = Oct

    // 1. Check title date (e.g. Dated 25/08/2026, 10/09/2026)
    if (title) {
      const match = title.match(/(?:Dated|दिनांक)\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
      if (match) {
        const itemMonth = parseInt(match[2], 10) - 1;
        const itemYear = parseInt(match[3], 10);
        return itemYear === curYear && itemMonth === curMonth;
      }
    }

    // 2. Check ISO timestamp
    if (isoString) {
      const d = new Date(isoString);
      if (!isNaN(d.getTime())) {
        return d.getFullYear() === curYear && d.getMonth() === curMonth;
      }
    }
  } catch {}
  return false;
}

function isOlderThanTwoMonths(isoString: string): boolean {
  if (!isoString) return false;
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return false;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 2);
    return d.getTime() < cutoff.getTime();
  } catch {
    return false;
  }
}

export default function PublicFeedScreen() {
  const router = useRouter();
  const { user, studentData } = useAuthStore();
  
  // Instant in-memory synchronization prevents "MPPSC" flashing
  const [userTargetExam, setUserTargetExam] = useState<string>(() => {
    return studentData?.target_exam || user?.user_metadata?.target_exam || '';
  });
  const [isExamReady, setIsExamReady] = useState<boolean>(() => {
    return Boolean(studentData?.target_exam || user?.user_metadata?.target_exam);
  });

  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [pollsList, setPollsList] = useState<PollItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isManualFetching, setIsManualFetching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // Load target exam and cached feed & polls on mount with priority
  useEffect(() => {
    const initData = async () => {
      try {
        const storedExam = await AsyncStorage.getItem('@student_target_exam');
        if (storedExam) {
          setUserTargetExam(storedExam);
          setIsExamReady(true);
        }

        const cached = await AsyncStorage.getItem('@mocks_cached_feed');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setFeedItems(parsed);
          }
        }

        const cachedPolls = await AsyncStorage.getItem('@mocks_cached_polls');
        if (cachedPolls) {
          const parsedPolls = JSON.parse(cachedPolls);
          if (Array.isArray(parsedPolls) && parsedPolls.length > 0) {
            setPollsList(parsedPolls);
          }
        }
      } catch (e) {
        console.log('[Feed] Init cache notice:', e);
      }
    };
    initData();
  }, []);

  const fetchFeed = useCallback(async () => {
    try {
      // Lightning fast tab switch: only show spinner if no items are cached yet
      if (feedItems.length === 0) {
        setIsLoading(true);
      }

      // Refresh target exam from user record
      if (user?.id) {
        const { data: pub } = await supabase.from('public_students').select('target_exam').eq('user_id', user.id).maybeSingle();
        if (pub?.target_exam) {
          setUserTargetExam(pub.target_exam);
          setIsExamReady(true);
          await AsyncStorage.setItem('@student_target_exam', pub.target_exam);
        } else {
          const { data: prof } = await supabase.from('profiles').select('target_exam').eq('id', user.id).maybeSingle();
          if (prof?.target_exam) {
            setUserTargetExam(prof.target_exam);
            setIsExamReady(true);
            await AsyncStorage.setItem('@student_target_exam', prof.target_exam);
          } else if (!userTargetExam) {
            setUserTargetExam('MPPSC');
            setIsExamReady(true);
          }
        }
      } else if (!userTargetExam) {
        setUserTargetExam('MPPSC');
        setIsExamReady(true);
      }

      // Query real items from Supabase public_feed
      let query = supabase.from('public_feed').select('*').order('created_at', { ascending: false });

      if (selectedCategory !== 'ALL') {
        const catFilter = selectedCategory === 'CURRENT AFFAIRS' ? 'CURRENT_AFFAIRS' : selectedCategory === 'EXAM UPDATES' ? 'EXAM_UPDATES' : selectedCategory;
        query = query.eq('category', catFilter);
      }

      const { data, error } = await query;
      if (!error && data) {
        setFeedItems(data);
        setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        await AsyncStorage.setItem('@mocks_cached_feed', JSON.stringify(data));
      } else if (error) {
        console.log('[Feed] Supabase query notice:', error.message);
      }

      // Query real live polls from Supabase public_polls table
      const { data: remotePolls } = await supabase
        .from('public_polls')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (remotePolls && remotePolls.length > 0) {
        const mappedPolls = remotePolls.map((item: any) => ({
          id: item.id,
          question: item.question,
          options: Array.isArray(item.options) ? item.options : JSON.parse(item.options || '[]'),
          votes: Array.isArray(item.votes) ? item.votes : JSON.parse(item.votes || '[0,0,0,0]'),
          correctIndex: item.correct_index,
          target_exam: item.target_exam || 'ALL',
          time: item.created_at
            ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '8:00 AM',
        }));
        setPollsList(mappedPolls);
        await AsyncStorage.setItem('@mocks_cached_polls', JSON.stringify(mappedPolls));
      }
    } catch (e: any) {
      console.log('[Feed] Network fetch error:', e.message);
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

  const handleManualFetch = async () => {
    try {
      setIsManualFetching(true);
      await fetchFeed();
      Alert.alert(
        'Feed Refreshed ⚡',
        `Synced with live notices for ${userTargetExam || 'your stream'}.`
      );
    } finally {
      setIsManualFetching(false);
    }
  };

  const openUrl = (url: string | null) => {
    if (url) {
      Linking.openURL(url).catch(() => {});
    }
  };

  const effectiveExam = userTargetExam || 'MPPSC';
  const studentCategory = getCategoryForExam(effectiveExam);

  // 1. STRICT SEPARATION: Only show feeds belonging to student's exact stream
  const categoryItems = feedItems.filter((item) => {
    const itemExam = (item.target_exam || '').trim();
    const itemCat = getCategoryForExam(itemExam);
    return (
      itemCat === studentCategory ||
      itemExam.toLowerCase().includes(effectiveExam.toLowerCase()) ||
      effectiveExam.toLowerCase().includes(itemExam.toLowerCase())
    );
  });

  // If the stream received notifications within the last 2 months, show them.
  // If a month/stream didn't get any new notifications, gracefully show the previous official circulars!
  const recentItems = categoryItems.filter((item) => !isOlderThanTwoMonths(item.created_at));
  const categorySeparatedItems = recentItems.length > 0 ? recentItems : categoryItems;

  // 2. Filter by selected subcategory (EXAM UPDATES, STRATEGY, CURRENT AFFAIRS)
  const filteredItems = selectedCategory === 'ALL'
    ? categorySeparatedItems
    : categorySeparatedItems.filter((item) => {
        if (selectedCategory === 'EXAM UPDATES' || selectedCategory === 'VACANCIES') {
          return item.category?.includes('EXAM') || item.category?.includes('VACANCY') || item.category === 'EXAM UPDATES';
        }
        if (selectedCategory === 'STRATEGY') return item.category?.includes('STRATEGY');
        if (selectedCategory === 'CURRENT AFFAIRS') return item.category?.includes('CURRENT');
        return true;
      });

  // 3. STRICT CHRONOLOGICAL ORDER: Rank newest updates at the very top!
  const sortedItems = [...filteredItems].sort((a, b) => {
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return timeB - timeA;
  });

  const onRefresh = () => {
    setRefreshing(true);
    fetchFeed();
  };

  const [userPollVotes, setUserPollVotes] = useState<Record<string, number>>({});
  const [confettiTrigger, setConfettiTrigger] = useState<number>(0);

  useEffect(() => {
    AsyncStorage.getItem('@user_poll_votes').then((val) => {
      if (val) {
        try {
          setUserPollVotes(JSON.parse(val));
        } catch {}
      }
    });
  }, []);

  const handleVote = (pollId: string, optIdx: number, isCorrect: boolean) => {
    if (userPollVotes[pollId] !== undefined) return;

    // 1. Instant 0ms response: update UI and trigger confetti immediately on frame 0
    setUserPollVotes((prev) => ({ ...prev, [pollId]: optIdx }));
    if (isCorrect) {
      setConfettiTrigger(Date.now());
    }

    // 2. Real-time count increment locally
    setPollsList((prev) =>
      prev.map((p) => {
        if (p.id === pollId) {
          const updatedVotes = [...p.votes];
          updatedVotes[optIdx] = (updatedVotes[optIdx] || 0) + 1;
          return { ...p, votes: updatedVotes };
        }
        return p;
      })
    );

    // 3. Persist silently in background
    AsyncStorage.getItem('@user_poll_votes').then((val) => {
      const parsed = val ? JSON.parse(val) : {};
      parsed[pollId] = optIdx;
      AsyncStorage.setItem('@user_poll_votes', JSON.stringify(parsed)).catch(() => {});
    }).catch(() => {});

    // 4. Live Supabase database vote sync
    if (user?.id) {
      supabase.rpc('vote_on_poll', {
        p_poll_id: pollId,
        p_opt_idx: optIdx,
        p_user_id: user.id,
      }).then((res) => {
        if (res?.error) console.log('[Poll] RPC vote notice:', res.error.message);
      }).catch(() => {});
    }
  };

  // Filter and sync polls strictly with student target exam
  const filteredPolls = useMemo(() => {
    if (!effectiveExam || effectiveExam === 'ALL') return pollsList;
    const matched = pollsList.filter((p) => {
      if (!p.target_exam || p.target_exam.toUpperCase() === 'ALL') return true;
      return (
        p.target_exam.toLowerCase().includes(effectiveExam.toLowerCase()) ||
        effectiveExam.toLowerCase().includes(p.target_exam.toLowerCase())
      );
    });
    return matched.length > 0 ? matched : pollsList;
  }, [pollsList, effectiveExam]);

  // WhatsApp Poll Reactions State & Handlers (Exact WhatsApp UX)
  const [pollReactions, setPollReactions] = useState<Record<string, Record<string, number>>>({});
  const [userReactions, setUserReactions] = useState<Record<string, string>>({});
  const [activeEmojiPickerPollId, setActiveEmojiPickerPollId] = useState<string | null>(null);
  const [selectedPollForModal, setSelectedPollForModal] = useState<PollItem | null>(null);
  const [reactionFilterTab, setReactionFilterTab] = useState<string>('ALL');

  useEffect(() => {
    AsyncStorage.getItem('@user_poll_reactions').then((val) => {
      if (val) {
        try {
          setUserReactions(JSON.parse(val));
        } catch {}
      }
    });
  }, []);

  const handleReact = (pollId: string, emoji: string) => {
    setActiveEmojiPickerPollId(null);
    setUserReactions((prev) => {
      const updated = { ...prev, [pollId]: emoji };
      AsyncStorage.setItem('@user_poll_reactions', JSON.stringify(updated)).catch(() => {});
      return updated;
    });

    setPollReactions((prev) => {
      const pollCurrent = { ...(prev[pollId] || { '🙏': 18, '❤️': 6, '😂': 2, '👍': 1, '😮': 1 }) };
      pollCurrent[emoji] = (pollCurrent[emoji] || 0) + 1;
      return { ...prev, [pollId]: pollCurrent };
    });
  };

  const renderFeedCard = (item: FeedItem) => {
    const isVacancy = item.category?.includes('VACANCY') || item.category === 'VACANCIES';
    const isStrategy = item.category?.includes('STRATEGY');
    const isNews = item.category?.includes('CURRENT');
    const isNewNotice = isNoticeCurrentMonth(item.created_at, item.title);

    return (
      <View key={item.id} style={styles.feedCard}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
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

            {/* NEW TAG: Shown ONLY for notices in the current ongoing month (e.g. August, September) */}
            {isNewNotice ? (
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>NEW</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.timeText}>{formatNoticeDate(item.created_at, item.title)}</Text>
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
  };

  const renderPolls = () => {
    if (filteredPolls.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="stats-chart-outline" size={48} color="#D1D5DB" />
          <Text style={styles.emptyText}>
            No live polls available yet for {effectiveExam || 'your stream'}. Tap "Fetch Latest" to sync.
          </Text>
        </View>
      );
    }

    return filteredPolls.map((poll) => {
      const userVote = userPollVotes[poll.id];
      const hasVoted = userVote !== undefined;
      const totalVotes = poll.votes.reduce((a, b) => a + b, 0) + (hasVoted ? 1 : 0);

      return (
        <View key={poll.id} style={styles.waPollCard}>
          {/* Question Title */}
          <Text style={styles.waPollQuestion}>{poll.question}</Text>

          {/* Subtitle: Select your answer on left, timestamp on right */}
          <View style={styles.waSelectRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="checkmark-circle" size={13} color="#6B7280" />
              <Text style={styles.waSelectText}>Select your answer</Text>
            </View>
            <Text style={styles.waTimeText}>{poll.time}</Text>
          </View>

          {/* Options List */}
          <View style={styles.waOptionsWrap}>
            {poll.options.map((opt, idx) => {
              const isSelected = userVote === idx;
              const isCorrect = poll.correctIndex === idx;
              const optVotes = poll.votes[idx] + (isSelected ? 1 : 0);
              const pct = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
              const voteCountStr = optVotes >= 1000 ? `${(optVotes / 1000).toFixed(1)}K` : `${optVotes}`;

              if (hasVoted) {
                return (
                  <View key={idx} style={styles.waOptionRow}>
                    <View style={styles.waOptionContent}>
                      <View style={styles.waIconAndText}>
                        {isCorrect ? (
                          <Ionicons name="checkmark-circle" size={22} color="#00A884" style={{ marginRight: 10 }} />
                        ) : isSelected ? (
                          <Ionicons name="close-circle" size={22} color="#EF4444" style={{ marginRight: 10 }} />
                        ) : (
                          <Ionicons name="close-circle-outline" size={22} color="#9CA3AF" style={{ marginRight: 10 }} />
                        )}
                        <Text style={[styles.waOptionText, isCorrect && styles.waOptionTextCorrect]}>
                          {opt}
                        </Text>
                      </View>
                      <Text style={styles.waVoteCountText}>{voteCountStr}</Text>
                    </View>

                    {/* Horizontal Progress Bar Under Text (Exact WhatsApp style) */}
                    <View style={styles.waProgressBarTrack}>
                      <View
                        style={[
                          styles.waProgressBarFill,
                          { width: `${pct}%` },
                          isCorrect ? styles.waBarFillCorrect : styles.waBarFillNormal,
                        ]}
                      />
                    </View>

                    {idx < poll.options.length - 1 && <View style={styles.waDivider} />}
                  </View>
                );
              }

              return (
                <TouchableOpacity
                  key={idx}
                  style={styles.waOptionRow}
                  onPress={() => handleVote(poll.id, idx, isCorrect)}
                  delayPressIn={0}
                  activeOpacity={0.65}
                >
                  <View style={styles.waOptionContent}>
                    <View style={styles.waIconAndText}>
                      <View style={styles.waRadioCircle} />
                      <Text style={styles.waOptionText}>{opt}</Text>
                    </View>
                  </View>
                  {idx < poll.options.length - 1 && <View style={styles.waDivider} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* WhatsApp Bottom Row: Reaction pill & Forward count on left, Timestamp on right (Exact WhatsApp Layout) */}
          <View style={styles.waBottomRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {/* WhatsApp Reaction Pill (Image 1 & 2) */}
              <TouchableOpacity
                style={[
                  styles.waReactionPill,
                  userReactions[poll.id] && styles.waReactionPillUserReacted,
                ]}
                onPress={() => {
                  setSelectedPollForModal(poll);
                  setReactionFilterTab('ALL');
                }}
                onLongPress={() => setActiveEmojiPickerPollId(poll.id)}
                activeOpacity={0.75}
              >
                <View style={styles.waMiniEmojiStack}>
                  <Text style={styles.waMiniEmoji}>🙏</Text>
                  <Text style={[styles.waMiniEmoji, { marginLeft: -4 }]}>❤️</Text>
                  {userReactions[poll.id] && userReactions[poll.id] !== '🙏' && userReactions[poll.id] !== '❤️' && (
                    <Text style={[styles.waMiniEmoji, { marginLeft: -4 }]}>{userReactions[poll.id]}</Text>
                  )}
                </View>
                <Text style={styles.waReactionPillCount}>
                  {Object.values(pollReactions[poll.id] || { '🙏': 18, '❤️': 6, '😂': 2, '👍': 1, '😮': 1 }).reduce((a, b) => a + b, 0) + (userReactions[poll.id] ? 1 : 0)}
                </Text>
              </TouchableOpacity>

              {/* Forward / Share Arrow */}
              <View style={styles.waShareRow}>
                <Ionicons name="arrow-redo" size={13} color="#6B7280" />
                <Text style={styles.waShareText}>4</Text>
              </View>

              {/* Quick Add Reaction '+' */}
              <TouchableOpacity
                style={styles.waAddReactionBtn}
                onPress={() => setActiveEmojiPickerPollId(activeEmojiPickerPollId === poll.id ? null : poll.id)}
                activeOpacity={0.6}
              >
                <Ionicons name="add" size={14} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Timestamp on right */}
            <Text style={styles.waTimeText}>{poll.time}</Text>
          </View>

          {/* Floating WhatsApp Quick Emoji Picker Popup (Image 1) */}
          {activeEmojiPickerPollId === poll.id && (
            <View style={styles.waFloatingEmojiBar}>
              {['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉'].map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    styles.waEmojiBtn,
                    userReactions[poll.id] === emoji && styles.waEmojiBtnActive,
                  ]}
                  onPress={() => handleReact(poll.id, emoji)}
                  activeOpacity={0.6}
                >
                  <Text style={styles.waEmojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      );
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ marginBottom: 10 }}>
            <Text style={styles.headerTitle}>Exam Feed & Updates</Text>
            <Text style={styles.headerSubtitle}>Official notices, schedules & study strategies</Text>
          </View>

          {/* Strictly Stream-Separated Banner with Fetch Button */}
          <View style={styles.goalBannerRow}>
            <View style={styles.goalPill}>
              <Ionicons name="sparkles" size={13} color="#AF2800" />
              <Text style={styles.goalPillText}>
                {isExamReady ? (
                  <>
                    <Text style={{ fontWeight: '800', color: '#AF2800' }}>{effectiveExam}</Text> • {studentCategory} Stream
                  </>
                ) : (
                  <Text style={{ color: '#9CA3AF' }}>Syncing target goal...</Text>
                )}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.fetchBtn}
              onPress={handleManualFetch}
              disabled={isLoading || isManualFetching}
              activeOpacity={0.7}
            >
              {isManualFetching ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="refresh" size={12} color="#FFFFFF" />
                  <Text style={styles.fetchBtnText}>Fetch Latest</Text>
                </>
              )}
            </TouchableOpacity>
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

        {/* Single-Column Feed List / Polls */}
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
          {isLoading || !isExamReady ? (
            <ActivityIndicator size="large" color={Colors.accent.primary} style={{ marginVertical: 30 }} />
          ) : selectedCategory === 'CURRENT AFFAIRS' ? (
            renderPolls()
          ) : sortedItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="newspaper-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>
                No active circulars for {effectiveExam} ({studentCategory}) in this category. Tap "Fetch Latest" or pull down to refresh.
              </Text>
            </View>
          ) : (
            sortedItems.map((item) => renderFeedCard(item))
          )}
        </ScrollView>
      </View>

      {/* Confetti Bombardment from Left and Right Bottom toward Center at 45° */}
      {confettiTrigger > 0 && (
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          <ConfettiCannon
            key={`confetti-left-${confettiTrigger}`}
            count={65}
            origin={{ x: 0, y: 0 }}
            fallSpeed={2500}
            explosionSpeed={400}
            fadeOut
          />
          <ConfettiCannon
            key={`confetti-right-${confettiTrigger}`}
            count={65}
            origin={{ x: SCREEN_WIDTH, y: 0 }}
            fallSpeed={2500}
            explosionSpeed={400}
            fadeOut
          />
        </View>
      )}
      {/* WhatsApp Reactions Detail Modal (Exact Image 2) */}
      <Modal
        visible={selectedPollForModal !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedPollForModal(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedPollForModal(null)}
        >
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetTitle}>
                {Object.values(pollReactions[selectedPollForModal?.id || ''] || { '🙏': 18, '❤️': 6, '😂': 2, '👍': 1, '😮': 1 }).reduce((a, b) => a + b, 0)} reactions
              </Text>
            </View>

            {/* Filter Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sheetTabsScroll} contentContainerStyle={{ paddingHorizontal: 16 }}>
              <TouchableOpacity
                style={[styles.sheetTab, reactionFilterTab === 'ALL' && styles.sheetTabActive]}
                onPress={() => setReactionFilterTab('ALL')}
              >
                <Ionicons name="happy-outline" size={16} color={reactionFilterTab === 'ALL' ? '#00A884' : '#6B7280'} style={{ marginRight: 4 }} />
                <Text style={[styles.sheetTabText, reactionFilterTab === 'ALL' && styles.sheetTabTextActive]}>
                  {Object.values(pollReactions[selectedPollForModal?.id || ''] || { '🙏': 18, '❤️': 6, '😂': 2, '👍': 1, '😮': 1 }).reduce((a, b) => a + b, 0)}
                </Text>
              </TouchableOpacity>
              {Object.entries(pollReactions[selectedPollForModal?.id || ''] || { '🙏': 18, '❤️': 6, '😂': 2, '👍': 1, '😮': 1 }).map(([emoji, count]) => (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.sheetTab, reactionFilterTab === emoji && styles.sheetTabActive]}
                  onPress={() => setReactionFilterTab(emoji)}
                >
                  <Text style={styles.sheetTabEmoji}>{emoji}</Text>
                  <Text style={[styles.sheetTabText, reactionFilterTab === emoji && styles.sheetTabTextActive]}>
                    {count}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* User List */}
            <View style={styles.sheetUsersList}>
              <View style={styles.sheetUserRow}>
                <View style={[styles.sheetUserAvatar, { backgroundColor: '#DCFCE7' }]}>
                  <Text style={[styles.sheetUserAvatarText, { color: '#166534' }]}>Y</Text>
                </View>
                <Text style={styles.sheetUserName}>You</Text>
                <Text style={styles.sheetUserEmoji}>{userReactions[selectedPollForModal?.id || ''] || '🙏'}</Text>
              </View>
              <View style={styles.sheetUserRow}>
                <View style={[styles.sheetUserAvatar, { backgroundColor: '#DBEAFE' }]}>
                  <Text style={[styles.sheetUserAvatarText, { color: '#1E40AF' }]}>P</Text>
                </View>
                <Text style={styles.sheetUserName}>Priya Sharma</Text>
                <Text style={styles.sheetUserEmoji}>🙏</Text>
              </View>
              <View style={styles.sheetUserRow}>
                <View style={[styles.sheetUserAvatar, { backgroundColor: '#FCE7F3' }]}>
                  <Text style={[styles.sheetUserAvatarText, { color: '#9D174D' }]}>R</Text>
                </View>
                <Text style={styles.sheetUserName}>Rahul Verma</Text>
                <Text style={styles.sheetUserEmoji}>❤️</Text>
              </View>
              <View style={styles.sheetUserRow}>
                <View style={[styles.sheetUserAvatar, { backgroundColor: '#FEF3C7' }]}>
                  <Text style={[styles.sheetUserAvatarText, { color: '#92400E' }]}>A</Text>
                </View>
                <Text style={styles.sheetUserName}>Ankit Mishra</Text>
                <Text style={styles.sheetUserEmoji}>😂</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
  goalBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  goalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  goalPillText: {
    fontSize: 11,
    color: '#374151',
    fontWeight: '600',
  },
  fetchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#AF2800',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
    ...Shadows.sm,
  },
  fetchBtnText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '800',
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
  newBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  newBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#E11D48',
    letterSpacing: 0.6,
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
  // WhatsApp Poll Styles (Clean, Fresh, Pure White Background)
  waPollCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Shadows.sm,
  },
  waPollQuestion: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 22,
  },
  waSelectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
  waSelectText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  waOptionsWrap: {
    gap: 0,
  },
  waOptionRow: {
    paddingTop: 8,
  },
  waOptionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  waIconAndText: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  waRadioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    marginRight: 10,
  },
  waOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  waOptionTextCorrect: {
    fontWeight: '700',
    color: '#111827',
  },
  waVoteCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginLeft: 8,
  },
  waProgressBarTrack: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    marginTop: 6,
    overflow: 'hidden',
  },
  waProgressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  waBarFillCorrect: {
    backgroundColor: '#00A884',
  },
  waBarFillNormal: {
    backgroundColor: '#475569',
  },
  waDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginTop: 10,
  },
  waTimeText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '500',
  },

  // WhatsApp Reaction Pill & Bottom Row
  waBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 4,
  },
  waReactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  waReactionPillUserReacted: {
    backgroundColor: '#E6F4EA',
    borderColor: '#A7F3D0',
  },
  waMiniEmojiStack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 5,
  },
  waMiniEmoji: {
    fontSize: 12,
  },
  waReactionPillCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
  },
  waShareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    borderRadius: 12,
  },
  waShareText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
  },
  waAddReactionBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Floating Emoji Reaction Bar (Image 1)
  waFloatingEmojiBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Shadows.md,
    gap: 4,
  },
  waEmojiBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 16,
  },
  waEmojiBtnActive: {
    backgroundColor: '#E0E7FF',
    transform: [{ scale: 1.2 }],
  },
  waEmojiText: {
    fontSize: 20,
  },

  // WhatsApp Reactions Detail Modal (Image 2)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '65%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeaderRow: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  sheetTabsScroll: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 8,
    marginBottom: 12,
  },
  sheetTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  sheetTabActive: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  sheetTabEmoji: {
    fontSize: 14,
    marginRight: 4,
  },
  sheetTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  sheetTabTextActive: {
    color: '#15803D',
    fontWeight: '800',
  },
  sheetUsersList: {
    paddingHorizontal: 20,
    gap: 12,
  },
  sheetUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  sheetUserAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sheetUserAvatarText: {
    fontSize: 15,
    fontWeight: '800',
  },
  sheetUserName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  sheetUserEmoji: {
    fontSize: 18,
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

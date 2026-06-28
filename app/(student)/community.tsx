import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Linking,
  Share,
  Modal,
  ScrollView,
  Image,
  PanResponder,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Colors, Shadows } from '@/constants/colors';
import { downloadAndOpenSaf } from '@/lib/saf';
import { supabase } from '@/lib/supabase';
import { getTelegramFastLink } from '@/lib/telegram';
import { useAuthStore } from '@/stores/useAuthStore';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendPushNotification, CHANNELS } from '@/lib/notifications';
import CachedImage from '@/components/CachedImage';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { savePostsToLocal, getPostsFromLocal } from '@/lib/localDb';
import VirtualIDCard from '@/components/VirtualIDCard';

type Reply = {
  author_id?: string;
  author: string;
  author_avatar?: string;
  text: string;
  timestamp: string;
};

type Comment = {
  id: string;
  author_id?: string;
  author: string;
  author_avatar?: string;
  text: string;
  timestamp: string;
  replies: Reply[];
};

type Post = {
  id: string;
  author_id?: string;
  author: string;
  category: 'announcement' | 'note' | 'schedule';
  text: string;
  timestamp: string;
  likes: number;
  comments: Comment[];
  liked: boolean;
  liked_by: string[];
  viewed_by_count: number;
  target_batches?: string[];
  media_url?: string;
  file_url?: string;
  file_name?: string;
  tg_file_id?: string;
  backup_url?: string;
  file_type?: string;
  local_sync_id?: string;
  author_avatar?: string | null;
  is_edited?: boolean;
  is_new?: boolean;
};

const getCategoryStyle = (category: Post['category']) => {
  switch (category) {
    case 'announcement':
      return { bg: Colors.accent.primary, label: 'Announcement' };
    case 'note':
      return { bg: Colors.status.info, label: 'Note' };
    case 'schedule':
      return { bg: Colors.status.warning, label: 'Schedule' };
  }
};

const parsePollData = (text: string) => {
  if (!text) return null;
  const startIdx = text.indexOf('{"isPoll":true');
  if (startIdx !== -1) {
    const endIdx = text.lastIndexOf('}');
    if (endIdx !== -1 && endIdx > startIdx) {
      const jsonStr = text.substring(startIdx, endIdx + 1);
      try {
        return JSON.parse(jsonStr);
      } catch (e) {
        return null;
      }
    }
  }
  return null;
};

const getFormattedDividerDate = (dateString: string) => {
  if (!dateString) return 'Today';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return 'Today';
  }
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    const day = date.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  }
};

const formatBubbleTime = (dateString: string) => {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch (e) {
    return dateString;
  }
};

const handleDownload = async (url: string, fileName?: string) => {
  if (!url) return;
  try {
    const downloadUrl = url.includes('?')
      ? `${url}&download=${encodeURIComponent(fileName || '')}`
      : `${url}?download=${encodeURIComponent(fileName || '')}`;
    await Linking.openURL(downloadUrl);
  } catch (err: any) {
    try {
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('Error', 'Could not open or download the file.');
    }
  }
};

interface PostCardProps {
  item: Post;
  studentName: string;
  studentPhotoUrl: string | null;
  avatarMap: Record<string, string>;
  onLike: (postId: string) => void;
  onAddComment: (postId: string, text: string) => void;
  onAddReply: (postId: string, commentId: string, text: string) => void;
  onVote: (postId: string, optionIndex: number) => void;
  downloadingFileId?: string | null;
  onViewDocument?: (post: Post) => void;
}

function PostCard({ item, studentName, studentPhotoUrl, onLike, onAddComment, onAddReply, avatarMap, onVote, downloadingFileId, onViewDocument }: PostCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showAllComments, setShowAllComments] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [replyingCommentId, setReplyingCommentId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [showFullImage, setShowFullImage] = useState(false);
  const { user } = useAuthStore();
  const { downloadedFiles } = useDownloadStore();
  const isDownloaded = !!downloadedFiles[item.id.toString()];

  const handleSendComment = () => {
    if (!commentText.trim()) return;
    onAddComment(item.id, commentText.trim());
    setCommentText('');
  };

  const handleSendReply = (commentId: string) => {
    if (!replyText.trim()) return;
    onAddReply(item.id, commentId, replyText.trim());
    setReplyText('');
    setReplyingCommentId(null);
  };

  const handleShare = async () => {
    try {
      const shareUrl = item.media_url || item.file_url;
      await Share.share({
        message: `${item.author} posted in PrestoID:\n\n"${item.text}"${shareUrl ? `\n\nAttachment: ${shareUrl}` : ''}\n\nShared via PrestoID App`,
      });
    } catch (err) {
      console.warn('Share error:', err);
    }
  };

  const cat = getCategoryStyle(item.category);
  const commentsToRender = showAllComments ? item.comments : item.comments.slice(0, 2);

  const authorAvatarUri = item.author_id ? (avatarMap[item.author_id] || item.author_avatar) : item.author_avatar;

  return (
    <View style={styles.postCard}>
      {/* Post Header */}
      <View style={styles.postHeader}>
        {authorAvatarUri ? (
          <CachedImage uri={authorAvatarUri} style={styles.postAuthorAvatarImage} fallbackInitial={item.author} />
        ) : (
          <View style={styles.postAuthorAvatar}>
            <Text style={styles.postAuthorInitial}>{item.author.charAt(0)}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.postAuthorName}>{item.author}</Text>
            {item.is_new && (
              <View style={{ backgroundColor: Colors.status.danger, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold' }}>NEW</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.postTimestamp}>{formatBubbleTime(item.timestamp)}</Text>
            {item.is_edited && (
              <Text style={styles.editedLabel}>• Edited</Text>
            )}
          </View>
        </View>
        <View style={[styles.categoryBadge, { backgroundColor: cat.bg }]}>
          <Text style={styles.categoryBadgeText}>{cat.label}</Text>
        </View>
      </View>

      {/* Post Content */}
      {(() => {
        const pollData = parsePollData(item.text);
        if (pollData) {
          const totalVotes = Object.keys(pollData.votes || {}).length;
          return (
            <View style={styles.pollContainer}>
              <Text style={styles.pollQuestionText}>{pollData.question}</Text>
              {pollData.options.map((opt: string, idx: number) => {
                const votesForOption = Object.values(pollData.votes || {}).filter((v: any) => v.option === idx);
                const voteCount = votesForOption.length;
                const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                const isSelected = user && pollData.votes?.[user.id]?.option === idx;
                const voterNames = votesForOption.map((v: any) => v.name).join(', ');

                return (
                  <View key={idx} style={styles.pollOptionWrapper}>
                    <TouchableOpacity
                      style={[styles.pollOptionButton, isSelected && styles.pollOptionButtonSelected]}
                      onPress={() => onVote(item.id, idx)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.pollOptionProgress, { width: `${pct}%` }, isSelected && styles.pollOptionProgressSelected]} />

                      <View style={styles.pollOptionTextRow}>
                        <Text style={[styles.pollOptionText, isSelected && styles.pollOptionTextSelected]}>
                          {opt}
                        </Text>
                        <Text style={styles.pollOptionPctText}>{pct}%</Text>
                      </View>
                    </TouchableOpacity>

                    {voteCount > 0 && (
                      <Text style={styles.pollVotersText} numberOfLines={1}>
                        Voted: {voterNames}
                      </Text>
                    )}
                  </View>
                );
              })}

              <Text style={styles.pollTotalVotesText}>{totalVotes} votes</Text>
            </View>
          );
        }

        return <Text style={styles.postText}>{item.text}</Text>;
      })()}

      {item.media_url && (
        <>
          <TouchableOpacity activeOpacity={0.9} onPress={() => setShowFullImage(true)}>
            <CachedImage uri={item.media_url} style={styles.postImage} contentFit="cover" priority="high" />
          </TouchableOpacity>

          <Modal visible={showFullImage} transparent={true} animationType="fade" onRequestClose={() => setShowFullImage(false)}>
            <View style={styles.fullImageModalOverlay}>
              <TouchableOpacity style={styles.fullImageCloseButton} onPress={() => setShowFullImage(false)}>
                <Ionicons name="close" size={28} color="#FFFFFF" />
              </TouchableOpacity>
              <CachedImage uri={item.media_url} style={styles.fullImageStyle} contentFit="contain" priority="high" />
            </View>
          </Modal>
        </>
      )}

      {item.file_url && (() => {
        const isPDF = item.file_name?.toLowerCase().endsWith('.pdf') || item.file_url?.toLowerCase().includes('.pdf');
        if (isPDF) {
          const thumbnailUrl = item.file_url.startsWith('http')
            ? `https://image.thum.io/get/pdfSource/${item.file_url}`
            : null;

          return (
            <TouchableOpacity
              style={styles.pdfAttachmentCardContainer}
              onPress={() => {
                if (item.file_url && onViewDocument) onViewDocument(item);
              }}
              activeOpacity={0.8}
            >
              <View style={styles.pdfPreviewImageContainer}>
                {thumbnailUrl ? (
                  <View style={styles.pdfPreviewWrapper}>
                    {/* Fallback mockup rendered behind the image in case of loading/offline */}
                    <View style={[StyleSheet.absoluteFill, styles.pdfPlaceholderLayout]}>
                      <View style={styles.pdfPlaceholderPage}>
                        <View style={styles.pdfPlaceholderHeader}>
                          <Ionicons name="document-text" size={14} color="#E53935" />
                          <Text style={styles.pdfPlaceholderTitle} numberOfLines={1}>
                            {item.file_name || 'PDF Document'}
                          </Text>
                        </View>
                        <View style={styles.pdfPlaceholderBody}>
                          <View style={[styles.pdfPlaceholderLine, { width: '80%' }]} />
                          <View style={[styles.pdfPlaceholderLine, { width: '90%' }]} />
                          <View style={[styles.pdfPlaceholderLine, { width: '60%' }]} />
                          <View style={[styles.pdfPlaceholderLine, { width: '75%' }]} />
                        </View>
                      </View>
                    </View>
                    <CachedImage
                      uri={thumbnailUrl}
                      style={styles.pdfPreviewImage}
                      contentFit="cover"
                    />
                  </View>
                ) : (
                  <View style={styles.pdfPlaceholderLayout}>
                    <View style={styles.pdfPlaceholderPage}>
                      <View style={styles.pdfPlaceholderHeader}>
                        <Ionicons name="document-text" size={14} color="#E53935" />
                        <Text style={styles.pdfPlaceholderTitle} numberOfLines={1}>
                          {item.file_name || 'PDF Document'}
                        </Text>
                      </View>
                      <View style={styles.pdfPlaceholderBody}>
                        <View style={[styles.pdfPlaceholderLine, { width: '80%' }]} />
                        <View style={[styles.pdfPlaceholderLine, { width: '90%' }]} />
                        <View style={[styles.pdfPlaceholderLine, { width: '60%' }]} />
                        <View style={[styles.pdfPlaceholderLine, { width: '75%' }]} />
                      </View>
                    </View>
                  </View>
                )}
              </View>

              {/* Details banner */}
              <View style={styles.pdfDetailsBanner}>
                <View style={styles.pdfIconBadge}>
                  <Ionicons name="document" size={12} color="#FFFFFF" />
                  <Text style={styles.pdfIconBadgeText}>PDF</Text>
                </View>
                <View style={{ flex: 1, paddingLeft: 10, paddingRight: 6 }}>
                  <Text style={styles.pdfDetailsFileName} numberOfLines={1}>
                    {item.file_name || 'PDF Document'}
                  </Text>
                  <Text style={styles.pdfDetailsMeta}>
                    Document • Tap to view
                  </Text>
                </View>
                {downloadingFileId === item.id ? (
                  <ActivityIndicator size="small" color={Colors.accent.primary} />
                ) : isDownloaded ? (
                  <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                ) : (
                  <Ionicons name="arrow-down-circle-outline" size={20} color="#78909C" />
                )}
              </View>
            </TouchableOpacity>
          );
        }
        return (
          <TouchableOpacity
            style={styles.fileAttachmentCard}
            onPress={() => {
              if (item.file_url && onViewDocument) onViewDocument(item);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="document-text-outline" size={22} color={Colors.accent.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.fileNameText} numberOfLines={1}>
                {item.file_name || 'Document Attachment'}
              </Text>
            </View>
            {downloadingFileId === item.id ? (
              <ActivityIndicator size="small" color={Colors.accent.primary} />
            ) : isDownloaded ? (
              <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
            ) : (
              <Ionicons name="open-outline" size={16} color={Colors.text.tertiary} />
            )}
          </TouchableOpacity>
        );
      })()}

      {/* Engagement Row */}
      <View style={styles.engagementRow}>
        <TouchableOpacity
          style={styles.engagementButton}
          onPress={() => onLike(item.id)}
        >
          <Ionicons
            name={item.liked ? 'heart' : 'heart-outline'}
            size={20}
            color={item.liked ? Colors.status.danger : Colors.text.tertiary}
          />
          <Text
            style={[
              styles.engagementCount,
              item.liked && { color: Colors.status.danger },
            ]}
          >
            {item.likes}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.engagementButton}
          onPress={() => setIsExpanded(!isExpanded)}
        >
          <Ionicons
            name="chatbubble-outline"
            size={18}
            color={Colors.text.tertiary}
          />
          <Text style={styles.engagementCount}>{item.comments.length}</Text>
        </TouchableOpacity>

        <View style={styles.engagementButton}>
          <Ionicons name="eye-outline" size={20} color={Colors.text.tertiary} />
          <Text style={styles.engagementCount}>{item.viewed_by_count}</Text>
        </View>

        <TouchableOpacity style={styles.engagementButton} onPress={handleShare}>
          <Ionicons name="share-social-outline" size={18} color={Colors.text.tertiary} />
        </TouchableOpacity>

        {(item.file_url || item.media_url) && (
          <TouchableOpacity
            style={[styles.engagementButton, { marginLeft: 'auto' }]}
            onPress={() => {
              const url = item.file_url || item.media_url;
              if (url) handleDownload(url, item.file_name);
            }}
          >
            <Ionicons name="download-outline" size={20} color={Colors.accent.primary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Comments Section */}
      {isExpanded && (
        <View style={styles.commentsSection}>
          {commentsToRender.map((comment, idx) => {
            const replies = comment.replies || [];
            const isRepliesExpanded = !!expandedReplies[comment.id];
            const repliesToRender = isRepliesExpanded ? replies : replies.slice(0, 1);
            const isReplying = replyingCommentId === comment.id;

            return (
              <View key={comment.id || idx.toString()} style={styles.commentItemContainer}>
                {/* Comment row */}
                <View style={styles.commentItem}>
                  {(() => {
                    const commentAvatarUri = comment.author_id ? (avatarMap[comment.author_id] || comment.author_avatar) : comment.author_avatar;
                    return commentAvatarUri ? (
                      <CachedImage uri={commentAvatarUri} style={styles.commentAvatarImage} fallbackInitial={comment.author} />
                    ) : (
                      <View style={styles.commentAvatar}>
                        <Text style={styles.commentAvatarText}>
                          {comment.author.charAt(0)}
                        </Text>
                      </View>
                    );
                  })()}
                  <View style={styles.commentContent}>
                    <Text style={styles.commentAuthor}>{comment.author}</Text>
                    <Text style={styles.commentText}>{comment.text}</Text>
                    <TouchableOpacity 
                      style={styles.replyButton}
                      onPress={() => {
                        setReplyingCommentId(isReplying ? null : comment.id);
                        setReplyText('');
                      }}
                    >
                      <Text style={styles.replyButtonText}>Reply</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Nested Replies */}
                {replies.length > 0 && (
                  <View style={styles.repliesList}>
                    {repliesToRender.map((reply, rIdx) => {
                      const replyAvatarUri = reply.author_id ? (avatarMap[reply.author_id] || reply.author_avatar) : reply.author_avatar;
                      return (
                        <View key={rIdx} style={styles.replyItem}>
                          {replyAvatarUri ? (
                            <CachedImage uri={replyAvatarUri} style={styles.replyAvatarImage} fallbackInitial={reply.author} />
                          ) : (
                            <View style={styles.replyAvatar}>
                              <Text style={styles.replyAvatarText}>
                                {reply.author.charAt(0)}
                              </Text>
                            </View>
                          )}
                          <View style={styles.replyContent}>
                            <Text style={styles.replyAuthor}>{reply.author}</Text>
                            <Text style={styles.replyText}>{reply.text}</Text>
                            <TouchableOpacity 
                              style={styles.replyButton}
                              onPress={() => {
                                setReplyingCommentId(comment.id);
                                setReplyText(`@${reply.author} `);
                              }}
                            >
                              <Text style={styles.replyButtonText}>Reply</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}

                    {/* View more replies */}
                    {replies.length > 1 && (
                      <TouchableOpacity
                        style={styles.viewMoreRepliesButton}
                        onPress={() => {
                          setExpandedReplies(prev => ({
                            ...prev,
                            [comment.id]: !isRepliesExpanded
                          }));
                        }}
                      >
                        <Text style={styles.viewMoreRepliesText}>
                          {isRepliesExpanded ? 'Hide replies' : `View replies (${replies.length})`}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Reply Input row */}
                {isReplying && (
                  <View style={styles.replyInputRow}>
                    <TextInput
                      style={styles.replyInput}
                      placeholder={`Reply to ${comment.author}...`}
                      placeholderTextColor={Colors.text.tertiary}
                      value={replyText}
                      onChangeText={setReplyText}
                      onSubmitEditing={() => handleSendReply(comment.id)}
                    />
                    <TouchableOpacity style={styles.replySendButton} onPress={() => handleSendReply(comment.id)}>
                      <Ionicons name="send" size={14} color={Colors.accent.primary} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}

          {/* View more comments */}
          {item.comments.length > 2 && (
            <TouchableOpacity
              style={styles.viewCommentsButton}
              onPress={() => setShowAllComments(!showAllComments)}
            >
              <Text style={styles.viewCommentsText}>
                {showAllComments ? 'Collapse comments' : `View more comments (${item.comments.length - 2})`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Comment Input */}
      {isExpanded && (
        <View style={styles.commentInputRow}>
          <TextInput
            style={styles.commentInput}
            placeholder="Add a comment..."
            placeholderTextColor={Colors.text.tertiary}
            value={commentText}
            onChangeText={setCommentText}
            onSubmitEditing={handleSendComment}
          />
          <TouchableOpacity style={styles.commentSendButton} onPress={handleSendComment}>
            <Ionicons name="send" size={18} color={Colors.accent.primary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
function RotatingPlaceholderInput({ value, onChangeText, style, placeholderTextColor, multiline }: any) {
  const placeholders = ['Message', 'Announcement', 'Notes'];
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <TextInput
      style={style}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholders[placeholderIndex]}
      placeholderTextColor={placeholderTextColor}
      multiline={multiline}
    />
  );
}
export default function StudentCommunityScreen() {
  const { user, businessName, businessCode, avatarUrl } = useAuthStore();
  const activeStudentId = user?.id;
  const router = useRouter();
  const [studentCount, setStudentCount] = useState<number>(0);
  const [showGroupInfoModal, setShowGroupInfoModal] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [studentProfile, setStudentProfile] = useState<any | null>(null);
  const [coachingName, setCoachingName] = useState<string>('');
  const [coachingLogoUrl, setCoachingLogoUrl] = useState<string | null>(null);
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'media' | 'docs' | 'links'>('all');
  const [showSearch, setShowSearch] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  const { downloadedFiles, markAsDownloaded } = useDownloadStore();

  const { width: screenWidth } = Dimensions.get('window');
  const translateX = useRef(new Animated.Value(0)).current;
  const groupInfoAnim = useRef(new Animated.Value(0)).current;

  const postsLengthRef = useRef(0);
  useEffect(() => {
    postsLengthRef.current = posts.length;
  }, [posts]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return gestureState.dx > 10 && Math.abs(gestureState.dy) < 15;
      },
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dx > 0) {
          translateX.setValue(gestureState.dx);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx > screenWidth * 0.35 || gestureState.vx > 0.4) {
          Animated.timing(translateX, {
            toValue: screenWidth,
            duration: 150,
            useNativeDriver: true,
          }).start(() => {
            router.back();
            setTimeout(() => translateX.setValue(0), 300);
          });
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 50,
            friction: 7,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    const fetchStudentCount = async () => {
      const bizId = studentProfile?.business_id;
      if (!bizId) return;
      try {
        const { count, error } = await supabase
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', bizId);
        if (!error && count !== null) {
          setStudentCount(count);
        }
      } catch (err) {
        console.warn('Failed to fetch student count:', err);
      }
    };
    fetchStudentCount();
  }, [studentProfile?.business_id]);

  const sendLikePushNotification = async (recipientId: string, likerName: string, postText: string) => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('push_token')
        .eq('id', recipientId)
        .maybeSingle();

      if (profile?.push_token) {
        await sendPushNotification(
          [profile.push_token],
          '❤️ New Like',
          `${likerName} liked your post: "${postText.substring(0, 40)}${postText.length > 40 ? '...' : ''}"`,
          { screen: 'community' }, 1, CHANNELS.community
        );
      }
    } catch (err) {
      console.warn('Failed to send like push notification:', err);
    }
  };

  const sendCommentPushNotification = async (recipientId: string, commentAuthorName: string, text: string) => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('push_token')
        .eq('id', recipientId)
        .maybeSingle();

      if (profile?.push_token) {
        await sendPushNotification(
          [profile.push_token],
          '💬 New Comment',
          `${commentAuthorName}: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`,
          { screen: 'community' }, 1, CHANNELS.community
        );
      }
    } catch (err) {
      console.warn('Failed to send comment push notification:', err);
    }
  };

  const sendReplyPushNotification = async (recipientIds: string[], replyAuthorName: string, text: string) => {
    try {
      const uniqueIds = Array.from(new Set(recipientIds));
      if (uniqueIds.length === 0) return;

      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, push_token')
        .in('id', uniqueIds);

      if (error || !profiles) return;

      const tokens = profiles.map(p => p.push_token).filter(t => t);
      if (tokens.length > 0) {
        await sendPushNotification(
          tokens,
          '💬 New Reply',
          `${replyAuthorName}: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`,
          { screen: 'community' }, 1, CHANNELS.community
        );
      }
    } catch (err) {
      console.warn('Failed to send reply push notification:', err);
    }
  };

  useEffect(() => {
    const resolveAvatars = async () => {
      if (posts.length === 0) return;
      try {
        const uniqueIds = new Set<string>();
        posts.forEach((p) => {
          if (p.author_id) uniqueIds.add(p.author_id);
          p.comments.forEach((c) => {
            if (c.author_id) uniqueIds.add(c.author_id);
            c.replies?.forEach((r) => {
              if (r.author_id) uniqueIds.add(r.author_id);
            });
          });
        });

        const idList = Array.from(uniqueIds);
        if (idList.length === 0) return;

        const newMap: Record<string, string> = {};

        // 1. Fetch from profiles
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, avatar_url')
          .in('id', idList);

        profilesData?.forEach((p) => {
          if (p.avatar_url) newMap[p.id] = p.avatar_url;
        });

        // 2. Fetch from students
        const { data: studentsData } = await supabase
          .from('students')
          .select('user_id, photo_url')
          .in('user_id', idList);

        studentsData?.forEach((s) => {
          if (s.user_id && s.photo_url) newMap[s.user_id] = s.photo_url;
        });

        setAvatarMap((prev) => ({ ...prev, ...newMap }));
      } catch (err) {
        console.warn('Failed to resolve avatars map:', err);
      }
    };

    resolveAvatars();
  }, [posts]);

  const handleViewDocument = async (post: Post) => {
    // 1. OFFLINE FAST PATH: Check if already downloaded
    const existingLocalUri = downloadedFiles[post.id.toString()];
    if (existingLocalUri) {
      try {
        const fileInfo = await FileSystem.getInfoAsync(existingLocalUri);
        if (fileInfo.exists) {
          // It's local! Open it natively (for PDFs we will route to our internal viewer later, but for now we route to pdf-viewer if we have one)
          if (post.file_name?.toLowerCase().endsWith('.pdf') || post.file_url?.toLowerCase().endsWith('.pdf')) {
            router.push({ pathname: '/(student)/pdf-viewer', params: { uri: existingLocalUri, title: post.file_name || 'Document' } });
            return;
          }
          // For images/videos, we can just use intent or custom viewer. Since it's local, we might need intent.
          // Since we removed intent from kotlin, let's just open PDF internally for now.
        }
      } catch (e) {
        console.warn("Local file check failed, re-downloading", e);
      }
    }

    let downloadUrl = '';
    setDownloadingFileId(post.id);

    try {
      if (post.tg_file_id) {
        try {
          downloadUrl = await getTelegramFastLink(post.tg_file_id);
        } catch (tgError) {
          console.warn("Telegram link resolve failed", tgError);
        }
      }
      if (!downloadUrl && post.backup_url) downloadUrl = post.backup_url;
      else if (!downloadUrl && post.file_url) downloadUrl = post.file_url;

      if (!downloadUrl) throw new Error('No valid download link found.');

      // 3. Download via our Native Module
      const result = await downloadAndOpenSaf(downloadUrl, post.file_name || 'document.pdf');
      
      if (!result.success && result.error !== 'No directory selected.') {
         throw new Error(result.error);
      } else if (result.success && result.uri) {
         // Mark as downloaded for offline access!
         markAsDownloaded(post.id.toString(), result.uri);
         
         // Now that it's downloaded, open it internally if it's a PDF
         if (post.file_name?.toLowerCase().endsWith('.pdf') || post.file_url?.toLowerCase().endsWith('.pdf')) {
            router.push({ pathname: '/(student)/pdf-viewer', params: { uri: result.uri, title: post.file_name || 'Document' } });
         }
      }
      
    } catch (err) {
      console.warn('Failed to download document:', err);
      Alert.alert('Error', 'Failed to open document. Please check your internet connection.');
    } finally {
      setDownloadingFileId(null);
    }
  };

  const fetchStudentProfile = useCallback(async () => {
    if (!user) return null;
    try {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('user_id', user.id)
        .single();

      console.log('[DEBUG] fetchStudentProfile result:', data);
      if (error) {
        console.log('[DEBUG] fetchStudentProfile error:', error);
      }

      // Debug check the profiles table for this user
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      console.log('[DEBUG] profiles row for student:', profileRow);

      if (!error && data) {
        setStudentProfile(data);
        
        // Fetch business details
        try {
          const { data: bizData } = await supabase
            .from('businesses')
            .select('name, avatar_url')
            .eq('id', data.business_id)
            .single();
            
          if (bizData) {
            setCoachingName(bizData.name || '');
            setCoachingLogoUrl(bizData.avatar_url || null);
          }

          // Fetch student count
          const { count } = await supabase
            .from('students')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', data.business_id);
          if (count !== null) {
            setStudentCount(count);
          }
        } catch (bizErr) {
          console.warn('Failed to fetch business details for student:', bizErr);
        }

        return data;
      }
    } catch (err) {
      console.warn('Failed to fetch student profile for community:', err);
    }
    return null;
  }, [user]);

  const fetchPosts = useCallback(async (silent = false) => {
    if (!silent) {
      try {
        const cached = getPostsFromLocal();
        if (cached.length > 0) {
          setPosts(cached);
          setIsLoading(false);
        } else {
          setIsLoading(true);
        }
      } catch (err) {
        setIsLoading(true);
      }
    }
    try {
      const profile = studentProfile || await fetchStudentProfile();
      console.log('[DEBUG] fetchPosts using profile:', profile);
      if (!profile) {
        setIsLoading(false);
        console.log('[DEBUG] fetchPosts aborted because profile is null');
        return;
      }

      const { data, error } = await supabase
        .from('community_posts')
        .select('*')
        .eq('business_id', profile.business_id)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      console.log('[DEBUG] fetchPosts query result count:', data?.length);
      if (error) {
        console.log('[DEBUG] fetchPosts query error:', error);
      }

      if (error) throw error;

      // Load read posts to determine if NEW
      const readPostsJSON = await AsyncStorage.getItem('@presto_student_read_posts');
      const readPosts: string[] = readPostsJSON ? JSON.parse(readPostsJSON) : [];

      const loadedPosts: Post[] = [];
      
      for (const p of (data || [])) {
        // Filter by batch
        const targetBatches = p.target_batches || [];
        console.log('[DEBUG] Post target_batches:', targetBatches, 'Student batch:', profile.batch_name);
        if (targetBatches.length > 0 && !targetBatches.includes(profile.batch_name)) {
          console.log('[DEBUG] Post skipped due to batch mismatch');
          continue; // Skip post intended for another batch
        }

        const isNewPost = !readPosts.includes(String(p.id));

        const createdDate = new Date(p.created_at);
        const timeLabel = createdDate.toLocaleDateString('en-US', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });

        const likedByArray = Array.isArray(p.liked_by) ? p.liked_by : [];
        const isLiked = user ? likedByArray.includes(user.id) : false;

        // Track post views by updating viewed_by list in background
        const viewedByArray = Array.isArray(p.viewed_by) ? [...p.viewed_by] : [];
        if (user && !viewedByArray.includes(user.id)) {
          viewedByArray.push(user.id);
          supabase
            .from('community_posts')
            .update({ viewed_by: viewedByArray })
            .eq('id', p.id)
            .then(({ error }) => {
              if (error) console.log('Failed to update viewed_by in background:', error);
            });
        }

        loadedPosts.push({
          id: String(p.id),
          author_id: p.author_id,
          author: p.author_name || 'Upendra Sir',
          category: p.category,
          text: p.text,
          timestamp: p.created_at,
          likes: p.likes || 0,
          comments: p.comments || [],
          liked: isLiked,
          liked_by: likedByArray,
          viewed_by_count: viewedByArray.length,
          media_url: p.media_url,
          file_url: p.file_url,
          file_name: p.file_name,
          target_batches: Array.isArray(p.target_batches) ? p.target_batches : [],
          author_avatar: p.author_avatar,
          is_edited: p.is_edited,
          is_new: isNewPost,
        });
      }
      setPosts(loadedPosts);
      try {
        savePostsToLocal(loadedPosts);
      } catch (dbErr) {
        console.warn('Failed to save posts to SQLite local cache:', dbErr);
      }
      if (loadedPosts.length > 0) {
        const postIds = loadedPosts.map(p => p.id);
        AsyncStorage.setItem('@presto_student_read_posts', JSON.stringify(postIds)).then(() => {
          useNotificationStore.getState().setStudentCommunityUnreadCount(0);
        }).catch(err => console.warn('Failed to save read posts:', err));
      }
    } catch (err) {
      console.warn('Failed to fetch community posts:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user, fetchStudentProfile, studentProfile]);

  useEffect(() => {
    // 1. Pre-load cached student profile from AsyncStorage immediately
    AsyncStorage.getItem('@presto_cached_student_data').then(cached => {
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          setStudentProfile(parsed);
        } catch (_) {}
      }
    }).catch(_ => {});

    // 2. Refresh user metadata in background exactly once on mount to get latest avatar
    const refreshUser = async () => {
      try {
        const { data: { user: freshUser } } = await supabase.auth.getUser();
        if (freshUser) {
          useAuthStore.getState().setUser(freshUser);
        }
      } catch (e) {
        console.warn('Failed to refresh user in community:', e);
      }
    };
    refreshUser();

    // 3. Pre-request picker permissions in background for 0ms latency launch
    const ImagePicker = require('expo-image-picker');
    ImagePicker.getMediaLibraryPermissionsAsync().then((status: any) => {
      if (!status.granted) ImagePicker.requestMediaLibraryPermissionsAsync().catch((_: any) => {});
    }).catch((_: any) => {});
    ImagePicker.getCameraPermissionsAsync().then((status: any) => {
      if (!status.granted) ImagePicker.requestCameraPermissionsAsync().catch((_: any) => {});
    }).catch((_: any) => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchStudentProfile();
      fetchPosts(postsLengthRef.current > 0);
    }, [fetchStudentProfile, fetchPosts])
  );

  useEffect(() => {
    // Set up postgres realtime subscription for auto-syncing updates
    const channel = supabase
      .channel('student-community-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_posts',
        },
        (payload) => {
          console.log('Realtime community change detected:', payload);
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new;
            setPosts((prev) =>
              prev.map((p) =>
                p.id === String(updated.id)
                  ? {
                      ...p,
                      likes: updated.likes ?? 0,
                      comments: updated.comments ?? [],
                      liked_by: updated.liked_by ?? [],
                      liked: user ? (updated.liked_by ?? []).includes(user.id) : false,
                      viewed_by_count: Array.isArray(updated.viewed_by) ? updated.viewed_by.length : 0,
                      media_url: updated.media_url,
                      file_url: updated.file_url,
                      file_name: updated.file_name,
                      author_avatar: updated.author_avatar,
                      is_edited: updated.is_edited,
                      author_id: updated.author_id,
                      text: updated.text ?? p.text,
                    }
                  : p
              )
            );
          } else {
            fetchPosts(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPosts, user]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await fetchPosts(true);
    setIsRefreshing(false);
  };

  const toggleLike = async (postId: string) => {
    if (!user) return;
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    const likedByArray = [...(post.liked_by || [])];
    const userIndex = likedByArray.indexOf(user.id);
    const nextLiked = userIndex === -1;

    if (nextLiked) {
      likedByArray.push(user.id);
    } else {
      likedByArray.splice(userIndex, 1);
    }

    const nextLikes = likedByArray.length;

    // Optimistic Update
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, liked: nextLiked, likes: nextLikes, liked_by: likedByArray } : p
      )
    );

    try {
      const { error } = await supabase
        .from('community_posts')
        .update({
          likes: nextLikes,
          liked_by: likedByArray,
        })
        .eq('id', Number(postId));

      if (error) throw error;

      if (nextLiked && post.author_id && post.author_id !== user.id) {
        sendLikePushNotification(post.author_id, studentProfile?.name || 'A student', post.text);
      }
    } catch (err) {
      // Revert on failure
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, liked: post.liked, likes: post.likes, liked_by: post.liked_by } : p
        )
      );
      console.warn('Failed to update like status:', err);
    }
  };

  const handleVote = async (postId: string, optionIndex: number) => {
    if (!user) return;
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    const pollData = parsePollData(post.text);
    if (!pollData) return;

    const votes = { ...(pollData.votes || {}) };
    const currentVote = votes[user.id];

    if (currentVote && currentVote.option === optionIndex) {
      delete votes[user.id];
    } else {
      const studentName = studentProfile?.name || 'Student';
      votes[user.id] = {
        option: optionIndex,
        name: studentName,
      };
    }

    const nextPollData = { ...pollData, votes };
    const nextText = JSON.stringify(nextPollData);

    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, text: nextText } : p
      )
    );

    try {
      const { error } = await supabase
        .from('community_posts')
        .update({
          text: nextText,
        })
        .eq('id', Number(postId));

      if (error) throw error;
    } catch (err) {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, text: post.text } : p
        )
      );
      console.warn('Failed to update vote:', err);
    }
  };

  const handleAddComment = async (postId: string, text: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    const newComment: Comment = {
      id: Math.random().toString(36).substring(2, 9),
      author_id: user?.id,
      author: studentProfile?.name || 'Student',
      author_avatar: studentProfile?.photo_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || undefined,
      text,
      timestamp: new Date().toLocaleDateString('en-US', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
      replies: [],
    };
    const newCommentList = [...post.comments, newComment];

    // Optimistic Update
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, comments: newCommentList } : p
      )
    );

    try {
      const { error } = await supabase
        .from('community_posts')
        .update({ comments: newCommentList })
        .eq('id', Number(postId));

      if (error) throw error;

      if (post.author_id && post.author_id !== user?.id) {
        sendCommentPushNotification(post.author_id, studentProfile?.name || 'A student', text);
      }
    } catch (err) {
      // Revert on failure
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, comments: post.comments } : p
        )
      );
      console.warn('Failed to add comment:', err);
    }
  };

  const handleAddReply = async (postId: string, commentId: string, text: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    const newReply: Reply = {
      author_id: user?.id,
      author: studentProfile?.name || 'Student',
      author_avatar: studentProfile?.photo_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || undefined,
      text,
      timestamp: new Date().toLocaleDateString('en-US', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    const newCommentList = post.comments.map((comment, idx) => {
      const cId = comment.id || idx.toString();
      if (cId === commentId) {
        return {
          ...comment,
          replies: [...(comment.replies || []), newReply],
        };
      }
      return comment;
    });

    // Optimistic Update
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, comments: newCommentList } : p
      )
    );

    try {
      const { error } = await supabase
        .from('community_posts')
        .update({ comments: newCommentList })
        .eq('id', Number(postId));

      if (error) throw error;

      // Notify relevant users (post author, comment author, and mentioned reply author)
      const recipientIds: string[] = [];
      if (post.author_id && post.author_id !== user?.id) {
        recipientIds.push(post.author_id);
      }
      const comment = post.comments.find((c, idx) => (c.id || idx.toString()) === commentId);
      if (comment) {
        if (comment.author_id && comment.author_id !== user?.id) {
          recipientIds.push(comment.author_id);
        }
        if (text.startsWith('@')) {
          const firstSpace = text.indexOf(' ');
          if (firstSpace !== -1) {
            const mention = text.substring(1, firstSpace).toLowerCase().replace(/[^a-z0-9]/g, '');
            const matchedReply = comment.replies?.find(r => 
              r.author.toLowerCase().replace(/[^a-z0-9]/g, '').includes(mention) || 
              mention.includes(r.author.toLowerCase().replace(/[^a-z0-9]/g, ''))
            );
            if (matchedReply && matchedReply.author_id && matchedReply.author_id !== user?.id) {
              recipientIds.push(matchedReply.author_id);
            }
          }
        }
      }

      if (recipientIds.length > 0) {
        sendReplyPushNotification(recipientIds, studentProfile?.name || 'A student', text);
      }
    } catch (err) {
      // Revert on failure
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, comments: post.comments } : p
        )
      );
      console.warn('Failed to add reply:', err);
    }
  };

  const renderHeader = () => (
    <>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Community</Text>
        <TouchableOpacity onPress={() => setShowSearch(!showSearch)} style={styles.premiumSearchButton}>
          <Ionicons
            name={showSearch ? "close" : "search"}
            size={20}
            color={Colors.accent.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Telegram-like Search Bar */}
      {showSearch && (
        <View style={styles.searchBarHeader}>
          <Ionicons name="search" size={18} color={Colors.text.tertiary} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchBarInput}
            placeholder="Search messages, files, or links..."
            placeholderTextColor={Colors.text.tertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={Colors.text.tertiary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Category Tabs */}
      <View style={styles.filterChipsRow}>
        {(['all', 'media', 'docs', 'links'] as const).map((filter) => {
          const isActive = activeFilter === filter;
          return (
            <TouchableOpacity
              key={filter}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => setActiveFilter(filter)}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );

  const filteredPosts = posts.filter((post) => {
    // 1. Category Filter
    if (activeFilter === 'media') {
      if (!post.media_url) return false;
    } else if (activeFilter === 'docs') {
      if (!post.file_url) return false;
    } else if (activeFilter === 'links') {
      const hasLink = post.text && /(https?:\/\/[^\s]+)/g.test(post.text);
      if (!hasLink) return false;
    }

    // 2. Search Query Filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const textMatch = post.text ? post.text.toLowerCase().includes(query) : false;
      const fileMatch = post.file_name ? post.file_name.toLowerCase().includes(query) : false;
      const authorMatch = post.author ? post.author.toLowerCase().includes(query) : false;
      if (!textMatch && !fileMatch && !authorMatch) return false;
    }

    return true;
  });

  const activeStudent = studentProfile || {
    name: 'Student User',
    father_name: '',
    batch_name: 'Other',
    course: 'General',
    enrollment_id: 'UCI-PENDING',
    phone: '',
    id: user?.id,
    fee_amount: 2500,
    fee_status: 'unpaid',
    next_due_date: 'N/A',
    admission_date: 'N/A',
    photo_url: '',
    valid_from: '01/26',
    valid_till: '01/27',
    dob: '',
    address: '',
    whatsapp: '',
    blood_group: '',
    duration: '1 Year',
    batch_timing: '10:00 AM - 01:00 PM'
  };

  const cardData = {
    studentName: activeStudent.name,
    fatherName: activeStudent.father_name || 'Not Set',
    batch: activeStudent.batch_name,
    course: activeStudent.course || 'General',
    enrollmentId: activeStudent.enrollment_id,
    phone: activeStudent.phone || 'Not Set',
    coachingName: coachingName || businessName || 'PrestoID Coaching',
    qrValue: `KF-${activeStudent.id}-${activeStudent.enrollment_id}`,
    feeAmount: Number(activeStudent.fee_amount || 0),
    feeStatus: (activeStudent.fee_status || 'unpaid') as 'paid' | 'unpaid' | 'overdue',
    nextDueDate: activeStudent.next_due_date || 'N/A',
    admissionDate: activeStudent.admission_date || 'N/A',
    photoUrl: activeStudent.photo_url || '',
    validFrom: activeStudent.valid_from || '01/26',
    validTill: activeStudent.valid_till || '01/27',
    dob: activeStudent.dob || 'Not Set',
    address: activeStudent.address || 'Not Set',
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']} {...panResponder.panHandlers}>
      {/* Visual background placeholder of the Student ID Card home screen */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 10 }]}>
        {/* Mock Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 50, marginBottom: 16 }}>
          {activeStudent.photo_url ? (
            <Image source={{ uri: activeStudent.photo_url }} style={{ width: 34, height: 34, borderRadius: 17 }} />
          ) : (
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#EBEBEB', justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.text.secondary }}>{activeStudent.name ? activeStudent.name.charAt(0) : 'S'}</Text>
            </View>
          )}
          <Text style={{ fontSize: 18, fontWeight: '700', color: Colors.text.primary }}>PrestoID</Text>
          <View style={{ width: 34 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
          {/* Mock Title Section */}
          <View style={{ marginBottom: 20, marginTop: 10 }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: Colors.text.primary }}>Virtual ID Card</Text>
            <Text style={{ fontSize: 13, color: Colors.text.tertiary, marginTop: 4 }}>
              Present this code for campus access and attendance.
            </Text>
          </View>

          {/* Real Live Activity Widget styling */}
          <View style={{ width: '100%', height: 95, backgroundColor: '#1E1B4B', borderRadius: 12, padding: 16, marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ADE80', marginRight: 6 }} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#4ADE80', letterSpacing: 0.5 }}>LIVE AT UCI</Text>
              </View>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ fontSize: 10, color: '#FFF', fontWeight: '500' }}>{activeStudent.batch_timing || '10:00 AM - 1:00 PM'}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF', marginBottom: 4 }}>{activeStudent.course || 'General Coaching'}</Text>
            <Text style={{ fontSize: 11, color: '#A5B4FC' }}>
              Batch: {activeStudent.batch_name} • Duration: {activeStudent.duration || '1 Year'}
            </Text>
          </View>

          {/* Real Virtual ID Card Component */}
          <View style={{ width: '100%', minHeight: 240, marginBottom: 20 }}>
            <VirtualIDCard {...cardData} />
          </View>
        </ScrollView>
      </View>

      <Animated.View style={[{ flex: 1, backgroundColor: '#FFFFFF', transform: [{ translateX }] }]}>
        {/* Telegram-style Header */}
        <TouchableOpacity 
          style={styles.telegramHeader} 
          activeOpacity={0.9}
          onPress={() => {
            setShowGroupInfoModal(true);
            Animated.spring(groupInfoAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 9 }).start();
          }}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBackBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.text.primary} />
          </TouchableOpacity>
          
          {coachingLogoUrl ? (
            <Image source={{ uri: coachingLogoUrl }} style={styles.headerLogo} />
          ) : (
            <View style={[styles.headerLogo, { justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.accent.primary + '10' }]}>
              <Ionicons name="megaphone" size={20} color={Colors.accent.primary} />
            </View>
          )}
          
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitleText} numberOfLines={1}>
              {coachingName || businessName || 'UCI Coaching Sehore'}
            </Text>
            <Text style={styles.headerSubtitleText}>
              {studentCount > 0 ? `${studentCount.toLocaleString()} subscribers` : '0 subscribers'}
            </Text>
          </View>

          <TouchableOpacity onPress={() => setShowSearch(!showSearch)} style={styles.headerSearchBtn}>
            <Ionicons name={showSearch ? "close" : "search"} size={22} color={Colors.text.secondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerMenuBtn} onPress={() => {
            setShowGroupInfoModal(true);
            Animated.spring(groupInfoAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 9 }).start();
          }}>
            <Ionicons name="ellipsis-vertical" size={20} color={Colors.text.secondary} />
          </TouchableOpacity>
        </TouchableOpacity>

      {/* Search Bar (Sticky at top below header if active) */}
      {showSearch && (
        <View style={{ backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#EBEBEB' }}>
          <View style={styles.searchBarHeader}>
            <Ionicons name="search" size={18} color={Colors.text.tertiary} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchBarInput}
              placeholder="Search messages, files, or links..."
              placeholderTextColor={Colors.text.tertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color={Colors.text.tertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={filteredPosts}
          renderItem={({ item, index }) => {
            const showDivider = index === 0 ||
              new Date(filteredPosts[index].timestamp).toDateString() !==
              new Date(filteredPosts[index - 1].timestamp).toDateString();

            return (
              <View>
                {showDivider && (
                  <View style={styles.dateDividerContainer}>
                    <View style={styles.dateDividerBubble}>
                      <Text style={styles.dateDividerText}>
                        {getFormattedDividerDate(item.timestamp)}
                      </Text>
                    </View>
                  </View>
                )}
                <PostCard
                  item={item}
                  studentName={studentProfile?.name || 'Student'}
                  studentPhotoUrl={studentProfile?.photo_url || null}
                  avatarMap={avatarMap}
                  onLike={toggleLike}
                  onAddComment={handleAddComment}
                  onAddReply={handleAddReply}
                  onVote={handleVote}
                  downloadingFileId={downloadingFileId}
                  onViewDocument={handleViewDocument}
                />
              </View>
            );
          }}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          ListEmptyComponent={
            isLoading ? (
              <View style={styles.emptyContainer}>
                <ActivityIndicator size="large" color={Colors.accent.primary} />
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons
                  name="megaphone-outline"
                  size={40}
                  color={Colors.text.tertiary}
                />
                <Text style={styles.emptyText}>
                  No announcements from your organization yet.
                </Text>
              </View>
            )
          }
        />
      </KeyboardAvoidingView>
    </Animated.View>

      {/* Telegram-style Group Info Details Absolute sliding overlay */}
      {showGroupInfoModal && (
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#F0F2F5', zIndex: 9999, transform: [{ translateX: groupInfoAnim.interpolate({ inputRange: [0, 1], outputRange: [screenWidth, 0] }) }] }]}>
          <SafeAreaView style={styles.groupInfoModalContainer} edges={['top']}>
            {/* Modal Header */}
            <View style={[styles.telegramHeader, { borderBottomWidth: 0 }]}>
              <TouchableOpacity onPress={() => {
                Animated.timing(groupInfoAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
                  setShowGroupInfoModal(false);
                });
              }} style={styles.headerBackBtn}>
                <Ionicons name="chevron-back" size={24} color={Colors.text.primary} />
              </TouchableOpacity>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#000', flex: 1 }}>Info</Text>
              <TouchableOpacity style={styles.headerMenuBtn}>
                <Ionicons name="ellipsis-vertical" size={20} color={Colors.text.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Hero Card */}
              <View style={styles.groupInfoHeroCard}>
                {coachingLogoUrl ? (
                  <Image source={{ uri: coachingLogoUrl }} style={styles.groupInfoBigLogo} />
                ) : (
                  <View style={[styles.groupInfoBigLogo, { justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.accent.primary + '10' }]}>
                    <Ionicons name="megaphone" size={48} color={Colors.accent.primary} />
                  </View>
                )}
                
                <Text style={styles.groupInfoTitle}>{coachingName || businessName || 'UCI Coaching Sehore'}</Text>
                <Text style={styles.groupInfoSubtitle}>
                  {studentCount > 0 ? `${studentCount.toLocaleString()} subscribers` : '0 subscribers'}
                </Text>

                {/* Action row */}
                <View style={styles.groupInfoActionsRow}>
                  <TouchableOpacity 
                    style={styles.groupInfoActionItem}
                    onPress={() => {
                      Animated.timing(groupInfoAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
                        setShowGroupInfoModal(false);
                        router.push('/notes');
                      });
                    }}
                  >
                    <View style={styles.groupInfoActionIconContainer}>
                      <Ionicons name="document-text" size={24} color={Colors.accent.primary} />
                    </View>
                    <Text style={styles.groupInfoActionText}>Notes</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Invite Link section */}
              <View style={styles.groupInfoLinkCard}>
                <Text style={styles.groupInfoLinkLabel}>presto.link/{businessCode || 'invite'}</Text>
                <Text style={styles.groupInfoLinkSubtitle}>Invite Link (Org Code: {businessCode || '–'})</Text>
              </View>

              {/* Tabs Filter section */}
              <View style={styles.groupInfoTabsSection}>
                <View style={styles.groupInfoTabsRow}>
                  {(['media', 'docs', 'links'] as const).map(tab => (
                    <TouchableOpacity
                      key={tab}
                      style={[styles.groupInfoTab, activeFilter === tab && styles.groupInfoTabActive]}
                      onPress={() => {
                        setActiveFilter(tab);
                        Animated.timing(groupInfoAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
                          setShowGroupInfoModal(false);
                        });
                      }}
                    >
                      <Text style={[styles.groupInfoTabText, activeFilter === tab && styles.groupInfoTabTextActive]}>
                        {tab === 'media' ? 'Media' : tab === 'docs' ? 'Files' : 'Links'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text.primary,
  },

  // Post Card
  postCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.card.border,
    padding: 16,
    marginBottom: 14,
    ...Shadows.sm,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  postAuthorAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.stitch.primaryFixed,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postAuthorInitial: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.accent.primary,
  },
  postAuthorName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  postTimestamp: {
    fontSize: 11,
    color: Colors.text.tertiary,
    fontWeight: '500',
    marginTop: 1,
  },
  editedLabel: {
    fontSize: 10,
    color: Colors.text.tertiary,
    fontStyle: 'italic',
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  postText: {
    fontSize: 14,
    color: Colors.text.primary,
    lineHeight: 21,
    fontWeight: '500',
    marginBottom: 12,
  },

  // Engagement Row
  engagementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.card.border + '60',
  },
  engagementButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  engagementCount: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.tertiary,
  },

  // Comments
  viewCommentsButton: {
    marginTop: 8,
  },
  viewCommentsText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.tertiary,
  },
  commentsSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.card.border + '40',
    gap: 10,
  },
  commentItem: {
    flexDirection: 'row',
    gap: 8,
  },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.bg.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentAvatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  commentContent: {
    flex: 1,
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 10,
    padding: 10,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  commentText: {
    fontSize: 12,
    color: Colors.text.secondary,
    fontWeight: '500',
    lineHeight: 17,
  },
  viewAllCommentsText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.accent.primary,
    marginTop: 4,
  },

  // Comment Input
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.card.border + '40',
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#FFFFFF', // Milk color
    borderRadius: 20, // WhatsApp-like curveness
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '500',
    color: '#000000',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  commentSendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.text.secondary,
    fontWeight: '500',
    textAlign: 'center',
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 12,
  },
  fileAttachmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.card.border,
    marginBottom: 12,
    gap: 10,
  },
  fileNameText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  commentItemContainer: {
    marginBottom: 10,
  },
  replyButton: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  replyButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.accent.primary,
  },
  repliesList: {
    marginLeft: 36,
    marginTop: 8,
    gap: 8,
  },
  replyItem: {
    flexDirection: 'row',
    gap: 8,
  },
  replyAvatar: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: Colors.bg.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  replyAvatarText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  replyAvatarImage: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  commentAvatarImage: {
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  replyContent: {
    flex: 1,
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 8,
    padding: 8,
  },
  replyAuthor: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  replyText: {
    fontSize: 11,
    color: Colors.text.secondary,
    fontWeight: '500',
    lineHeight: 15,
  },
  viewMoreRepliesButton: {
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  viewMoreRepliesText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.tertiary,
  },
  replyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 36,
    marginTop: 8,
  },
  replyInput: {
    flex: 1,
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '500',
    color: Colors.text.primary,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  replySendButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.accent.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postAuthorAvatarImage: {
    width: 38,
    height: 38,
    borderRadius: 12,
  },
  searchBarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1,
    borderColor: Colors.card.border,
    marginBottom: 8,
  },
  searchBarInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text.primary,
  },
  filterChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.bg.tertiary,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  filterChipActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dateDividerContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  dateDividerBubble: {
    backgroundColor: 'rgba(220, 248, 198, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    ...Shadows.sm,
  },
  dateDividerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#34495E',
    textTransform: 'capitalize',
  },
  pdfAttachmentCardContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 12,
  },
  pdfPreviewImageContainer: {
    height: 140,
    width: '100%',
    backgroundColor: '#ECEFF1',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    position: 'relative',
  },
  pdfPreviewImage: {
    width: '100%',
    height: '100%',
  },
  pdfPreviewWrapper: {
    flex: 1,
    position: 'relative',
  },
  pdfPlaceholderLayout: {
    flex: 1,
    backgroundColor: '#ECEFF1',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  pdfPlaceholderPage: {
    width: '85%',
    height: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    padding: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  pdfPlaceholderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    paddingBottom: 6,
    marginBottom: 10,
  },
  pdfPlaceholderTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#37474F',
    marginLeft: 6,
    flex: 1,
  },
  pdfPlaceholderBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 8,
  },
  pdfPlaceholderLine: {
    height: 6,
    backgroundColor: '#CFD8DC',
    borderRadius: 3,
  },
  pdfDetailsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  pdfIconBadge: {
    backgroundColor: '#E53935',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  pdfIconBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  pdfDetailsFileName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#263238',
  },
  pdfDetailsMeta: {
    fontSize: 11,
    color: '#78909C',
    marginTop: 2,
  },
  pollContainer: {
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.card.border,
    marginBottom: 12,
    gap: 8,
  },
  pollQuestionText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 6,
  },
  pollOptionWrapper: {
    marginBottom: 6,
    gap: 3,
  },
  pollOptionButton: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.card.border,
    backgroundColor: Colors.bg.secondary,
    overflow: 'hidden',
    justifyContent: 'center',
    position: 'relative',
  },
  pollOptionButtonSelected: {
    borderColor: Colors.accent.primary,
  },
  pollOptionProgress: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(175, 40, 0, 0.08)',
  },
  pollOptionProgressSelected: {
    backgroundColor: 'rgba(175, 40, 0, 0.15)',
  },
  pollOptionTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    zIndex: 10,
  },
  pollOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  pollOptionTextSelected: {
    color: Colors.accent.primary,
    fontWeight: '700',
  },
  pollOptionPctText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  pollVotersText: {
    fontSize: 10,
    color: Colors.text.tertiary,
    paddingLeft: 4,
  },
  pollTotalVotesText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.tertiary,
    marginTop: 4,
    textAlign: 'right',
  },
  fullImageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImageCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 100,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImageStyle: {
    width: '100%',
    height: '80%',
  },
  premiumSearchButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: 'rgba(175, 40, 0, 0.15)',
    backgroundColor: 'rgba(175, 40, 0, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Telegram Header
  telegramHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
  },
  headerBackBtn: {
    paddingRight: 10,
  },
  headerLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
  },
  headerTitleText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  headerSubtitleText: {
    fontSize: 12,
    color: Colors.text.tertiary,
    marginTop: 1,
  },
  headerSearchBtn: {
    padding: 8,
    marginRight: 4,
  },
  headerMenuBtn: {
    padding: 8,
  },

  // Telegram Group Info Modal
  groupInfoModalContainer: {
    flex: 1,
    backgroundColor: '#F0F2F5', // Milky layered off-white background
  },
  groupInfoHeroCard: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
  },
  groupInfoBigLogo: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
    backgroundColor: '#F0F0F0',
  },
  groupInfoTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
  },
  groupInfoSubtitle: {
    fontSize: 14,
    color: Colors.text.tertiary,
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '500',
  },
  groupInfoActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
  groupInfoActionItem: {
    alignItems: 'center',
    width: 72,
  },
  groupInfoActionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F5F6F8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  groupInfoActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  groupInfoLinkCard: {
    backgroundColor: '#FFFFFF',
    marginTop: 12,
    padding: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#EBEBEB',
  },
  groupInfoLinkLabel: {
    fontSize: 14,
    color: Colors.accent.primary,
    fontWeight: '700',
  },
  groupInfoLinkSubtitle: {
    fontSize: 11,
    color: Colors.text.tertiary,
    marginTop: 2,
  },
  groupInfoTabsSection: {
    backgroundColor: '#FFFFFF',
    marginTop: 12,
    flex: 1,
    borderTopWidth: 1,
    borderColor: '#EBEBEB',
  },
  groupInfoTabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
    paddingHorizontal: 8,
  },
  groupInfoTab: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  groupInfoTabActive: {
    borderBottomColor: Colors.accent.primary,
  },
  groupInfoTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.tertiary,
  },
  groupInfoTabTextActive: {
    color: Colors.accent.primary,
    fontWeight: '700',
  },
});

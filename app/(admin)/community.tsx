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
import * as ImagePicker from 'expo-image-picker';
let DocumentPicker: any = null;
try {
  DocumentPicker = require('expo-document-picker');
} catch (e) {
  console.warn('DocumentPicker native module not found:', e);
}
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { decode } from 'base64-arraybuffer';
import CachedImage from '@/components/CachedImage';
import { savePostsToLocal, getPostsFromLocal } from '@/lib/localDb';
import { Colors, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useFocusEffect, useRouter } from 'expo-router';
import { sendPushNotification, scheduleLocalNotification, CHANNELS } from '@/lib/notifications';
import { uploadFileToGoogleDrive, deleteFileFromGoogleDrive } from '@/lib/googleDrive';

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
  media_url?: string;
  file_url?: string;
  file_name?: string;
  target_batches?: string[];
  author_avatar?: string | null;
  is_edited?: boolean;
};

const CATEGORIES: { key: Post['category']; label: string }[] = [
  { key: 'announcement', label: 'Announcement' },
  { key: 'note', label: 'Note' },
  { key: 'schedule', label: 'Schedule' },
];

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
  avatarMap: Record<string, string>;
  onLike: (postId: string) => void;
  onAddComment: (postId: string, text: string) => void;
  onAddReply: (postId: string, commentId: string, text: string) => void;
  onEdit: (post: Post) => void;
  onDelete: (postId: string) => void;
  onVote: (postId: string, optionIndex: number) => void;
}

function PostCard({ item, onLike, onAddComment, onAddReply, onEdit, onDelete, avatarMap, onVote }: PostCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showAllComments, setShowAllComments] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [replyingCommentId, setReplyingCommentId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [showFullImage, setShowFullImage] = useState(false);
  const { user } = useAuthStore();

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
            <Text style={styles.postAuthorInitial}>
              {item.author.charAt(0)}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.postAuthorName}>{item.author}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.postTimestamp}>{formatBubbleTime(item.timestamp)}</Text>
            {item.is_edited && (
              <Text style={styles.editedLabel}>• Edited</Text>
            )}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.categoryBadge, { backgroundColor: cat.bg }]}>
            <Text style={styles.categoryBadgeText}>{cat.label}</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              Alert.alert(
                'Post Options',
                'Choose an action for this post:',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Edit Post', onPress: () => onEdit(item) },
                  { text: 'Delete Post', style: 'destructive', onPress: () => onDelete(item.id) },
                ]
              );
            }}
            style={styles.optionsPostButton}
            activeOpacity={0.7}
          >
            <Ionicons name="ellipsis-vertical-outline" size={18} color={Colors.text.tertiary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Post Content & Poll support */}
      {(() => {
        const pollData = parsePollData(item.text);
        if (pollData) {
          const votes = pollData.votes || {};
          const totalVotes = Object.keys(votes).length;
          const userVote = user ? votes[user.id]?.option : undefined;

          return (
            <View style={styles.pollContainer}>
              <Text style={styles.pollQuestionText}>{pollData.question}</Text>
              
              {pollData.options.map((opt: string, optIdx: number) => {
                const optVotes = Object.values(votes).filter((v: any) => v.option === optIdx);
                const voteCount = optVotes.length;
                const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                const isSelected = userVote === optIdx;

                const voterNames = optVotes.map((v: any) => v.name).join(', ');

                return (
                  <View key={optIdx} style={styles.pollOptionWrapper}>
                    <TouchableOpacity
                      style={[
                        styles.pollOptionButton,
                        isSelected && styles.pollOptionButtonSelected,
                      ]}
                      onPress={() => onVote(item.id, optIdx)}
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
                if (item.file_url) handleViewDocument(item.file_url, item.file_name || 'Document.pdf', item.id);
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
              if (item.file_url) handleViewDocument(item.file_url, item.file_name || 'Document.pdf', item.id);
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
            <Ionicons
              name="download-outline"
              size={20}
              color={Colors.accent.primary}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Comments Section */}
      {isExpanded && (
        <View style={styles.commentsSection}>
          {commentsToRender.map((comment, idx) => {
            const commentId = comment.id || idx.toString();
            const replies = comment.replies || [];
            const isRepliesExpanded = !!expandedReplies[commentId];
            const repliesToRender = isRepliesExpanded ? replies : replies.slice(0, 1);
            const isReplying = replyingCommentId === commentId;

            return (
              <View key={commentId} style={styles.commentItemContainer}>
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
                        setReplyingCommentId(isReplying ? null : commentId);
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
                                setReplyingCommentId(commentId);
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
                            [commentId]: !isRepliesExpanded
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
                      onSubmitEditing={() => handleSendReply(commentId)}
                    />
                    <TouchableOpacity style={styles.replySendButton} onPress={() => handleSendReply(commentId)}>
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
          <TouchableOpacity
            style={styles.commentSendButton}
            onPress={handleSendComment}
          >
            <Ionicons
              name="send"
              size={18}
              color={Colors.accent.primary}
            />
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
export default function CommunityScreen() {
  const { user, businessId, businessCode, businessName, avatarUrl } = useAuthStore();
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [composerCategory, setComposerCategory] = useState<Post['category']>('announcement');
  const [composerText, setComposerText] = useState('');
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [availableBatches, setAvailableBatches] = useState<string[]>(['All']);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'media' | 'docs' | 'links'>('all');
  const [showSearch, setShowSearch] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const router = useRouter();
  const [studentCount, setStudentCount] = useState<number>(0);
  const [showGroupInfoModal, setShowGroupInfoModal] = useState(false);
  const [showBatchPicker, setShowBatchPicker] = useState(false);
  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const { width: screenWidth } = Dimensions.get('window');
  const translateX = useRef(new Animated.Value(0)).current;
  const groupInfoAnim = useRef(new Animated.Value(0)).current;
  const attachSheetAnim = useRef(new Animated.Value(0)).current;
  const [isAttachOpen, setIsAttachOpen] = useState(false);

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
      if (!businessId) return;
      try {
        const { count, error } = await supabase
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', businessId);
        if (!error && count !== null) {
          setStudentCount(count);
        }
      } catch (err) {
        console.warn('Failed to fetch student count:', err);
      }
    };
    fetchStudentCount();
  }, [businessId]);
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

  const handleEditInit = (post: Post) => {
    setEditingPost(post);
    const pollData = parsePollData(post.text);
    if (pollData) {
      setPollQuestion(pollData.question);
      setPollOptions(pollData.options);
      setShowPollCreator(true);
    } else {
      setComposerCategory(post.category);
      setComposerText(post.text);
      setSelectedImage(post.media_url || null);
      if (post.file_url) {
        setSelectedFile({
          assets: [{ uri: post.file_url, name: post.file_name || 'Document' }],
        });
      } else {
        setSelectedFile(null);
      }
      const targetB = post.target_batches || [];
      setSelectedBatches(targetB.length === 0 ? ['All'] : targetB);
      setShowComposer(true);
    }
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (err) {
      console.warn('Direct pick image failed, trying with permission request:', err);
      try {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permissionResult.granted) {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.8,
          });
          if (!result.canceled && result.assets && result.assets.length > 0) {
            setSelectedImage(result.assets[0].uri);
          }
        }
      } catch (innerErr) {
        console.warn('Fallback pick image failed:', innerErr);
      }
    }
  };

  const handleTakePhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (err) {
      console.warn('Direct take photo failed, trying with permission request:', err);
      try {
        const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
        if (permissionResult.granted) {
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.8,
          });
          if (!result.canceled && result.assets && result.assets.length > 0) {
            setSelectedImage(result.assets[0].uri);
          }
        }
      } catch (innerErr) {
        console.warn('Fallback take photo failed:', innerErr);
      }
    }
  };

  const handlePickDocument = async () => {
    if (!DocumentPicker || !DocumentPicker.getDocumentAsync) {
      Alert.alert('Unsupported', 'Document picking is not supported in this development build. Please rebuild the app with npx expo run:android.');
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedFile(result);
      }
    } catch (err) {
      console.warn('Pick document error:', err);
    }
  };

  const handleViewDocument = async (url: string, fileName: string, id: string) => {
    if (!url) return;
    const safeName = fileName ? fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_') : 'document.pdf';
    const localUri = `${FileSystem.documentDirectory}${safeName}`;
    try {
      const info = await FileSystem.getInfoAsync(localUri);
      if (info.exists) {
        await Sharing.shareAsync(localUri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf' });
        return;
      }
      setDownloadingFileId(id);
      const downloadRes = await FileSystem.downloadAsync(url, localUri);
      setDownloadingFileId(null);
      await Sharing.shareAsync(downloadRes.uri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf' });
    } catch (err) {
      setDownloadingFileId(null);
      console.warn('Failed to download or view document:', err);
      Alert.alert('Error', 'Failed to open document. Please check your internet connection.');
    }
  };

  const uploadFileToSupabase = async (uri: string, folder: string, filename: string): Promise<string> => {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    const filePath = `${folder}/${Date.now()}_${filename}`;
    const ext = filename.split('.').pop()?.toLowerCase();
    const contentType = ext === 'pdf' ? 'application/pdf' : 
                        ext === 'png' ? 'image/png' :
                        ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
                        'application/octet-stream';
                        
    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(filePath, decode(base64), {
        contentType,
        upsert: true,
      });
      
    if (error) throw error;
    
    const { data: publicUrlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);
      
    return publicUrlData.publicUrl;
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

  useEffect(() => {
    const fetchBatches = async () => {
      if (!businessId) return;
      try {
        const { data: batchesData } = await supabase
          .from('students')
          .select('batch_name')
          .eq('business_id', businessId);
          
        if (batchesData) {
          const uniqueBatches = Array.from(new Set(batchesData.map(b => b.batch_name)));
          setAvailableBatches(['All', ...uniqueBatches]);
        }
      } catch (err) {
        console.warn('Failed to fetch batches:', err);
      }
    };
    fetchBatches();
  }, [businessId]);

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
      let query = supabase
        .from('community_posts')
        .select('*')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });
        
      if (businessId) {
        query = query.eq('business_id', businessId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const loadedPosts: Post[] = (data || []).map((p: any) => {
        const createdDate = new Date(p.created_at);
        const timeLabel = createdDate.toLocaleDateString('en-US', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });

        const likedByArray = Array.isArray(p.liked_by) ? p.liked_by : [];
        const isLiked = user ? likedByArray.includes(user.id) : false;

        return {
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
          viewed_by_count: Array.isArray(p.viewed_by) ? p.viewed_by.length : 0,
          media_url: p.media_url,
          file_url: p.file_url,
          file_name: p.file_name,
          target_batches: Array.isArray(p.target_batches) ? p.target_batches : [],
          author_avatar: p.author_avatar,
          is_edited: p.is_edited,
        };
      });
      setPosts(loadedPosts);
      try {
        savePostsToLocal(loadedPosts);
      } catch (dbErr) {
        console.warn('Failed to save posts to SQLite local cache:', dbErr);
      }
    } catch (err) {
      console.warn('Failed to fetch community posts:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, businessId]);

  useEffect(() => {
    // Refresh user metadata in background exactly once on mount to get latest avatar
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

    // Pre-request picker permissions in background for 0ms latency launch
    ImagePicker.getMediaLibraryPermissionsAsync().then(status => {
      if (!status.granted) ImagePicker.requestMediaLibraryPermissionsAsync().catch(_ => {});
    }).catch(_ => {});
    ImagePicker.getCameraPermissionsAsync().then(status => {
      if (!status.granted) ImagePicker.requestCameraPermissionsAsync().catch(_ => {});
    }).catch(_ => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPosts(postsLengthRef.current > 0);
    }, [fetchPosts])
  );

  useEffect(() => {
    // Set up postgres realtime subscription for auto-syncing updates
    const channel = supabase
      .channel('admin-community-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_posts',
        },
        (payload) => {
          console.log('Realtime community change detected by Admin:', payload);
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
                      viewed_by_count: Array.isArray(updated.viewed_by) ? updated.viewed_by.length : p.viewed_by_count,
                      media_url: updated.media_url,
                      file_url: updated.file_url,
                      file_name: updated.file_name,
                      author_avatar: updated.author_avatar,
                      is_edited: updated.is_edited,
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
  }, [user, fetchPosts]);

  const handlePost = async (customText?: string) => {
    const postText = customText !== undefined ? customText : composerText;
    if (!postText.trim()) {
      Alert.alert('Empty Post', 'Please write something before posting.');
      return;
    }
    setIsLoading(true);
    setIsUploading(true);
    try {
      const adminName = businessName || user?.user_metadata?.name || 'Admin';
      const adminAvatar = avatarUrl || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
      const targetBatchesArray = selectedBatches.includes('All') ? [] : selectedBatches;
      
      let mediaUrl = editingPost ? editingPost.media_url : null;
      let fileUrl = editingPost ? editingPost.file_url : null;
      let fileName = editingPost ? editingPost.file_name : null;

      if (selectedImage && selectedImage !== editingPost?.media_url) {
        try {
          const uploadRes = await uploadFileToGoogleDrive(
            selectedImage,
            `image_${Date.now()}.jpg`,
            businessCode || 'community'
          );
          mediaUrl = uploadRes.fileUrl;
          if (editingPost?.media_url) {
            await deleteFileFromGoogleDrive(editingPost.media_url);
          }
        } catch (imgErr: any) {
          Alert.alert('Upload Failed', 'Failed to upload the image: ' + (imgErr.message || imgErr));
          setIsLoading(false);
          setIsUploading(false);
          return;
        }
      }

      if (selectedFile && selectedFile.assets && selectedFile.assets.length > 0 && selectedFile.assets[0].uri !== editingPost?.file_url) {
        const fileAsset = selectedFile.assets[0];
        try {
          const uploadRes = await uploadFileToGoogleDrive(
            fileAsset.uri,
            fileAsset.name || `doc_${Date.now()}`,
            businessCode || 'community'
          );
          fileUrl = uploadRes.fileUrl;
          fileName = fileAsset.name || `doc_${Date.now()}`;
          if (editingPost?.file_url) {
            await deleteFileFromGoogleDrive(editingPost.file_url);
          }
        } catch (fileErr: any) {
          Alert.alert('Upload Failed', 'Failed to upload the document: ' + (fileErr.message || fileErr));
          setIsLoading(false);
          setIsUploading(false);
          return;
        }
      }

      if (editingPost) {
        // UPDATE Existing Post
        const { error } = await supabase
          .from('community_posts')
          .update({
            category: composerCategory,
            text: postText.trim(),
            target_batches: targetBatchesArray,
            media_url: mediaUrl,
            file_url: fileUrl,
            file_name: fileName,
            author_avatar: adminAvatar,
            is_edited: true,
          })
          .eq('id', Number(editingPost.id));

        if (error) throw error;

        // Reset
        setComposerText('');
        setSelectedImage(null);
        setSelectedFile(null);
        setShowComposer(false);
        setEditingPost(null);

        fetchPosts(true);
        Alert.alert('Success', 'Post updated successfully.');
      } else {
        // INSERT New Post
        const { data, error } = await supabase
          .from('community_posts')
          .insert({
            business_id: businessId,
            author_id: user?.id,
            author_name: adminName,
            author_avatar: adminAvatar,
            category: composerCategory,
            text: postText.trim(),
            target_batches: targetBatchesArray,
            likes: 0,
            comments: [],
            media_url: mediaUrl,
            file_url: fileUrl,
            file_name: fileName,
          })
          .select()
          .single();

        if (error) throw error;

        if (data) {
          setComposerText('');
          setSelectedImage(null);
          setSelectedFile(null);
          setShowComposer(false);

          fetchPosts(true);

          // Fetch student profiles for push notifications scoped to this business and target batches
          try {
            let studentUserIds: string[] = [];

            if (targetBatchesArray.length > 0) {
              // Fetch students in the targeted batches
              const { data: targetStudents } = await supabase
                .from('students')
                .select('user_id')
                .eq('business_id', businessId)
                .in('batch_name', targetBatchesArray)
                .not('user_id', 'is', null);
              
              if (targetStudents) {
                studentUserIds = targetStudents.map(s => s.user_id).filter(Boolean) as string[];
              }
            } else {
              // General post, target all students in the business
              const { data: allStudents } = await supabase
                .from('students')
                .select('user_id')
                .eq('business_id', businessId)
                .not('user_id', 'is', null);
              
              if (allStudents) {
                studentUserIds = allStudents.map(s => s.user_id).filter(Boolean) as string[];
              }
            }

            if (studentUserIds.length > 0) {
              const { data: studentProfiles } = await supabase
                .from('profiles')
                .select('push_token')
                .in('id', studentUserIds)
                .not('push_token', 'is', null);

              if (studentProfiles && studentProfiles.length > 0) {
                const tokens = studentProfiles.map(p => p.push_token).filter(Boolean) as string[];
                if (tokens.length > 0) {
                  await sendPushNotification(
                    tokens,
                    `New ${composerCategory.charAt(0).toUpperCase() + composerCategory.slice(1)} by ${adminName}`,
                    composerText.trim(),
                    { screen: 'community', postId: data.id }
                  );
                }
              }
            }
          } catch (pushErr) {
            console.warn('Failed to send push notifications:', pushErr);
          }
        }
      }
    } catch (err: any) {
      Alert.alert('Post Failed', err.message || 'Failed to publish post.');
    } finally {
      setIsLoading(false);
      setIsUploading(false);
    }
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
        const adminName = businessName || user?.user_metadata?.name || 'Admin';
        sendLikePushNotification(post.author_id, adminName, post.text);
      }
    } catch (err) {
      // Revert if error
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, liked: post.liked, likes: post.likes, liked_by: post.liked_by } : p
        )
      );
      console.warn('Failed to update likes count:', err);
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
      const studentName = user?.user_metadata?.name || 'Admin';
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

    const adminName = businessName || user?.user_metadata?.name || 'Admin';
    const newComment: Comment = {
      id: Math.random().toString(36).substring(2, 9),
      author_id: user?.id,
      author: adminName,
      author_avatar: avatarUrl || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || undefined,
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
        sendCommentPushNotification(post.author_id, adminName, text);
      }
    } catch (err) {
      // Revert on error
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

    const adminName = businessName || user?.user_metadata?.name || 'Admin';
    const newReply: Reply = {
      author_id: user?.id,
      author: adminName,
      author_avatar: avatarUrl || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || undefined,
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
        sendReplyPushNotification(recipientIds, adminName, text);
      }
    } catch (err) {
      // Revert on error
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, comments: post.comments } : p
        )
      );
      console.warn('Failed to add reply:', err);
    }
  };

  const handleDeletePost = async (postId: string) => {
    Alert.alert(
      'Delete Post',
      'Are you sure you want to delete this post permanently?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Locate post to delete attached files from Google Drive
              const postToDelete = posts.find((p) => String(p.id) === String(postId));
              if (postToDelete) {
                if (postToDelete.media_url) {
                  await deleteFileFromGoogleDrive(postToDelete.media_url);
                }
                if (postToDelete.file_url) {
                  await deleteFileFromGoogleDrive(postToDelete.file_url);
                }
              }

              const { error } = await supabase
                .from('community_posts')
                .delete()
                .eq('id', Number(postId));

              if (error) throw error;

              setPosts((prev) => prev.filter((p) => p.id !== postId));
              Alert.alert('Post Deleted', 'The post was removed successfully.');
            } catch (err: any) {
              Alert.alert('Delete Failed', err.message || 'Something went wrong.');
            }
          },
        },
      ]
    );
  };

  const renderHeader = () => (
    <>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Community</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={() => setShowComposer(!showComposer)}>
            <Text style={styles.newPostButton}>
              {showComposer ? 'Cancel' : 'New Post'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowSearch(!showSearch)} style={styles.premiumSearchButton}>
            <Ionicons
              name={showSearch ? "close" : "search"}
              size={20}
              color={Colors.accent.primary}
            />
          </TouchableOpacity>
        </View>
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

      {/* Post Composer */}
      {showComposer && (
        <View style={styles.composerCard}>
          {/* Category Selector */}
          <View style={styles.composerCategories}>
            {CATEGORIES.map((cat) => {
              const isActive = composerCategory === cat.key;
              const catStyle = getCategoryStyle(cat.key);
              return (
                <TouchableOpacity
                  key={cat.key}
                  style={[
                    styles.composerCategoryChip,
                    isActive && { backgroundColor: catStyle.bg },
                  ]}
                  onPress={() => setComposerCategory(cat.key)}
                >
                  <Text
                    style={[
                      styles.composerCategoryText,
                      isActive && { color: '#FFFFFF' },
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Batch Selector */}
          {availableBatches.length > 1 && (
            <View style={styles.composerBatches}>
              <Text style={styles.composerBatchesLabel}>Target Audience:</Text>
              <FlatList
                horizontal
                data={availableBatches}
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item}
                renderItem={({ item }) => {
                  const isSelected = selectedBatches.includes(item) || (item === 'All' && selectedBatches.length === 0);
                  return (
                    <TouchableOpacity
                      style={[
                        styles.composerBatchChip,
                        isSelected && styles.composerBatchChipActive
                      ]}
                      onPress={() => {
                        if (item === 'All') {
                          setSelectedBatches([]);
                        } else {
                          setSelectedBatches(prev => 
                            prev.includes(item) 
                              ? prev.filter(b => b !== item) 
                              : [...prev.filter(b => b !== 'All'), item]
                          );
                        }
                      }}
                    >
                      <Text style={[
                        styles.composerBatchText,
                        isSelected && styles.composerBatchTextActive
                      ]}>
                        {item}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          )}

          {/* Text Input */}
          <TextInput
            style={styles.composerInput}
            placeholder="Share an update with your students..."
            placeholderTextColor={Colors.text.tertiary}
            multiline
            value={composerText}
            onChangeText={setComposerText}
            textAlignVertical="top"
          />

          {/* Attachment Icons */}
          <View style={styles.composerAttachments}>
            <TouchableOpacity style={styles.attachIcon} onPress={handleTakePhoto}>
              <Ionicons
                name="camera-outline"
                size={22}
                color={Colors.text.tertiary}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachIcon} onPress={handlePickImage}>
              <Ionicons
                name="image-outline"
                size={22}
                color={Colors.text.tertiary}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachIcon} onPress={handlePickDocument}>
              <Ionicons
                name="document-outline"
                size={22}
                color={Colors.text.tertiary}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachIcon} onPress={() => setShowPollCreator(true)}>
              <Ionicons
                name="bar-chart-outline"
                size={22}
                color={Colors.text.tertiary}
              />
            </TouchableOpacity>
          </View>

          {/* Selected Attachment Previews */}
          {selectedImage && (
            <View style={styles.previewImageContainer}>
              <Image source={{ uri: selectedImage }} style={styles.previewImage} />
              <TouchableOpacity
                style={styles.removePreviewButton}
                onPress={() => setSelectedImage(null)}
              >
                <Ionicons name="close-circle" size={24} color={Colors.status.danger} />
              </TouchableOpacity>
            </View>
          )}

          {selectedFile && selectedFile.assets && selectedFile.assets.length > 0 && (
            <View style={styles.previewFileContainer}>
              <Ionicons name="document-text-outline" size={24} color={Colors.accent.primary} />
              <Text style={styles.previewFileName} numberOfLines={1}>
                {selectedFile.assets[0].name}
              </Text>
              <TouchableOpacity
                style={styles.removeFilePreviewButton}
                onPress={() => setSelectedFile(null)}
              >
                <Ionicons name="close-circle" size={24} color={Colors.status.danger} />
              </TouchableOpacity>
            </View>
          )}

          {/* Post Button */}
          <TouchableOpacity
            style={[styles.composerPostButton, (isUploading || isLoading) && { opacity: 0.6 }]}
            activeOpacity={0.8}
            onPress={() => handlePost()}
            disabled={isUploading || isLoading}
          >
            {isUploading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.composerPostButtonText}>Uploading attachments...</Text>
              </View>
            ) : isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.composerPostButtonText}>Post</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
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

  return (
    <SafeAreaView style={styles.container} edges={['top']} {...panResponder.panHandlers}>
      {/* Visual background placeholder of the Students home screen */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingTop: 10 }]}>
        {/* Mock Header Bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 50, marginBottom: 16 }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#EBEBEB' }} />
          <Text style={{ fontSize: 18, fontWeight: '700', color: Colors.text.primary }}>PrestoID</Text>
          <View style={{ width: 38 }} />
        </View>

        {/* Mock View Toggle */}
        <View style={{ flexDirection: 'row', backgroundColor: '#F5F5F5', borderRadius: 8, padding: 4, marginBottom: 16 }}>
          <View style={{ flex: 1, height: 36, backgroundColor: '#FFFFFF', borderRadius: 6, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 }}>
            <View style={{ width: 60, height: 10, backgroundColor: '#EBEBEB', borderRadius: 2 }} />
          </View>
          <View style={{ flex: 1, height: 36, justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ width: 70, height: 10, backgroundColor: '#EBEBEB', borderRadius: 2 }} />
          </View>
        </View>

        {/* Mock Stats Row (3 cards) */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={{ flex: 1, height: 78, backgroundColor: '#FAFAFA', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#EBEBEB', marginBottom: 6 }} />
              <View style={{ width: 24, height: 12, backgroundColor: '#EBEBEB', borderRadius: 2, marginBottom: 4 }} />
              <View style={{ width: 45, height: 8, backgroundColor: '#EBEBEB', borderRadius: 2 }} />
            </View>
          ))}
        </View>

        {/* Mock Search Bar */}
        <View style={{ height: 42, backgroundColor: '#F5F5F5', borderRadius: 8, marginBottom: 16 }} />

        {/* Mock Students List cards */}
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#EBEBEB' }} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ width: 100, height: 12, backgroundColor: '#EBEBEB', borderRadius: 2, marginBottom: 6 }} />
              <View style={{ width: 80, height: 8, backgroundColor: '#EBEBEB', borderRadius: 2 }} />
            </View>
            <View style={{ width: 50, height: 20, borderRadius: 4, backgroundColor: '#EBEBEB' }} />
          </View>
        ))}
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
          
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.headerLogo} />
          ) : (
            <View style={[styles.headerLogo, { justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.accent.primary + '10' }]}>
              <Ionicons name="megaphone" size={20} color={Colors.accent.primary} />
            </View>
          )}
          
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitleText} numberOfLines={1}>
              {businessName || 'UCI Coaching Sehore'}
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
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Main Feed List */}
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
                  avatarMap={avatarMap}
                  onLike={toggleLike}
                  onAddComment={handleAddComment}
                  onAddReply={handleAddReply}
                  onEdit={handleEditInit}
                  onDelete={handleDeletePost}
                  onVote={handleVote}
                />
              </View>
            );
          }}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: 120 }]}
          showsVerticalScrollIndicator={false}
          refreshing={isLoading}
          onRefresh={() => fetchPosts()}
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
                  No posts yet. Be the first to share!
                </Text>
              </View>
            )
          }
        />

        {/* Selected Attachment Previews (Floating above the message bar) */}
        {(selectedImage || selectedFile || pollQuestion) && (
          <View style={{ backgroundColor: '#FFFFFF', padding: 8, borderTopWidth: 1, borderTopColor: '#EBEBEB', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {selectedImage && (
              <View style={styles.previewImageContainer}>
                <Image source={{ uri: selectedImage }} style={styles.previewImage} />
                <TouchableOpacity
                  style={styles.removePreviewButton}
                  onPress={() => setSelectedImage(null)}
                >
                  <Ionicons name="close-circle" size={24} color={Colors.status.danger} />
                </TouchableOpacity>
              </View>
            )}

            {selectedFile && selectedFile.assets && selectedFile.assets.length > 0 && (
              <View style={styles.previewFileContainer}>
                <Ionicons name="document-text" size={24} color={Colors.accent.primary} />
                <Text numberOfLines={1} style={styles.previewFileName}>
                  {selectedFile.assets[0].name}
                </Text>
                <TouchableOpacity
                  style={styles.removeFilePreviewButton}
                  onPress={() => setSelectedFile(null)}
                >
                  <Ionicons name="close-circle" size={24} color={Colors.status.danger} />
                </TouchableOpacity>
              </View>
            )}

            {pollQuestion && (
              <View style={[styles.previewFileContainer, { backgroundColor: Colors.accent.primary + '10' }]}>
                <Ionicons name="bar-chart" size={20} color={Colors.accent.primary} />
                <Text numberOfLines={1} style={[styles.previewFileName, { color: Colors.accent.primary, fontWeight: '700' }]}>
                  Poll: {pollQuestion}
                </Text>
                <TouchableOpacity
                  style={styles.removeFilePreviewButton}
                  onPress={() => {
                    setPollQuestion('');
                    setPollOptions(['', '']);
                  }}
                >
                  <Ionicons name="close-circle" size={24} color={Colors.status.danger} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Target Batch list picker row (toggled above input bar) */}
        {showBatchPicker && availableBatches.length > 1 && (
          <View style={{ backgroundColor: '#FFFFFF', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#EBEBEB', paddingHorizontal: 12 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.text.secondary, marginBottom: 6 }}>Target Audience:</Text>
            <FlatList
              horizontal
              data={availableBatches}
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item}
              renderItem={({ item }) => {
                const isSelected = selectedBatches.includes(item) || (item === 'All' && selectedBatches.length === 0);
                return (
                  <TouchableOpacity
                    style={[
                      styles.composerBatchChip,
                      isSelected && styles.composerBatchChipActive
                    ]}
                    onPress={() => {
                      if (item === 'All') {
                        setSelectedBatches([]);
                      } else {
                        setSelectedBatches(prev => 
                          prev.includes(item) 
                            ? prev.filter(b => b !== item) 
                            : [...prev.filter(b => b !== 'All'), item]
                        );
                      }
                    }}
                  >
                    <Text style={[
                      styles.composerBatchText,
                      isSelected && styles.composerBatchTextActive
                    ]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        )}

        {/* Category & Batch Quick Toggle bar */}
        <View style={{ flexDirection: 'row', backgroundColor: '#F0F2F5', paddingHorizontal: 12, paddingTop: 6, gap: 8 }}>
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#EBEBEB', gap: 4 }} 
            onPress={() => {
              const keys = CATEGORIES.map(c => c.key);
              const currIdx = keys.indexOf(composerCategory);
              const nextKey = keys[(currIdx + 1) % keys.length];
              setComposerCategory(nextKey);
            }}
          >
            <Ionicons name="pricetag-outline" size={12} color={Colors.accent.primary} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.text.secondary }}>
              {CATEGORIES.find(c => c.key === composerCategory)?.label || 'Announcement'}
            </Text>
            <Ionicons name="chevron-down" size={10} color={Colors.text.tertiary} />
          </TouchableOpacity>

          {availableBatches.length > 1 && (
            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#EBEBEB', gap: 4 }} 
              onPress={() => setShowBatchPicker(!showBatchPicker)}
            >
              <Ionicons name="people-outline" size={12} color={Colors.accent.primary} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.text.secondary }}>
                Target: {selectedBatches.length === 0 ? 'All' : selectedBatches.join(', ')}
              </Text>
              <Ionicons name="chevron-down" size={10} color={Colors.text.tertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* WhatsApp-style Input / Composer Bar */}
        <View style={styles.whatsappMessageBar}>
          <View style={styles.whatsappInputContainer}>
            {/* Emoji placeholder replaced with Plus Icon */}
            <TouchableOpacity style={styles.whatsappPlusIcon} onPress={() => setShowAttachmentSheet(true)}>
              <Ionicons name="add" size={24} color={Colors.accent.primary} />
            </TouchableOpacity>

            <RotatingPlaceholderInput
              style={styles.whatsappTextInputField}
              placeholderTextColor={Colors.text.tertiary}
              multiline
              value={composerText}
              onChangeText={setComposerText}
            />

            {/* File attach button */}
            <TouchableOpacity style={styles.whatsappRightIcon} onPress={handlePickDocument}>
              <Ionicons name="document-attach-outline" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>

            {/* Image attach button */}
            <TouchableOpacity style={styles.whatsappRightIcon} onPress={handlePickImage}>
              <Ionicons name="image-outline" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* Send Circle Button */}
          <TouchableOpacity 
            style={[styles.whatsappSendCircle, isUploading && { opacity: 0.7 }]} 
            onPress={handlePost}
            disabled={isUploading}
          >
            {isUploading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Ionicons name="send" size={18} color="#FFFFFF" style={{ marginLeft: 2 }} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>


      {/* Attachment Options ActionSheet absolute overlay */}
      {showAttachmentSheet && (
        <View style={StyleSheet.absoluteFill}>
          <TouchableOpacity 
            style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)' }} 
            activeOpacity={1}
            onPress={() => {
              Animated.timing(attachSheetAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
                setShowAttachmentSheet(false);
              });
            }}
          />
          <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 16, zIndex: 10000, transform: [{ translateY: attachSheetAnim.interpolate({ inputRange: [0, 1], outputRange: [400, 0] }) }] }]}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.text.primary, marginBottom: 8 }}>Select Attachment</Text>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap', gap: 16 }}>
              <TouchableOpacity 
                style={{ alignItems: 'center', width: 70 }}
                onPress={() => {
                  Animated.timing(attachSheetAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
                    setShowAttachmentSheet(false);
                    setShowPollCreator(true);
                  });
                }}
              >
                <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="bar-chart" size={24} color="#1E88E5" />
                </View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.text.secondary }}>Create Poll</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={{ alignItems: 'center', width: 70 }}
                onPress={() => {
                  Animated.timing(attachSheetAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
                    setShowAttachmentSheet(false);
                    handlePickDocument();
                  });
                }}
              >
                <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="document-text" size={24} color="#43A047" />
                </View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.text.secondary }}>Document</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={{ alignItems: 'center', width: 70 }}
                onPress={() => {
                  Animated.timing(attachSheetAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
                    setShowAttachmentSheet(false);
                    handlePickImage();
                  });
                }}
              >
                <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#FFF3E0', justifyContent: 'center', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="image" size={24} color="#FB8C00" />
                </View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.text.secondary }}>Gallery</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={{ alignItems: 'center', width: 70 }}
                onPress={() => {
                  Animated.timing(attachSheetAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
                    setShowAttachmentSheet(false);
                    handleTakePhoto();
                  });
                }}
              >
                <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#FFEBEE', justifyContent: 'center', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="camera" size={24} color="#E53935" />
                </View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.text.secondary }}>Camera</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      )}

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
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.groupInfoBigLogo} />
                ) : (
                  <View style={[styles.groupInfoBigLogo, { justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.accent.primary + '10' }]}>
                    <Ionicons name="megaphone" size={48} color={Colors.accent.primary} />
                  </View>
                )}
                
                <Text style={styles.groupInfoTitle}>{businessName || 'UCI Coaching Sehore'}</Text>
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
                        router.push('/notebank');
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

        {/* Poll Creator Modal */}
        <Modal
          visible={showPollCreator}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowPollCreator(false)}
        >
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.pollModalOverlay}
          >
            <View style={styles.pollModalContainer}>
              <View style={styles.pollModalHeader}>
                <Text style={styles.pollModalTitle}>{editingPost ? 'Edit Poll' : 'Create Poll'}</Text>
                <TouchableOpacity onPress={() => {
                  setShowPollCreator(false);
                  setEditingPost(null);
                  setPollQuestion('');
                  setPollOptions(['', '']);
                }}>
                  <Ionicons name="close" size={24} color={Colors.text.primary} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.pollModalScroll} keyboardShouldPersistTaps="handled">
                <Text style={styles.pollModalLabel}>Question</Text>
                <TextInput
                  style={styles.pollModalInput}
                  placeholder="Ask a question..."
                  placeholderTextColor={Colors.text.tertiary}
                  value={pollQuestion}
                  onChangeText={setPollQuestion}
                />

                <Text style={styles.pollModalLabel}>Options</Text>
                {pollOptions.map((opt, idx) => (
                  <View key={idx} style={styles.pollOptionInputRow}>
                    <TextInput
                      style={[styles.pollModalInput, { flex: 1, marginBottom: 0 }]}
                      placeholder={`Option ${idx + 1}`}
                      placeholderTextColor={Colors.text.tertiary}
                      value={opt}
                      onChangeText={(val) => {
                        const next = [...pollOptions];
                        next[idx] = val;
                        setPollOptions(next);
                      }}
                    />
                    {pollOptions.length > 2 && (
                      <TouchableOpacity 
                        onPress={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                        style={styles.pollOptionRemoveButton}
                      >
                        <Ionicons name="remove-circle" size={22} color={Colors.status.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

                <TouchableOpacity 
                  style={styles.pollAddOptionButton}
                  onPress={() => setPollOptions([...pollOptions, ''])}
                >
                  <Ionicons name="add" size={16} color={Colors.accent.primary} />
                  <Text style={styles.pollAddOptionText}>Add Option</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.pollSubmitButton}
                  onPress={async () => {
                    if (!pollQuestion.trim()) {
                      Alert.alert('Empty Question', 'Please enter a poll question.');
                      return;
                    }
                    const activeOpts = pollOptions.filter(o => o.trim());
                    if (activeOpts.length < 2) {
                      Alert.alert('Too Few Options', 'Please enter at least 2 options.');
                      return;
                    }

                    const existingVotes = editingPost ? (parsePollData(editingPost.text)?.votes || {}) : {};

                    const pollData = {
                      isPoll: true,
                      question: pollQuestion.trim(),
                      options: activeOpts.map(o => o.trim()),
                      votes: existingVotes
                    };

                    setShowPollCreator(false);
                    setPollQuestion('');
                    setPollOptions(['', '']);
                    await handlePost(JSON.stringify(pollData));
                  }}
                >
                  <Text style={styles.pollSubmitButtonText}>{editingPost ? 'Save Poll' : 'Create Poll'}</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
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

  // Header
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
  newPostButton: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.accent.primary,
  },

  // Composer
  composerCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.card.border,
    padding: 16,
    marginBottom: 20,
    ...Shadows.sm,
  },
  composerCategories: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  composerCategoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.bg.tertiary,
  },
  composerCategoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  composerBatches: {
    marginBottom: 12,
  },
  composerBatchesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.tertiary,
    marginBottom: 6,
  },
  composerBatchChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.card.border,
    marginRight: 6,
  },
  composerBatchChipActive: {
    backgroundColor: Colors.accent.primary + '20',
    borderColor: Colors.accent.primary,
  },
  composerBatchText: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.text.secondary,
  },
  composerBatchTextActive: {
    color: Colors.accent.primary,
    fontWeight: '700',
  },
  composerInput: {
    backgroundColor: Colors.bg.input,
    borderRadius: 12,
    padding: 14,
    minHeight: 100,
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text.primary,
    borderWidth: 1,
    borderColor: Colors.card.border,
    marginBottom: 12,
  },
  composerAttachments: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  attachIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.bg.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  composerPostButton: {
    backgroundColor: Colors.accent.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  composerPostButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
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
  deletePostButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: Colors.status.danger + '10',
    justifyContent: 'center',
    alignItems: 'center',
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
  previewImageContainer: {
    position: 'relative',
    marginTop: 8,
    marginBottom: 14,
    borderRadius: 12,
    overflow: 'hidden',
    height: 150,
    width: '100%',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  removePreviewButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 12,
  },
  previewFileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.card.border,
    marginBottom: 14,
    gap: 10,
  },
  previewFileName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  removeFilePreviewButton: {
    padding: 2,
  },
  optionsPostButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: Colors.bg.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
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
  whatsappInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 8,
  },
  whatsappPlusButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  whatsappTextInput: {
    flex: 1,
    fontSize: 15,
    color: '#000000',
    maxHeight: 100,
    paddingVertical: 4,
  },
  whatsappAttachMenu: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  whatsappAttachItem: {
    width: '22%',
    alignItems: 'center',
    gap: 6,
  },
  whatsappAttachIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  whatsappAttachText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#37474F',
  },
  pollModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pollModalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: 24,
  },
  pollModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  pollModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },
  pollModalScroll: {
    padding: 16,
  },
  pollModalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#37474F',
    marginBottom: 8,
    marginTop: 12,
  },
  pollModalInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: '#000000',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  pollAddOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  pollAddOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.accent.primary,
  },
  pollSubmitButton: {
    backgroundColor: Colors.accent.primary,
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    ...Shadows.glow,
  },
  pollSubmitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  pollOptionInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  pollOptionRemoveButton: {
    padding: 4,
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

  // WhatsApp Message Input Bar Styles
  whatsappMessageBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#F0F2F5', // Matches WhatsApp background
  },
  whatsappInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF', // Milk color surface
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  whatsappPlusIcon: {
    padding: 4,
    marginRight: 6,
  },
  whatsappTextInputField: {
    flex: 1,
    fontSize: 15,
    color: '#000000',
    maxHeight: 120,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  whatsappRightIcon: {
    padding: 6,
    marginLeft: 4,
  },
  whatsappSendCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#AF2800', // Our brand color code
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  // Extra Composer Settings styles
  composerSettingsBar: {
    flexDirection: 'row',
    backgroundColor: '#F0F2F5',
    paddingHorizontal: 12,
    paddingTop: 6,
    gap: 8,
  },
  settingsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EBEBEB',
    gap: 4,
  },
  settingsChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
});

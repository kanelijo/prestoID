import { useState, useEffect, useCallback } from 'react';
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
  Image,
  Linking,
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
import { decode } from 'base64-arraybuffer';
import { Colors, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useFocusEffect } from 'expo-router';
import { sendPushNotification, scheduleLocalNotification } from '@/lib/notifications';

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

interface PostCardProps {
  item: Post;
  avatarMap: Record<string, string>;
  onLike: (postId: string) => void;
  onAddComment: (postId: string, text: string) => void;
  onAddReply: (postId: string, commentId: string, text: string) => void;
  onEdit: (post: Post) => void;
  onDelete: (postId: string) => void;
}

function PostCard({ item, onLike, onAddComment, onAddReply, onEdit, onDelete, avatarMap }: PostCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showAllComments, setShowAllComments] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [replyingCommentId, setReplyingCommentId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

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

  const cat = getCategoryStyle(item.category);
  const commentsToRender = showAllComments ? item.comments : item.comments.slice(0, 2);

  const authorAvatarUri = item.author_id ? (avatarMap[item.author_id] || item.author_avatar) : item.author_avatar;

  return (
    <View style={styles.postCard}>
      {/* Post Header */}
      <View style={styles.postHeader}>
        {authorAvatarUri ? (
          <Image source={{ uri: authorAvatarUri }} style={styles.postAuthorAvatarImage} />
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
            <Text style={styles.postTimestamp}>{item.timestamp}</Text>
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

      {/* Post Content */}
      <Text style={styles.postText}>{item.text}</Text>

      {item.media_url && (
        <Image source={{ uri: item.media_url }} style={styles.postImage} resizeMode="cover" />
      )}

      {item.file_url && (
        <TouchableOpacity
          style={styles.fileAttachmentCard}
          onPress={() => {
            if (item.file_url) Linking.openURL(item.file_url);
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="document-text-outline" size={22} color={Colors.accent.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.fileNameText} numberOfLines={1}>
              {item.file_name || 'Document Attachment'}
            </Text>
          </View>
          <Ionicons name="open-outline" size={16} color={Colors.text.tertiary} />
        </TouchableOpacity>
      )}

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

        {(item.file_url || item.media_url) && (
          <TouchableOpacity
            style={styles.engagementButton}
            onPress={() => {
              const url = item.file_url || item.media_url;
              if (url) Linking.openURL(url);
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
                      <Image source={{ uri: commentAvatarUri }} style={styles.commentAvatarImage} />
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
                            <Image source={{ uri: replyAvatarUri }} style={styles.replyAvatarImage} />
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

export default function CommunityScreen() {
  const { user, businessId, businessName } = useAuthStore();
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
          'New Like',
          `${likerName} liked your post: "${postText.substring(0, 40)}${postText.length > 40 ? '...' : ''}"`,
          { screen: 'community' }
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
          'New Comment',
          `${commentAuthorName} commented: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}" on your post`,
          { screen: 'community' }
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
          'New Reply on Post',
          `${replyAuthorName} replied: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`,
          { screen: 'community' }
        );
      }
    } catch (err) {
      console.warn('Failed to send reply push notification:', err);
    }
  };

  const handleEditInit = (post: Post) => {
    setEditingPost(post);
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
  };

  const handlePickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Permission to access gallery is required to select photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (err) {
      console.warn('Pick image error:', err);
    }
  };

  const handleTakePhoto = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Permission to access camera is required to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (err) {
      console.warn('Take photo error:', err);
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
    if (!silent) setIsLoading(true);
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
          timestamp: timeLabel,
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
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPosts();
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

  const handlePost = async () => {
    if (!composerText.trim()) {
      Alert.alert('Empty Post', 'Please write something before posting.');
      return;
    }
    setIsLoading(true);
    setIsUploading(true);
    try {
      const adminName = businessName || user?.user_metadata?.name || 'Admin';
      const adminAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
      const targetBatchesArray = selectedBatches.includes('All') ? [] : selectedBatches;
      
      let mediaUrl = editingPost ? editingPost.media_url : null;
      let fileUrl = editingPost ? editingPost.file_url : null;
      let fileName = editingPost ? editingPost.file_name : null;

      if (selectedImage && selectedImage !== editingPost?.media_url) {
        try {
          mediaUrl = await uploadFileToSupabase(selectedImage, 'community', 'image.jpg');
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
          fileUrl = await uploadFileToSupabase(fileAsset.uri, 'community', fileAsset.name || 'document');
          fileName = fileAsset.name;
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
            text: composerText.trim(),
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
            text: composerText.trim(),
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

  const handleAddComment = async (postId: string, text: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    const adminName = businessName || user?.user_metadata?.name || 'Admin';
    const newComment: Comment = {
      id: Math.random().toString(36).substring(2, 9),
      author_id: user?.id,
      author: adminName,
      author_avatar: user?.user_metadata?.avatar_url || user?.user_metadata?.picture || undefined,
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
      author_avatar: user?.user_metadata?.avatar_url || user?.user_metadata?.picture || undefined,
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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Community</Text>
        <TouchableOpacity onPress={() => setShowComposer(!showComposer)}>
          <Text style={styles.newPostButton}>
            {showComposer ? 'Cancel' : 'New Post'}
          </Text>
        </TouchableOpacity>
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
            onPress={handlePost}
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={posts}
          renderItem={({ item }) => (
            <PostCard
              item={item}
              avatarMap={avatarMap}
              onLike={toggleLike}
              onAddComment={handleAddComment}
              onAddReply={handleAddReply}
              onEdit={handleEditInit}
              onDelete={handleDeletePost}
            />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={renderHeader()}
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
      </KeyboardAvoidingView>
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
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '500',
    color: Colors.text.primary,
  },
  commentSendButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.accent.primary + '12',
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
});

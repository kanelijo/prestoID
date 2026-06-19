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
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { Colors, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { sendPushNotification, scheduleLocalNotification } from '@/lib/notifications';

type Comment = {
  author: string;
  text: string;
};

type Post = {
  id: string;
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
  onLike: (postId: string) => void;
  onAddComment: (postId: string, text: string) => void;
  onDelete: (postId: string) => void;
}

function PostCard({ item, onLike, onAddComment, onDelete }: PostCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [commentText, setCommentText] = useState('');

  const handleSend = () => {
    if (!commentText.trim()) return;
    onAddComment(item.id, commentText.trim());
    setCommentText('');
  };

  const cat = getCategoryStyle(item.category);

  return (
    <View style={styles.postCard}>
      {/* Post Header */}
      <View style={styles.postHeader}>
        <View style={styles.postAuthorAvatar}>
          <Text style={styles.postAuthorInitial}>
            {item.author.charAt(0)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.postAuthorName}>{item.author}</Text>
          <Text style={styles.postTimestamp}>{item.timestamp}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.categoryBadge, { backgroundColor: cat.bg }]}>
            <Text style={styles.categoryBadgeText}>{cat.label}</Text>
          </View>
          <TouchableOpacity
            onPress={() => onDelete(item.id)}
            style={styles.deletePostButton}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={18} color={Colors.status.danger} />
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
      {item.comments.length > 0 && !isExpanded && (
        <TouchableOpacity
          style={styles.viewCommentsButton}
          onPress={() => setIsExpanded(true)}
        >
          <Text style={styles.viewCommentsText}>
            View {item.comments.length} comment
            {item.comments.length > 1 ? 's' : ''}
          </Text>
        </TouchableOpacity>
      )}

      {isExpanded && (
        <View style={styles.commentsSection}>
          {item.comments.map((comment, idx) => (
            <View key={idx} style={styles.commentItem}>
              <View style={styles.commentAvatar}>
                <Text style={styles.commentAvatarText}>
                  {comment.author.charAt(0)}
                </Text>
              </View>
              <View style={styles.commentContent}>
                <Text style={styles.commentAuthor}>{comment.author}</Text>
                <Text style={styles.commentText}>{comment.text}</Text>
              </View>
            </View>
          ))}
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
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            style={styles.commentSendButton}
            onPress={handleSend}
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
  const { user } = useAuthStore();
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [composerCategory, setComposerCategory] = useState<Post['category']>('announcement');
  const [composerText, setComposerText] = useState('');
  const [businessName, setBusinessName] = useState('Business Name');
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [availableBatches, setAvailableBatches] = useState<string[]>(['All']);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);

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
    const fetchBusinessName = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('businesses')
          .select('id, business_name')
          .eq('admin_id', user.id)
          .maybeSingle();

        if (!error && data) {
          setBusinessName(data.business_name);
          setBusinessId(data.id);
          
          // Fetch unique batches for this business
          const { data: batchesData } = await supabase
            .from('students')
            .select('batch_name')
            .eq('business_id', data.id);
            
          if (batchesData) {
            const uniqueBatches = Array.from(new Set(batchesData.map(b => b.batch_name)));
            setAvailableBatches(['All', ...uniqueBatches]);
          }
        } else if (user?.user_metadata?.name) {
          setBusinessName(user.user_metadata.name);
        }
      } catch (err) {
        console.warn('Failed to fetch business name:', err);
      }
    };
    fetchBusinessName();
  }, [user]);

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
    fetchPosts();

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
      const targetBatchesArray = selectedBatches.includes('All') ? [] : selectedBatches;
      
      let mediaUrl = null;
      let fileUrl = null;
      let fileName = null;

      if (selectedImage) {
        try {
          mediaUrl = await uploadFileToSupabase(selectedImage, 'community', 'image.jpg');
        } catch (imgErr: any) {
          Alert.alert('Upload Failed', 'Failed to upload the image: ' + (imgErr.message || imgErr));
          setIsLoading(false);
          setIsUploading(false);
          return;
        }
      }

      if (selectedFile && selectedFile.assets && selectedFile.assets.length > 0) {
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

      const { data, error } = await supabase
        .from('community_posts')
        .insert({
          business_id: businessId,
          author_name: adminName,
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
        // Clear inputs immediately
        setComposerText('');
        setSelectedImage(null);
        setSelectedFile(null);
        setShowComposer(false);

        // Fetch student profiles for push notifications
        try {
          const { data: studentProfiles } = await supabase
            .from('profiles')
            .select('push_token')
            .eq('role', 'student')
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
        } catch (pushErr) {
          console.warn('Failed to send push notifications:', pushErr);
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

    const adminName = user?.user_metadata?.name || 'Upendra Sir';
    const newCommentList = [...post.comments, { author: adminName, text }];

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
              onLike={toggleLike}
              onAddComment={handleAddComment}
              onDelete={handleDeletePost}
            />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={renderHeader()}
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
});

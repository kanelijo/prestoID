import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, KeyboardAvoidingView, Platform, Animated, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { useState, useRef } from 'react';

const { width: screenWidth } = Dimensions.get('window');

const DoodleBackground = () => {
  const icons = ['book', 'calculator', 'flask', 'school', 'pencil', 'library', 'earth', 'telescope', 'bulb', 'compass'];
  const grid = [];
  
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 5; col++) {
      const idx = row * 5 + col;
      const icon = icons[idx % icons.length] as any;
      grid.push(
        <Ionicons 
          key={idx}
          name={`${icon}-outline` as any} 
          size={42} 
          color="#000000" 
          style={{
            position: 'absolute',
            top: row * 100 + (col % 2 === 0 ? 0 : 50),
            left: col * 90 - 20,
            opacity: 0.06,
            transform: [{ rotate: `${(row * 25 + col * 45) % 360}deg` }]
          }} 
        />
      );
    }
  }

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
      {grid}
    </View>
  );
};

export default function TelegramLabScreen() {
  const router = useRouter();
  const [showGroupInfoModal, setShowGroupInfoModal] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'media' | 'docs' | 'links'>('media');
  const groupInfoAnim = useRef(new Animated.Value(screenWidth)).current;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Telegram-style Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <TouchableOpacity 
          style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} 
          onPress={() => {
            setShowGroupInfoModal(true);
            Animated.timing(groupInfoAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
          }}
        >
          <Image 
            source={{ uri: 'https://ui-avatars.com/api/?name=Community&background=0D8ABC&color=fff&rounded=true' }} 
            style={styles.headerAvatar}
          />
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>Official Community</Text>
            <Text style={styles.headerSubtitle}>2,451 subscribers</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerIcon}>
          <Ionicons name="search-outline" size={24} color="#000" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerIcon}>
          <Ionicons name="ellipsis-vertical" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Chat Background (Telegram style) */}
      <KeyboardAvoidingView style={styles.chatBackground} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <DoodleBackground />
        <ScrollView contentContainerStyle={styles.chatContent} showsVerticalScrollIndicator={false}>
          
          {/* Date Label */}
          <View style={styles.dateBadgeContainer}>
            <View style={styles.dateBadge}>
              <Text style={styles.dateBadgeText}>June 28</Text>
            </View>
          </View>

          {/* Telegram-style Message Bubble (Text) */}
          <View style={styles.messageBubble}>
            <Text style={styles.messageAuthor}>Admin Team</Text>
            <Text style={styles.messageText}>
              Welcome to the new community feed! We are testing out this Telegram-inspired layout. Let us know what you think! 🚀
            </Text>
            <View style={styles.messageMeta}>
              <Text style={styles.messageTime}>10:42 AM</Text>
              <Ionicons name="checkmark-done" size={16} color="#34B7F1" />
            </View>
          </View>

          {/* Telegram-style Message Bubble (Image/Document) */}
          <View style={styles.messageBubble}>
            <Text style={styles.messageAuthor}>Physics Department</Text>
            <Image 
              source={{ uri: 'https://images.unsplash.com/photo-1636466497217-26a8cbeaf0aa?q=80&w=600&auto=format&fit=crop' }} 
              style={styles.messageImage} 
            />
            <Text style={styles.messageText}>
              Here are the handwritten notes for Chapter 4: Thermodynamics. Make sure to review them before Friday's test.
            </Text>
            <View style={styles.messageMeta}>
              <Text style={styles.messageTime}>11:15 AM</Text>
              <Ionicons name="checkmark-done" size={16} color="#34B7F1" />
            </View>
            {/* Inline reaction */}
            <View style={styles.reactionPill}>
              <Text style={styles.reactionEmoji}>🔥</Text>
              <Text style={styles.reactionCount}>42</Text>
            </View>
          </View>

          {/* Date Label */}
          <View style={styles.dateBadgeContainer}>
            <View style={styles.dateBadge}>
              <Text style={styles.dateBadgeText}>Today</Text>
            </View>
          </View>

          {/* Telegram-style Message Bubble (File) */}
          <View style={styles.messageBubble}>
            <Text style={styles.messageAuthor}>Mathematics</Text>
            <View style={styles.fileAttachment}>
              <View style={styles.fileIconBox}>
                <Ionicons name="document-text" size={24} color="#FFF" />
              </View>
              <View style={styles.fileInfo}>
                <Text style={styles.fileName}>Calculus_Worksheet_05.pdf</Text>
                <Text style={styles.fileSize}>1.2 MB • PDF</Text>
              </View>
              <Ionicons name="download-outline" size={24} color="#3390EC" />
            </View>
            <View style={styles.messageMeta}>
              <Text style={styles.messageTime}>09:00 AM</Text>
              <Ionicons name="checkmark-done" size={16} color="#34B7F1" />
            </View>
          </View>
        </ScrollView>

        {/* Telegram-style Input Bar */}
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.attachBtn}>
            <Ionicons name="attach" size={28} color="#8E8E93" />
          </TouchableOpacity>
          <TextInput 
            style={styles.textInput}
            placeholder="Broadcast a message..."
            placeholderTextColor="#8E8E93"
          />
          <TouchableOpacity style={styles.sendBtn}>
            <View style={styles.sendIconCircle}>
              <Ionicons name="send" size={18} color="#FFF" style={{ marginLeft: 2 }} />
            </View>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Telegram-style Group Info Details Absolute sliding overlay */}
      {showGroupInfoModal && (
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#F0F2F5', zIndex: 9999, transform: [{ translateX: groupInfoAnim }] }]}>
          <SafeAreaView style={styles.groupInfoModalContainer} edges={['top']}>
            {/* Modal Header */}
            <View style={[styles.header, { borderBottomWidth: 0, elevation: 0, shadowOpacity: 0 }]}>
              <TouchableOpacity onPress={() => {
                Animated.timing(groupInfoAnim, { toValue: screenWidth, duration: 250, useNativeDriver: true }).start(() => {
                  setShowGroupInfoModal(false);
                });
              }} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color="#000" />
              </TouchableOpacity>
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#000', flex: 1, marginLeft: 8 }}>Info</Text>
              <TouchableOpacity style={styles.headerIcon}>
                <Ionicons name="call-outline" size={22} color="#000" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerIcon}>
                <Ionicons name="ellipsis-vertical" size={24} color="#000" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Hero Card */}
              <View style={styles.groupInfoHeroCard}>
                <Image source={{ uri: 'https://ui-avatars.com/api/?name=Community&background=0D8ABC&color=fff&rounded=true' }} style={styles.groupInfoBigLogo} />
                <Text style={styles.groupInfoTitle}>Official Community</Text>
                <Text style={styles.groupInfoSubtitle}>2,451 subscribers</Text>
                
                {/* Info Text */}
                <Text style={{ fontSize: 14, color: Colors.text.primary, marginTop: 12, textAlign: 'center', paddingHorizontal: 20 }}>
                  Welcome to the official community! Discuss topics, share resources, and connect with other students.
                </Text>

                {/* Action row */}
                <View style={styles.groupInfoActionsRow}>
                  <TouchableOpacity style={styles.groupInfoActionItem}>
                    <View style={styles.groupInfoActionIconContainer}>
                      <Ionicons name="notifications-outline" size={24} color={Colors.accent.primary} />
                    </View>
                    <Text style={styles.groupInfoActionText}>Mute</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.groupInfoActionItem}>
                    <View style={styles.groupInfoActionIconContainer}>
                      <Ionicons name="search-outline" size={24} color={Colors.accent.primary} />
                    </View>
                    <Text style={styles.groupInfoActionText}>Search</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.groupInfoActionItem}>
                    <View style={styles.groupInfoActionIconContainer}>
                      <Ionicons name="log-out-outline" size={24} color="#FF3B30" />
                    </View>
                    <Text style={[styles.groupInfoActionText, { color: '#FF3B30' }]}>Leave</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Tabs Filter section */}
              <View style={styles.groupInfoTabsSection}>
                <View style={styles.groupInfoTabsRow}>
                  {(['media', 'docs', 'links'] as const).map(tab => (
                    <TouchableOpacity
                      key={tab}
                      style={[styles.groupInfoTab, activeFilter === tab && styles.groupInfoTabActive]}
                      onPress={() => setActiveFilter(tab)}
                    >
                      <Text style={[styles.groupInfoTabText, activeFilter === tab && styles.groupInfoTabTextActive]}>
                        {tab === 'media' ? 'Media' : tab === 'docs' ? 'Files' : 'Links'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                
                {/* Tab Content Placeholder */}
                <View style={{ padding: 16, alignItems: 'center', justifyContent: 'center', height: 200 }}>
                  <Ionicons name={activeFilter === 'media' ? 'images-outline' : activeFilter === 'docs' ? 'document-text-outline' : 'link-outline'} size={48} color="#C7C7CC" />
                  <Text style={{ marginTop: 12, color: '#8E8E93', fontSize: 14 }}>
                    No {activeFilter === 'media' ? 'media' : activeFilter === 'docs' ? 'files' : 'links'} found.
                  </Text>
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
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  backBtn: {
    padding: 6,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginLeft: 4,
    marginRight: 12,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  headerIcon: {
    padding: 8,
    marginLeft: 4,
  },
  chatBackground: {
    flex: 1,
    backgroundColor: '#E8EAED', // Clean light gray-blue background
  },
  chatContent: {
    padding: 12,
    paddingBottom: 24,
  },
  dateBadgeContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  dateBadge: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dateBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  messageBubble: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderTopLeftRadius: 4, // Tail effect on the left for incoming messages (or channel posts)
    padding: 10,
    marginBottom: 8,
    maxWidth: '85%',
    alignSelf: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  messageAuthor: {
    color: '#3390EC', 
    fontWeight: '600',
    fontSize: 14,
    marginBottom: 4,
  },
  messageText: {
    fontSize: 16,
    color: '#000',
    lineHeight: 22,
  },
  messageImage: {
    width: 250,
    height: 180,
    borderRadius: 8,
    marginBottom: 8,
  },
  messageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  messageTime: {
    fontSize: 11,
    color: '#8E8E93',
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  reactionEmoji: {
    fontSize: 14,
    marginRight: 4,
  },
  reactionCount: {
    fontSize: 13,
    color: '#3390EC',
    fontWeight: '600',
  },
  fileAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F4F5',
    padding: 8,
    borderRadius: 8,
    marginBottom: 6,
    width: 250,
  },
  fileIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3390EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
  },
  fileSize: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  attachBtn: {
    padding: 8,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#FFF',
    fontSize: 16,
    paddingHorizontal: 12,
  },
  sendBtn: {
    padding: 8,
  },
  sendIconCircle: {
    backgroundColor: '#3390EC',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
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
  }
});

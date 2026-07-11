import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';

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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Telegram-style Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Image 
          source={{ uri: 'https://ui-avatars.com/api/?name=Community&background=0D8ABC&color=fff&rounded=true' }} 
          style={styles.headerAvatar}
        />
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Official Community</Text>
          <Text style={styles.headerSubtitle}>2,451 subscribers</Text>
        </View>
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3390EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

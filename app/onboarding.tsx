import { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  TouchableOpacity,
  Animated,
  ViewToken,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Gradients, Shadows } from '@/constants/colors';

const { width, height } = Dimensions.get('window');

interface OnboardingSlide {
  id: string;
  type: 'info' | 'selector';
  iconName?: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  gradient?: [string, string];
}

const SLIDES: OnboardingSlide[] = [
  {
    id: '1',
    type: 'info',
    iconName: 'card' as const,
    title: 'Your Digital ID Card',
    description:
      'Get a virtual ID card with dynamic QR codes.\nNo more carrying plastic cards.',
    gradient: Gradients.primary as [string, string],
  },
  {
    id: '2',
    type: 'info',
    iconName: 'scan' as const,
    title: 'Instant Attendance',
    description:
      'Just scan your QR code at the desk.\nAttendance registered in seconds.',
    gradient: ['#007AFF', '#0056B3'] as [string, string],
  },
  {
    id: '3',
    type: 'info',
    iconName: 'notifications' as const,
    title: 'Instant Reminders',
    description:
      'Get real-time mobile updates.\nStay notified about fee deadlines & announcements.',
    gradient: ['#34C759', '#28A745'] as [string, string],
  },
  {
    id: '4',
    type: 'selector',
    title: 'How will you use PrestoID?',
    description: 'Select your primary role to configure your workspace.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const handleNext = async () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    }
  };

  const handleRoleSelect = async (role: 'student' | 'admin') => {
    await AsyncStorage.setItem('onboarding_completed', 'true');
    router.push({
      pathname: '/(auth)/login',
      params: { role },
    });
  };

  const renderSlide = ({ item }: { item: OnboardingSlide }) => {
    if (item.type === 'selector') {
      return (
        <View style={styles.slide}>
          <Text style={[styles.title, { marginTop: height * 0.05, marginBottom: 8 }]}>
            {item.title}
          </Text>
          <Text style={[styles.description, { marginBottom: 36 }]}>
            {item.description}
          </Text>

          <View style={styles.selectorContainer}>
            {/* Student Card */}
            <TouchableOpacity
              style={styles.roleCard}
              activeOpacity={0.85}
              onPress={() => handleRoleSelect('student')}
            >
              <LinearGradient
                colors={Gradients.primary as [string, string]}
                style={styles.cardHeaderGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="school" size={28} color="#FFFFFF" />
              </LinearGradient>
              <View style={styles.cardTextContainer}>
                <Text style={styles.roleCardTitle}>I am a Student</Text>
                <Text style={styles.roleCardDesc}>
                  View your digital ID card, track attendance, and check payment history.
                </Text>
              </View>
              <Ionicons name="arrow-forward-circle" size={24} color={Colors.accent.primary} style={styles.arrowIcon} />
            </TouchableOpacity>

            {/* Admin Card */}
            <TouchableOpacity
              style={styles.roleCard}
              activeOpacity={0.85}
              onPress={() => handleRoleSelect('admin')}
            >
              <LinearGradient
                colors={['#1E1B4B', '#312E81']}
                style={styles.cardHeaderGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="briefcase" size={28} color="#FFFFFF" />
              </LinearGradient>
              <View style={styles.cardTextContainer}>
                <Text style={styles.roleCardTitle}>I am an Admin</Text>
                <Text style={styles.roleCardDesc}>
                  Manage coaching roster, scan student QR codes, and send fee alerts.
                </Text>
              </View>
              <Ionicons name="arrow-forward-circle" size={24} color="#1E1B4B" style={styles.arrowIcon} />
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.slide}>
        <View style={styles.iconContainer}>
          <LinearGradient colors={item.gradient || (Gradients.primary as [string, string])} style={styles.iconGradient}>
            {item.iconName && <Ionicons name={item.iconName} size={56} color="#FFFFFF" />}
          </LinearGradient>
        </View>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.description}>{item.description}</Text>
      </View>
    );
  };

  const isLastSlide = currentIndex === SLIDES.length - 1;

  return (
    <View style={styles.container}>
      {!isLastSlide && (
        <TouchableOpacity
          style={styles.skipButton}
          onPress={() => flatListRef.current?.scrollToIndex({ index: SLIDES.length - 1 })}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        scrollEnabled={!isLastSlide} // Prevent swiping past the selector
      />

      {/* Dot Indicators */}
      <View style={styles.dotsContainer}>
        {SLIDES.map((_, index) => {
          const inputRange = [
            (index - 1) * width,
            index * width,
            (index + 1) * width,
          ];
          const dotWidth = scrollX.interpolate({
            inputRange,
            outputRange: [8, 24, 8],
            extrapolate: 'clamp',
          });
          const dotOpacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.3, 1, 0.3],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View
              key={index}
              style={[
                styles.dot,
                { width: dotWidth, opacity: dotOpacity },
              ]}
            />
          );
        })}
      </View>

      {/* Next Button (Only shown on info slides) */}
      {!isLastSlide ? (
        <TouchableOpacity onPress={handleNext} activeOpacity={0.8}>
          <LinearGradient
            colors={Gradients.primary as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.nextButton}
          >
            <Text style={styles.nextButtonText}>Next</Text>
          </LinearGradient>
        </TouchableOpacity>
      ) : (
        // Spacer to keep layout constraints consistent on last slide
        <View style={{ height: 56, marginHorizontal: 24 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
    paddingBottom: 40,
  },
  skipButton: {
    position: 'absolute',
    top: 60,
    right: 24,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  skipText: {
    color: Colors.text.secondary,
    fontSize: 16,
    fontWeight: '600',
  },
  slide: {
    width,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingTop: height * 0.08,
  },
  iconContainer: {
    marginBottom: 40,
  },
  iconGradient: {
    width: 120,
    height: 120,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.accent.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text.primary,
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 21,
    fontWeight: '500',
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent.primary,
    marginHorizontal: 4,
  },
  nextButton: {
    marginHorizontal: 24,
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.accent.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // Role Selector Styles
  selectorContainer: {
    width: '100%',
    gap: 16,
    paddingHorizontal: 10,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.card.border,
    padding: 16,
    ...Shadows.sm,
  },
  cardHeaderGradient: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  cardTextContainer: {
    flex: 1,
    paddingRight: 8,
  },
  roleCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 3,
  },
  roleCardDesc: {
    fontSize: 11,
    color: Colors.text.secondary,
    lineHeight: 16,
    fontWeight: '500',
  },
  arrowIcon: {
    marginLeft: 'auto',
  },
});

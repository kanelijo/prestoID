import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '@/constants/colors';
import { useFeatureFlags } from '@/stores/useFeatureFlags';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

// Import actual screens dynamically for inline sandbox testing
import TargetExamAdminScreen from './(admin)/test/target-exam-admin';
import TargetExamStudentScreen from './(student)/test/target-exam-student';
import PeerConversationsScreen from './(student)/peers';

interface FeatureItem {
  key: string;
  name: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface SandboxItem {
  name: string;
  description: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
  roleRequired?: string;
}

const AVAILABLE_FEATURES: FeatureItem[] = [
  {
    key: 'target_exam_test',
    name: 'Practice Target Exams',
    description: 'Categorized exam targets, strategies, syllabus details, and AI practice test engine.',
    icon: 'school-outline',
  },
  {
    key: 'student_to_student_chat',
    name: 'Student-to-Student Chat',
    description: 'Allow registered coaching students to request chat access and message each other.',
    icon: 'chatbubbles-outline',
  },
  {
    key: 'automated_test_creation',
    name: 'Daily AI Test Scheduler',
    description: 'Automatically schedule and generate exams daily based on defined subjects.',
    icon: 'calendar-outline',
  },
];

const SANDBOX_FEATURES: SandboxItem[] = [
  {
    name: 'Student Peers Directory & Chat',
    description: 'Search peers, accept connection requests, and initiate messaging.',
    route: '/(student)/peers',
    icon: 'people-outline',
  },
  {
    name: 'Admin Target Exam Config',
    description: 'Add target exams, syllabuses, strategies, and Gemini AI metadata.',
    route: '/(admin)/test/target-exam-admin',
    icon: 'options-outline',
    roleRequired: 'admin',
  },
  {
    name: 'Student Target Exam Launchpad',
    description: 'View strategies/syllabus, pick target exam, and start practice tests.',
    route: '/(student)/test/target-exam-student',
    icon: 'play-outline',
  },
];

export default function DeveloperPlaygroundScreen() {
  const router = useRouter();
  const { role } = useAuthStore();
  const { flags, overrides, initialize, setOverride } = useFeatureFlags();
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingDb, setIsUpdatingDb] = useState(false);

  // Tab State: 'toggles' or 'sandbox'
  const [activeTab, setActiveTab] = useState<'toggles' | 'sandbox'>('toggles');

  // Expanded Feature Key (dropdown menu tracker)
  const [expandedFeatureKey, setExpandedFeatureKey] = useState<string | null>(null);

  // In-place Sandbox Preview state
  const [previewScreen, setPreviewScreen] = useState<'peers' | 'target_exam_admin' | 'target_exam_student' | null>(null);

  useEffect(() => {
    initialize().then(() => setIsLoading(false));
  }, []);

  const handleLocalToggle = async (key: string, value: boolean) => {
    await setOverride(key, value);
  };

  const handleGlobalDbToggle = async (key: string, currentVal: boolean) => {

    setIsUpdatingDb(true);
    try {
      const newVal = !currentVal;
      const { error } = await supabase
        .from('feature_flags')
        .upsert({ key, is_enabled: newVal }, { onConflict: 'key' });

      if (error) throw error;
      
      // Re-initialize store to fetch latest global DB values
      await initialize();
      Alert.alert('Success', `Global flag for "${key}" updated to ${newVal ? 'ON' : 'OFF'}.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update database feature flag.');
    } finally {
      setIsUpdatingDb(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.accent.primary} />
      </View>
    );
  }

  // Renders the in-place screen component preview when clicked
  if (previewScreen) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
        {/* Preview Sandbox Banner */}
        <SafeAreaView style={styles.sandboxBanner} edges={['top']}>
          <Text style={styles.sandboxBannerText}>🧪 SANDBOX PREVIEW MODE</Text>
          <TouchableOpacity
            style={styles.sandboxExitBtn}
            onPress={() => setPreviewScreen(null)}
          >
            <Text style={styles.sandboxExitBtnText}>Exit Preview</Text>
          </TouchableOpacity>
        </SafeAreaView>
        
        {/* Render the actual imported page in place */}
        <View style={{ flex: 1 }}>
          {previewScreen === 'peers' && <PeerConversationsScreen />}
          {previewScreen === 'target_exam_admin' && <TargetExamAdminScreen />}
          {previewScreen === 'target_exam_student' && <TargetExamStudentScreen />}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Zenza Playground</Text>
      </View>

      {/* Main Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'toggles' && styles.tabButtonActive]}
          onPress={() => setActiveTab('toggles')}
        >
          <Text style={[styles.tabText, activeTab === 'toggles' && styles.tabTextActive]}>
            ⚙️ Feature Toggles
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'sandbox' && styles.tabButtonActive]}
          onPress={() => setActiveTab('sandbox')}
        >
          <Text style={[styles.tabText, activeTab === 'sandbox' && styles.tabTextActive]}>
            🧪 Sandbox Preview
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'toggles' ? (
          <>
            <Text style={styles.subtitle}>
              Configure development feature flags. Expand any feature card to override flags locally or globally on the server.
            </Text>

            {isUpdatingDb && (
              <View style={styles.syncBanner}>
                <ActivityIndicator size="small" color={Colors.accent.primary} />
                <Text style={styles.syncBannerText}>Syncing global config...</Text>
              </View>
            )}

            {AVAILABLE_FEATURES.map((feature) => {
              const isGlobalOn = !!flags[feature.key];
              const isLocalOverrideActive = overrides[feature.key] !== undefined;
              const isCurrentlyActive = isLocalOverrideActive ? overrides[feature.key] : isGlobalOn;
              const isExpanded = expandedFeatureKey === feature.key;

              return (
                <View key={feature.key} style={styles.featureCard}>
                  {/* Collapsible Card Header Clickable */}
                  <TouchableOpacity
                    style={styles.cardHeader}
                    activeOpacity={0.8}
                    onPress={() => setExpandedFeatureKey(isExpanded ? null : feature.key)}
                  >
                    <View style={styles.iconBox}>
                      <Ionicons name={feature.icon} size={22} color={Colors.accent.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.featureName}>{feature.name}</Text>
                      <Text style={styles.featureKey}>Key: {feature.key}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {isCurrentlyActive ? (
                        <View style={styles.activeLabelBadge}>
                          <Ionicons name="checkmark-sharp" size={10} color="#FFF" />
                          <Text style={styles.activeLabelText}>Active</Text>
                        </View>
                      ) : (
                        <Text style={styles.inactiveLabelText}>Inactive</Text>
                      )}
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={Colors.text.tertiary}
                      />
                    </View>
                  </TouchableOpacity>

                  <Text style={styles.featureDesc}>{feature.description}</Text>

                  {/* Dropdown Toggle Section */}
                  {isExpanded && (
                    <View style={styles.dropdownContent}>
                      <View style={styles.dropdownDivider} />
                      
                      {/* Local Dev Override */}
                      <View style={styles.controlRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.controlLabel}>Local Dev Override</Text>
                          <Text style={styles.controlSub}>Force toggle for testing on this phone</Text>
                        </View>
                        <View style={styles.overrideControls}>
                          {isLocalOverrideActive && (
                            <TouchableOpacity
                              style={styles.clearOverrideBtn}
                              onPress={() => handleLocalToggle(feature.key, undefined as any)}
                            >
                              <Text style={styles.clearOverrideBtnText}>Clear</Text>
                            </TouchableOpacity>
                          )}
                          <View style={styles.switchWrapper}>
                            {isCurrentlyActive && (
                              <Ionicons name="checkmark-circle" size={18} color="#10B981" style={{ marginRight: 6 }} />
                            )}
                            <Switch
                              value={isCurrentlyActive}
                              onValueChange={(val) => handleLocalToggle(feature.key, val)}
                              trackColor={{ false: '#E5E7EB', true: Colors.accent.primary }}
                              thumbColor={isCurrentlyActive ? '#FFF' : '#F4F3F0'}
                            />
                          </View>
                        </View>
                      </View>

                      {true && (
                        <>
                          <View style={styles.dropdownDivider} />
                          
                          {/* Global Database Settings */}
                          <View style={styles.controlRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.controlLabel}>Global Server Switch</Text>
                              <Text style={styles.controlSub}>Enable/Disable for all coaching users</Text>
                            </View>
                            <View style={styles.switchWrapper}>
                              {isGlobalOn && (
                                <Ionicons name="checkmark-circle" size={18} color="#10B981" style={{ marginRight: 6 }} />
                              )}
                              <Switch
                                value={isGlobalOn}
                                onValueChange={() => handleGlobalDbToggle(feature.key, isGlobalOn)}
                                trackColor={{ false: '#E5E7EB', true: Colors.accent.primary }}
                                thumbColor={isGlobalOn ? '#FFF' : '#F4F3F0'}
                              />
                            </View>
                          </View>
                        </>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>
              Safely isolate, view, and test specific pages in-place during development without needing layout navigation or redirects.
            </Text>

            {SANDBOX_FEATURES.map((sandboxItem, index) => {
              const hasAccess = !sandboxItem.roleRequired || role === sandboxItem.roleRequired;

              return (
                <TouchableOpacity
                  key={index}
                  style={[styles.featureCard, !hasAccess && { opacity: 0.6 }]}
                  activeOpacity={hasAccess ? 0.85 : 1}
                  onPress={() => {
                    if (hasAccess) {
                      if (sandboxItem.route.includes('/peers')) {
                        setPreviewScreen('peers');
                      } else if (sandboxItem.route.includes('/target-exam-admin')) {
                        setPreviewScreen('target_exam_admin');
                      } else if (sandboxItem.route.includes('/target-exam-student')) {
                        setPreviewScreen('target_exam_student');
                      }
                    } else {
                      Alert.alert('Restricted', `This page requires ${sandboxItem.roleRequired} privileges.`);
                    }
                  }}
                >
                  <View style={styles.cardHeader}>
                    <View style={[styles.iconBox, { backgroundColor: '#F3F4F6' }]}>
                      <Ionicons name={sandboxItem.icon} size={22} color={Colors.accent.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.featureName}>{sandboxItem.name}</Text>
                      <Text style={styles.featureDesc}>{sandboxItem.description}</Text>
                    </View>
                    {hasAccess ? (
                      <Ionicons name="arrow-forward" size={18} color={Colors.accent.primary} />
                    ) : (
                      <Ionicons name="lock-closed" size={18} color={Colors.text.tertiary} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.bg.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: Colors.card.border,
    backgroundColor: '#FFF',
  },
  backButton: {
    padding: 4,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  tabContainer: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  tabButton: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  tabButtonActive: {
    backgroundColor: Colors.accent.primary,
    borderColor: Colors.accent.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  tabTextActive: {
    color: '#FFF',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  subtitle: {
    fontSize: 12.5,
    color: Colors.text.secondary,
    lineHeight: 18,
    marginBottom: 4,
  },
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E8F0FE',
    padding: 10,
    borderRadius: 12,
    justifyContent: 'center',
  },
  syncBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A73E8',
  },
  featureCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.card.border,
    padding: 16,
    ...Shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureName: {
    fontSize: 14.5,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  featureKey: {
    fontSize: 10.5,
    color: Colors.text.tertiary,
    marginTop: 1,
  },
  featureDesc: {
    fontSize: 12,
    color: Colors.text.secondary,
    lineHeight: 17,
    marginTop: 8,
  },
  dropdownContent: {
    marginTop: 4,
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: Colors.card.border,
    marginVertical: 12,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  controlLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  controlSub: {
    fontSize: 11,
    color: Colors.text.tertiary,
    marginTop: 2,
  },
  overrideControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  clearOverrideBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  clearOverrideBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  switchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeLabelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981', // solid green background
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  activeLabelText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFF', // white text
  },
  inactiveLabelText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.tertiary,
  },
  sandboxBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 48,
    backgroundColor: '#FEF3C7',
    borderBottomWidth: 1,
    borderColor: '#F59E0B',
  },
  sandboxBannerText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#B45309',
  },
  sandboxExitBtn: {
    backgroundColor: '#D97706',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  sandboxExitBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
});

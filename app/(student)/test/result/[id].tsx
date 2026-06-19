import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

export default function TestResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); // test_id
  const router = useRouter();
  const { verified, user } = useAuthStore();
  const activeStudentId = user?.id;
  
  const [isLoading, setIsLoading] = useState(true);
  const [submission, setSubmission] = useState<any>(null);
  const [testDetails, setTestDetails] = useState<any>(null);

  useEffect(() => {
    fetchResults();
  }, [id]);

  const fetchResults = async () => {
    setIsLoading(true);
    try {
      if (!verified || id === 'demo-test-id') {
        setTestDetails({ title: 'MPPSC Mock Test', duration_minutes: 60 });
        setSubmission({ 
          score: 85, 
          total_questions: 100, 
          submitted_at: new Date().toISOString(),
          exit_logs: [{ time: new Date().toISOString(), duration_ms: 15000, type: 'app_switch' }] 
        });
        setIsLoading(false);
        return;
      }

      // Fetch test details
      const { data: test, error: tErr } = await supabase.from('tests').select('*').eq('id', id).single();
      if (tErr) throw tErr;
      setTestDetails(test);

      // Fetch submission
      const { data: sub, error: subErr } = await supabase
        .from('test_submissions')
        .select('*')
        .eq('test_id', id)
        .eq('student_id', activeStudentId)
        .single();
        
      if (subErr) throw subErr;
      setSubmission(sub);

    } catch (err: any) {
      console.warn('Failed to load test results', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || !submission || !testDetails) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.accent.primary} />
      </SafeAreaView>
    );
  }

  const scorePercentage = submission.score !== null ? submission.score : 0;
  
  let scoreColor = Colors.status.success;
  let scoreMsg = "Excellent Work!";
  if (scorePercentage < 40) {
    scoreColor = Colors.status.danger;
    scoreMsg = "Needs Improvement";
  } else if (scorePercentage < 75) {
    scoreColor = Colors.status.warning;
    scoreMsg = "Good Effort";
  }

  const exitCount = submission.exit_logs ? submission.exit_logs.length : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(student)/test')}>
          <Ionicons name="close" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Test Results</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.testTitle}>{testDetails.title}</Text>
        <Text style={styles.submitDate}>
          Submitted on {new Date(submission.submitted_at || new Date()).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </Text>

        {/* Score Card */}
        <View style={styles.scoreCard}>
          <View style={styles.scoreRing}>
            <Text style={[styles.scoreNumber, { color: scoreColor }]}>{scorePercentage}%</Text>
            <Text style={styles.scoreLabel}>Score</Text>
          </View>
          <Text style={[styles.scoreMsg, { color: scoreColor }]}>{scoreMsg}</Text>
        </View>

        {/* Analytics Section */}
        <Text style={styles.sectionTitle}>AI Analytics</Text>
        
        <View style={styles.insightCard}>
          <View style={styles.insightHeader}>
            <Ionicons name="trending-up" size={20} color={Colors.status.success} />
            <Text style={styles.insightTitle}>Strong Areas</Text>
          </View>
          <Text style={styles.insightText}>• Town Planning</Text>
          <Text style={styles.insightText}>• Harappan Trade</Text>
        </View>

        <View style={styles.insightCard}>
          <View style={styles.insightHeader}>
            <Ionicons name="trending-down" size={20} color={Colors.status.danger} />
            <Text style={styles.insightTitle}>Weak Areas</Text>
          </View>
          <Text style={styles.insightText}>• Post-Harappan Sites</Text>
          <Text style={styles.insightText}>• Agriculture patterns</Text>
        </View>

        {/* Activity Logs */}
        {exitCount > 0 && (
          <View style={styles.warningCard}>
            <View style={styles.warningHeader}>
              <Ionicons name="warning" size={20} color={Colors.status.warning} />
              <Text style={styles.warningTitle}>Activity Log</Text>
            </View>
            <Text style={styles.warningText}>
              You exited the test app {exitCount} time(s) during the session. These logs have been recorded and are visible to your teacher.
            </Text>
            {submission.exit_logs.map((log: any, idx: number) => (
              <Text key={idx} style={styles.logText}>
                • Exited for {(log.duration_ms / 1000).toFixed(1)}s at {new Date(log.time).toLocaleTimeString()}
              </Text>
            ))}
          </View>
        )}

      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.doneBtn} onPress={() => router.replace('/(student)/test')}>
          <Text style={styles.doneBtnText}>Back to Dashboard</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  testTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text.primary,
    textAlign: 'center',
  },
  submitDate: {
    fontSize: 13,
    color: Colors.text.tertiary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 24,
  },
  scoreCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  scoreRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Colors.bg.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 8,
    borderColor: Colors.bg.tertiary,
    marginBottom: 16,
  },
  scoreNumber: {
    fontSize: 40,
    fontWeight: '800',
  },
  scoreLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  scoreMsg: {
    fontSize: 18,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
    marginBottom: 16,
  },
  insightCard: {
    backgroundColor: Colors.bg.secondary,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  insightText: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 4,
    paddingLeft: 28,
  },
  warningCard: {
    backgroundColor: Colors.status.warning + '15',
    padding: 16,
    borderRadius: 12,
    marginTop: 12,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  warningTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.status.warning,
  },
  warningText: {
    fontSize: 13,
    color: Colors.text.primary,
    lineHeight: 18,
    marginBottom: 12,
  },
  logText: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginBottom: 4,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.card.border,
    backgroundColor: Colors.bg.primary,
  },
  doneBtn: {
    backgroundColor: Colors.bg.tertiary,
    height: 54,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },
});

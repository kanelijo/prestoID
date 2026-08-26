import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { restoreProcedure, checkForBackup } from '@/lib/restoreService';
import { useAuthStore } from '@/stores/useAuthStore';
import { Colors } from '@/constants/colors';

export default function RestoreScreen() {
  const router = useRouter();
  const { next } = useLocalSearchParams();
  const [checkState, setCheckState] = useState<'idle' | 'checking' | 'found' | 'not_found'>('idle');
  const [backupInfo, setBackupInfo] = useState<{ fileId: string; iv: string; size: number; date: string } | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const user = useAuthStore(state => state.user);

  const handleCheckBackup = async () => {
    setCheckState('checking');
    try {
      const backup = await checkForBackup();
      if (backup) {
        setBackupInfo(backup);
        setCheckState('found');
      } else {
        setCheckState('not_found');
      }
    } catch (err) {
      console.warn('Backup check failed:', err);
      setCheckState('not_found');
    }
  };

  const handleRestore = async () => {
    if (!user || !backupInfo) {
      Alert.alert('Error', 'Missing restore information.');
      return;
    }

    setIsRestoring(true);
    const success = await restoreProcedure(user.id, backupInfo.fileId, backupInfo.iv);
    if (!success) {
      setIsRestoring(false);
      Alert.alert('Restore Failed', 'There was a problem restoring your history. You can try again or skip.');
    }
  };

  const handleSkip = () => {
    router.replace(next as any || '/(student)');
  };

  // Format size
  const rawSize = backupInfo?.size ? backupInfo.size : 0;
  const sizeDisplay = rawSize > 0
    ? rawSize >= 1024 * 1024
      ? `${(rawSize / (1024 * 1024)).toFixed(1)} MB`
      : `${(rawSize / 1024).toFixed(1)} KB`
    : 'Encrypted backup';

  const formattedDate = backupInfo?.date ? new Date(backupInfo.date).toLocaleString() : 'Unknown date';

  return (
    <SafeAreaView style={styles.container}>
      {checkState === 'idle' && (
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons name="logo-google" size={60} color={Colors.accent.primary} />
          </View>
          <Text style={styles.title}>Google Drive Backup</Text>
          <Text style={styles.subtitle}>
            To restore your announcement feed and local database records, allow KanelFlow access to search your Google Account.
          </Text>
          <View style={{ width: '100%', gap: 12, marginTop: 10 }}>
            <TouchableOpacity style={styles.restoreButton} onPress={handleCheckBackup}>
              <Text style={styles.restoreButtonText}>Give Permission</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
              <Text style={styles.skipButtonText}>Skip Restoration</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {checkState === 'checking' && (
        <View style={styles.content}>
          <ActivityIndicator size="large" color={Colors.accent.primary} style={{ marginBottom: 20 }} />
          <Text style={styles.title}>Looking for Backups</Text>
          <Text style={styles.subtitle}>
            Querying Google Drive AppData folder for secure database backups...
          </Text>
        </View>
      )}

      {checkState === 'found' && (
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons name="cloud-download" size={64} color={Colors.accent.primary} />
          </View>
          <Text style={styles.title}>Backup Found</Text>
          <Text style={styles.subtitle}>
            We found a database backup in your Google Drive AppData folder. Restore it to retrieve your history.
          </Text>

          <View style={styles.detailsBox}>
            <View style={styles.detailRow}>
              <View style={styles.detailIconWrap}>
                <Ionicons name="document-lock-outline" size={20} color={Colors.accent.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>Backup Size</Text>
                <Text style={styles.detailText}>{sizeDisplay}</Text>
              </View>
            </View>
            <View style={[styles.detailRow, { marginBottom: 0 }]}>
              <View style={styles.detailIconWrap}>
                <Ionicons name="time-outline" size={20} color={Colors.accent.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>Saved On</Text>
                <Text style={styles.detailText}>{formattedDate}</Text>
              </View>
            </View>
          </View>

          <View style={{ width: '100%', gap: 12, marginTop: 24 }}>
            {isRestoring ? (
              <View style={styles.restoringContainer}>
                <ActivityIndicator size="small" color={Colors.accent.primary} style={{ marginBottom: 8 }} />
                <Text style={styles.restoringText}>Restoring data...</Text>
              </View>
            ) : (
              <>
                <TouchableOpacity style={styles.restoreButton} onPress={handleRestore}>
                  <Text style={styles.restoreButtonText}>Restore Backup</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
                  <Text style={styles.skipButtonText}>Skip</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}

      {checkState === 'not_found' && (
        <View style={styles.content}>
          <View style={[styles.iconContainer, { backgroundColor: Colors.status.warning + '15', borderColor: Colors.status.warning + '30' }]}>
            <Ionicons name="alert-circle-outline" size={60} color={Colors.status.warning} />
          </View>
          <Text style={styles.title}>No Backup Found</Text>
          <Text style={styles.subtitle}>
            We checked your Google Account, but no secure database backups were found. You can start fresh or sign in with another account.
          </Text>
          <View style={{ width: '100%', gap: 12, marginTop: 10 }}>
            <TouchableOpacity style={[styles.restoreButton, { backgroundColor: Colors.status.warning }]} onPress={handleCheckBackup}>
              <Text style={styles.restoreButtonText}>Check Another Account</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
              <Text style={styles.skipButtonText}>Continue to Dashboard</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    justifyContent: 'space-between',
    padding: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
  iconContainer: {
    width: 120,
    height: 120,
    backgroundColor: Colors.accent.primary + '15',
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
    borderWidth: 2,
    borderColor: Colors.accent.primary + '30',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text.primary,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
    marginBottom: 28,
  },
  detailsBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: '#EBEBEB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.accent.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  detailLabel: {
    fontSize: 11,
    color: Colors.text.tertiary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  detailText: {
    fontSize: 15,
    color: Colors.text.primary,
    fontWeight: '600',
  },
  footer: {
    paddingBottom: 8,
  },
  restoreButton: {
    backgroundColor: Colors.accent.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: Colors.accent.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  restoreButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  skipButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  skipButtonText: {
    color: Colors.text.secondary,
    fontSize: 15,
    fontWeight: '500',
  },
  restoringContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  restoringText: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 16,
  },
  restoringSubtext: {
    fontSize: 13,
    color: Colors.text.secondary,
    marginTop: 6,
  }
});


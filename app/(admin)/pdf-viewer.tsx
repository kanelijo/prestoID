import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Linking, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Pdf from 'react-native-pdf';
import { Colors } from '@/constants/colors';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PDFViewerScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const [hasError, setHasError] = useState(false);
  
  const localUri = Array.isArray(params.uri) ? params.uri[0] : params.uri;
  const title = Array.isArray(params.title) ? params.title[0] : (params.title || 'PDF Document');

  if (!localUri) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.status.danger} />
          <Text style={styles.errorTitle}>No PDF File Specified</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleOpenExternal = () => {
    const encoded = encodeURI(localUri);
    Linking.openURL(encoded).catch(() => {
      console.warn('Could not open external URL:', localUri);
    });
  };

  const source = { uri: encodeURI(localUri), cache: true };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <TouchableOpacity style={styles.externalBtn} onPress={handleOpenExternal}>
          <Ionicons name="open-outline" size={22} color={Colors.accent.primary} />
        </TouchableOpacity>
      </View>

      {/* PDF Viewer */}
      <View style={styles.pdfContainer}>
        {hasError ? (
          <View style={styles.errorContainer}>
            <Ionicons name="document-text-outline" size={56} color={Colors.accent.primary} />
            <Text style={styles.errorTitle}>Could Not Render PDF Preview</Text>
            <Text style={styles.errorDesc}>
              The PDF file may be stored externally or download was interrupted. Tap below to open in your device's PDF reader.
            </Text>
            <TouchableOpacity style={styles.openExternalBtn} onPress={handleOpenExternal}>
              <Ionicons name="open-outline" size={18} color="#FFF" />
              <Text style={styles.openExternalBtnText}>Open in PDF Reader / Browser</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Pdf
            trustAllCerts={false}
            source={source}
            onLoadComplete={(numberOfPages, filePath) => {
               console.log(`[PDF] Loaded ${numberOfPages} pages from ${filePath}`);
            }}
            onError={(error) => {
               console.warn("[PDF] Error rendering PDF:", error);
               setHasError(true);
            }}
            style={styles.pdf}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
    paddingHorizontal: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  externalBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  pdfContainer: {
    flex: 1,
  },
  pdf: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#F5F5F5',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 16,
  },
  errorDesc: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    marginBottom: 20,
  },
  openExternalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  openExternalBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

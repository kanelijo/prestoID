import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Pdf from 'react-native-pdf';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors } from '@/constants/colors';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PDFViewerScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  
  const rawUri = Array.isArray(params.uri) ? params.uri[0] : params.uri;
  const title = Array.isArray(params.title) ? params.title[0] : (params.title || 'PDF Document');

  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!rawUri) return;

    // Check if it's a remote URL
    const isRemote = rawUri.startsWith('http://') || rawUri.startsWith('https://');

    if (isRemote) {
      const downloadPdf = async () => {
        setIsDownloading(true);
        setErrorMsg(null);
        try {
          // Use stable filename based on URL hash/name instead of Date.now() to prevent duplicate files
          const rawFileName = rawUri.split('/').pop()?.split('?')[0] || title;
          const sanitized = rawFileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
          const localFilename = `pdf_${sanitized.endsWith('.pdf') ? sanitized : sanitized + '.pdf'}`;
          const localTargetUri = `${FileSystem.documentDirectory}${localFilename}`;

          // Check if PDF already exists locally
          const fileInfo = await FileSystem.getInfoAsync(localTargetUri);
          if (fileInfo.exists && fileInfo.size && fileInfo.size > 0) {
            setPdfUri(localTargetUri);
            setIsDownloading(false);
            return;
          }

          // Ensure URL is properly encoded (escapes spaces and special characters to prevent HTTP 400 errors)
          const encodedUrl = encodeURI(rawUri);
          const downloadRes = await FileSystem.downloadAsync(encodedUrl, localTargetUri);
          
          if (downloadRes.status >= 200 && downloadRes.status < 300) {
            setPdfUri(downloadRes.uri);
          } else {
            throw new Error(`Download failed with status code ${downloadRes.status}`);
          }
        } catch (err: any) {
          console.warn('Failed to pre-download PDF:', err);
          setErrorMsg(err.message || 'Failed to download PDF document.');
        } finally {
          setIsDownloading(false);
        }
      };

      downloadPdf();
    } else {
      setPdfUri(rawUri);
    }
  }, [rawUri, title]);

  if (!rawUri) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.centerText}>No PDF file specified.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* PDF Viewer / Downloader State */}
      <View style={styles.pdfContainer}>
        {isDownloading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={Colors.accent.primary} />
            <Text style={styles.loadingText}>Downloading PDF for viewing...</Text>
          </View>
        ) : errorMsg ? (
          <View style={styles.centerContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.status.danger} />
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
              <Text style={styles.retryBtnText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        ) : pdfUri ? (
          <Pdf
            trustAllCerts={false}
            source={{ uri: pdfUri, cache: true }}
            onLoadComplete={(numberOfPages, filePath) => {
              console.log(`[PDF] Loaded ${numberOfPages} pages from ${filePath}`);
            }}
            onPageChanged={(page, numberOfPages) => {
              console.log(`[PDF] Current page: ${page}`);
            }}
            onError={(error) => {
              console.error("[PDF] Error rendering PDF:", error);
              setErrorMsg("Cannot display PDF. The file may be corrupted or not in PDF format.");
            }}
            style={styles.pdf}
          />
        ) : null}
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
  centerText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#666',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: '#E53E3E',
    textAlign: 'center',
    fontWeight: '500',
  },
  retryBtn: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.accent.primary,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  }
});

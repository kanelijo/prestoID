import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Pdf from 'react-native-pdf';
import { Colors } from '@/constants/colors';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PDFViewerScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  
  // localUri must be a string starting with file:// or content://
  const localUri = Array.isArray(params.uri) ? params.uri[0] : params.uri;
  const title = Array.isArray(params.title) ? params.title[0] : (params.title || 'PDF Document');

  if (!localUri) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ textAlign: 'center', marginTop: 20 }}>No PDF file specified.</Text>
      </SafeAreaView>
    );
  }

  const source = { uri: localUri, cache: true };

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

      {/* PDF Viewer */}
      <View style={styles.pdfContainer}>
        <Pdf
          trustAllCerts={false}
          source={source}
          onLoadComplete={(numberOfPages, filePath) => {
             console.log(`[PDF] Loaded ${numberOfPages} pages from ${filePath}`);
          }}
          onPageChanged={(page, numberOfPages) => {
             console.log(`[PDF] Current page: ${page}`);
          }}
          onError={(error) => {
             console.error("[PDF] Error rendering PDF:", error);
          }}
          onPressLink={(uri) => {
             console.log(`[PDF] Link pressed: ${uri}`);
          }}
          style={styles.pdf}
        />
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
  }
});

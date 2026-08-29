import { Stack, Redirect } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useAuthStore } from '@/stores/useAuthStore';
import OfflineBanner from '@/components/OfflineBanner';

export default function AdminLayout() {
  const { role, businessId } = useAuthStore();

  if (role && role !== 'admin') {
    return <Redirect href="/(student)/id-card" />;
  }

  return (
    <View style={styles.container} key={businessId || 'admin-root'}>
      <OfflineBanner />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});

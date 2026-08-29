import { Stack } from 'expo-router';

export default function AdminTestLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="create-ai" />
      <Stack.Screen name="create-manual" />
      <Stack.Screen name="target-exam-admin" />
      <Stack.Screen name="banks" />
      <Stack.Screen name="review/[id]" />
      <Stack.Screen name="live-dashboard/[id]" />
      <Stack.Screen name="zenza-review" />
      <Stack.Screen name="analytics/[id]" />
    </Stack>
  );
}

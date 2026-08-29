import { Redirect } from 'expo-router';

export default function NotificationsRouteRedirect() {
  return <Redirect href="/(admin)?tab=notifications" />;
}

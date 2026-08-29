import { Redirect } from 'expo-router';

export default function ProfileRouteRedirect() {
  return <Redirect href="/(admin)?tab=profile" />;
}

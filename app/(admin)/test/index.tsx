import { Redirect } from 'expo-router';

export default function TestRouteRedirect() {
  return <Redirect href="/(admin)?tab=test" />;
}

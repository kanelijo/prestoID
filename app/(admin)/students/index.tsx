import { Redirect } from 'expo-router';

export default function StudentsRouteRedirect() {
  return <Redirect href="/(admin)?tab=students" />;
}

import { Redirect } from 'expo-router';

export default function LeaderboardRouteRedirect() {
  return <Redirect href="/(admin)?tab=leaderboard" />;
}

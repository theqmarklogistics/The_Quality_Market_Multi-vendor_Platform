// Entry route. Sends users straight to the Shop tab (the Home landing stays one
// tap away); the root layout's auth gate bounces unauthenticated users to sign-in.
import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/(tabs)/shop" />;
}

// Entry route. Sends users to the tabbed app; the root layout's auth gate bounces
// unauthenticated users to the sign-in screen.
import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/(tabs)" />;
}

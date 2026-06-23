// Requests notification permission, obtains the Expo push token, and registers it
// with the backend. Returns the token, or null if unavailable (simulator, denied,
// or no EAS projectId). Safe to call repeatedly — registration upserts server-side.
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { registerPushToken, unregisterPushToken } from '@/api/push';

// Remember the last token so we can unregister it on sign-out (while still authed).
let lastToken: string | null = null;

export async function registerForPush(): Promise<string | null> {
  // Push tokens are not available on simulators/emulators.
  if (!Device.isDevice) return null;

  // Android needs a notification channel for headsup notifications.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return null;

  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
      ?.projectId || Constants.easConfig?.projectId;
  if (!projectId) {
    // Without an EAS projectId, getExpoPushTokenAsync can't resolve a token.
    console.warn('[push] No EAS projectId configured; skipping push registration.');
    return null;
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await registerPushToken({
      token,
      platform: Platform.OS,
      deviceId: Constants.sessionId,
    });
    lastToken = token;
    return token;
  } catch (err) {
    console.warn('[push] token registration failed:', err);
    return null;
  }
}

// Unregister this device's token. Call BEFORE signing out (needs an active session).
export async function unregisterCurrentPush(): Promise<void> {
  if (!lastToken) return;
  try {
    await unregisterPushToken(lastToken);
  } catch {
    // best-effort
  } finally {
    lastToken = null;
  }
}

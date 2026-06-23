// Registers for push on sign-in and routes notification taps to the right screen.
// Rendered once in the root layout (inside Clerk + Router).
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { registerForPush } from './registerForPush';

// Show notifications while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type PushData = {
  type?: string;
  orderId?: string;
  conversationId?: string;
};

export function PushManager() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const handled = useRef(false);

  // Register the device once the user is signed in.
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      registerForPush();
    }
  }, [isLoaded, isSignedIn]);

  // Route a notification's data payload to the relevant screen.
  const routeFromData = (data: PushData | undefined) => {
    if (!data) return;
    if (data.type === 'delivery' && data.orderId) {
      router.push({ pathname: '/track/[orderId]', params: { orderId: data.orderId } });
    } else if (data.type === 'chat' && data.conversationId) {
      router.push({
        pathname: '/conversation/[id]',
        params: { id: data.conversationId },
      });
    }
  };

  useEffect(() => {
    // Cold start from a tapped notification.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response && !handled.current) {
        handled.current = true;
        routeFromData(response.notification.request.content.data as PushData);
      }
    });

    // Taps while the app is running.
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      routeFromData(response.notification.request.content.data as PushData);
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

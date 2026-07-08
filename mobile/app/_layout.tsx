// Root layout: wires Clerk auth, the API token bridge, and the Redux store, then
// gates navigation between the (auth) and (tabs) route groups based on session state.
import { useEffect } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { Provider as ReduxProvider } from 'react-redux';

import { tokenCache } from '@/auth/tokenCache';
import { ApiAuthBridge } from '@/api/authBridge';
import { store } from '@/store';
import { CartSync } from '@/store/CartSync';
import { PushManager } from '@/push/PushManager';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { installGlobalErrorHandler } from '@/lib/crashReporting';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';

const isLocalWebHost =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname);

const hasProductionClerkKeyOnLocalhost =
  isLocalWebHost && publishableKey.startsWith('pk_live_');

// Report uncaught JS errors (outside the render tree) to the backend. Module
// scope so it's installed before the first render.
installGlobalErrorHandler();

function InitialLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (isSignedIn && inAuthGroup) {
      router.replace('/(tabs)');
    } else if (!isSignedIn && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    }
  }, [isLoaded, isSignedIn, segments, router]);

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <PushManager />
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="product/[id]" options={{ title: 'Product' }} />
        <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
        <Stack.Screen name="address/new" options={{ title: 'New address', presentation: 'modal' }} />
        <Stack.Screen name="order-confirmation" options={{ title: 'Order placed', headerBackVisible: false }} />
        <Stack.Screen name="track/[orderId]" options={{ title: 'Track delivery' }} />
        <Stack.Screen name="conversation/[id]" options={{ title: 'Chat' }} />
        <Stack.Screen name="rider/index" options={{ title: 'Rider console' }} />
        <Stack.Screen name="store/index" options={{ title: 'Seller console' }} />
        <Stack.Screen name="store/products" options={{ title: 'Products' }} />
        <Stack.Screen name="store/product-form" options={{ title: 'Add product' }} />
        <Stack.Screen name="store/orders" options={{ title: 'Store orders' }} />
        <Stack.Screen name="store/payouts" options={{ title: 'Payouts' }} />
        <Stack.Screen name="external/index" options={{ title: 'My deliveries' }} />
        <Stack.Screen name="external/book" options={{ title: 'Book a delivery' }} />
        <Stack.Screen name="admin/index" options={{ title: 'Admin console' }} />
        <Stack.Screen name="admin/dispatch" options={{ title: 'Dispatch board' }} />
        <Stack.Screen name="admin/payments" options={{ title: 'Payment review' }} />
        <Stack.Screen name="admin/stores" options={{ title: 'Store approvals' }} />
      </Stack>
    </ErrorBoundary>
  );
}

export default function RootLayout() {
  if (!publishableKey) {
    throw new Error(
      'Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Copy .env.example to .env and set it.',
    );
  }

  if (hasProductionClerkKeyOnLocalhost) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
          backgroundColor: '#111827',
        }}
      >
        <View style={{ maxWidth: 520, gap: 12 }}>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>
            Clerk production key cannot run on localhost
          </Text>
          <Text style={{ color: '#cbd5e1', fontSize: 16, lineHeight: 24 }}>
            This Expo web session is running on localhost, but your `pk_live_...` Clerk key is
            only allowed on the production domain. To test locally, switch to a Clerk test key
            or run the app from the production domain.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ApiAuthBridge>
        <ReduxProvider store={store}>
          <CartSync />
          <StatusBar style="auto" />
          <InitialLayout />
        </ReduxProvider>
      </ApiAuthBridge>
    </ClerkProvider>
  );
}

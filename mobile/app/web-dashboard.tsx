// In-app web dashboard: renders any section of the web platform inside the mobile
// app (react-native-webview), so EVERY web feature — the full admin console,
// logistics dispatch board, financial & warehouse dashboards, seller console —
// is available on mobile with its complete contents. Native quick screens still
// cover the common flows; this guarantees total parity.
//
// Auth: the WebView keeps its own Clerk session cookie — the user signs in once
// inside it and stays signed in across visits.
import { useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { BrandLogo } from '@/components/BrandLogo';
import { LoadingLine } from '@/components/ui';
import { API_URL } from '@/constants';
import { colors, fonts, spacing } from '@/theme';

export default function WebDashboardScreen() {
  const { path = '/', title = 'Dashboard' } = useLocalSearchParams<{ path?: string; title?: string }>();
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);

  const url = `${API_URL}${String(path).startsWith('/') ? path : `/${path}`}`;

  // Expo web build has no native WebView — open the page in the browser instead.
  if (Platform.OS === 'web') {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: String(title) }} />
        <Text style={styles.muted}>This dashboard opens in a new tab on web.</Text>
        <TouchableOpacity style={styles.openBtn} onPress={() => Linking.openURL(url)}>
          <Ionicons name="open-outline" size={16} color="#fff" />
          <Text style={styles.openBtnText}>Open dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: String(title),
          headerRight: () => (
            <View style={styles.headerActions}>
              {canGoBack ? (
                <TouchableOpacity onPress={() => webRef.current?.goBack()} hitSlop={10}>
                  <Ionicons name="arrow-back-circle-outline" size={24} color={colors.text} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={() => webRef.current?.reload()} hitSlop={10}>
                <Ionicons name="refresh-outline" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <WebView
        ref={webRef}
        source={{ uri: url }}
        style={{ flex: 1 }}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(nav) => setCanGoBack(nav.canGoBack)}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        javaScriptEnabled
        geolocationEnabled
        setSupportMultipleWindows={false}
      />
      {loading ? (
        <View style={styles.loader} pointerEvents="none">
          <BrandLogo size={72} />
          <LoadingLine width={148} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  muted: { fontSize: 14, color: colors.muted, fontFamily: fonts.regular, textAlign: 'center' },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  openBtnText: { color: '#fff', fontFamily: fonts.bold, fontSize: 14 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  loader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    backgroundColor: colors.bg, // hide the WebView's white flash behind the brand loader
  },
});

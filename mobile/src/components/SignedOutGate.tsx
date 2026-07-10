// Guest gate: wraps screens that need an account. Guests can browse the shop
// freely; the moment they hit orders/chat/checkout/account features, this shows
// a friendly sign-in prompt instead of the screen.
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { Button, Loader } from '@/components/ui';
import { colors, fonts, spacing } from '@/theme';

export function SignedOutGate({
  children,
  title = 'Sign in to continue',
  subtitle = 'Create a free account or sign in to use this part of the app.',
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  if (!isLoaded) return <Loader />;

  if (!isSignedIn) {
    return (
      <View style={styles.wrap}>
        <View style={styles.iconWrap}>
          <Ionicons name="person-circle-outline" size={44} color={colors.primary} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <View style={styles.actions}>
          <Button label="Sign in" onPress={() => router.push('/(auth)/sign-in')} />
          <Button
            label="Create account"
            variant="outline"
            onPress={() => router.push('/(auth)/sign-up')}
          />
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.bg,
    gap: spacing.sm,
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: 19, fontFamily: fonts.bold, color: colors.text, textAlign: 'center' },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    fontFamily: fonts.regular,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  actions: { alignSelf: 'stretch', gap: spacing.sm },
});

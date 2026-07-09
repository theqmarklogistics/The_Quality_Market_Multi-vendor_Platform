// Email + password sign-in via Clerk. Uses the same Clerk instance as the web app,
// so existing accounts work as-is.
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useSignIn } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui';
import { BrandLogo } from '@/components/BrandLogo';
import { colors, fonts, radius, spacing } from '@/theme';

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSignIn = async () => {
    if (!isLoaded || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const attempt = await signIn.create({ identifier: email.trim(), password });
      if (attempt.status === 'complete') {
        await setActive({ session: attempt.createdSessionId });
        router.replace('/(tabs)');
      } else {
        setError('Additional verification is required to sign in.');
      }
    } catch (err: any) {
      setError(err?.errors?.[0]?.message ?? 'Sign-in failed. Check your details.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <BrandLogo size={84} style={styles.brandMark} />
        <Text style={styles.title}>
          The Quality <Text style={styles.titleAccent}>Market</Text>
        </Text>
        <Text style={styles.subtitle}>Welcome back — sign in to your account</Text>

        <Text style={styles.label}>Email</Text>
        <View style={styles.inputRow}>
          <Ionicons name="mail-outline" size={18} color={colors.subtle} />
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={colors.subtle}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <Text style={styles.label}>Password</Text>
        <View style={styles.inputRow}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.subtle} />
          <TextInput
            style={styles.input}
            placeholder="Your password"
            placeholderTextColor={colors.subtle}
            secureTextEntry={!showPassword}
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={19}
              color={colors.muted}
            />
          </TouchableOpacity>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}

        <View style={{ marginTop: spacing.sm }}>
          <Button label="Sign in" onPress={onSignIn} loading={submitting} />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>No account? </Text>
          <Link href="/(auth)/sign-up" style={styles.link}>
            Create one
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  brandMark: {
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 26,
    fontFamily: fonts.bold,
    color: colors.text,
    textAlign: 'center',
  },
  titleAccent: { color: colors.primary },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: spacing.xl,
    fontFamily: fonts.regular,
  },
  label: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: fonts.medium,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    minHeight: 50,
    marginBottom: spacing.md,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    fontFamily: fonts.regular,
    paddingVertical: 12,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.sm,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  error: { color: colors.dangerDeep, fontSize: 13, flex: 1, fontFamily: fonts.medium },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  footerText: { color: colors.muted, fontFamily: fonts.regular },
  link: { color: colors.primary, fontFamily: fonts.semibold },
});

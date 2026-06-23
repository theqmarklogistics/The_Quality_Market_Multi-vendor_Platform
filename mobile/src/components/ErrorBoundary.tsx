// App-wide error boundary. Catches render/lifecycle crashes in the screen tree so a
// single bad render shows a friendly recovery screen instead of white-screening the
// whole app. Wraps the navigation in app/_layout.tsx. The fallback uses only static
// imports (no providers/hooks) so it still renders even if context is the culprit.
import { Component, type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/theme';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Surface for crash logs / dev console. Swap for a reporter (Sentry, etc.) later.
    console.error('[ErrorBoundary] Uncaught render error:', error);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Ionicons name="alert-circle-outline" size={56} color={colors.danger} />
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            The app hit an unexpected error. You can try again — if it keeps happening,
            restart the app.
          </Text>
          {__DEV__ ? (
            <Text style={styles.detail} numberOfLines={6}>
              {this.state.error.message}
            </Text>
          ) : null}
          <TouchableOpacity style={styles.button} onPress={this.reset} activeOpacity={0.85}>
            <Text style={styles.buttonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
    backgroundColor: colors.bg,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: spacing.md },
  subtitle: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  detail: {
    fontSize: 12,
    color: colors.danger,
    backgroundColor: '#fef2f2',
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.sm,
    alignSelf: 'stretch',
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
  },
  buttonText: { color: colors.primaryText, fontSize: 16, fontWeight: '700' },
});

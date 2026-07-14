// Small reusable UI primitives shared across screens.
// Visual language mirrors the web app: Outfit type, slate neutrals,
// green-600 brand accent, dark slate purchase CTAs, soft shadows.
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, shadows, spacing } from '@/theme';
import { formatPrice } from '@/constants';
import { BrandLogo } from './BrandLogo';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable that gently scales down while pressed (web's active:scale-95). */
export function PressableScale({
  children,
  style,
  disabled,
  onPress,
  scaleTo = 0.97,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  onPress?: () => void;
  scaleTo?: number;
  accessibilityLabel?: string;
}) {
  const [scale] = useState(() => new Animated.Value(1));
  const animate = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => animate(scaleTo)}
      onPressOut={() => animate(1)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

type ButtonVariant = 'primary' | 'brand' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'lg' | 'md' | 'sm';

/**
 * Button. `primary` is the dark slate purchase CTA (matches the web's
 * bg-slate-800 buttons); `brand` is solid green for positive/brand actions.
 */
export function Button({
  label,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  size = 'lg',
  icon,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const isDisabled = disabled || loading;
  const spinnerColor =
    variant === 'outline' ? colors.text : variant === 'ghost' ? colors.primary : colors.onInk;
  const textStyle = [
    styles.btnText,
    size === 'sm' && styles.btnTextSm,
    variant === 'outline' && styles.btnTextOutline,
    variant === 'ghost' && styles.btnTextGhost,
  ];
  const iconColor =
    variant === 'outline' ? colors.text : variant === 'ghost' ? colors.primary : colors.onInk;
  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      accessibilityLabel={label}
      style={[
        styles.btn,
        size === 'md' && styles.btnMd,
        size === 'sm' && styles.btnSm,
        variant === 'brand' && styles.btnBrand,
        variant === 'outline' && styles.btnOutline,
        variant === 'ghost' && styles.btnGhost,
        variant === 'danger' && styles.btnDanger,
        isDisabled && styles.btnDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <View style={styles.btnInner}>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 15 : 18} color={iconColor} /> : null}
          <Text style={textStyle}>{label}</Text>
        </View>
      )}
    </PressableScale>
  );
}

/** Labeled input with focus highlight and optional error/helper text. */
export function Field({
  label,
  error,
  helper,
  style,
  ...props
}: { label: string; error?: string | null; helper?: string } & TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          focused && styles.inputFocused,
          !!error && styles.inputError,
          style,
        ]}
        placeholderTextColor={colors.subtle}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        {...props}
      />
      {error ? (
        <View style={styles.fieldMsgRow}>
          <Ionicons name="alert-circle" size={13} color={colors.danger} />
          <Text style={styles.fieldError}>{error}</Text>
        </View>
      ) : helper ? (
        <Text style={styles.fieldHelper}>{helper}</Text>
      ) : null}
    </View>
  );
}

export function Money({ value, style }: { value: number | null | undefined; style?: object }) {
  return <Text style={[styles.money, style]}>{formatPrice(value ?? 0)}</Text>;
}

/** Star rating display — brand-green fill, gray empties (same as web). */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const rounded = Math.round(value);
  return (
    <View style={{ flexDirection: 'row', gap: 1 }} accessibilityLabel={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name="star" size={size} color={i <= rounded ? colors.star : colors.starEmpty} />
      ))}
    </View>
  );
}

/** White card surface with soft slate shadow (web's rounded-2xl card). */
export function Card({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return <View style={[styles.card, padded && styles.cardPadded, style]}>{children}</View>;
}

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

const badgeTones: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: colors.borderLight, fg: colors.muted },
  success: { bg: colors.successSoft, fg: colors.successDeep },
  warning: { bg: colors.warningSoft, fg: colors.warningDeep },
  danger: { bg: colors.dangerSoft, fg: colors.dangerDeep },
  info: { bg: colors.infoSoft, fg: colors.infoDeep },
  brand: { bg: colors.primaryTint, fg: colors.primaryDark },
};

/** Soft status pill (web's bg-green-100 text-green-700 pattern). */
export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const t = badgeTones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.badgeText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

/** Section heading with optional trailing action. */
export function SectionTitle({
  title,
  action,
  onAction,
  style,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.sectionRow, style]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button" accessibilityLabel={action}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Pulsing placeholder block for loading states. */
export function Skeleton({
  width,
  height,
  borderRadius = radius.sm,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}) {
  const [opacity] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: colors.borderLight, opacity }, style]}
    />
  );
}

export function EmptyState({
  icon = 'cube-outline',
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={34} color={colors.subtle} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySubtitle}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing.md, alignSelf: 'stretch' }}>
          <Button label={actionLabel} variant="brand" size="md" onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

/** Indeterminate brand-green loading line (the app's signature loader). */
export function LoadingLine({ width = 168 }: { width?: number }) {
  const [progress] = useState(() => new Animated.Value(0));
  const barW = Math.round(width * 0.36);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  // Slide the green segment across (and past) the track, then wrap around.
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-barW, width],
  });

  return (
    <View style={[styles.loadingTrack, { width }]}>
      <Animated.View
        style={[styles.loadingBar, { width: barW, transform: [{ translateX }] }]}
      />
    </View>
  );
}

/** Full-screen branded loading state: brand mark over the green loading line. */
export function Loader() {
  return (
    <View style={styles.loader} accessibilityLabel="Loading">
      <BrandLogo size={72} />
      <LoadingLine width={148} />
    </View>
  );
}

// Average of a product's rating relation.
export function avgRating(ratings: { rating: number }[] | undefined): number {
  if (!ratings || ratings.length === 0) return 0;
  return ratings.reduce((s, r) => s + r.rating, 0) / ratings.length;
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: colors.ink,
    borderRadius: radius.md + 2,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnMd: { minHeight: 46 },
  btnSm: { minHeight: 38, paddingHorizontal: spacing.md, borderRadius: radius.sm + 2 },
  btnBrand: { backgroundColor: colors.primary },
  btnOutline: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnGhost: { backgroundColor: 'transparent' },
  btnDanger: { backgroundColor: colors.danger },
  btnDisabled: { opacity: 0.45 },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { color: colors.onInk, fontSize: 16, fontFamily: fonts.semibold },
  btnTextSm: { fontSize: 14 },
  btnTextOutline: { color: colors.text },
  btnTextGhost: { color: colors.primary },
  fieldLabel: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 6,
    fontFamily: fonts.medium,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    fontSize: 16,
    color: colors.text,
    fontFamily: fonts.regular,
  },
  inputFocused: { borderColor: colors.primary },
  inputError: { borderColor: colors.danger },
  fieldMsgRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  fieldError: { fontSize: 12.5, color: colors.danger, fontFamily: fonts.medium },
  fieldHelper: { fontSize: 12.5, color: colors.subtle, marginTop: 5, fontFamily: fonts.regular },
  money: {
    fontSize: 16,
    color: colors.text,
    fontFamily: fonts.bold,
    fontVariant: ['tabular-nums'],
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  cardPadded: { padding: spacing.lg },
  badge: {
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11, fontFamily: fonts.semibold, letterSpacing: 0.3 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 17, color: colors.text, fontFamily: fonts.semibold },
  sectionAction: { fontSize: 14, color: colors.primary, fontFamily: fonts.semibold },
  empty: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 8 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, color: colors.text, marginTop: 4, fontFamily: fonts.semibold },
  emptySubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
    fontFamily: fonts.regular,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: 22,
  },
  loadingTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primaryTint,
    overflow: 'hidden',
  },
  loadingBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
});

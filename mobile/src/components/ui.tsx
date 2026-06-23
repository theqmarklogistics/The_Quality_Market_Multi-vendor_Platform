// Small reusable UI primitives shared across screens.
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/theme';
import { formatPrice } from '@/constants';

export function Button({
  label,
  onPress,
  loading,
  disabled,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'outline' | 'danger';
}) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      style={[
        styles.btn,
        variant === 'outline' && styles.btnOutline,
        variant === 'danger' && styles.btnDanger,
        isDisabled && styles.btnDisabled,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'outline' ? colors.text : colors.primaryText} />
      ) : (
        <Text style={[styles.btnText, variant === 'outline' && styles.btnTextOutline]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export function Field({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={colors.subtle} {...props} />
    </View>
  );
}

export function Money({ value, style }: { value: number | null | undefined; style?: object }) {
  return <Text style={[styles.money, style]}>{formatPrice(value ?? 0)}</Text>;
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const rounded = Math.round(value);
  return (
    <View style={{ flexDirection: 'row' }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= rounded ? 'star' : 'star-outline'}
          size={size}
          color={colors.star}
        />
      ))}
    </View>
  );
}

export function EmptyState({
  icon = 'cube-outline',
  title,
  subtitle,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={48} color={colors.subtle} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Loader() {
  return (
    <View style={styles.loader}>
      <ActivityIndicator size="large" color={colors.primary} />
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
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  btnDanger: { backgroundColor: colors.danger },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: colors.primaryText, fontSize: 16, fontWeight: '600' },
  btnTextOutline: { color: colors.text },
  fieldLabel: { fontSize: 13, color: colors.muted, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  money: { fontSize: 16, fontWeight: '700', color: colors.text },
  empty: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginTop: 8 },
  emptySubtitle: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});

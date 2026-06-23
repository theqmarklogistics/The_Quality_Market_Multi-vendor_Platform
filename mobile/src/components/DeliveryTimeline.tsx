// Vertical status stepper for a pooled delivery.
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';

const STEPS: { key: string; label: string }[] = [
  { key: 'PENDING_INTAKE', label: 'Order received at hub' },
  { key: 'SORTING', label: 'Sorted for delivery' },
  { key: 'IN_TRANSIT', label: 'On the way' },
  { key: 'ARRIVING', label: 'Rider arriving' },
  { key: 'DELIVERED', label: 'Delivered' },
];

export function DeliveryTimeline({ status }: { status: string | null }) {
  if (status === 'FAILED') {
    return (
      <View style={styles.failed}>
        <Ionicons name="alert-circle" size={20} color={colors.danger} />
        <Text style={styles.failedText}>Delivery attempt failed</Text>
      </View>
    );
  }

  const activeIndex = Math.max(
    0,
    STEPS.findIndex((s) => s.key === status),
  );

  return (
    <View>
      {STEPS.map((step, i) => {
        const done = i < activeIndex;
        const current = i === activeIndex;
        const reached = done || current;
        return (
          <View key={step.key} style={styles.row}>
            <View style={styles.railCol}>
              <View
                style={[
                  styles.dot,
                  reached && styles.dotActive,
                  current && styles.dotCurrent,
                ]}
              >
                {done ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
              </View>
              {i < STEPS.length - 1 ? (
                <View style={[styles.rail, done && styles.railActive]} />
              ) : null}
            </View>
            <Text style={[styles.label, reached && styles.labelActive]}>{step.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  railCol: { alignItems: 'center', width: 24 },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: { borderColor: colors.success, backgroundColor: colors.success },
  dotCurrent: { borderColor: colors.primary, backgroundColor: colors.primary },
  rail: { width: 2, height: 26, backgroundColor: colors.border },
  railActive: { backgroundColor: colors.success },
  label: { fontSize: 14, color: colors.subtle, marginLeft: spacing.sm, paddingBottom: 18 },
  labelActive: { color: colors.text, fontWeight: '600' },
  failed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff5f5',
    padding: spacing.md,
    borderRadius: 8,
  },
  failedText: { color: colors.danger, fontWeight: '600' },
});

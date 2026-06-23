// Seller → Payouts. Read-only list of platform payouts to the store, with received
// and pending totals. Mirrors the web's app/store/payouts.
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getPayouts, type Payout } from '@/api/store';
import { EmptyState, Loader, Money } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

export default function SellerPayoutsScreen() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getPayouts();
      setPayouts(res.payouts || []);
    } catch {
      // surfaced via empty state
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const totalPaid = payouts.filter((p) => p.status === 'PAID').reduce((a, p) => a + p.amount, 0);
  const totalPending = payouts.filter((p) => p.status === 'PENDING').reduce((a, p) => a + p.amount, 0);

  const fmt = (d: string) => {
    try {
      return format(new Date(d), 'MMM d, yyyy');
    } catch {
      return '—';
    }
  };

  if (loading) return <Loader />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {payouts.length ? (
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Ionicons name="checkmark-circle" size={22} color={colors.success} />
            <Text style={styles.summaryLabel}>Received</Text>
            <Money value={totalPaid} style={styles.summaryValue} />
          </View>
          <View style={styles.summaryCard}>
            <Ionicons name="time-outline" size={22} color={colors.warning} />
            <Text style={styles.summaryLabel}>Pending</Text>
            <Money value={totalPending} style={styles.summaryValue} />
          </View>
        </View>
      ) : null}

      {payouts.length === 0 ? (
        <EmptyState
          icon="cash-outline"
          title="No payouts yet"
          subtitle="Payouts from the platform will appear here."
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {payouts.map((p) => {
            const paid = p.status === 'PAID';
            return (
              <View key={p.id} style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.period}>
                    {fmt(p.periodStart)} – {fmt(p.periodEnd)}
                  </Text>
                  <View style={[styles.badge, paid ? styles.paidBadge : styles.pendingBadge]}>
                    <Ionicons
                      name={paid ? 'checkmark-circle' : 'time-outline'}
                      size={11}
                      color={paid ? '#15803d' : '#b45309'}
                    />
                    <Text style={[styles.badgeText, { color: paid ? '#15803d' : '#b45309' }]}>{p.status}</Text>
                  </View>
                  {p.notes ? <Text style={styles.notes}>{p.notes}</Text> : null}
                  {p.paidAt ? <Text style={styles.paidAt}>Paid {fmt(p.paidAt)}</Text> : null}
                </View>
                <Money value={p.amount} style={styles.amount} />
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },

  summaryRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 2,
  },
  summaryLabel: { fontSize: 12, color: colors.muted, marginTop: 4 },
  summaryValue: { fontSize: 18 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  period: { fontSize: 14, fontWeight: '600', color: colors.text },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 6,
  },
  paidBadge: { backgroundColor: '#dcfce7' },
  pendingBadge: { backgroundColor: '#fef3c7' },
  badgeText: { fontSize: 10, fontWeight: '700' },
  notes: { fontSize: 12, color: colors.muted, marginTop: 6 },
  paidAt: { fontSize: 11, color: colors.subtle, marginTop: 2 },
  amount: { fontSize: 16 },
});

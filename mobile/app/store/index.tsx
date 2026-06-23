// Seller console — the mobile equivalent of the web's app/store dashboard. Shows
// the store's headline metrics, a low-stock alert, recent reviews, and shortcuts
// into Products, Orders, Payouts and Messages. Access is role-gated (SELLER/ADMIN)
// and the store API still enforces an approved, active store (authSeller); when it
// isn't, getSellerStatus's reason drives a friendly empty state.
import { useCallback, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getSellerDashboard,
  getSellerStatus,
  type SellerDashboard,
  type SellerStatus,
} from '@/api/store';
import { useMyRole, canAccessSeller } from '@/hooks/useMyRole';
import { EmptyState, Loader, Money, Stars } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

const STATUS_COPY: Record<string, { title: string; subtitle: string }> = {
  no_store: {
    title: 'No store yet',
    subtitle: 'Create your store on thequalitymarket.com to start selling, then come back here.',
  },
  store_pending: {
    title: 'Store under review',
    subtitle: 'An admin is reviewing your store. You can manage it here once approved.',
  },
  store_rejected: {
    title: 'Store not approved',
    subtitle: 'Your store application was rejected. Contact support for next steps.',
  },
  store_inactive: {
    title: 'Store deactivated',
    subtitle: 'Your store is currently inactive. Contact support to reactivate it.',
  },
};

export default function SellerDashboardScreen() {
  const router = useRouter();
  const { role, loading: roleLoading } = useMyRole();
  const allowed = canAccessSeller(role);

  const [status, setStatus] = useState<SellerStatus | null>(null);
  const [data, setData] = useState<SellerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await getSellerStatus();
      setStatus(s);
      if (s.isSeller) {
        setData(await getSellerDashboard());
      } else {
        setData(null);
      }
    } catch {
      setStatus({ isSeller: false, reason: 'error' });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!allowed) return;
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [allowed, load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (roleLoading || (allowed && loading)) return <Loader />;

  if (!allowed) {
    return (
      <EmptyState
        icon="storefront-outline"
        title="Sellers only"
        subtitle="This area is for store owners. Apply to sell on thequalitymarket.com."
      />
    );
  }

  if (status && !status.isSeller) {
    const copy = STATUS_COPY[status.reason ?? ''] ?? {
      title: 'Store unavailable',
      subtitle: 'We could not open your seller dashboard. Pull to refresh or try again later.',
    };
    return <EmptyState icon="storefront-outline" title={copy.title} subtitle={copy.subtitle} />;
  }

  const metrics = [
    { label: 'Products', value: String(data?.totalProducts ?? 0), icon: 'cube-outline' as const },
    { label: 'Orders', value: String(data?.totalOrders ?? 0), icon: 'receipt-outline' as const },
    { label: 'Reviews', value: String(data?.ratings.length ?? 0), icon: 'star-outline' as const },
  ];

  const shortcuts = [
    { title: 'Products', subtitle: 'Add, edit & stock', icon: 'pricetags-outline' as const, route: '/store/products' },
    { title: 'Orders', subtitle: 'Fulfil & ship', icon: 'cart-outline' as const, route: '/store/orders' },
    { title: 'Payouts', subtitle: 'Your earnings', icon: 'cash-outline' as const, route: '/store/payouts' },
    { title: 'Messages', subtitle: 'Buyer chats', icon: 'chatbubbles-outline' as const, route: '/(tabs)/chat' },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.headerKicker}>SELLER CONSOLE</Text>
        <Text style={styles.headerTitle}>{status?.storeInfo?.name ?? 'Your store'}</Text>
        <Text style={styles.headerEarnings}>
          Net earnings: <Money value={data?.totalEarnings ?? 0} style={styles.earningsValue} />
        </Text>
      </View>

      <View style={styles.metricsRow}>
        {metrics.map((m) => (
          <View key={m.label} style={styles.metricCard}>
            <Ionicons name={m.icon} size={18} color={colors.muted} />
            <Text style={styles.metricValue}>{m.value}</Text>
            <Text style={styles.metricLabel}>{m.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.shortcuts}>
        {shortcuts.map((s) => (
          <TouchableOpacity
            key={s.title}
            style={styles.shortcut}
            onPress={() => router.push(s.route as never)}
            activeOpacity={0.85}
          >
            <View style={styles.shortcutIcon}>
              <Ionicons name={s.icon} size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.shortcutTitle}>{s.title}</Text>
              <Text style={styles.shortcutSub}>{s.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.subtle} />
          </TouchableOpacity>
        ))}
      </View>

      {data?.lowStockProducts.length ? (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
            <Text style={styles.sectionTitle}>Low stock</Text>
          </View>
          <View style={{ gap: spacing.sm }}>
            {data.lowStockProducts.map((p) => {
              const out = p.warehouseQuantity === 0;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.lowStock, out && styles.lowStockOut]}
                  onPress={() => router.push({ pathname: '/store/product-form', params: { id: p.id } })}
                >
                  <Text style={styles.lowStockName} numberOfLines={1}>{p.name}</Text>
                  <Text style={[styles.lowStockQty, out && styles.lowStockQtyOut]}>
                    {out ? 'Out of stock' : `${p.warehouseQuantity} left`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="star-outline" size={18} color={colors.star} />
          <Text style={styles.sectionTitle}>Recent reviews</Text>
        </View>
        {data?.ratings.length ? (
          <View style={{ gap: spacing.md }}>
            {data.ratings.slice(0, 10).map((r, i) => (
              <View key={i} style={styles.review}>
                <View style={styles.reviewTop}>
                  <Text style={styles.reviewUser}>{r.user?.name ?? 'Customer'}</Text>
                  <Stars value={r.rating} />
                </View>
                {r.product?.name ? (
                  <Text style={styles.reviewProduct}>{r.product.name}</Text>
                ) : null}
                {r.review ? <Text style={styles.reviewBody}>{r.review}</Text> : null}
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyHint}>No reviews yet. They’ll appear here as customers rate your products.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: '#0f172a',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  headerKicker: { color: 'rgba(255,255,255,0.6)', fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 2 },
  headerEarnings: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 6, flexDirection: 'row' },
  earningsValue: { color: '#fff', fontSize: 14 },

  metricsRow: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg },
  metricCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  metricValue: { fontSize: 20, fontWeight: '800', color: colors.text },
  metricLabel: { fontSize: 11, color: colors.muted },

  shortcuts: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  shortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  shortcutIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  shortcutSub: { fontSize: 12, color: colors.muted, marginTop: 2 },

  section: { padding: spacing.lg },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },

  lowStock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.md,
  },
  lowStockOut: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  lowStockName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  lowStockQty: { fontSize: 13, fontWeight: '700', color: colors.warning },
  lowStockQtyOut: { color: colors.danger },

  review: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  reviewTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewUser: { fontSize: 14, fontWeight: '700', color: colors.text },
  reviewProduct: { fontSize: 12, color: colors.muted, marginTop: 2 },
  reviewBody: { fontSize: 13, color: colors.text, marginTop: 6, lineHeight: 19 },

  emptyHint: { fontSize: 13, color: colors.muted },
});

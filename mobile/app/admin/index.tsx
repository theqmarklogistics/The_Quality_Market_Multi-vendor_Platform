// Ops console home — the mobile equivalent of the web admin dashboard. Role-aware:
//   • ADMIN sees headline metrics + triage counts and shortcuts into the dispatch
//     board, payment-proof review and store approvals.
//   • LOGISTICS_MANAGER (non-admin) sees only the dispatch board entry; the admin
//     dashboard endpoint is admin-only, so we skip it for them.
// All admin endpoints stay gated by authAdmin/authLogistics on the backend.
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
import { getAdminDashboard, type AdminDashboard } from '@/api/admin';
import { useMyRole, canAccessAdmin, canAccessOps } from '@/hooks/useMyRole';
import { EmptyState, Loader, Money } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/theme';

interface Triage {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  route?: string;
  tone?: 'alert' | 'normal';
}

export default function AdminHomeScreen() {
  const router = useRouter();
  const { role, loading: roleLoading } = useMyRole();
  const isAdmin = canAccessAdmin(role);
  const isOps = canAccessOps(role);

  const [data, setData] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) {
      setData(null);
      return;
    }
    try {
      setData(await getAdminDashboard());
    } catch {
      setData(null);
    }
  }, [isAdmin]);

  useFocusEffect(
    useCallback(() => {
      if (!isOps) return;
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [isOps, load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (roleLoading || (isAdmin && loading)) return <Loader />;

  if (!isOps) {
    return (
      <EmptyState
        icon="lock-closed-outline"
        title="Ops only"
        subtitle="This area is for admins and logistics managers."
      />
    );
  }

  // The dispatch board is available to every ops user (admin + logistics manager).
  const shortcuts: Triage[] = [
    {
      label: 'Dispatch board',
      value: 0,
      icon: 'git-network-outline',
      route: '/admin/dispatch',
    },
  ];

  const triage: Triage[] = isAdmin
    ? [
        { label: 'Payment proofs', value: data?.pendingPaymentProofs ?? 0, icon: 'card-outline', route: '/admin/payments', tone: 'alert' },
        { label: 'Store approvals', value: data?.pendingStores ?? 0, icon: 'storefront-outline', route: '/admin/stores', tone: 'alert' },
        { label: 'New orders', value: data?.newOrders ?? 0, icon: 'receipt-outline', tone: 'normal' },
        { label: 'Pending products', value: data?.pendingProducts ?? 0, icon: 'cube-outline', tone: 'normal' },
        { label: 'Unread chats', value: data?.unreadChatMessages ?? 0, icon: 'chatbubbles-outline', tone: 'normal' },
        { label: 'Invoice requests', value: data?.pendingInvoiceRequests ?? 0, icon: 'document-text-outline', tone: 'normal' },
      ]
    : [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.headerKicker}>{isAdmin ? 'ADMIN CONSOLE' : 'LOGISTICS'}</Text>
        <Text style={styles.headerTitle}>Operations</Text>
        {isAdmin ? (
          <View style={styles.headerStats}>
            <View>
              <Text style={styles.headerStatValue}>{data?.orders ?? 0}</Text>
              <Text style={styles.headerStatLabel}>Total orders</Text>
            </View>
            <View>
              <Money value={Number(data?.revenue ?? 0)} style={styles.headerStatValue} />
              <Text style={styles.headerStatLabel}>Revenue</Text>
            </View>
            <View>
              <Text style={styles.headerStatValue}>{data?.stores ?? 0}</Text>
              <Text style={styles.headerStatLabel}>Stores</Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* Primary actions */}
      <View style={styles.shortcuts}>
        {shortcuts.map((s) => (
          <TouchableOpacity
            key={s.label}
            style={styles.shortcut}
            onPress={() => s.route && router.push(s.route as never)}
            activeOpacity={0.85}
          >
            <View style={styles.shortcutIcon}>
              <Ionicons name={s.icon} size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.shortcutTitle}>{s.label}</Text>
              <Text style={styles.shortcutSub}>Batch, assign riders & dispatch corridors</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.subtle} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Triage grid (admin only) */}
      {triage.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Needs attention</Text>
          <View style={styles.grid}>
            {triage.map((t) => {
              const alert = t.tone === 'alert' && t.value > 0;
              const Wrapper: typeof TouchableOpacity | typeof View = t.route ? TouchableOpacity : View;
              return (
                <Wrapper
                  key={t.label}
                  style={[styles.tile, alert && styles.tileAlert]}
                  onPress={t.route ? () => router.push(t.route as never) : undefined}
                  activeOpacity={0.85}
                >
                  <View style={styles.tileTop}>
                    <Ionicons
                      name={t.icon}
                      size={18}
                      color={alert ? colors.danger : colors.muted}
                    />
                    {t.route ? (
                      <Ionicons name="chevron-forward" size={14} color={colors.subtle} />
                    ) : null}
                  </View>
                  <Text style={[styles.tileValue, alert && { color: colors.danger }]}>{t.value}</Text>
                  <Text style={styles.tileLabel}>{t.label}</Text>
                </Wrapper>
              );
            })}
          </View>
        </View>
      ) : null}
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
  headerKicker: { color: 'rgba(255,255,255,0.6)', fontSize: 11, letterSpacing: 2, fontFamily: fonts.bold },
  headerTitle: { color: '#fff', fontSize: 22, fontFamily: fonts.bold, marginTop: 2 },
  headerStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg, gap: spacing.md },
  headerStatValue: { color: '#fff', fontSize: 18, fontFamily: fonts.bold },
  headerStatLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 },

  shortcuts: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
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
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.text },
  shortcutSub: { fontSize: 12, color: colors.muted, marginTop: 2 },

  section: { padding: spacing.lg },
  sectionTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.text, marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    width: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 2,
  },
  tileAlert: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tileValue: { fontSize: 24, fontFamily: fonts.bold, color: colors.text, marginTop: 4 },
  tileLabel: { fontSize: 12, color: colors.muted },
});

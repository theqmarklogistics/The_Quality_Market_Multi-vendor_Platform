// Seller → Orders. Lists store orders (paginated, searchable, status-filtered) and
// opens a detail sheet to fulfil them: set a shipping fee, choose the pooled-delivery
// intake method, and advance status (Processing → Shipped with an optional public
// note). Mirrors the web's app/store/orders. Sellers can only set PROCESSING/SHIPPED;
// DELIVERED is admin-only (backend-enforced).
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  listSellerOrders,
  updateSellerOrder,
  type SellerOrder,
} from '@/api/store';
import { EmptyState, Loader, Money } from '@/components/ui';
import { formatPrice } from '@/constants';
import type { OrderStatus } from '@/constants';
import { colors, fonts, radius, spacing } from '@/theme';

const STATUS_FILTERS: { label: string; value: OrderStatus | '' }[] = [
  { label: 'All', value: '' },
  { label: 'Placed', value: 'ORDER_PLACED' },
  { label: 'Processing', value: 'PROCESSING' },
  { label: 'Shipped', value: 'SHIPPED' },
  { label: 'Delivered', value: 'DELIVERED' },
];

const STATUS_LABEL: Record<string, string> = {
  ORDER_PLACED: 'Placed',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
};

export default function SellerOrdersScreen() {
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<OrderStatus | ''>('');

  const [selected, setSelected] = useState<SellerOrder | null>(null);
  const [shippingInput, setShippingInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchPage = useCallback(
    async (pg: number, q: string, status: OrderStatus | '') => {
      const res = await listSellerOrders({ page: pg, search: q, status });
      setTotal(res.total);
      setPage(res.page);
      setPages(res.pages);
      setOrders((prev) => (pg === 1 ? res.orders : [...prev, ...res.orders]));
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchPage(1, search, filter)
        .catch((err: any) => Alert.alert('Could not load orders', err?.message ?? 'Try again.'))
        .finally(() => setLoading(false));
    }, [fetchPage, search, filter]),
  );

  const loadMore = async () => {
    if (loadingMore || page >= pages) return;
    setLoadingMore(true);
    try {
      await fetchPage(page + 1, search, filter);
    } catch {
      /* keep list */
    } finally {
      setLoadingMore(false);
    }
  };

  const open = (o: SellerOrder) => {
    setSelected(o);
    setShippingInput('');
    setNoteInput(o.publicStatusNote ?? '');
  };

  // Apply a partial update to the selected order both in the modal and the list.
  const patchLocal = (changes: Partial<SellerOrder>) => {
    setSelected((cur) => (cur ? { ...cur, ...changes } : cur));
    setOrders((prev) => prev.map((o) => (selected && o.id === selected.id ? { ...o, ...changes } : o)));
  };

  const setShippingFee = async () => {
    if (!selected) return;
    const fee = parseFloat(shippingInput);
    if (Number.isNaN(fee) || fee < 0) {
      Alert.alert('Invalid fee', 'Enter a valid shipping fee (0 or more).');
      return;
    }
    setBusy(true);
    try {
      const res = await updateSellerOrder(selected.id, { shippingCost: fee });
      patchLocal({ shippingCost: res.shippingCost ?? fee, total: res.total ?? selected.total, shippingQuoted: true });
      setShippingInput('');
    } catch (err: any) {
      Alert.alert('Could not set fee', err?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const setIntake = async (method: 'HUB_DROP_OFF' | 'DRIVER_SWEEP') => {
    if (!selected || selected.intakeMethod === method) return;
    setBusy(true);
    try {
      const res = await updateSellerOrder(selected.id, { intakeMethod: method });
      patchLocal({ intakeMethod: method, total: res.total ?? selected.total, shippingCost: res.shippingCost ?? selected.shippingCost });
    } catch (err: any) {
      Alert.alert('Could not set intake', err?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const advance = async (status: 'PROCESSING' | 'SHIPPED') => {
    if (!selected) return;
    setBusy(true);
    try {
      await updateSellerOrder(
        selected.id,
        status === 'SHIPPED' ? { status, publicStatusNote: noteInput.trim() || null } : { status },
      );
      patchLocal({ status, publicStatusNote: status === 'SHIPPED' ? noteInput.trim() || null : selected.publicStatusNote });
    } catch (err: any) {
      Alert.alert('Could not update', err?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        ListHeaderComponent={
          <View>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={colors.subtle} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search customer…"
                placeholderTextColor={colors.subtle}
                value={searchInput}
                onChangeText={setSearchInput}
                onSubmitEditing={() => setSearch(searchInput.trim())}
                returnKeyType="search"
              />
              {searchInput ? (
                <TouchableOpacity onPress={() => { setSearchInput(''); setSearch(''); }}>
                  <Ionicons name="close-circle" size={16} color={colors.subtle} />
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.filters}>
              {STATUS_FILTERS.map((f) => {
                const active = filter === f.value;
                return (
                  <TouchableOpacity
                    key={f.label}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setFilter(f.value)}
                  >
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {total > 0 ? <Text style={styles.count}>{total} order{total === 1 ? '' : 's'}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="receipt-outline"
            title="No orders"
            subtitle={search || filter ? 'Try adjusting your filters.' : 'Customer orders will appear here.'}
          />
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.primary} /> : null
        }
        renderItem={({ item }) => {
          const paid = item.paymentStatus === 'PAID' || item.isPaid;
          return (
            <TouchableOpacity style={styles.card} onPress={() => open(item)} activeOpacity={0.85}>
              <View style={{ flex: 1 }}>
                <Text style={styles.customer}>{item.user?.name ?? 'Customer'}</Text>
                <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                <View style={styles.cardBadges}>
                  <View style={[styles.badge, styles.statusBadge]}>
                    <Text style={styles.statusBadgeText}>{STATUS_LABEL[item.status] ?? item.status}</Text>
                  </View>
                  <View style={[styles.badge, paid ? styles.paidBadge : styles.pendingBadge]}>
                    <Text style={[styles.badgeText, { color: paid ? '#15803d' : '#b45309' }]}>
                      {paid ? 'Paid' : 'Unpaid'}
                    </Text>
                  </View>
                  {!item.shippingQuoted ? (
                    <View style={[styles.badge, styles.shipBadge]}>
                      <Text style={[styles.badgeText, { color: '#b45309' }]}>+shipping</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={styles.cardRight}>
                <Money value={item.total} />
                <Ionicons name="chevron-forward" size={18} color={colors.subtle} />
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Detail sheet */}
      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Order details</Text>
              <TouchableOpacity onPress={() => setSelected(null)} disabled={busy}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            {selected ? (
              <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}>
                {/* Customer */}
                <Text style={styles.detailLabel}>Customer</Text>
                <Text style={styles.detailValue}>{selected.user?.name ?? '—'}</Text>
                {selected.user?.email ? <Text style={styles.detailSub}>{selected.user.email}</Text> : null}
                {selected.address?.phone ? <Text style={styles.detailSub}>{selected.address.phone}</Text> : null}
                {selected.address ? (
                  <Text style={styles.detailSub}>
                    {[selected.address.street, selected.address.sector, selected.address.city, selected.address.country]
                      .filter(Boolean)
                      .join(', ')}
                  </Text>
                ) : null}

                {/* Items */}
                <Text style={[styles.detailLabel, { marginTop: spacing.lg }]}>Products</Text>
                <View style={{ gap: spacing.sm }}>
                  {selected.orderItems.map((it) => (
                    <View key={String(it.id)} style={styles.itemRow}>
                      <Image source={{ uri: it.product?.images?.[0] }} style={styles.itemThumb} alt={it.product?.name ?? 'Product'} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName} numberOfLines={1}>{it.product?.name ?? 'Item'}</Text>
                        <Text style={styles.itemMeta}>Qty {it.quantity} · {formatPrice(it.price)}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Money + status */}
                <View style={styles.summary}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Shipping</Text>
                    <Text style={styles.summaryValue}>
                      {selected.shippingQuoted ? formatPrice(selected.shippingCost ?? 0) : 'Pending'}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Total</Text>
                    <Money value={selected.total} />
                  </View>
                </View>

                {/* Set shipping fee */}
                {!selected.shippingQuoted ? (
                  <View style={styles.actionCard}>
                    <Text style={styles.actionCardTitle}>Set shipping fee</Text>
                    <Text style={styles.actionCardHint}>Check the address above, then enter the delivery fee to charge.</Text>
                    <View style={styles.feeRow}>
                      <TextInput
                        style={styles.feeInput}
                        value={shippingInput}
                        onChangeText={(t) => setShippingInput(t.replace(/[^0-9.]/g, ''))}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={colors.subtle}
                      />
                      <TouchableOpacity style={styles.feeBtn} onPress={setShippingFee} disabled={busy}>
                        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.feeBtnText}>Confirm</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}

                {/* Rider-delivery intake (pooled + express) */}
                {selected.deliveryType === 'KIGALI_POOL' || selected.deliveryType === 'EXPRESS' ? (
                  <View style={styles.actionCard}>
                    <Text style={styles.actionCardTitle}>
                      {selected.deliveryType === 'EXPRESS' ? 'Express delivery intake' : 'Pooled delivery intake'}
                    </Text>
                    {selected.landmarkAddress ? (
                      <Text style={styles.actionCardHint}>Customer landmark: {selected.landmarkAddress}</Text>
                    ) : null}
                    {([
                      { method: 'HUB_DROP_OFF' as const, title: 'Drop off at Central Hub', sub: 'Free — Downtown / CHIC hub' },
                      { method: 'DRIVER_SWEEP' as const, title: 'Request driver sweep pickup', sub: '+1,000 RWF — we collect from you' },
                    ]).map((opt) => {
                      const active = selected.intakeMethod === opt.method;
                      return (
                        <TouchableOpacity
                          key={opt.method}
                          style={[styles.intakeOption, active && styles.intakeOptionActive]}
                          onPress={() => setIntake(opt.method)}
                          disabled={busy}
                        >
                          <Ionicons
                            name={active ? 'radio-button-on' : 'radio-button-off'}
                            size={18}
                            color={active ? colors.success : colors.subtle}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.intakeTitle}>{opt.title}</Text>
                            <Text style={styles.intakeSub}>{opt.sub}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}

                {/* Status advance */}
                {selected.status === 'ORDER_PLACED' ? (
                  <TouchableOpacity style={[styles.primaryBtn, styles.processingBtn]} onPress={() => advance('PROCESSING')} disabled={busy}>
                    {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Mark as processing</Text>}
                  </TouchableOpacity>
                ) : null}
                {selected.status === 'PROCESSING' ? (
                  <View style={{ marginTop: spacing.md }}>
                    <TextInput
                      style={[styles.input, styles.noteArea]}
                      value={noteInput}
                      onChangeText={setNoteInput}
                      placeholder="Delivery note for the customer (optional)"
                      placeholderTextColor={colors.subtle}
                      multiline
                      textAlignVertical="top"
                    />
                    <TouchableOpacity style={[styles.primaryBtn, styles.shippedBtn]} onPress={() => advance('SHIPPED')} disabled={busy}>
                      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Mark as shipped</Text>}
                    </TouchableOpacity>
                  </View>
                ) : null}
                {['SHIPPED', 'DELIVERED'].includes(selected.status) ? (
                  <Text style={styles.doneNote}>
                    {selected.status === 'DELIVERED' ? 'This order has been delivered.' : 'Order shipped — delivery is handled by logistics.'}
                  </Text>
                ) : null}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, gap: spacing.md },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, padding: 0 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  filterChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 12, color: colors.muted, fontFamily: fonts.semibold },
  filterTextActive: { color: colors.primaryText },
  count: { fontSize: 12, color: colors.subtle, marginTop: spacing.md },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  customer: { fontSize: 15, fontFamily: fonts.bold, color: colors.text },
  date: { fontSize: 12, color: colors.muted, marginTop: 2 },
  cardBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  cardRight: { alignItems: 'flex-end', gap: 4, flexDirection: 'row' },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  statusBadge: { backgroundColor: '#f1f5f9' },
  statusBadgeText: { fontSize: 10, fontFamily: fonts.bold, color: '#475569' },
  paidBadge: { backgroundColor: '#dcfce7' },
  pendingBadge: { backgroundColor: '#fef3c7' },
  shipBadge: { backgroundColor: '#fef3c7' },
  badgeText: { fontSize: 10, fontFamily: fonts.bold },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.text },

  detailLabel: { fontSize: 11, fontFamily: fonts.bold, color: colors.subtle, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  detailValue: { fontSize: 15, fontFamily: fonts.bold, color: colors.text },
  detailSub: { fontSize: 13, color: colors.muted, marginTop: 2 },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  itemThumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.card },
  itemName: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text },
  itemMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },

  summary: { marginTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, gap: 6 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 14, color: colors.muted },
  summaryValue: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text },

  actionCard: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  actionCardTitle: { fontSize: 14, fontFamily: fonts.bold, color: '#92400e' },
  actionCardHint: { fontSize: 12, color: '#b45309', marginTop: 4, marginBottom: spacing.sm },
  feeRow: { flexDirection: 'row', gap: spacing.sm },
  feeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  feeBtn: { backgroundColor: colors.warning, borderRadius: radius.sm, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  feeBtnText: { color: '#fff', fontFamily: fonts.bold },

  intakeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: colors.bg,
  },
  intakeOptionActive: { borderColor: '#86efac', backgroundColor: '#f0fdf4' },
  intakeTitle: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text },
  intakeSub: { fontSize: 12, color: colors.muted, marginTop: 2 },

  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  noteArea: { height: 80, marginBottom: spacing.sm },

  primaryBtn: { borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.md },
  processingBtn: { backgroundColor: colors.primary },
  shippedBtn: { backgroundColor: colors.success },
  primaryBtnText: { color: '#fff', fontFamily: fonts.bold, fontSize: 15 },
  doneNote: { fontSize: 13, color: colors.muted, marginTop: spacing.lg, textAlign: 'center' },
});

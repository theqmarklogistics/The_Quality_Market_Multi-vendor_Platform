// Payment-proof review — the mobile equivalent of the web admin payments queue.
// Lists orders by proof status (Submitted / Approved / Rejected), opens a detail
// sheet showing the uploaded proof image and order summary, and lets an admin
// Approve (marks the order paid) or Reject (with a note emailed to the customer).
// Mirrors POST /api/admin/payments. Access: ADMIN (authAdmin, backend-enforced).
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
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
  listPaymentProofs,
  reviewPaymentProof,
  type PaymentReviewOrder,
  type ProofStatus,
} from '@/api/admin';
import { useMyRole, canAccessAdmin } from '@/hooks/useMyRole';
import { EmptyState, Loader, Money } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

const FILTERS: { label: string; value: ProofStatus }[] = [
  { label: 'Submitted', value: 'SUBMITTED' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
];

export default function PaymentReviewScreen() {
  const { role, loading: roleLoading } = useMyRole();
  const allowed = canAccessAdmin(role);

  const [filter, setFilter] = useState<ProofStatus>('SUBMITTED');
  const [orders, setOrders] = useState<PaymentReviewOrder[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [selected, setSelected] = useState<PaymentReviewOrder | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchPage = useCallback(
    async (pg: number, status: ProofStatus) => {
      const res = await listPaymentProofs({ page: pg, proofStatus: status });
      setTotal(res.total);
      setPage(res.page);
      setPages(res.pages);
      setOrders((prev) => (pg === 1 ? res.orders : [...prev, ...res.orders]));
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      if (!allowed) return;
      setLoading(true);
      fetchPage(1, filter)
        .catch((err: any) => Alert.alert('Could not load', err?.message ?? 'Try again.'))
        .finally(() => setLoading(false));
    }, [allowed, fetchPage, filter]),
  );

  const loadMore = async () => {
    if (loadingMore || page >= pages) return;
    setLoadingMore(true);
    try {
      await fetchPage(page + 1, filter);
    } catch {
      /* keep list */
    } finally {
      setLoadingMore(false);
    }
  };

  const open = (o: PaymentReviewOrder) => {
    setSelected(o);
    setNote(o.paymentProofNotes ?? '');
  };

  const review = async (status: 'APPROVED' | 'REJECTED') => {
    if (!selected) return;
    if (status === 'REJECTED' && !note.trim()) {
      Alert.alert('Add a reason', 'Tell the customer why the proof was rejected.');
      return;
    }
    setBusy(true);
    try {
      await reviewPaymentProof(selected.id, status, note.trim() || undefined);
      // It leaves the current queue (SUBMITTED) once reviewed — drop it locally.
      setOrders((prev) => prev.filter((o) => o.id !== selected.id));
      setTotal((t) => Math.max(0, t - 1));
      setSelected(null);
    } catch (err: any) {
      Alert.alert('Review failed', err?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmReview = (status: 'APPROVED' | 'REJECTED') => {
    if (status === 'APPROVED') {
      Alert.alert('Approve payment?', 'This marks the order as paid.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => review('APPROVED') },
      ]);
    } else {
      review('REJECTED');
    }
  };

  if (roleLoading || (allowed && loading)) return <Loader />;

  if (!allowed) {
    return (
      <EmptyState
        icon="lock-closed-outline"
        title="Admins only"
        subtitle="Payment review is restricted to admins."
      />
    );
  }

  const isQueue = filter === 'SUBMITTED';

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
            <View style={styles.filters}>
              {FILTERS.map((f) => {
                const active = filter === f.value;
                return (
                  <TouchableOpacity
                    key={f.value}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setFilter(f.value)}
                  >
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {total > 0 ? (
              <Text style={styles.count}>{total} order{total === 1 ? '' : 's'}</Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="card-outline"
            title={isQueue ? 'Queue clear' : 'Nothing here'}
            subtitle={isQueue ? 'No payment proofs are awaiting review.' : 'No orders with this status.'}
          />
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.primary} /> : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => open(item)} activeOpacity={0.85}>
            {item.paymentProofUrl ? (
              <Image source={{ uri: item.paymentProofUrl }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]}>
                <Ionicons name="image-outline" size={20} color={colors.subtle} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.customer}>{item.user?.name ?? 'Customer'}</Text>
              <Text style={styles.sub} numberOfLines={1}>
                {item.store?.name ?? 'Order'} · {new Date(item.createdAt).toLocaleDateString()}
              </Text>
              <Text style={styles.method}>{(item.paymentMethod ?? 'Payment').replace(/_/g, ' ')}</Text>
            </View>
            <View style={styles.cardRight}>
              <Money value={item.total} />
              <Ionicons name="chevron-forward" size={18} color={colors.subtle} />
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Detail sheet */}
      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Payment proof</Text>
              <TouchableOpacity onPress={() => setSelected(null)} disabled={busy}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            {selected ? (
              <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}>
                {/* Summary */}
                <View style={styles.summaryRow}>
                  <View>
                    <Text style={styles.detailValue}>{selected.user?.name ?? '—'}</Text>
                    {selected.user?.email ? <Text style={styles.detailSub}>{selected.user.email}</Text> : null}
                    <Text style={styles.detailSub}>
                      {selected.store?.name ?? 'Order'} · {(selected.paymentMethod ?? '').replace(/_/g, ' ')}
                    </Text>
                  </View>
                  <Money value={selected.total} style={{ fontSize: 18 }} />
                </View>

                {/* Items */}
                {selected.orderItems?.length ? (
                  <Text style={styles.itemsLine}>
                    {selected.orderItems.length} item{selected.orderItems.length === 1 ? '' : 's'}:{' '}
                    {selected.orderItems
                      .map((it) => `${it.product?.name ?? 'Item'}×${it.quantity}`)
                      .join(', ')}
                  </Text>
                ) : null}

                {/* Proof image */}
                <Text style={styles.proofLabel}>Uploaded proof</Text>
                {selected.paymentProofUrl ? (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => Linking.openURL(selected.paymentProofUrl!)}
                  >
                    <Image source={{ uri: selected.paymentProofUrl }} style={styles.proofImage} resizeMode="contain" />
                    <View style={styles.proofOpen}>
                      <Ionicons name="open-outline" size={14} color={colors.muted} />
                      <Text style={styles.proofOpenText}>Tap to open full image</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.proofImage, styles.thumbEmpty]}>
                    <Ionicons name="image-outline" size={28} color={colors.subtle} />
                    <Text style={styles.detailSub}>No image uploaded</Text>
                  </View>
                )}

                {/* Existing review note (non-queue) */}
                {!isQueue && selected.paymentProofNotes ? (
                  <View style={styles.existingNote}>
                    <Text style={styles.detailSub}>Note: {selected.paymentProofNotes}</Text>
                  </View>
                ) : null}

                {/* Actions (only the submitted queue is actionable) */}
                {isQueue ? (
                  <View style={{ marginTop: spacing.lg }}>
                    <TextInput
                      style={styles.noteArea}
                      value={note}
                      onChangeText={setNote}
                      placeholder="Note (required to reject, emailed to customer)"
                      placeholderTextColor={colors.subtle}
                      multiline
                      textAlignVertical="top"
                    />
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.rejectBtn]}
                        onPress={() => confirmReview('REJECTED')}
                        disabled={busy}
                      >
                        {busy ? <ActivityIndicator color="#fff" size="small" /> : (
                          <Text style={styles.actionBtnText}>Reject</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.approveBtn]}
                        onPress={() => confirmReview('APPROVED')}
                        disabled={busy}
                      >
                        {busy ? <ActivityIndicator color="#fff" size="small" /> : (
                          <Text style={styles.actionBtnText}>Approve & mark paid</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.statusPill}>
                    <Ionicons
                      name={selected.paymentProofStatus === 'APPROVED' ? 'checkmark-circle' : 'close-circle'}
                      size={16}
                      color={selected.paymentProofStatus === 'APPROVED' ? colors.success : colors.danger}
                    />
                    <Text style={styles.statusPillText}>
                      {selected.paymentProofStatus === 'APPROVED' ? 'Approved — order paid' : 'Rejected'}
                    </Text>
                  </View>
                )}
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

  filters: { flexDirection: 'row', gap: spacing.sm },
  filterChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 12, color: colors.muted, fontWeight: '600' },
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
  thumb: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: colors.card },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  customer: { fontSize: 15, fontWeight: '700', color: colors.text },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  method: { fontSize: 11, color: colors.subtle, marginTop: 2, textTransform: 'capitalize' },
  cardRight: { alignItems: 'flex-end', flexDirection: 'row', gap: 4 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: colors.text },

  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  detailValue: { fontSize: 16, fontWeight: '700', color: colors.text },
  detailSub: { fontSize: 13, color: colors.muted, marginTop: 2, textTransform: 'capitalize' },
  itemsLine: { fontSize: 13, color: colors.muted, marginTop: spacing.md, lineHeight: 19 },

  proofLabel: { fontSize: 11, fontWeight: '700', color: colors.subtle, textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.lg, marginBottom: spacing.sm },
  proofImage: {
    width: '100%',
    height: 280,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proofOpen: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.sm },
  proofOpenText: { fontSize: 12, color: colors.muted },

  existingNote: { marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.card, borderRadius: radius.md },

  noteArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    height: 76,
    marginBottom: spacing.md,
  },
  actionRow: { flexDirection: 'row', gap: spacing.md },
  actionBtn: { flex: 1, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  rejectBtn: { backgroundColor: colors.danger },
  approveBtn: { backgroundColor: colors.success },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  statusPill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.lg },
  statusPillText: { fontSize: 14, fontWeight: '600', color: colors.text },
});

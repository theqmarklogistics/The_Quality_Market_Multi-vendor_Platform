// Dispatch board — the mobile equivalent of the web logistics dispatch board.
// For a chosen day it shows each delivery corridor (route), its assigned rider and
// ordered stops, and the key dispatcher actions: run the auto-batcher to sweep
// waiting pooled orders into routes, assign/reassign a rider, and advance a corridor
// through its lifecycle (close → dispatch → complete). Live via the logistics room
// with a focus/refresh fallback. Access: ADMIN or LOGISTICS_MANAGER (authLogistics).
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  assignRider,
  listCorridors,
  listDispatchRiders,
  listPoolableOrders,
  runBatch,
  setCorridorStatus,
  type Corridor,
  type CorridorStatus,
  type DispatchRider,
} from '@/api/admin';
import { useMyRole, canAccessOps } from '@/hooks/useMyRole';
import { useRealtimeRoom } from '@/realtime/useRealtimeRoom';
import { EmptyState, Loader } from '@/components/ui';
import { SOCKET_ENABLED } from '@/constants';
import { colors, fonts, radius, spacing } from '@/theme';

// Local YYYY-MM-DD key (the corridors API matches the day window on this).
function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayLabel(key: string): string {
  const today = dateKey(new Date());
  const tomorrow = dateKey(new Date(Date.now() + 86400000));
  const yesterday = dateKey(new Date(Date.now() - 86400000));
  if (key === today) return 'Today';
  if (key === tomorrow) return 'Tomorrow';
  if (key === yesterday) return 'Yesterday';
  return new Date(`${key}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

const STATUS_META: Record<CorridorStatus, { label: string; bg: string; fg: string }> = {
  OPEN: { label: 'Open', bg: '#e0e7ff', fg: '#3730a3' },
  CLOSED: { label: 'Ready', bg: '#fef3c7', fg: '#92400e' },
  IN_TRANSIT: { label: 'In transit', bg: '#dbeafe', fg: '#1e40af' },
  COMPLETED: { label: 'Completed', bg: '#dcfce7', fg: '#15803d' },
};

const STOP_LABEL: Record<string, string> = {
  PENDING_INTAKE: 'Awaiting intake',
  SORTING: 'Sorting',
  IN_TRANSIT: 'In transit',
  ARRIVING: 'Arriving',
  DELIVERED: 'Delivered',
  FAILED: 'Failed',
};

export default function DispatchBoardScreen() {
  const { role, loading: roleLoading } = useMyRole();
  const allowed = canAccessOps(role);

  const [date, setDate] = useState(() => dateKey(new Date()));
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [poolableCount, setPoolableCount] = useState(0);
  const [riders, setRiders] = useState<DispatchRider[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [batching, setBatching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [riderPickerFor, setRiderPickerFor] = useState<string | null>(null);

  const load = useCallback(async (day: string) => {
    const [c, p] = await Promise.all([listCorridors(day), listPoolableOrders()]);
    setCorridors(c.corridors);
    setPoolableCount(p.orders.length);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!allowed) return;
      setLoading(true);
      load(date)
        .catch((err: any) => Alert.alert('Could not load board', err?.message ?? 'Try again.'))
        .finally(() => setLoading(false));
      // Riders rarely change — fetch once per focus, ignore failures.
      listDispatchRiders()
        .then((r) => setRiders(r.riders))
        .catch(() => {});
    }, [allowed, date, load]),
  );

  // Live refresh from the logistics room (best-effort; focus/pull-to-refresh cover gaps).
  useRealtimeRoom({
    enabled: SOCKET_ENABLED && allowed,
    join: { event: 'join-logistics-room' },
    leave: { event: 'leave-logistics-room' },
    handlers: {
      'corridor-update': () => {
        load(date).catch(() => {});
      },
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(date).catch(() => {});
    setRefreshing(false);
  }, [date, load]);

  const shiftDay = (delta: number) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + delta);
    setDate(dateKey(d));
  };

  const onRunBatch = async () => {
    setBatching(true);
    try {
      const res = await runBatch();
      await load(date);
      const made = res.corridors ?? 0;
      const batched = res.batched ?? 0;
      Alert.alert(
        'Batching complete',
        made > 0
          ? `Created ${made} route${made === 1 ? '' : 's'} from ${batched} order${batched === 1 ? '' : 's'}.`
          : 'No orders were ready to batch.',
      );
    } catch (err: any) {
      Alert.alert('Batching failed', err?.message ?? 'Try again.');
    } finally {
      setBatching(false);
    }
  };

  const onStatus = async (
    corridor: Corridor,
    action: 'dispatch' | 'complete' | 'close' | 'open',
  ) => {
    setBusyId(corridor.id);
    try {
      await setCorridorStatus(corridor.id, action);
      await load(date);
    } catch (err: any) {
      Alert.alert('Action failed', err?.message ?? 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDispatch = (corridor: Corridor) => {
    if (!corridor.rider) {
      Alert.alert('Assign a rider first', 'A corridor needs an assigned rider before dispatch.');
      return;
    }
    Alert.alert(
      'Dispatch route?',
      `Send ${corridor.name} out for delivery with ${corridor.rider.name ?? 'the assigned rider'}? Customers will be notified.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Dispatch', style: 'default', onPress: () => onStatus(corridor, 'dispatch') },
      ],
    );
  };

  const onAssign = async (corridorId: string, riderId: string | null) => {
    setRiderPickerFor(null);
    setBusyId(corridorId);
    try {
      await assignRider(corridorId, riderId);
      await load(date);
    } catch (err: any) {
      Alert.alert('Could not assign rider', err?.message ?? 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const pickerCorridor = useMemo(
    () => corridors.find((c) => c.id === riderPickerFor) ?? null,
    [corridors, riderPickerFor],
  );

  if (roleLoading || (allowed && loading)) return <Loader />;

  if (!allowed) {
    return (
      <EmptyState
        icon="git-network-outline"
        title="Logistics only"
        subtitle="This dispatch board is for logistics managers and admins."
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Date navigator */}
      <View style={styles.dateBar}>
        <TouchableOpacity style={styles.dateArrow} onPress={() => shiftDay(-1)}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.dateCenter}>
          <Text style={styles.dateLabel}>{dayLabel(date)}</Text>
          <Text style={styles.dateSub}>{date}</Text>
        </View>
        <TouchableOpacity style={styles.dateArrow} onPress={() => shiftDay(1)}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={corridors}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={[styles.poolBanner, poolableCount === 0 && styles.poolBannerEmpty]}>
            <Ionicons
              name={poolableCount > 0 ? 'layers' : 'checkmark-circle'}
              size={20}
              color={poolableCount > 0 ? '#92400e' : colors.success}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.poolTitle}>
                {poolableCount > 0
                  ? `${poolableCount} order${poolableCount === 1 ? '' : 's'} waiting to batch`
                  : 'No orders waiting to batch'}
              </Text>
              <Text style={styles.poolSub}>Sweep sorted pooled orders into routes now.</Text>
            </View>
            <TouchableOpacity
              style={[styles.batchBtn, (batching || poolableCount === 0) && styles.btnDisabled]}
              onPress={onRunBatch}
              disabled={batching || poolableCount === 0}
            >
              {batching ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.batchBtnText}>Auto-batch</Text>
              )}
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="git-network-outline"
            title="No routes this day"
            subtitle="Run auto-batch to build routes from waiting pooled orders, or pick another day."
          />
        }
        renderItem={({ item }) => {
          const meta = STATUS_META[item.status];
          const isOpen = expanded[item.id];
          const busy = busyId === item.id;
          return (
            <View style={styles.card}>
              {/* Header */}
              <TouchableOpacity
                style={styles.cardHead}
                onPress={() => setExpanded((e) => ({ ...e, [item.id]: !e[item.id] }))}
                activeOpacity={0.85}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  <Text style={styles.cardMeta}>
                    {item.stops.length} stop{item.stops.length === 1 ? '' : 's'}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.badgeText, { color: meta.fg }]}>{meta.label}</Text>
                </View>
                <Ionicons
                  name={isOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.subtle}
                  style={{ marginLeft: 6 }}
                />
              </TouchableOpacity>

              {/* Rider row */}
              <TouchableOpacity
                style={styles.riderRow}
                onPress={() => setRiderPickerFor(item.id)}
                disabled={busy || item.status === 'COMPLETED'}
              >
                <Ionicons name="person-circle-outline" size={18} color={colors.muted} />
                <Text style={[styles.riderName, !item.rider && styles.riderUnset]}>
                  {item.rider?.name ?? 'No rider assigned'}
                </Text>
                {item.rider?.phone ? (
                  <TouchableOpacity
                    onPress={() => Linking.openURL(`tel:${item.rider!.phone}`)}
                    hitSlop={8}
                  >
                    <Ionicons name="call-outline" size={16} color={colors.success} />
                  </TouchableOpacity>
                ) : null}
                {item.status !== 'COMPLETED' ? (
                  <Text style={styles.riderAction}>{item.rider ? 'Change' : 'Assign'}</Text>
                ) : null}
              </TouchableOpacity>

              {/* Stops (expanded) */}
              {isOpen && item.stops.length ? (
                <View style={styles.stops}>
                  {item.stops.map((s) => (
                    <View key={s.orderId} style={styles.stop}>
                      <Text style={styles.stopSeq}>{s.stopSequence ?? '•'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.stopName} numberOfLines={1}>
                          {s.recipientName ?? 'Recipient'}
                          {s.sector ? ` · ${s.sector}` : ''}
                        </Text>
                        {s.landmarkAddress ? (
                          <Text style={styles.stopSub} numberOfLines={1}>{s.landmarkAddress}</Text>
                        ) : null}
                        <Text style={styles.stopStatus}>{STOP_LABEL[s.deliveryStatus] ?? s.deliveryStatus}</Text>
                      </View>
                      {s.recipientPhone ? (
                        <TouchableOpacity
                          onPress={() => Linking.openURL(`tel:${s.recipientPhone}`)}
                          hitSlop={8}
                        >
                          <Ionicons name="call-outline" size={16} color={colors.success} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Lifecycle actions */}
              <View style={styles.actions}>
                {item.status === 'OPEN' && item.stops.length > 0 ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionNeutral]}
                    onPress={() => onStatus(item, 'close')}
                    disabled={busy}
                  >
                    {busy ? <ActivityIndicator color={colors.text} size="small" /> : (
                      <Text style={styles.actionNeutralText}>Mark ready</Text>
                    )}
                  </TouchableOpacity>
                ) : null}

                {item.status === 'CLOSED' ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionPrimary, !item.rider && styles.btnDisabled]}
                    onPress={() => confirmDispatch(item)}
                    disabled={busy}
                  >
                    {busy ? <ActivityIndicator color="#fff" size="small" /> : (
                      <Text style={styles.actionPrimaryText}>Dispatch</Text>
                    )}
                  </TouchableOpacity>
                ) : null}

                {item.status === 'IN_TRANSIT' ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionSuccess]}
                    onPress={() => onStatus(item, 'complete')}
                    disabled={busy}
                  >
                    {busy ? <ActivityIndicator color="#fff" size="small" /> : (
                      <Text style={styles.actionPrimaryText}>Mark completed</Text>
                    )}
                  </TouchableOpacity>
                ) : null}

                {item.status === 'COMPLETED' ? (
                  <View style={styles.completedNote}>
                    <Ionicons name="checkmark-done" size={16} color={colors.success} />
                    <Text style={styles.completedText}>Route completed</Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        }}
      />

      {/* Rider picker */}
      <Modal
        visible={!!riderPickerFor}
        animationType="slide"
        transparent
        onRequestClose={() => setRiderPickerFor(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Assign rider</Text>
              <TouchableOpacity onPress={() => setRiderPickerFor(null)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={riders}
              keyExtractor={(r) => r.id}
              contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}
              ListHeaderComponent={
                pickerCorridor?.rider ? (
                  <TouchableOpacity
                    style={styles.riderOption}
                    onPress={() => onAssign(pickerCorridor.id, null)}
                  >
                    <Ionicons name="remove-circle-outline" size={20} color={colors.danger} />
                    <Text style={[styles.riderOptName, { color: colors.danger }]}>Unassign rider</Text>
                  </TouchableOpacity>
                ) : null
              }
              ListEmptyComponent={
                <Text style={styles.noRiders}>No riders available.</Text>
              }
              renderItem={({ item: r }) => {
                const current = pickerCorridor?.rider?.id === r.id;
                return (
                  <TouchableOpacity
                    style={styles.riderOption}
                    onPress={() => riderPickerFor && onAssign(riderPickerFor, r.id)}
                  >
                    <Ionicons
                      name={current ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={current ? colors.success : colors.subtle}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.riderOptName}>{r.name ?? r.email ?? 'Rider'}</Text>
                      <Text style={styles.riderOptSub}>
                        {[r.vehicleType, r.phone].filter(Boolean).join(' · ') || 'No details'}
                        {!r.isActive ? ' · inactive' : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dateArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCenter: { alignItems: 'center' },
  dateLabel: { fontSize: 16, fontFamily: fonts.bold, color: colors.text },
  dateSub: { fontSize: 12, color: colors.subtle, marginTop: 1 },

  list: { padding: spacing.lg, gap: spacing.md },

  poolBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  poolBannerEmpty: { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' },
  poolTitle: { fontSize: 14, fontFamily: fonts.bold, color: colors.text },
  poolSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  batchBtn: {
    backgroundColor: colors.warning,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 92,
  },
  batchBtnText: { color: '#fff', fontFamily: fonts.bold, fontSize: 13 },
  btnDisabled: { opacity: 0.45 },

  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center' },
  cardName: { fontSize: 16, fontFamily: fonts.bold, color: colors.text },
  cardMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontFamily: fonts.bold },

  riderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  riderName: { flex: 1, fontSize: 14, fontFamily: fonts.semibold, color: colors.text },
  riderUnset: { color: colors.subtle, fontStyle: 'italic', fontFamily: fonts.regular },
  riderAction: { fontSize: 13, fontFamily: fonts.bold, color: colors.success },

  stops: { marginTop: spacing.md, gap: spacing.sm },
  stop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  stopSeq: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    color: '#fff',
    fontSize: 12,
    fontFamily: fonts.bold,
    textAlign: 'center',
    lineHeight: 24,
    overflow: 'hidden',
  },
  stopName: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text },
  stopSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  stopStatus: { fontSize: 11, color: colors.subtle, marginTop: 2, fontFamily: fonts.semibold },

  actions: { marginTop: spacing.md, gap: spacing.sm },
  actionBtn: { borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  actionPrimary: { backgroundColor: colors.primary },
  actionPrimaryText: { color: '#fff', fontFamily: fonts.bold, fontSize: 14 },
  actionSuccess: { backgroundColor: colors.success },
  actionNeutral: { borderWidth: 1, borderColor: colors.border },
  actionNeutralText: { color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
  completedNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  completedText: { fontSize: 13, color: colors.success, fontFamily: fonts.semibold },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.text },
  riderOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  riderOptName: { fontSize: 15, fontFamily: fonts.semibold, color: colors.text },
  riderOptSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  noRiders: { fontSize: 14, color: colors.muted, textAlign: 'center', paddingVertical: spacing.xl },
});

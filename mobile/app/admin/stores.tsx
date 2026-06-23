// Store approvals — the mobile equivalent of the web admin store-approval queue.
// Lists stores awaiting a decision (pending + previously rejected), opens a detail
// sheet with the store's profile, and lets an admin Approve (activates the store and
// emails a contract) or Reject (with a reason emailed to the owner). Mirrors
// POST /api/admin/approve-store. Access: ADMIN (authAdmin, backend-enforced).
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  RefreshControl,
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
import { listPendingStores, reviewStore, type PendingStore } from '@/api/admin';
import { useMyRole, canAccessAdmin } from '@/hooks/useMyRole';
import { EmptyState, Loader } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

export default function StoreApprovalsScreen() {
  const { role, loading: roleLoading } = useMyRole();
  const allowed = canAccessAdmin(role);

  const [stores, setStores] = useState<PendingStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selected, setSelected] = useState<PendingStore | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await listPendingStores();
    setStores(res.stores);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!allowed) return;
      setLoading(true);
      load()
        .catch((err: any) => Alert.alert('Could not load stores', err?.message ?? 'Try again.'))
        .finally(() => setLoading(false));
    }, [allowed, load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load().catch(() => {});
    setRefreshing(false);
  }, [load]);

  const open = (s: PendingStore) => {
    setSelected(s);
    setNote(s.rejectionNotes ?? '');
  };

  const review = async (status: 'approved' | 'rejected') => {
    if (!selected) return;
    if (status === 'rejected' && !note.trim()) {
      Alert.alert('Add a reason', 'Tell the owner why the store was rejected.');
      return;
    }
    setBusy(true);
    try {
      await reviewStore(selected.id, status, note.trim() || undefined);
      setSelected(null);
      await load();
    } catch (err: any) {
      Alert.alert('Review failed', err?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmApprove = () => {
    Alert.alert('Approve store?', 'This activates the store and emails the owner a contract.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => review('approved') },
    ]);
  };

  if (roleLoading || (allowed && loading)) return <Loader />;

  if (!allowed) {
    return (
      <EmptyState
        icon="lock-closed-outline"
        title="Admins only"
        subtitle="Store approvals are restricted to admins."
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={stores}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          stores.length ? (
            <Text style={styles.count}>{stores.length} awaiting review</Text>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="storefront-outline"
            title="Queue clear"
            subtitle="No stores are awaiting approval."
          />
        }
        renderItem={({ item }) => {
          const rejected = item.status === 'rejected';
          return (
            <TouchableOpacity style={styles.card} onPress={() => open(item)} activeOpacity={0.85}>
              {item.logo ? (
                <Image source={{ uri: item.logo }} style={styles.logo} />
              ) : (
                <View style={[styles.logo, styles.logoEmpty]}>
                  <Ionicons name="storefront" size={20} color={colors.subtle} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.sub}>@{item.username}</Text>
                <Text style={styles.owner} numberOfLines={1}>
                  {item.user?.name ?? item.user?.email ?? 'Owner'}
                </Text>
              </View>
              <View style={[styles.badge, rejected ? styles.badgeRejected : styles.badgePending]}>
                <Text style={[styles.badgeText, { color: rejected ? '#b91c1c' : '#92400e' }]}>
                  {rejected ? 'Rejected' : 'Pending'}
                </Text>
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
              <Text style={styles.modalTitle}>Store review</Text>
              <TouchableOpacity onPress={() => setSelected(null)} disabled={busy}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            {selected ? (
              <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}>
                <View style={styles.storeHead}>
                  {selected.logo ? (
                    <Image source={{ uri: selected.logo }} style={styles.logoLg} />
                  ) : (
                    <View style={[styles.logoLg, styles.logoEmpty]}>
                      <Ionicons name="storefront" size={28} color={colors.subtle} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.storeName}>{selected.name}</Text>
                    <Text style={styles.sub}>@{selected.username}</Text>
                  </View>
                </View>

                {selected.description ? (
                  <Text style={styles.desc}>{selected.description}</Text>
                ) : null}

                <View style={styles.detailGrid}>
                  <DetailRow icon="person-outline" label="Owner" value={selected.user?.name ?? '—'} />
                  {selected.email ? (
                    <DetailRow
                      icon="mail-outline"
                      label="Email"
                      value={selected.email}
                      onPress={() => Linking.openURL(`mailto:${selected.email}`)}
                    />
                  ) : null}
                  {selected.contact ? (
                    <DetailRow
                      icon="call-outline"
                      label="Contact"
                      value={selected.contact}
                      onPress={() => Linking.openURL(`tel:${selected.contact}`)}
                    />
                  ) : null}
                  {selected.address ? (
                    <DetailRow icon="location-outline" label="Address" value={selected.address} />
                  ) : null}
                  <DetailRow
                    icon="time-outline"
                    label="Applied"
                    value={new Date(selected.createdAt).toLocaleDateString()}
                  />
                </View>

                <TextInput
                  style={styles.noteArea}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Note (required to reject, emailed to owner)"
                  placeholderTextColor={colors.subtle}
                  multiline
                  textAlignVertical="top"
                />
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.rejectBtn]}
                    onPress={() => review('rejected')}
                    disabled={busy}
                  >
                    {busy ? <ActivityIndicator color="#fff" size="small" /> : (
                      <Text style={styles.actionBtnText}>Reject</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.approveBtn]}
                    onPress={confirmApprove}
                    disabled={busy}
                  >
                    {busy ? <ActivityIndicator color="#fff" size="small" /> : (
                      <Text style={styles.actionBtnText}>Approve</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DetailRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={styles.detailRow} onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={16} color={colors.muted} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, onPress && styles.detailLink]} numberOfLines={1}>
        {value}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, gap: spacing.md },
  count: { fontSize: 12, color: colors.subtle, marginBottom: spacing.xs },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  logo: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.card },
  logoEmpty: { alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  owner: { fontSize: 12, color: colors.subtle, marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgePending: { backgroundColor: '#fef3c7' },
  badgeRejected: { backgroundColor: '#fee2e2' },
  badgeText: { fontSize: 10, fontWeight: '800' },

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

  storeHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logoLg: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.card },
  storeName: { fontSize: 18, fontWeight: '800', color: colors.text },
  desc: { fontSize: 14, color: colors.text, lineHeight: 20, marginTop: spacing.md },

  detailGrid: { marginTop: spacing.lg, gap: spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  detailLabel: { fontSize: 13, color: colors.muted, width: 72 },
  detailValue: { flex: 1, fontSize: 13, color: colors.text, fontWeight: '600' },
  detailLink: { color: colors.success },

  noteArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    height: 76,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  actionRow: { flexDirection: 'row', gap: spacing.md },
  actionBtn: { flex: 1, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  rejectBtn: { backgroundColor: colors.danger },
  approveBtn: { backgroundColor: colors.success },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

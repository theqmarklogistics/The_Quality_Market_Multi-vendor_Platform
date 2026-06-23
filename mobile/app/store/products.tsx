// Seller → Products. Lists the store's products (paginated, searchable, filterable
// by approval status), with quick stock toggle, edit, and delete. Mirrors the web's
// app/store/manage-product. "Add product" and tapping a card open the shared form.
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  listSellerProducts,
  toggleStock,
  deleteSellerProduct,
  type SellerProduct,
  type ApprovalStatus,
} from '@/api/store';
import { EmptyState, Loader, Money } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

const FILTERS: { label: string; value: ApprovalStatus | '' }[] = [
  { label: 'All', value: '' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Rejected', value: 'REJECTED' },
];

const APPROVAL_BADGE: Record<ApprovalStatus, { bg: string; fg: string; label: string }> = {
  APPROVED: { bg: '#dcfce7', fg: '#15803d', label: 'Approved' },
  PENDING: { bg: '#fef3c7', fg: '#b45309', label: 'Pending' },
  REJECTED: { bg: '#fee2e2', fg: '#b91c1c', label: 'Rejected' },
};

export default function SellerProductsScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ApprovalStatus | ''>('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (pg: number, q: string, status: ApprovalStatus | '') => {
      const res = await listSellerProducts({ page: pg, search: q, status });
      setTotal(res.total);
      setPage(res.page);
      setPages(res.pages);
      setProducts((prev) => (pg === 1 ? res.products : [...prev, ...res.products]));
    },
    [],
  );

  const reload = useCallback(
    async (q = search, status = filter) => {
      setLoading(true);
      try {
        await fetchPage(1, q, status);
      } catch (err: any) {
        Alert.alert('Could not load products', err?.message ?? 'Try again.');
      } finally {
        setLoading(false);
      }
    },
    [fetchPage, search, filter],
  );

  useFocusEffect(
    useCallback(() => {
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, filter]),
  );

  const loadMore = async () => {
    if (loadingMore || page >= pages) return;
    setLoadingMore(true);
    try {
      await fetchPage(page + 1, search, filter);
    } catch {
      /* keep current list */
    } finally {
      setLoadingMore(false);
    }
  };

  const onToggleStock = async (p: SellerProduct) => {
    setBusyId(p.id);
    // Optimistic flip; revert on failure.
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, inStock: !x.inStock } : x)));
    try {
      await toggleStock(p.id);
    } catch (err: any) {
      setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, inStock: p.inStock } : x)));
      Alert.alert('Could not update stock', err?.message ?? 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = (p: SellerProduct) => {
    Alert.alert('Delete product', `Remove “${p.name}”? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusyId(p.id);
          try {
            await deleteSellerProduct(p.id);
            setProducts((prev) => prev.filter((x) => x.id !== p.id));
            setTotal((t) => Math.max(0, t - 1));
          } catch (err: any) {
            Alert.alert('Could not delete', err?.message ?? 'Try again.');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const submitSearch = () => setSearch(searchInput.trim());
  const clearSearch = () => {
    setSearchInput('');
    setSearch('');
  };

  const header = useMemo(
    () => (
      <View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/store/product-form')}
          activeOpacity={0.85}
        >
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Add product</Text>
        </TouchableOpacity>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={colors.subtle} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search products…"
            placeholderTextColor={colors.subtle}
            value={searchInput}
            onChangeText={setSearchInput}
            onSubmitEditing={submitSearch}
            returnKeyType="search"
          />
          {searchInput ? (
            <TouchableOpacity onPress={clearSearch}>
              <Ionicons name="close-circle" size={16} color={colors.subtle} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.filters}>
          {FILTERS.map((f) => {
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

        {total > 0 ? (
          <Text style={styles.count}>{total} product{total === 1 ? '' : 's'}</Text>
        ) : null}
      </View>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchInput, filter, total],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {header}
        <Loader />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        ListEmptyComponent={
          <EmptyState
            icon="cube-outline"
            title="No products"
            subtitle={search || filter ? 'Try adjusting your search or filter.' : 'Tap “Add product” to list your first item.'}
          />
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.primary} /> : null
        }
        renderItem={({ item }) => {
          const badge = APPROVAL_BADGE[item.approvalStatus];
          const busy = busyId === item.id;
          return (
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.cardMain}
                activeOpacity={0.85}
                onPress={() => router.push({ pathname: '/store/product-form', params: { id: item.id } })}
              >
                <Image
                  source={{ uri: item.images?.[0] }}
                  style={styles.thumb}
                  resizeMode="cover"
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <View style={styles.priceRow}>
                    <Money value={item.price} style={styles.price} />
                    <Text style={styles.qty}>· {item.warehouseQuantity} in stock</Text>
                  </View>
                  <View style={styles.badgeRow}>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.label}</Text>
                    </View>
                    <View style={[styles.badge, item.inStock ? styles.inBadge : styles.outBadge]}>
                      <Text style={[styles.badgeText, { color: item.inStock ? '#15803d' : '#b91c1c' }]}>
                        {item.inStock ? 'Listed' : 'Hidden'}
                      </Text>
                    </View>
                  </View>
                  {item.approvalStatus === 'REJECTED' && item.approvalNotes ? (
                    <Text style={styles.rejectNote} numberOfLines={2}>{item.approvalNotes}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => onToggleStock(item)}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={colors.muted} />
                  ) : (
                    <>
                      <Ionicons
                        name={item.inStock ? 'eye-off-outline' : 'eye-outline'}
                        size={15}
                        color={colors.text}
                      />
                      <Text style={styles.actionText}>{item.inStock ? 'Hide' : 'List'}</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => router.push({ pathname: '/store/product-form', params: { id: item.id } })}
                  disabled={busy}
                >
                  <Ionicons name="create-outline" size={15} color={colors.text} />
                  <Text style={styles.actionText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => onDelete(item)}
                  disabled={busy}
                >
                  <Ionicons name="trash-outline" size={15} color={colors.danger} />
                  <Text style={[styles.actionText, { color: colors.danger }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, gap: spacing.md },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.success,
    borderRadius: radius.md,
    paddingVertical: 12,
    marginBottom: spacing.md,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

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
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  filterTextActive: { color: colors.primaryText },

  count: { fontSize: 12, color: colors.subtle, marginTop: spacing.md },

  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: 'hidden' },
  cardMain: { flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  thumb: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.card },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 2 },
  price: { fontSize: 14 },
  qty: { fontSize: 12, color: colors.muted },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  inBadge: { backgroundColor: '#dcfce7' },
  outBadge: { backgroundColor: '#fee2e2' },
  badgeText: { fontSize: 10, fontWeight: '700' },
  rejectNote: { fontSize: 11, color: colors.danger, marginTop: 6 },

  actions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
  },
  actionText: { fontSize: 13, fontWeight: '600', color: colors.text },
});

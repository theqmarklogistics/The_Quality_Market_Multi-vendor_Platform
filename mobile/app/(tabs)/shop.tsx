// Shop: the searchable, category-filterable, paginated product grid with the
// best-selling rail. Moved here from the Home tab so Home can act as the
// service landing (ads, delivery, seller CTAs) while Shop stays pure commerce.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getBestSelling, getCategories, listProducts } from '@/api/products';
import type { Product } from '@/api/types';
import { ProductCard } from '@/components/ProductCard';
import { EmptyState, Skeleton } from '@/components/ui';
import { PRODUCT_CATEGORIES } from '@/constants';
import { colors, fonts, radius, spacing } from '@/theme';

const PAGE_SIZE = 20;

export default function ShopScreen() {
  // Home service cards can deep-link here with ?category=...
  const { category: categoryParam } = useLocalSearchParams<{ category?: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>(PRODUCT_CATEGORIES);
  const [activeCategory, setActiveCategory] = useState<string | null>(categoryParam ?? null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bestSellers, setBestSellers] = useState<Product[]>([]);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the search input → search term used for fetching.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchInput]);

  useEffect(() => {
    getCategories()
      .then((res) => {
        if (res.categories?.length) setCategories(res.categories.map((c) => c.name));
      })
      .catch(() => {
        // Fall back to the ported PRODUCT_CATEGORIES already in state.
      });
    getBestSelling(10)
      .then((res) => setBestSellers(res.products ?? []))
      .catch(() => {
        // Rail is optional — hidden if the request fails.
      });
  }, []);

  const fetchPage = useCallback(
    async (nextPage: number, replace: boolean) => {
      try {
        setError(null);
        const res = await listProducts({
          page: nextPage,
          limit: PAGE_SIZE,
          search: search || undefined,
          category: activeCategory || undefined,
        });
        setTotalPages(res.totalPages);
        setPage(res.page);
        setProducts((prev) => (replace ? res.products : [...prev, ...res.products]));
      } catch (err: any) {
        setError(err?.message ?? 'Could not load products');
      }
    },
    [search, activeCategory],
  );

  // Reload from page 1 whenever search/category changes.
  useEffect(() => {
    setLoading(true);
    fetchPage(1, true).finally(() => setLoading(false));
  }, [fetchPage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPage(1, true);
    setRefreshing(false);
  }, [fetchPage]);

  const onEndReached = useCallback(async () => {
    if (loadingMore || loading || page >= totalPages) return;
    setLoadingMore(true);
    await fetchPage(page + 1, false);
    setLoadingMore(false);
  }, [loadingMore, loading, page, totalPages, fetchPage]);

  const sectionLabel = search
    ? `Results for “${search}”`
    : activeCategory ?? 'All products';

  const header = useMemo(
    () => (
      <View>
        {/* Search */}
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.subtle} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search products"
            placeholderTextColor={colors.subtle}
            value={searchInput}
            onChangeText={setSearchInput}
            returnKeyType="search"
          />
          {searchInput ? (
            <TouchableOpacity
              onPress={() => setSearchInput('')}
              hitSlop={10}
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color={colors.subtle} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Best selling — horizontal rail, mirrors the web BestSelling section */}
        {!search && !activeCategory && bestSellers.length > 0 ? (
          <View style={styles.bestWrap}>
            <View style={styles.bestHead}>
              <Ionicons name="flame" size={16} color={colors.primaryDark} />
              <Text style={styles.bestTitle}>Best selling</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.bestRail}
            >
              {bestSellers.map((p) => (
                <View key={p.id} style={styles.bestCard}>
                  <ProductCard product={p} />
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Categories */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <Chip
            label="All"
            active={activeCategory === null}
            onPress={() => setActiveCategory(null)}
          />
          {categories.map((c) => (
            <Chip
              key={c}
              label={c}
              active={activeCategory === c}
              onPress={() => setActiveCategory(c)}
            />
          ))}
        </ScrollView>

        <Text style={styles.sectionLabel}>{sectionLabel}</Text>
      </View>
    ),
    [searchInput, categories, activeCategory, search, sectionLabel, bestSellers],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.titleRow}>
        <Text style={styles.screenTitle}>Shop</Text>
      </View>

      {loading ? (
        <View style={styles.skeletonWrap}>
          <Skeleton height={48} borderRadius={radius.full} />
          <View style={styles.skeletonRow}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
          <View style={styles.skeletonRow}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        </View>
      ) : error ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't load products"
          subtitle={error}
          actionLabel="Try again"
          onAction={onRefresh}
        />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          ListHeaderComponent={header}
          renderItem={({ item }) => <ProductCard product={item} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <EmptyState title="No products found" subtitle="Try a different search or category." />
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} />
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

function SkeletonCard() {
  return (
    <View style={styles.skeletonCard}>
      <Skeleton height={150} borderRadius={radius.md} />
      <Skeleton height={13} width="90%" style={{ marginTop: 10 }} />
      <Skeleton height={13} width="55%" style={{ marginTop: 6 }} />
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  titleRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  screenTitle: { fontSize: 24, fontFamily: fonts.bold, color: colors.text },
  list: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  row: { gap: spacing.md },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.borderLight,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    minHeight: 48,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    fontFamily: fonts.regular,
    paddingVertical: 12,
  },
  bestWrap: { marginBottom: spacing.md },
  bestHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  bestTitle: { fontSize: 16, color: colors.text, fontFamily: fonts.semibold },
  bestRail: { gap: spacing.md, paddingRight: spacing.xs },
  bestCard: { width: 150 },
  chips: { gap: 8, paddingBottom: spacing.md },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.body, fontFamily: fonts.medium },
  chipTextActive: { color: colors.primaryText, fontFamily: fonts.semibold },
  sectionLabel: {
    fontSize: 16,
    color: colors.text,
    fontFamily: fonts.semibold,
    marginBottom: spacing.sm,
  },
  skeletonWrap: { padding: spacing.lg, paddingTop: spacing.sm },
  skeletonRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  skeletonCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.sm,
  },
});

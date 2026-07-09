// Storefront: searchable, category-filterable, paginated product grid.
// Branded like the web home: wordmark header, green hero banner, pill search.
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getCategories, listProducts } from '@/api/products';
import type { Product } from '@/api/types';
import { ProductCard } from '@/components/ProductCard';
import { EmptyState, Skeleton } from '@/components/ui';
import { PRODUCT_CATEGORIES } from '@/constants';
import { colors, fonts, radius, spacing } from '@/theme';

const PAGE_SIZE = 20;

export default function ShopScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>(PRODUCT_CATEGORIES);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

        {/* Promo hero — mirrors the web hero banner */}
        {!search && !activeCategory ? (
          <View style={styles.hero}>
            <View style={styles.heroBadge}>
              <Ionicons name="flash" size={12} color={colors.primaryDark} />
              <Text style={styles.heroBadgeText}>Free shipping on orders above RWF 50K</Text>
            </View>
            <Text style={styles.heroTitle}>Gadgets you’ll love.{'\n'}Prices you’ll trust.</Text>
            <Text style={styles.heroSub}>
              Hand-picked products, verified sellers, fast delivery in Kigali.
            </Text>
            <View style={styles.heroIcon}>
              <Ionicons name="bag-handle" size={30} color={colors.primary} />
            </View>
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
    [searchInput, categories, activeCategory, search, sectionLabel],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Brand wordmark, two-tone like the web logo */}
      <View style={styles.brandRow}>
        <Text style={styles.brand}>
          The Quality <Text style={styles.brandAccent}>Market</Text>
        </Text>
      </View>

      {loading ? (
        <View style={styles.skeletonWrap}>
          <Skeleton height={48} borderRadius={radius.full} />
          <Skeleton height={148} borderRadius={radius.lg} style={{ marginTop: spacing.md }} />
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
  brandRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  brand: { fontSize: 22, color: colors.text, fontFamily: fonts.bold },
  brandAccent: { color: colors.primary },
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
  hero: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primaryTint,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  heroBadgeText: { fontSize: 11, color: colors.primaryDark, fontFamily: fonts.semibold },
  heroTitle: {
    fontSize: 22,
    lineHeight: 28,
    color: colors.text,
    fontFamily: fonts.bold,
    marginTop: spacing.sm,
    maxWidth: '80%',
  },
  heroSub: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    fontFamily: fonts.regular,
    marginTop: 6,
    maxWidth: '75%',
  },
  heroIcon: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
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

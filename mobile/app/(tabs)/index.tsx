// Storefront: searchable, category-filterable, paginated product grid.
// Replaces the Phase 0 smoke test (the product fetch itself confirms connectivity).
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
import { EmptyState, Loader } from '@/components/ui';
import { PRODUCT_CATEGORIES } from '@/constants';
import { colors, radius, spacing } from '@/theme';

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

  const header = useMemo(
    () => (
      <View>
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
            <TouchableOpacity onPress={() => setSearchInput('')}>
              <Ionicons name="close-circle" size={18} color={colors.subtle} />
            </TouchableOpacity>
          ) : null}
        </View>

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
      </View>
    ),
    [searchInput, categories, activeCategory],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Shop</Text>
      {loading ? (
        <Loader />
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" title="Couldn't load products" subtitle={error} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          ListHeaderComponent={header}
          renderItem={({ item }) => <ProductCard product={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <EmptyState title="No products found" subtitle="Try a different search or category." />
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null
          }
        />
      )}
    </SafeAreaView>
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
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 24, fontWeight: '700', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  list: { padding: spacing.lg, gap: spacing.md },
  row: { gap: spacing.md },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  chips: { gap: 8, paddingBottom: spacing.md },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.text },
  chipTextActive: { color: colors.primaryText, fontWeight: '600' },
});

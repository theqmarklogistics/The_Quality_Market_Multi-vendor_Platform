// Home: brand hero, delivery-service CTA, quick actions, value props, and the
// searchable, category-filterable, paginated product grid.
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
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getBestSelling, getCategories, listProducts } from '@/api/products';
import type { Product } from '@/api/types';
import { ProductCard } from '@/components/ProductCard';
import { BrandLogo } from '@/components/BrandLogo';
import { EmptyState, Skeleton } from '@/components/ui';
import { PRODUCT_CATEGORIES } from '@/constants';
import { colors, fonts, radius, spacing } from '@/theme';

const PAGE_SIZE = 20;

export default function HomeScreen() {
  const router = useRouter();
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

        {/* Promo hero — mirrors the web hero banner */}
        {!search && !activeCategory ? (
          <View style={styles.hero}>
            <View style={styles.heroBadge}>
              <Ionicons name="flash" size={12} color={colors.primaryDark} />
              <Text style={styles.heroBadgeText}>Fast, tracked delivery across Kigali</Text>
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

        {/* Delivery service CTA — mirrors the web DeliveryCTA banner */}
        {!search && !activeCategory ? (
          <TouchableOpacity
            style={styles.deliveryCta}
            activeOpacity={0.85}
            onPress={() => router.push('/external')}
            accessibilityRole="button"
          >
            <View style={styles.deliveryIconWrap}>
              <Ionicons name="bicycle" size={26} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.deliveryTitle}>Need something delivered?</Text>
              <Text style={styles.deliverySub}>
                Book a rider on our shared Kigali routes — pay by MoMo, track every drop live. Your
                client shares their location through a link, and it sets the delivery fee.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.subtle} />
          </TouchableOpacity>
        ) : null}

        {/* Quick actions */}
        {!search && !activeCategory ? (
          <View style={styles.quickRow}>
            <QuickAction icon="cube-outline" label="Book delivery" onPress={() => router.push('/external/book')} />
            <QuickAction icon="time-outline" label="Departures" onPress={() => router.push('/schedule')} />
            <QuickAction icon="receipt-outline" label="My orders" onPress={() => router.push('/(tabs)/orders')} />
          </View>
        ) : null}

        {/* Value props */}
        {!search && !activeCategory ? (
          <View style={styles.propsRow}>
            <ValueProp icon="flash-outline" label="Fast, tracked delivery" />
            <ValueProp icon="shield-checkmark-outline" label="Verified sellers" />
            <ValueProp icon="wallet-outline" label="Pay by MoMo or bank" />
          </View>
        ) : null}

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
    [searchInput, categories, activeCategory, search, sectionLabel, bestSellers, router],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Brand lockup — logo mark + two-tone wordmark, mirroring the web header */}
      <View style={styles.brandRow}>
        <BrandLogo direction="row" size={32} gap={8} showWordmark wordmarkSize={21} />
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

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.quickCard} onPress={onPress} activeOpacity={0.8} accessibilityRole="button">
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function ValueProp({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.propItem}>
      <Ionicons name={icon} size={14} color={colors.primaryDark} />
      <Text style={styles.propLabel}>{label}</Text>
    </View>
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
  deliveryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  deliveryIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deliveryTitle: { fontSize: 14, color: colors.text, fontFamily: fonts.semibold },
  deliverySub: { fontSize: 11, lineHeight: 15, color: colors.muted, fontFamily: fonts.regular, marginTop: 2 },
  quickRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  quickCard: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
  },
  quickLabel: { fontSize: 11, color: colors.body, fontFamily: fonts.medium },
  propsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  propItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  propLabel: { fontSize: 11, color: colors.muted, fontFamily: fonts.medium },
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

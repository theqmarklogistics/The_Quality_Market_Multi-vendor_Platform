// Product detail: gallery, price (with wholesale note), reviews, add-to-cart.
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getProduct } from '@/api/products';
import { createConversation } from '@/api/chat';
import type { Product } from '@/api/types';
import { Button, EmptyState, Loader, Stars, avgRating } from '@/components/ui';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { addToCart, persistCart } from '@/store/cartSlice';
import { formatPrice } from '@/constants';
import { colors, fonts, radius, shadows, spacing } from '@/theme';

const { width } = Dimensions.get('window');

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const inCartQty = useAppSelector((s) => (id ? s.cart.cartItems[id] || 0 : 0));

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getProduct(id)
      .then((res) => setProduct(res.product))
      .catch((err) => setError(err?.message ?? 'Product not found'))
      .finally(() => setLoading(false));
  }, [id]);

  const onAdd = useCallback(() => {
    if (!id) return;
    dispatch(addToCart({ productId: id }));
    dispatch(persistCart());
  }, [dispatch, id]);

  const storeId = product?.store?.id;
  const onMessageSeller = useCallback(async () => {
    if (!storeId) return;
    try {
      const { conversation } = await createConversation({
        targetType: 'STORE',
        storeId,
      });
      router.push({
        pathname: '/conversation/[id]',
        params: { id: conversation.id },
      });
    } catch (err: any) {
      Alert.alert('Could not open chat', err?.message ?? 'Try again.');
    }
  }, [storeId, router]);

  const onGalleryScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setGalleryIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  if (loading) return <Loader />;
  if (error || !product) {
    return <EmptyState icon="alert-circle-outline" title="Unavailable" subtitle={error ?? ''} />;
  }

  const rating = avgRating(product.rating);
  const hasDiscount = product.mrp != null && product.mrp > product.price;
  const discountPct = hasDiscount ? Math.round((1 - product.price / product.mrp!) * 100) : 0;
  const images = product.images ?? [];

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: product.name }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Gallery */}
        {images.length ? (
          <View>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onGalleryScroll}
            >
              {images.map((uri, i) => (
                <Image
                  key={i}
                  source={{ uri }}
                  style={styles.image}
                  resizeMode="cover"
                  alt={`${product.name} photo ${i + 1}`}
                />
              ))}
            </ScrollView>
            {images.length > 1 ? (
              <View style={styles.dots}>
                {images.map((_, i) => (
                  <View key={i} style={[styles.dot, i === galleryIndex && styles.dotActive]} />
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Ionicons name="image-outline" size={40} color={colors.subtle} />
          </View>
        )}

        <View style={styles.body}>
          <Text style={styles.name}>{product.name}</Text>

          <View style={styles.ratingRow}>
            <Stars value={rating} />
            <Text style={styles.muted}>
              {rating > 0
                ? `${rating.toFixed(1)} · ${product.rating.length} review${product.rating.length === 1 ? '' : 's'}`
                : 'No reviews yet'}
            </Text>
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatPrice(product.price)}</Text>
            {hasDiscount ? (
              <>
                <Text style={styles.mrp}>{formatPrice(product.mrp!)}</Text>
                <View style={styles.saveBadge}>
                  <Text style={styles.saveBadgeText}>Save {discountPct}%</Text>
                </View>
              </>
            ) : null}
          </View>

          {product.wholesalePrice && product.wholesaleMinQty ? (
            <View style={styles.wholesaleBox}>
              <Ionicons name="pricetags" size={16} color={colors.primaryDark} />
              <Text style={styles.wholesale}>
                Buy {product.wholesaleMinQty}+ at {formatPrice(product.wholesalePrice)} each
              </Text>
            </View>
          ) : null}

          {product.store ? (
            <View style={styles.storeRow}>
              <View style={styles.storeIcon}>
                <Ionicons name="storefront" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.storeLabel}>Sold by</Text>
                <Text style={styles.storeName}>{product.store.name}</Text>
              </View>
              <TouchableOpacity
                style={styles.msgSeller}
                onPress={onMessageSeller}
                accessibilityRole="button"
                accessibilityLabel="Message seller"
              >
                <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.primary} />
                <Text style={styles.msgSellerText}>Message</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{product.description}</Text>

          {product.rating.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Reviews</Text>
              <View style={{ gap: spacing.sm }}>
                {product.rating.map((r, i) => (
                  <View key={i} style={styles.review}>
                    <View style={styles.reviewHead}>
                      <Text style={styles.reviewer}>{r.user?.name ?? 'Customer'}</Text>
                      <Stars value={r.rating} size={12} />
                    </View>
                    {r.review ? <Text style={styles.reviewText}>{r.review}</Text> : null}
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: spacing.lg + insets.bottom }]}>
        {inCartQty > 0 ? (
          <View style={styles.inCartRow}>
            <Ionicons name="cart" size={14} color={colors.primaryDark} />
            <Text style={styles.inCartText}>{inCartQty} in cart</Text>
          </View>
        ) : null}
        <Button
          label={inCartQty > 0 ? 'Add another' : `Add to cart · ${formatPrice(product.price)}`}
          icon="cart-outline"
          onPress={onAdd}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: 24 },
  image: { width, aspectRatio: 1, backgroundColor: colors.card },
  imagePlaceholder: { width, alignItems: 'center', justifyContent: 'center' },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: -18,
    marginBottom: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotActive: { backgroundColor: colors.primary, width: 16 },
  body: { padding: spacing.lg, gap: spacing.sm },
  name: { fontSize: 21, color: colors.text, fontFamily: fonts.bold, lineHeight: 28 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  price: {
    fontSize: 24,
    color: colors.text,
    fontFamily: fonts.bold,
    fontVariant: ['tabular-nums'],
  },
  mrp: {
    fontSize: 15,
    color: colors.subtle,
    textDecorationLine: 'line-through',
    fontFamily: fonts.regular,
  },
  saveBadge: {
    backgroundColor: colors.primaryTint,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  saveBadgeText: { fontSize: 11, color: colors.primaryDark, fontFamily: fonts.bold },
  wholesaleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  wholesale: { fontSize: 13, color: colors.primaryDark, fontFamily: fonts.semibold, flex: 1 },
  muted: { fontSize: 13, color: colors.muted, fontFamily: fonts.regular },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: 2,
  },
  storeIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeLabel: { fontSize: 11, color: colors.subtle, fontFamily: fonts.regular },
  storeName: { fontSize: 14, color: colors.text, fontFamily: fonts.semibold },
  msgSeller: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    minHeight: 36,
  },
  msgSellerText: { color: colors.primaryDark, fontFamily: fonts.semibold, fontSize: 13 },
  sectionTitle: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    marginTop: spacing.md,
    color: colors.text,
  },
  description: { fontSize: 14, lineHeight: 22, color: colors.body, fontFamily: fonts.regular },
  review: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  reviewHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewer: { fontSize: 14, color: colors.text, fontFamily: fonts.semibold },
  reviewText: { fontSize: 13, color: colors.muted, lineHeight: 19, fontFamily: fonts.regular },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.bg,
    gap: spacing.sm,
    ...shadows.footer,
  },
  inCartRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inCartText: { fontSize: 13, color: colors.primaryDark, fontFamily: fonts.semibold },
});

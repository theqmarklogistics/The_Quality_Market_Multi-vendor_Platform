// Product detail: gallery, price (with wholesale note), reviews, add-to-cart.
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getProduct } from '@/api/products';
import { createConversation } from '@/api/chat';
import type { Product } from '@/api/types';
import { Button, EmptyState, Loader, Money, Stars, avgRating } from '@/components/ui';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { addToCart, persistCart } from '@/store/cartSlice';
import { formatPrice } from '@/constants';
import { colors, spacing } from '@/theme';

const { width } = Dimensions.get('window');

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const inCartQty = useAppSelector((s) => (id ? s.cart.cartItems[id] || 0 : 0));

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const onMessageSeller = useCallback(async () => {
    if (!product?.store) return;
    try {
      const { conversation } = await createConversation({
        targetType: 'STORE',
        storeId: product.store.id,
      });
      router.push({
        pathname: '/conversation/[id]',
        params: { id: conversation.id },
      });
    } catch (err: any) {
      Alert.alert('Could not open chat', err?.message ?? 'Try again.');
    }
  }, [product?.store, router]);

  if (loading) return <Loader />;
  if (error || !product) {
    return <EmptyState icon="alert-circle-outline" title="Unavailable" subtitle={error ?? ''} />;
  }

  const rating = avgRating(product.rating);
  const hasDiscount = product.mrp != null && product.mrp > product.price;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: product.name }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {product.images?.length ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {product.images.map((uri, i) => (
              <Image key={i} source={{ uri }} style={styles.image} resizeMode="cover" />
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]} />
        )}

        <View style={styles.body}>
          <Text style={styles.name}>{product.name}</Text>

          {rating > 0 ? (
            <View style={styles.ratingRow}>
              <Stars value={rating} />
              <Text style={styles.muted}>
                {rating.toFixed(1)} · {product.rating.length} review
                {product.rating.length === 1 ? '' : 's'}
              </Text>
            </View>
          ) : null}

          <View style={styles.priceRow}>
            <Money value={product.price} style={styles.price} />
            {hasDiscount ? <Text style={styles.mrp}>{formatPrice(product.mrp!)}</Text> : null}
          </View>

          {product.wholesalePrice && product.wholesaleMinQty ? (
            <Text style={styles.wholesale}>
              Buy {product.wholesaleMinQty}+ at {formatPrice(product.wholesalePrice)} each
            </Text>
          ) : null}

          {product.store ? (
            <View style={styles.storeRow}>
              <Text style={styles.muted}>Sold by {product.store.name}</Text>
              <TouchableOpacity style={styles.msgSeller} onPress={onMessageSeller}>
                <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.primary} />
                <Text style={styles.msgSellerText}>Message seller</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{product.description}</Text>

          {product.rating.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Reviews</Text>
              {product.rating.map((r, i) => (
                <View key={i} style={styles.review}>
                  <View style={styles.reviewHead}>
                    <Text style={styles.reviewer}>{r.user?.name ?? 'Customer'}</Text>
                    <Stars value={r.rating} size={12} />
                  </View>
                  {r.review ? <Text style={styles.reviewText}>{r.review}</Text> : null}
                </View>
              ))}
            </>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={inCartQty > 0 ? `Add another (${inCartQty} in cart)` : 'Add to cart'}
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
  imagePlaceholder: { width },
  body: { padding: spacing.lg, gap: spacing.sm },
  name: { fontSize: 20, fontWeight: '700', color: colors.text },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 4 },
  price: { fontSize: 22 },
  mrp: { fontSize: 15, color: colors.subtle, textDecorationLine: 'line-through' },
  wholesale: { fontSize: 13, color: colors.success, fontWeight: '600' },
  muted: { fontSize: 13, color: colors.muted },
  storeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  msgSeller: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  msgSellerText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: spacing.md, color: colors.text },
  description: { fontSize: 14, lineHeight: 21, color: colors.text },
  review: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.sm,
    gap: 4,
  },
  reviewHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewer: { fontSize: 14, fontWeight: '600', color: colors.text },
  reviewText: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
});

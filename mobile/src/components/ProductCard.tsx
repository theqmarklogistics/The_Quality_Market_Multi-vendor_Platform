// Grid card for a product in the storefront. Mirrors the web ProductCard:
// white rounded-2xl surface, soft slate shadow, green stars, quick add-to-cart.
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Product } from '@/api/types';
import { colors, fonts, radius, shadows, spacing } from '@/theme';
import { formatPrice } from '@/constants';
import { PressableScale, Stars, avgRating } from './ui';
import { useAppDispatch } from '@/store/hooks';
import { addToCart, persistCart } from '@/store/cartSlice';

export function ProductCard({ product }: { product: Product }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const rating = avgRating(product.rating);
  const ratingCount = product.rating?.length ?? 0;
  const hasDiscount = product.mrp != null && product.mrp > product.price;
  const discountPct = hasDiscount ? Math.round((1 - product.price / product.mrp!) * 100) : 0;

  const [justAdded, setJustAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (addedTimer.current) clearTimeout(addedTimer.current);
    },
    [],
  );

  const quickAdd = () => {
    dispatch(addToCart({ productId: product.id }));
    dispatch(persistCart());
    setJustAdded(true);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setJustAdded(false), 1200);
  };

  return (
    <PressableScale
      style={styles.card}
      scaleTo={0.98}
      accessibilityLabel={product.name}
      onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.id } })}
    >
      <View style={styles.imageWrap}>
        {product.images?.[0] ? (
          <Image
            source={{ uri: product.images[0] }}
            style={styles.image}
            resizeMode="cover"
            alt={product.name}
          />
        ) : (
          <View style={styles.noImage}>
            <Ionicons name="image-outline" size={28} color={colors.subtle} />
          </View>
        )}
        {hasDiscount && discountPct > 0 ? (
          <View style={styles.discount}>
            <Text style={styles.discountText}>-{discountPct}%</Text>
          </View>
        ) : null}
        <Pressable
          style={[styles.quickAdd, justAdded && styles.quickAdded]}
          onPress={quickAdd}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Add ${product.name} to cart`}
        >
          <Ionicons name={justAdded ? 'checkmark' : 'add'} size={20} color={colors.onInk} />
        </Pressable>
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
        <View style={styles.ratingRow}>
          <Stars value={rating} size={12} />
          <Text style={styles.ratingCount}>
            {ratingCount > 0 ? `(${ratingCount})` : 'No reviews'}
          </Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatPrice(product.price)}</Text>
          {hasDiscount ? (
            <Text style={styles.mrp}>{formatPrice(product.mrp!)}</Text>
          ) : null}
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.card,
  },
  imageWrap: { position: 'relative' },
  image: { width: '100%', aspectRatio: 1, backgroundColor: colors.card },
  noImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discount: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: colors.primaryTint,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  discountText: { fontSize: 11, color: colors.primaryDark, fontFamily: fonts.bold },
  quickAdd: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.raised,
  },
  quickAdded: { backgroundColor: colors.primary },
  body: { padding: spacing.sm + 2, gap: 4 },
  name: {
    fontSize: 13.5,
    color: colors.text,
    minHeight: 36,
    lineHeight: 18,
    fontFamily: fonts.medium,
  },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingCount: { fontSize: 11, color: colors.subtle, fontFamily: fonts.regular },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
  price: {
    fontSize: 15,
    color: colors.text,
    fontFamily: fonts.bold,
    fontVariant: ['tabular-nums'],
  },
  mrp: {
    fontSize: 12,
    color: colors.subtle,
    textDecorationLine: 'line-through',
    fontFamily: fonts.regular,
  },
});

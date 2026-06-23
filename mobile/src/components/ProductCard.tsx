// Grid card for a product in the storefront.
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Product } from '@/api/types';
import { colors, radius, spacing } from '@/theme';
import { formatPrice } from '@/constants';
import { Stars, avgRating } from './ui';

export function ProductCard({ product }: { product: Product }) {
  const router = useRouter();
  const rating = avgRating(product.rating);
  const hasDiscount = product.mrp != null && product.mrp > product.price;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.id } })}
    >
      <Image
        source={{ uri: product.images?.[0] }}
        style={styles.image}
        resizeMode="cover"
      />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
        {rating > 0 ? (
          <View style={styles.ratingRow}>
            <Stars value={rating} size={12} />
            <Text style={styles.ratingCount}>({product.rating.length})</Text>
          </View>
        ) : null}
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatPrice(product.price)}</Text>
          {hasDiscount ? (
            <Text style={styles.mrp}>{formatPrice(product.mrp!)}</Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  image: { width: '100%', aspectRatio: 1, backgroundColor: colors.card },
  body: { padding: spacing.sm, gap: 4 },
  name: { fontSize: 13, color: colors.text, minHeight: 34 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingCount: { fontSize: 11, color: colors.subtle },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  price: { fontSize: 15, fontWeight: '700', color: colors.text },
  mrp: { fontSize: 12, color: colors.subtle, textDecorationLine: 'line-through' },
});

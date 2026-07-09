// Cart: shows each cart line (product fetched by id), quantity steppers, subtotal,
// and a checkout entry. Shipping/delivery fees are added by the server at order time.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getProduct } from '@/api/products';
import type { Product } from '@/api/types';
import { Button, EmptyState, Loader, Money } from '@/components/ui';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  addToCart,
  removeFromCart,
  deleteItemFromCart,
  persistCart,
} from '@/store/cartSlice';
import { unitPrice } from '@/lib/pricing';
import { formatPrice } from '@/constants';
import { colors, fonts, radius, shadows, spacing } from '@/theme';

export default function CartScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const cartItems = useAppSelector((s) => s.cart.cartItems);
  const cartCount = useAppSelector((s) => s.cart.total);

  const [products, setProducts] = useState<Record<string, Product>>({});
  const [loading, setLoading] = useState(true);

  const ids = useMemo(() => Object.keys(cartItems), [cartItems]);

  // Fetch details for any cart product we don't already have cached.
  useEffect(() => {
    const missing = ids.filter((id) => !products[id]);
    if (missing.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all(
      missing.map((id) =>
        getProduct(id)
          .then((res) => res.product)
          .catch(() => null),
      ),
    ).then((results) => {
      if (cancelled) return;
      setProducts((prev) => {
        const next = { ...prev };
        results.forEach((p) => {
          if (p) next[p.id] = p;
        });
        return next;
      });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ids, products]);

  const subtotal = useMemo(
    () =>
      ids.reduce((sum, id) => {
        const p = products[id];
        const qty = cartItems[id];
        return p ? sum + unitPrice(p, qty) * qty : sum;
      }, 0),
    [ids, products, cartItems],
  );

  const inc = useCallback(
    (id: string) => {
      dispatch(addToCart({ productId: id }));
      dispatch(persistCart());
    },
    [dispatch],
  );
  const dec = useCallback(
    (id: string) => {
      dispatch(removeFromCart({ productId: id }));
      dispatch(persistCart());
    },
    [dispatch],
  );
  const remove = useCallback(
    (id: string) => {
      dispatch(deleteItemFromCart({ productId: id }));
      dispatch(persistCart());
    },
    [dispatch],
  );

  if (loading && ids.length > 0) return <Loader />;

  if (ids.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.title}>Cart</Text>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            icon="cart-outline"
            title="Your cart is empty"
            subtitle="Browse the shop and add items to get started."
            actionLabel="Start shopping"
            onAction={() => router.push('/(tabs)')}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>
        Cart <Text style={styles.titleCount}>({cartCount})</Text>
      </Text>
      <FlatList
        data={ids}
        keyExtractor={(id) => id}
        contentContainerStyle={styles.list}
        renderItem={({ item: id }) => {
          const p = products[id];
          const qty = cartItems[id];
          if (!p) {
            return (
              <View style={styles.line}>
                <Text style={styles.unavailable}>Item unavailable</Text>
                <TouchableOpacity
                  onPress={() => remove(id)}
                  hitSlop={10}
                  accessibilityLabel="Remove unavailable item"
                >
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </TouchableOpacity>
              </View>
            );
          }
          return (
            <View style={styles.line}>
              <Image source={{ uri: p.images?.[0] }} style={styles.thumb} alt={p.name} />
              <View style={styles.lineBody}>
                <Text style={styles.name} numberOfLines={2}>
                  {p.name}
                </Text>
                <Text style={styles.unit}>{formatPrice(unitPrice(p, qty))} each</Text>
                <View style={styles.stepperRow}>
                  <View style={styles.stepper}>
                    <TouchableOpacity
                      style={styles.stepBtn}
                      onPress={() => dec(id)}
                      hitSlop={6}
                      accessibilityLabel="Decrease quantity"
                    >
                      <Ionicons name="remove" size={16} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.qty}>{qty}</Text>
                    <TouchableOpacity
                      style={styles.stepBtn}
                      onPress={() => inc(id)}
                      hitSlop={6}
                      accessibilityLabel="Increase quantity"
                    >
                      <Ionicons name="add" size={16} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => remove(id)}
                    hitSlop={8}
                    accessibilityLabel={`Remove ${p.name} from cart`}
                  >
                    <Ionicons name="trash-outline" size={17} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
              <Money value={unitPrice(p, qty) * qty} style={styles.lineTotal} />
            </View>
          );
        }}
      />
      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Money value={subtotal} style={styles.totalValue} />
        </View>
        <View style={styles.noteRow}>
          <Ionicons name="information-circle-outline" size={14} color={colors.subtle} />
          <Text style={styles.note}>Delivery fee is calculated at checkout.</Text>
        </View>
        <Button
          label="Proceed to checkout"
          icon="arrow-forward"
          onPress={() => router.push('/checkout')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: {
    fontSize: 24,
    fontFamily: fonts.bold,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  titleCount: { color: colors.primary },
  list: { padding: spacing.lg, gap: spacing.md },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.card,
  },
  thumb: { width: 68, height: 68, borderRadius: radius.md, backgroundColor: colors.card },
  lineBody: { flex: 1, gap: 3 },
  name: { fontSize: 14, color: colors.text, fontFamily: fonts.medium, lineHeight: 19 },
  unit: { fontSize: 12, color: colors.muted, fontFamily: fonts.regular },
  unavailable: { flex: 1, color: colors.muted, fontStyle: 'italic', fontFamily: fonts.regular },
  stepperRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
  },
  stepBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qty: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.text,
    minWidth: 24,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  removeBtn: { marginLeft: spacing.md, padding: 6 },
  lineTotal: { fontSize: 15 },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: spacing.sm,
    backgroundColor: colors.bg,
    ...shadows.footer,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 16, color: colors.muted, fontFamily: fonts.medium },
  totalValue: { fontSize: 22 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: spacing.xs },
  note: { fontSize: 12, color: colors.subtle, fontFamily: fonts.regular },
});

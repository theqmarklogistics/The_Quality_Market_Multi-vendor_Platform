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
import { colors, radius, spacing } from '@/theme';

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
        <EmptyState
          icon="cart-outline"
          title="Your cart is empty"
          subtitle="Browse the shop and add items to get started."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Cart ({cartCount})</Text>
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
                <TouchableOpacity onPress={() => remove(id)}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </TouchableOpacity>
              </View>
            );
          }
          return (
            <View style={styles.line}>
              <Image source={{ uri: p.images?.[0] }} style={styles.thumb} />
              <View style={styles.lineBody}>
                <Text style={styles.name} numberOfLines={2}>
                  {p.name}
                </Text>
                <Text style={styles.unit}>{formatPrice(unitPrice(p, qty))} each</Text>
                <View style={styles.stepper}>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => dec(id)}>
                    <Ionicons name="remove" size={18} color={colors.text} />
                  </TouchableOpacity>
                  <Text style={styles.qty}>{qty}</Text>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => inc(id)}>
                    <Ionicons name="add" size={18} color={colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.removeBtn} onPress={() => remove(id)}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
              <Money value={unitPrice(p, qty) * qty} />
            </View>
          );
        }}
      />
      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Money value={subtotal} style={styles.totalValue} />
        </View>
        <Text style={styles.note}>Delivery fee is calculated at checkout.</Text>
        <Button label="Proceed to checkout" onPress={() => router.push('/checkout')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 24, fontWeight: '700', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  list: { padding: spacing.lg, gap: spacing.md },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.card },
  lineBody: { flex: 1, gap: 4 },
  name: { fontSize: 14, color: colors.text },
  unit: { fontSize: 12, color: colors.muted },
  unavailable: { flex: 1, color: colors.muted, fontStyle: 'italic' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qty: { fontSize: 15, fontWeight: '600', minWidth: 20, textAlign: 'center' },
  removeBtn: { marginLeft: 'auto', padding: 4 },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 16, color: colors.muted },
  totalValue: { fontSize: 20 },
  note: { fontSize: 12, color: colors.subtle },
});

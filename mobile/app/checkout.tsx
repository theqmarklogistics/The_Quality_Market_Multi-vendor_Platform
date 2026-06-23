// Checkout: pick address, delivery type (+ landmark/pin for pooled), payment method,
// optional coupon, then place the order. Totals shown here are estimates — the server
// computes the authoritative total (shipping/commission/pooled fee) at order creation.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { getAddresses } from '@/api/addresses';
import { getProduct } from '@/api/products';
import { verifyCoupon } from '@/api/coupons';
import { createOrder } from '@/api/orders';
import type { Address, Coupon, Product } from '@/api/types';
import { Button, Loader, Money } from '@/components/ui';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { clearCart } from '@/store/cartSlice';
import { unitPrice } from '@/lib/pricing';
import {
  CHECKOUT_PAYMENT_METHODS,
  DeliveryType,
  PaymentMethod,
  formatPrice,
} from '@/constants';
import { colors, radius, spacing } from '@/theme';

const paymentLabels: Record<string, string> = {
  [PaymentMethod.MTN_MOMO]: 'MTN Mobile Money',
  [PaymentMethod.BANK_TRANSFER]: 'Bank transfer',
};

export default function CheckoutScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const cartItems = useAppSelector((s) => s.cart.cartItems);
  const ids = useMemo(() => Object.keys(cartItems), [cartItems]);

  const [products, setProducts] = useState<Record<string, Product>>({});
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [deliveryType, setDeliveryType] = useState<DeliveryType>(
    DeliveryType.STANDARD_UNPOOLED,
  );
  const [landmark, setLandmark] = useState('');
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pinning, setPinning] = useState(false);

  const [payment, setPayment] = useState<PaymentMethod>(PaymentMethod.MTN_MOMO);

  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const [placing, setPlacing] = useState(false);

  // Refetch addresses whenever the screen gains focus (e.g. after adding one).
  useFocusEffect(
    useCallback(() => {
      getAddresses()
        .then((res) => {
          setAddresses(res.addresses);
          setAddressId((cur) => cur ?? res.addresses[0]?.id ?? null);
        })
        .catch(() => {});
    }, []),
  );

  useEffect(() => {
    const missing = ids.filter((id) => !products[id]);
    if (missing.length === 0) {
      setLoading(false);
      return;
    }
    Promise.all(
      missing.map((id) => getProduct(id).then((r) => r.product).catch(() => null)),
    ).then((results) => {
      setProducts((prev) => {
        const next = { ...prev };
        results.forEach((p) => p && (next[p.id] = p));
        return next;
      });
      setLoading(false);
    });
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

  const discount = coupon ? (subtotal * coupon.discount) / 100 : 0;
  const estimatedTotal = subtotal - discount;

  const pinLocation = async () => {
    setPinning(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow location access to pin your delivery spot.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setPin({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch {
      Alert.alert('Location error', 'Could not get your location.');
    } finally {
      setPinning(false);
    }
  };

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setVerifying(true);
    setCouponError(null);
    try {
      const res = await verifyCoupon(couponCode);
      setCoupon(res.coupon);
    } catch (err: any) {
      setCoupon(null);
      setCouponError(err?.message ?? 'Invalid coupon');
    } finally {
      setVerifying(false);
    }
  };

  const placeOrder = async () => {
    if (!addressId) {
      Alert.alert('Address required', 'Please select or add a delivery address.');
      return;
    }
    if (deliveryType === DeliveryType.KIGALI_POOL && !landmark.trim()) {
      Alert.alert('Landmark required', 'Pooled delivery needs a landmark / directions.');
      return;
    }
    setPlacing(true);
    try {
      const { orderIds } = await createOrder({
        items: ids.map((id) => ({ id, quantity: cartItems[id] })),
        addressId,
        paymentMethod: payment,
        couponCode: coupon?.code,
        deliveryType,
        landmarkAddress:
          deliveryType === DeliveryType.KIGALI_POOL ? landmark.trim() : undefined,
        recipientLat: deliveryType === DeliveryType.KIGALI_POOL ? pin?.latitude : undefined,
        recipientLng: deliveryType === DeliveryType.KIGALI_POOL ? pin?.longitude : undefined,
      });
      dispatch(clearCart());
      router.replace({
        pathname: '/order-confirmation',
        params: { ids: orderIds.join(','), payment },
      });
    } catch (err: any) {
      Alert.alert('Order failed', err?.message ?? 'Please try again.');
    } finally {
      setPlacing(false);
    }
  };

  if (loading) return <Loader />;

  if (ids.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Your cart is empty.</Text>
        <Button label="Back to shop" variant="outline" onPress={() => router.replace('/(tabs)')} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Address */}
        <Text style={styles.sectionTitle}>Delivery address</Text>
        {addresses.length === 0 ? (
          <Text style={styles.muted}>No saved addresses yet.</Text>
        ) : (
          addresses.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={[styles.option, addressId === a.id && styles.optionActive]}
              onPress={() => setAddressId(a.id)}
            >
              <Ionicons
                name={addressId === a.id ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={addressId === a.id ? colors.primary : colors.subtle}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>{a.name}</Text>
                <Text style={styles.optionSub}>
                  {[a.street, a.sector, a.city].filter(Boolean).join(', ')} · {a.phone}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/address/new')}>
          <Ionicons name="add" size={18} color={colors.primary} />
          <Text style={styles.addText}>Add a new address</Text>
        </TouchableOpacity>

        {/* Delivery type */}
        <Text style={styles.sectionTitle}>Delivery method</Text>
        <DeliveryOption
          active={deliveryType === DeliveryType.STANDARD_UNPOOLED}
          title="Standard delivery"
          subtitle="Seller-fulfilled. Fee set per seller."
          onPress={() => setDeliveryType(DeliveryType.STANDARD_UNPOOLED)}
        />
        <DeliveryOption
          active={deliveryType === DeliveryType.KIGALI_POOL}
          title="Kigali pooled delivery"
          subtitle="Shared rider routes — save up to 60%."
          onPress={() => setDeliveryType(DeliveryType.KIGALI_POOL)}
        />

        {deliveryType === DeliveryType.KIGALI_POOL ? (
          <View style={styles.poolBox}>
            <Text style={styles.fieldLabel}>Landmark / directions (required)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Near Kisimenti Simba, Remera"
              placeholderTextColor={colors.subtle}
              value={landmark}
              onChangeText={setLandmark}
              multiline
            />
            <TouchableOpacity
              style={[styles.pinBtn, pin && styles.pinBtnDone]}
              onPress={pinLocation}
              disabled={pinning}
            >
              <Ionicons
                name={pin ? 'checkmark-circle' : 'location-outline'}
                size={18}
                color={pin ? colors.success : colors.text}
              />
              <Text style={styles.pinText}>
                {pinning
                  ? 'Getting location…'
                  : pin
                    ? 'Exact location pinned'
                    : 'Pin exact location (optional)'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Payment */}
        <Text style={styles.sectionTitle}>Payment method</Text>
        {CHECKOUT_PAYMENT_METHODS.map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.option, payment === m && styles.optionActive]}
            onPress={() => setPayment(m)}
          >
            <Ionicons
              name={payment === m ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={payment === m ? colors.primary : colors.subtle}
            />
            <Text style={styles.optionTitle}>{paymentLabels[m]}</Text>
          </TouchableOpacity>
        ))}

        {/* Coupon */}
        <Text style={styles.sectionTitle}>Coupon</Text>
        <View style={styles.couponRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Enter code"
            placeholderTextColor={colors.subtle}
            autoCapitalize="characters"
            value={couponCode}
            onChangeText={setCouponCode}
            editable={!coupon}
          />
          {coupon ? (
            <Button
              label="Remove"
              variant="outline"
              onPress={() => {
                setCoupon(null);
                setCouponCode('');
                setCouponError(null);
              }}
            />
          ) : (
            <Button label="Apply" variant="outline" onPress={applyCoupon} loading={verifying} />
          )}
        </View>
        {coupon ? (
          <Text style={styles.couponOk}>✓ {coupon.discount}% off applied</Text>
        ) : couponError ? (
          <Text style={styles.couponErr}>{couponError}</Text>
        ) : null}
      </ScrollView>

      {/* Summary + place */}
      <View style={styles.footer}>
        <View style={styles.sumRow}>
          <Text style={styles.muted}>Subtotal</Text>
          <Text style={styles.sumVal}>{formatPrice(subtotal)}</Text>
        </View>
        {discount > 0 ? (
          <View style={styles.sumRow}>
            <Text style={styles.muted}>Discount</Text>
            <Text style={[styles.sumVal, { color: colors.success }]}>
              −{formatPrice(discount)}
            </Text>
          </View>
        ) : null}
        <View style={styles.sumRow}>
          <Text style={styles.totalLabel}>Estimated total</Text>
          <Money value={estimatedTotal} style={{ fontSize: 18 }} />
        </View>
        <Text style={styles.note}>+ delivery fee, calculated by the server.</Text>
        <Button label="Place order" onPress={placeOrder} loading={placing} />
      </View>
    </View>
  );
}

function DeliveryOption({
  active,
  title,
  subtitle,
  onPress,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.option, active && styles.optionActive]} onPress={onPress}>
      <Ionicons
        name={active ? 'radio-button-on' : 'radio-button-off'}
        size={20}
        color={active ? colors.primary : colors.subtle}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionSub}>{subtitle}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  muted: { fontSize: 14, color: colors.muted },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  optionActive: { borderColor: colors.primary, backgroundColor: '#fafafa' },
  optionTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  optionSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.sm },
  addText: { color: colors.primary, fontWeight: '600' },
  poolBox: { gap: spacing.sm },
  fieldLabel: { fontSize: 13, color: colors.muted, marginBottom: 2 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  pinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  pinBtnDone: { borderColor: colors.success, backgroundColor: '#f0fff4' },
  pinText: { fontSize: 14, color: colors.text },
  couponRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch' },
  couponOk: { color: colors.success, marginTop: 6, fontWeight: '600' },
  couponErr: { color: colors.danger, marginTop: 6 },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sumVal: { fontSize: 14, color: colors.text },
  totalLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
  note: { fontSize: 12, color: colors.subtle, marginBottom: spacing.sm },
});

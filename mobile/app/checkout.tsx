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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { getAddresses } from '@/api/addresses';
import { getProduct } from '@/api/products';
import { verifyCoupon } from '@/api/coupons';
import { createOrder, getShippingQuote, type ShippingQuote } from '@/api/orders';
import type { Address, Coupon, Product } from '@/api/types';
import { Button, Loader, Money } from '@/components/ui';
import { SignedOutGate } from '@/components/SignedOutGate';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { clearCart } from '@/store/cartSlice';
import { unitPrice } from '@/lib/pricing';
import {
  CHECKOUT_PAYMENT_METHODS,
  DeliveryType,
  PaymentMethod,
  formatPrice,
} from '@/constants';
import { colors, fonts, radius, shadows, spacing } from '@/theme';

const paymentLabels: Record<string, string> = {
  [PaymentMethod.MTN_MOMO]: 'MTN Mobile Money',
  [PaymentMethod.BANK_TRANSFER]: 'Bank transfer',
};

const paymentIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  [PaymentMethod.MTN_MOMO]: 'phone-portrait-outline',
  [PaymentMethod.BANK_TRANSFER]: 'business-outline',
};

export default function CheckoutScreen() {
  return (
    <SignedOutGate
      title="Sign in to check out"
      subtitle="Your cart is saved — sign in or create an account to place the order."
    >
      <CheckoutScreenInner />
    </SignedOutGate>
  );
}

function CheckoutScreenInner() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
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
  // Mandatory at checkout; prefilled from the selected address, still editable.
  const [contactPhone, setContactPhone] = useState('');
  const [shippingQuote, setShippingQuote] = useState<ShippingQuote | null>(null);
  const [quoting, setQuoting] = useState(false);

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

  // Prefill the phone from the selected address.
  useEffect(() => {
    const a = addresses.find((x) => x.id === addressId);
    if (a?.phone) setContactPhone((cur) => cur || a.phone);
  }, [addressId, addresses]);

  // Live shipping quote whenever the delivery type / address / pin change —
  // shipping is always calculated and paid at checkout.
  useEffect(() => {
    let cancelled = false;
    if (!addressId) {
      setShippingQuote(null);
      return;
    }
    setQuoting(true);
    getShippingQuote({
      addressId,
      deliveryType,
      items: ids.map((id) => ({ id, quantity: cartItems[id] })),
      lat: pin?.latitude,
      lng: pin?.longitude,
    })
      .then((q) => {
        if (!cancelled) setShippingQuote(q);
      })
      .catch(() => {
        if (!cancelled) setShippingQuote(null);
      })
      .finally(() => {
        if (!cancelled) setQuoting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deliveryType, addressId, pin, ids, cartItems]);

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
  const shippingFee = shippingQuote?.shipping ?? 0;
  const estimatedTotal = subtotal - discount + shippingFee;

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
    if (!/^\+?\d[\d\s-]{6,17}$/.test(contactPhone.trim())) {
      Alert.alert('Phone required', 'Enter a valid phone number — it is required at checkout.');
      return;
    }
    setPlacing(true);
    try {
      const { orderIds } = await createOrder({
        items: ids.map((id) => ({ id, quantity: cartItems[id] })),
        addressId,
        paymentMethod: payment,
        couponCode: coupon?.code,
        contactPhone: contactPhone.trim(),
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
        <SectionHeading icon="location-outline" title="Delivery address" />
        {addresses.length === 0 ? (
          <Text style={styles.muted}>No saved addresses yet.</Text>
        ) : (
          addresses.map((a) => (
            <OptionRow
              key={a.id}
              active={addressId === a.id}
              onPress={() => setAddressId(a.id)}
              title={a.name}
              subtitle={`${[a.street, a.sector, a.city].filter(Boolean).join(', ')} · ${a.phone}`}
            />
          ))
        )}
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/address/new')}
          accessibilityRole="button"
          accessibilityLabel="Add a new address"
        >
          <View style={styles.addIcon}>
            <Ionicons name="add" size={16} color={colors.primaryDark} />
          </View>
          <Text style={styles.addText}>Add a new address</Text>
        </TouchableOpacity>

        {/* Phone — mandatory at checkout */}
        <SectionHeading icon="call-outline" title="Phone number (required)" />
        <TextInput
          style={styles.input}
          placeholder="e.g. 078X XXX XXX"
          placeholderTextColor={colors.subtle}
          keyboardType="phone-pad"
          value={contactPhone}
          onChangeText={setContactPhone}
        />
        <Text style={styles.note}>The rider and support will use this number for your delivery.</Text>

        {/* Delivery type */}
        <SectionHeading icon="bicycle-outline" title="Delivery method" />
        <OptionRow
          active={deliveryType === DeliveryType.STANDARD_UNPOOLED}
          title="Standard delivery"
          subtitle="Seller-fulfilled. Fee set per seller."
          onPress={() => setDeliveryType(DeliveryType.STANDARD_UNPOOLED)}
        />
        <OptionRow
          active={deliveryType === DeliveryType.KIGALI_POOL}
          title="Kigali pooled delivery"
          subtitle="Shared rider routes — save up to 60%."
          badge="Save up to 60%"
          onPress={() => setDeliveryType(DeliveryType.KIGALI_POOL)}
        />

        {deliveryType === DeliveryType.KIGALI_POOL ? (
          <View style={styles.poolBox}>
            {/* Option 1 (always first): share the exact delivery location.
                Otherwise the distance is calculated from the address's location. */}
            <TouchableOpacity
              style={[styles.pinBtn, pin && styles.pinBtnDone]}
              onPress={pinLocation}
              disabled={pinning}
              accessibilityRole="button"
            >
              <Ionicons
                name={pin ? 'checkmark-circle' : 'location-outline'}
                size={18}
                color={pin ? colors.success : colors.text}
              />
              <Text style={[styles.pinText, pin && styles.pinTextDone]}>
                {pinning
                  ? 'Getting location…'
                  : pin
                    ? 'Delivery location shared'
                    : 'Share my delivery location'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.hint}>
              Best option — the rider navigates straight to you. Otherwise the delivery distance is
              calculated from the geographic location of your saved address.
            </Text>
            <Text style={styles.fieldLabel}>Landmark / directions (required)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Near Kisimenti Simba, Remera"
              placeholderTextColor={colors.subtle}
              value={landmark}
              onChangeText={setLandmark}
              multiline
            />
            <View style={styles.quoteBox}>
              <Ionicons name="bicycle-outline" size={16} color={colors.primaryDark} />
              <Text style={styles.quoteText}>
                {quoting
                  ? 'Calculating delivery fee…'
                  : shippingQuote?.needsReview
                    ? "This package's weight is outside our standard ranges — our team will confirm your delivery fee after you order."
                    : shippingQuote && shippingQuote.shipping != null
                      ? `Delivery fee: ${formatPrice(shippingQuote.shipping)} — paid at checkout; sharing the route can only make it cheaper.`
                      : 'Delivery fee is calculated from your address location.'}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Payment */}
        <SectionHeading icon="wallet-outline" title="Payment method" />
        {CHECKOUT_PAYMENT_METHODS.map((m) => (
          <OptionRow
            key={m}
            active={payment === m}
            title={paymentLabels[m]}
            leadingIcon={paymentIcons[m]}
            onPress={() => setPayment(m)}
          />
        ))}

        {/* Coupon */}
        <SectionHeading icon="pricetag-outline" title="Coupon" />
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
              size="md"
              onPress={() => {
                setCoupon(null);
                setCouponCode('');
                setCouponError(null);
              }}
            />
          ) : (
            <Button
              label="Apply"
              variant="outline"
              size="md"
              onPress={applyCoupon}
              loading={verifying}
            />
          )}
        </View>
        {coupon ? (
          <View style={styles.couponOkRow}>
            <Ionicons name="checkmark-circle" size={15} color={colors.success} />
            <Text style={styles.couponOk}>{coupon.discount}% off applied</Text>
          </View>
        ) : couponError ? (
          <Text style={styles.couponErr}>{couponError}</Text>
        ) : null}
      </ScrollView>

      {/* Summary + place */}
      <View style={[styles.footer, { paddingBottom: spacing.lg + insets.bottom }]}>
        <View style={styles.sumRow}>
          <Text style={styles.muted}>Subtotal</Text>
          <Text style={styles.sumVal}>{formatPrice(subtotal)}</Text>
        </View>
        {discount > 0 ? (
          <View style={styles.sumRow}>
            <Text style={styles.muted}>Discount</Text>
            <Text style={[styles.sumVal, { color: colors.successDeep }]}>
              −{formatPrice(discount)}
            </Text>
          </View>
        ) : null}
        <View style={styles.sumRow}>
          <Text style={styles.muted}>
            {deliveryType === DeliveryType.KIGALI_POOL ? 'Shipping (pooled)' : 'Shipping'}
          </Text>
          <Text style={styles.sumVal}>
            {quoting
              ? 'Calculating…'
              : shippingQuote?.needsReview
                ? 'Confirmed by our team'
                : shippingQuote && shippingQuote.shipping != null
                  ? formatPrice(shippingFee)
                  : '—'}
          </Text>
        </View>
        <View style={styles.sumRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Money value={estimatedTotal} style={{ fontSize: 20 }} />
        </View>
        <Text style={styles.note}>
          {shippingQuote?.needsReview
            ? "Your delivery fee will be confirmed by our team after you place the order."
            : deliveryType === DeliveryType.KIGALI_POOL && shippingQuote
              ? 'Shipping is paid at checkout — the final pooled fee can only be lower when your route is shared.'
              : 'Shipping is calculated and paid at checkout.'}
        </Text>
        <Button label="Place order" icon="bag-check-outline" onPress={placeOrder} loading={placing} />
      </View>
    </View>
  );
}

function SectionHeading({
  icon,
  title,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}) {
  return (
    <View style={styles.sectionRow}>
      <Ionicons name={icon} size={17} color={colors.primary} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function OptionRow({
  active,
  title,
  subtitle,
  badge,
  leadingIcon,
  onPress,
}: {
  active: boolean;
  title: string;
  subtitle?: string;
  badge?: string;
  leadingIcon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.option, active && styles.optionActive]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
    >
      <Ionicons
        name={active ? 'radio-button-on' : 'radio-button-off'}
        size={20}
        color={active ? colors.primary : colors.subtle}
      />
      {leadingIcon ? (
        <Ionicons name={leadingIcon} size={20} color={active ? colors.primaryDark : colors.muted} />
      ) : null}
      <View style={{ flex: 1 }}>
        <View style={styles.optionTitleRow}>
          <Text style={styles.optionTitle}>{title}</Text>
          {badge ? (
            <View style={styles.optionBadge}>
              <Text style={styles.optionBadgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        {subtitle ? <Text style={styles.optionSub}>{subtitle}</Text> : null}
      </View>
      {active ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text },
  muted: { fontSize: 14, color: colors.muted, fontFamily: fonts.regular },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    minHeight: 56,
  },
  optionActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  optionTitle: { fontSize: 15, fontFamily: fonts.semibold, color: colors.text },
  optionSub: { fontSize: 12.5, color: colors.muted, marginTop: 2, fontFamily: fonts.regular },
  optionBadge: {
    backgroundColor: colors.primaryTint,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  optionBadgeText: { fontSize: 10.5, color: colors.primaryDark, fontFamily: fonts.bold },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  addIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { color: colors.primaryDark, fontFamily: fonts.semibold, fontSize: 14 },
  poolBox: { gap: spacing.sm },
  fieldLabel: { fontSize: 13, color: colors.muted, marginBottom: 2, fontFamily: fonts.medium },
  hint: { fontSize: 12, color: colors.subtle, marginBottom: spacing.sm, fontFamily: fonts.regular },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    fontSize: 15,
    color: colors.text,
    fontFamily: fonts.regular,
  },
  pinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 48,
  },
  pinBtnDone: { borderColor: colors.primaryBorder, backgroundColor: colors.primarySoft },
  pinText: { fontSize: 14, color: colors.text, fontFamily: fonts.medium },
  pinTextDone: { color: colors.primaryDark },
  quoteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  quoteText: { flex: 1, fontSize: 12.5, color: colors.primaryDark, fontFamily: fonts.medium, lineHeight: 18 },
  couponRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  couponOkRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  couponOk: { color: colors.successDeep, fontFamily: fonts.semibold, fontSize: 13.5 },
  couponErr: { color: colors.danger, marginTop: 6, fontFamily: fonts.medium, fontSize: 13 },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: spacing.xs,
    backgroundColor: colors.bg,
    ...shadows.footer,
  },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sumVal: {
    fontSize: 14,
    color: colors.text,
    fontFamily: fonts.medium,
    fontVariant: ['tabular-nums'],
  },
  totalLabel: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text },
  note: { fontSize: 12, color: colors.subtle, marginBottom: spacing.sm, fontFamily: fonts.regular },
});

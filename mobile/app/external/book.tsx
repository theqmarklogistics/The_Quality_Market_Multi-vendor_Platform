// External-seller → Book a delivery. Mirrors the web's ExternalBookingForm: collect
// the recipient + pinned drop location, pickup method, package weight/dims, and
// payment method, show a live fee quote (distance×weight, with pooling-credit redemption),
// then POST /api/delivery/external. On success the booking enters the Kigali pooled
// pipeline; the partner pays the fee (or it's covered by credit) to start it.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import {
  bookExternalDelivery,
  getExternalDeliveries,
  quoteExternalDelivery,
  trackingLink,
  type DeliveryQuote,
} from '@/api/externalDelivery';
import { Button, Field } from '@/components/ui';
import { EMPTY_RW_LOCATION, RwLocationSelect, type RwLocation } from '@/components/RwLocationSelect';
import { PaymentMethod, formatPrice } from '@/constants';
import { colors, fonts, radius, spacing } from '@/theme';

const num = (v: string): number | undefined => {
  if (v === '' || v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export default function ExternalBookScreen() {
  const router = useRouter();

  const [senderName, setSenderName] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [senderEmail, setSenderEmail] = useState('');

  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [location, setLocation] = useState<RwLocation>(EMPTY_RW_LOCATION);
  const [landmark, setLandmark] = useState('');

  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pinning, setPinning] = useState(false);
  const [pickupCoords, setPickupCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pickupPinning, setPickupPinning] = useState(false);

  const [intakeMethod, setIntakeMethod] = useState<'HUB_DROP_OFF' | 'DRIVER_SWEEP'>('HUB_DROP_OFF');
  const [pickupContactName, setPickupContactName] = useState('');
  const [pickupPhone, setPickupPhone] = useState('');
  const [pickupLandmark, setPickupLandmark] = useState('');

  const [packageDescription, setPackageDescription] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [declaredValue, setDeclaredValue] = useState('');
  const [lengthCm, setLengthCm] = useState('');
  const [widthCm, setWidthCm] = useState('');
  const [heightCm, setHeightCm] = useState('');

  const [paymentMethod, setPaymentMethod] = useState<typeof PaymentMethod.MTN_MOMO | typeof PaymentMethod.BANK_TRANSFER>(
    PaymentMethod.MTN_MOMO,
  );

  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [creditBalance, setCreditBalance] = useState(0);
  const [applyCredit, setApplyCredit] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const hasPin = !!coords;

  // Load redeemable pooling credit once.
  useEffect(() => {
    let active = true;
    getExternalDeliveries()
      .then((d) => active && setCreditBalance(d.creditBalance || 0))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const sector = location.sector;

  // Live quote whenever a pricing input changes (debounced).
  useEffect(() => {
    const lat = coords?.latitude;
    const w = num(weightKg);
    if (!sector && !(w && lat != null)) {
      setQuote(null);
      return;
    }
    let active = true;
    const t = setTimeout(async () => {
      try {
        const q = await quoteExternalDelivery({
          sector: sector || undefined,
          weightKg: w,
          lengthCm: num(lengthCm),
          widthCm: num(widthCm),
          heightCm: num(heightCm),
          dropLat: coords?.latitude,
          dropLng: coords?.longitude,
          // No pin — send the address so the server can geocode it and still
          // price the delivery by distance.
          district: coords ? undefined : location.district || undefined,
          cell: coords ? undefined : location.cell || undefined,
          village: coords ? undefined : location.village || undefined,
          // Recorded pickup point overrides the hub as the distance origin,
          // so the live quote matches the fee charged at booking.
          originLat: pickupCoords?.latitude,
          originLng: pickupCoords?.longitude,
        });
        if (active) setQuote(q);
      } catch {
        if (active) setQuote(null);
      }
    }, 400);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [sector, location.district, location.cell, location.village, weightKg, lengthCm, widthCm, heightCm, coords, pickupCoords]);

  const pinLocation = async () => {
    setPinning(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow location access to pin the delivery spot.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch {
      Alert.alert('Location error', 'Could not get the location. Try again outdoors.');
    } finally {
      setPinning(false);
    }
  };

  // Pickup origin (e.g. a rider recording a walk-up package in the field) — the
  // delivery distance and fee are measured from here instead of the hub.
  const pinPickup = async () => {
    setPickupPinning(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow location access to record the pickup point.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setPickupCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch {
      Alert.alert('Location error', 'Could not get the location. Try again outdoors.');
    } finally {
      setPickupPinning(false);
    }
  };

  const creditPreview = useMemo(() => {
    if (!quote || creditBalance <= 0 || !applyCredit) return null;
    const applied = Math.min(creditBalance, quote.fee);
    const net = Math.max(0, quote.fee - applied);
    return { applied, net };
  }, [quote, creditBalance, applyCredit]);

  const isEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v.trim());

  const submit = useCallback(async () => {
    if (!senderName.trim() || !senderPhone.trim() || !isEmail(senderEmail)) {
      Alert.alert('Sender details', 'Sender name, phone and a valid email are required.');
      return;
    }
    if (!recipientName.trim() || !recipientPhone.trim() || !isEmail(recipientEmail) || !landmark.trim()) {
      Alert.alert('Recipient details', 'Recipient name, phone, a valid email and a landmark are required.');
      return;
    }
    // Location: an exact GPS pin, or the address selected down to the cell.
    if (!hasPin && (!location.district || !location.sector || !location.cell)) {
      Alert.alert('Delivery location', 'Pin the exact location, or select the district, sector and cell.');
      return;
    }
    if (!num(weightKg) || Number(weightKg) <= 0) {
      Alert.alert('Weight required', 'Enter the package weight in kg.');
      return;
    }
    if (!num(declaredValue) || Number(declaredValue) <= 0) {
      Alert.alert('Declared value required', "Enter the package's declared value.");
      return;
    }
    if (intakeMethod === 'DRIVER_SWEEP' && (!pickupContactName.trim() || !pickupPhone.trim() || !pickupLandmark.trim())) {
      Alert.alert('Pickup details', 'Pickup contact, phone and location are required for a driver sweep.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await bookExternalDelivery({
        senderName: senderName.trim(),
        senderPhone: senderPhone.trim(),
        senderEmail: senderEmail.trim(),
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone.trim(),
        recipientEmail: recipientEmail.trim(),
        recipientDistrict: location.district,
        recipientSector: location.sector,
        recipientCell: location.cell,
        recipientVillage: location.village || undefined,
        recipientLandmark: landmark.trim(),
        recipientLat: coords?.latitude,
        recipientLng: coords?.longitude,
        intakeMethod,
        pickupContactName: pickupContactName.trim() || undefined,
        pickupPhone: pickupPhone.trim() || undefined,
        pickupLandmark: pickupLandmark.trim() || undefined,
        pickupLat: pickupCoords?.latitude,
        pickupLng: pickupCoords?.longitude,
        packageDescription: packageDescription.trim() || undefined,
        declaredValue: num(declaredValue),
        packageWeightKg: num(weightKg),
        packageLengthCm: num(lengthCm),
        packageWidthCm: num(widthCm),
        packageHeightCm: num(heightCm),
        paymentMethod,
        applyCredit,
      });
      const msg = res.fullyCovered
        ? `Fee ${formatPrice(res.fee)} fully covered by credit. Delivery code: ${res.deliveryOtp}.`
        : `Fee ${formatPrice(res.fee)}${res.creditApplied > 0 ? ` (credit −${formatPrice(res.creditApplied)}, pay ${formatPrice(res.amountDue)})` : ''}. Upload your payment proof to start it.`;
      // Hand the partner the client link first — the location the client shares
      // through it is what the delivery fee is calculated from.
      const clientLink = res.trackingToken ? trackingLink(res.orderId, res.trackingToken) : null;
      Alert.alert(
        'Delivery booked',
        `${msg}\n\nSend your client their link first — the location they share sets the final delivery fee.`,
        clientLink
          ? [
              {
                text: 'Share client link',
                onPress: async () => {
                  try {
                    await Share.share({ message: clientLink });
                  } catch {}
                  router.replace('/external');
                },
              },
              { text: 'Later', style: 'cancel', onPress: () => router.replace('/external') },
            ]
          : [{ text: 'OK', onPress: () => router.replace('/external') }],
      );
    } catch (err: any) {
      Alert.alert('Could not book', err?.message ?? 'Try again.');
    } finally {
      setSubmitting(false);
    }
  }, [
    senderName, senderPhone, senderEmail,
    recipientName, recipientPhone, recipientEmail, location, landmark, hasPin, coords,
    intakeMethod, pickupContactName, pickupPhone, pickupLandmark, pickupCoords,
    packageDescription, declaredValue, weightKg, lengthCm, widthCm, heightCm,
    paymentMethod, applyCredit, router,
  ]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Sender */}
      <Text style={styles.section}>Sender</Text>
      <Text style={styles.hint}>Who is sending this package — printed on the delivery documents.</Text>
      <Field label="Name" value={senderName} onChangeText={setSenderName} placeholder="Sender name" />
      <Field label="Phone" value={senderPhone} onChangeText={setSenderPhone} keyboardType="phone-pad" placeholder="07…" />
      <Field
        label="Email"
        value={senderEmail}
        onChangeText={setSenderEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholder="name@example.com"
      />

      {/* Recipient */}
      <Text style={styles.section}>Recipient</Text>
      <Field label="Name" value={recipientName} onChangeText={setRecipientName} placeholder="Recipient name" />
      <Field label="Phone" value={recipientPhone} onChangeText={setRecipientPhone} keyboardType="phone-pad" placeholder="07…" />
      <Field
        label="Email — receives the tracking link"
        value={recipientEmail}
        onChangeText={setRecipientEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholder="name@example.com"
      />

      <Field label="Landmark / directions" value={landmark} onChangeText={setLandmark} placeholder="Directions to the recipient" />

      {/* Delivery location: sharing/pinning it is always the first option. */}
      <Text style={styles.section}>Delivery location</Text>
      <Text style={styles.hint}>Share the recipient&apos;s exact spot — it sets the distance used for pricing and routing.</Text>
      <TouchableOpacity style={[styles.pinBtn, hasPin && styles.pinBtnDone]} onPress={pinLocation} disabled={pinning}>
        <Ionicons name={hasPin ? 'checkmark-circle' : 'location-outline'} size={20} color={hasPin ? colors.success : colors.text} />
        <Text style={styles.pinText}>
          {pinning
            ? 'Getting location…'
            : hasPin
              ? `Location shared (${coords!.latitude.toFixed(5)}, ${coords!.longitude.toFixed(5)})`
              : 'Share the delivery location'}
        </Text>
      </TouchableOpacity>

      {/* Option 2: record the address — its geocoded location sets the distance
          until an exact spot is shared. */}
      <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Delivery area (Kigali)</Text>
      <Text style={styles.hint}>
        Or select down to the cell — the delivery distance is calculated from the geographic
        location of this address until an exact spot is shared.
      </Text>
      <RwLocationSelect kigaliOnly value={location} onChange={setLocation} />
      {!hasPin ? (
        <Text style={styles.hint}>
          Don&apos;t know the exact spot? Book anyway — after booking, send your client their tracking
          link. The location they share sets the final delivery fee before you pay.
        </Text>
      ) : null}

      {/* Pickup */}
      <Text style={styles.section}>Pickup</Text>
      <View style={styles.toggleRow}>
        {([
          { value: 'HUB_DROP_OFF' as const, label: 'I drop at the hub' },
          { value: 'DRIVER_SWEEP' as const, label: 'Sweep pickup' },
        ]).map((o) => {
          const active = intakeMethod === o.value;
          return (
            <TouchableOpacity
              key={o.value}
              style={[styles.toggle, active && (o.value === 'DRIVER_SWEEP' ? styles.toggleWarn : styles.toggleActive)]}
              onPress={() => setIntakeMethod(o.value)}
            >
              <Text style={[styles.toggleText, active && styles.toggleTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {intakeMethod === 'DRIVER_SWEEP' ? (
        <View style={{ marginTop: spacing.sm }}>
          <Field label="Pickup contact" value={pickupContactName} onChangeText={setPickupContactName} placeholder="Contact name" />
          <Field label="Pickup phone" value={pickupPhone} onChangeText={setPickupPhone} keyboardType="phone-pad" placeholder="07…" />
          <Field label="Pickup location / landmark" value={pickupLandmark} onChangeText={setPickupLandmark} placeholder="Where to collect" />
        </View>
      ) : null}
      <TouchableOpacity style={[styles.pinBtn, pickupCoords && styles.pinBtnDone]} onPress={pinPickup} disabled={pickupPinning}>
        <Ionicons
          name={pickupCoords ? 'checkmark-circle' : 'locate-outline'}
          size={20}
          color={pickupCoords ? colors.success : colors.text}
        />
        <Text style={styles.pinText}>
          {pickupPinning
            ? 'Getting location…'
            : pickupCoords
              ? 'Pickup point recorded (tap to update)'
              : 'Record pickup at my current location'}
        </Text>
      </TouchableOpacity>
      <Text style={styles.hint}>
        When a pickup point is recorded (e.g. a rider logging a package in the field), the delivery
        distance — and the fee — is measured from that point instead of the hub.
      </Text>

      {/* Package */}
      <Text style={styles.section}>Package</Text>
      <Field label="Description" value={packageDescription} onChangeText={setPackageDescription} placeholder="What's in the package" />
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field label="Weight (kg)" value={weightKg} onChangeText={setWeightKg} keyboardType="numeric" placeholder="0.0" />
        </View>
        <View style={styles.flex}>
          <Field label="Declared value (RWF)" value={declaredValue} onChangeText={setDeclaredValue} keyboardType="numeric" placeholder="0" />
        </View>
      </View>
      <Text style={styles.hint}>Dimensions (cm) — optional, used when a bulky-but-light package costs more by volume.</Text>
      <View style={styles.row}>
        <View style={styles.flex}><Field label="Length" value={lengthCm} onChangeText={setLengthCm} keyboardType="numeric" placeholder="0" /></View>
        <View style={styles.flex}><Field label="Width" value={widthCm} onChangeText={setWidthCm} keyboardType="numeric" placeholder="0" /></View>
        <View style={styles.flex}><Field label="Height" value={heightCm} onChangeText={setHeightCm} keyboardType="numeric" placeholder="0" /></View>
      </View>
      <View style={styles.warnBox}>
        <Ionicons name="warning-outline" size={16} color="#b45309" style={{ marginTop: 1 }} />
        <Text style={styles.warnText}>
          Declare the weight, size and value accurately. Every package is verified at intake — if it&apos;s
          heavier or bigger than declared, it is held until you pay the difference, and unpaid
          differences cancel the delivery without a refund.
        </Text>
      </View>

      {/* Payment method */}
      <Text style={styles.section}>Payment method</Text>
      <View style={styles.toggleRow}>
        {([
          { value: PaymentMethod.MTN_MOMO, label: 'MTN MoMo' },
          { value: PaymentMethod.BANK_TRANSFER, label: 'Bank transfer' },
        ]).map((o) => {
          const active = paymentMethod === o.value;
          return (
            <TouchableOpacity
              key={o.value}
              style={[styles.toggle, active && styles.toggleActive]}
              onPress={() => setPaymentMethod(o.value)}
            >
              <Text style={[styles.toggleText, active && styles.toggleTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Quote */}
      <View style={styles.quoteCard}>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>Delivery fee</Text>
          <Text style={styles.quoteFee}>{quote?.fee != null ? formatPrice(quote.fee) : '—'}</Text>
        </View>
        {quote?.basis === 'formula' ? (
          <Text style={styles.quoteHint}>
            Chargeable {quote.chargeableKg} kg · {quote.distanceKm} km from {pickupCoords ? 'pickup point' : 'hub'}
            {quote.locationSource === 'address' ? " — measured to the recorded address's location" : ''}
          </Text>
        ) : null}
        {quote?.basis === 'flat' ? (
          <Text style={styles.quoteHint}>
            Flat sector rate — add a weight, then share the location (or select the address down to
            the cell) for distance pricing.
          </Text>
        ) : null}

        {creditBalance > 0 && quote?.fee != null ? (
          <View style={styles.creditToggleRow}>
            <Text style={styles.creditToggleText}>Apply my credit ({formatPrice(creditBalance)})</Text>
            <Switch value={applyCredit} onValueChange={setApplyCredit} />
          </View>
        ) : null}
        {creditPreview ? (
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>Credit −{formatPrice(creditPreview.applied)} · you pay</Text>
            <Text style={styles.quoteNet}>{creditPreview.net <= 0 ? 'Fully covered' : formatPrice(creditPreview.net)}</Text>
          </View>
        ) : null}
      </View>

      <View style={{ marginTop: spacing.lg, marginBottom: spacing.xl }}>
        <Button label="Book delivery" onPress={submit} loading={submitting} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },

  section: { fontSize: 13, fontFamily: fonts.bold, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },
  fieldLabel: { fontSize: 13, color: colors.muted, marginBottom: 6 },
  hint: { fontSize: 12, color: colors.subtle, marginBottom: spacing.sm },
  warnBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  warnText: { flex: 1, fontSize: 11, lineHeight: 16, color: '#92400e', fontFamily: fonts.medium },

  pinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  pinBtnDone: { borderColor: colors.success, backgroundColor: '#f0fdf4' },
  pinText: { fontSize: 14, color: colors.text, flex: 1 },

  toggleRow: { flexDirection: 'row', gap: spacing.sm },
  toggle: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  toggleActive: { borderColor: colors.success, backgroundColor: '#f0fdf4' },
  toggleWarn: { borderColor: colors.warning, backgroundColor: '#fffbeb' },
  toggleText: { fontSize: 14, color: colors.muted, fontFamily: fonts.semibold },
  toggleTextActive: { color: colors.text },

  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },

  quoteCard: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  quoteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quoteLabel: { fontSize: 14, color: colors.muted },
  quoteFee: { fontSize: 18, fontFamily: fonts.bold, color: colors.text },
  quoteHint: { fontSize: 11, color: colors.subtle, marginTop: 4 },
  creditToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  creditToggleText: { fontSize: 13, color: colors.muted },
  quoteNet: { fontSize: 15, fontFamily: fonts.bold, color: colors.success },
});

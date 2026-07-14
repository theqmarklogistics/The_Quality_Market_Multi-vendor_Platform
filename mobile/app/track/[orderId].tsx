// Live pooled-delivery tracking: map (rider + recipient + route), status timeline,
// ETA, OTP, rider contact, and opt-in live location sharing. Updates over Socket.IO
// (rider-location-update / delivery-status-update) and polls every 15s as a fallback.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { getTracking, locateFromMyAddress, shareMyLocation, type TrackingSnapshot } from '@/api/tracking';
import { useRealtimeRoom } from '@/realtime/useRealtimeRoom';
import { DeliveryTimeline } from '@/components/DeliveryTimeline';
import { Button, EmptyState, Loader } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/theme';

// Native maps need a Google Maps API key on Android; until one is configured
// the screen degrades to a placeholder (same as web).
const MAPS_ENABLED =
  Platform.OS !== 'web' && !!process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const maps = MAPS_ENABLED ? require('react-native-maps') : null;
const MapView = maps?.default as any;
const Marker = maps?.Marker as any;
const Polyline = maps?.Polyline as any;
const PROVIDER_GOOGLE = maps?.PROVIDER_GOOGLE as any;

// Kigali centre — fallback map region before any coordinates are known.
const KIGALI = { latitude: -1.9577, longitude: 30.1127 };

export default function TrackScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const mapRef = useRef<any>(null);

  const [data, setData] = useState<TrackingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [locatingAddress, setLocatingAddress] = useState(false);

  // Live rider position (socket updates patch this without a full refetch).
  const [riderPos, setRiderPos] = useState<{ lat: number; lng: number } | null>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    try {
      const snap = await getTracking(orderId);
      setData(snap);
      if (snap.riderLat != null && snap.riderLng != null) {
        setRiderPos({ lat: snap.riderLat, lng: snap.riderLng });
      }
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load tracking');
    }
  }, [orderId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Polling fallback (covers serverless / socket-disabled deployments).
  useEffect(() => {
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  // Realtime patches.
  useRealtimeRoom({
    join: { event: 'join-track-room', arg: orderId },
    leave: { event: 'leave-track-room', arg: orderId },
    handlers: {
      'rider-location-update': (p: { lat: number; lng: number }) => {
        if (typeof p?.lat === 'number' && typeof p?.lng === 'number') {
          setRiderPos({ lat: p.lat, lng: p.lng });
        }
      },
      'delivery-status-update': () => {
        // Status changed — refetch to get OTP/ETA/route consistent with the new state.
        load();
      },
      'customer-location-update': (p: { lat: number; lng: number }) => {
        setData((prev) => (prev ? { ...prev, recipientLat: p.lat, recipientLng: p.lng } : prev));
      },
    },
  });

  const shareLocation = async () => {
    if (!orderId) return;
    setSharing(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow location access to share your spot.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await shareMyLocation(orderId, pos.coords.latitude, pos.coords.longitude);
      setData((prev) =>
        prev ? { ...prev, recipientLat: pos.coords.latitude, recipientLng: pos.coords.longitude } : prev,
      );
      Alert.alert('Shared', 'Your live location was shared with the rider.');
    } catch (err: any) {
      Alert.alert('Could not share', err?.message ?? 'Try again.');
    } finally {
      setSharing(false);
    }
  };

  // Second option: derive the drop point from the geographic location of the
  // address recorded with the booking (geocoded server-side).
  const locateFromAddress = async () => {
    if (!orderId) return;
    setLocatingAddress(true);
    try {
      await locateFromMyAddress(orderId);
      await load();
      Alert.alert('Located', 'The delivery distance is calculated from your recorded address.');
    } catch (err: any) {
      Alert.alert('Could not locate', err?.message ?? 'Try sharing your location instead.');
    } finally {
      setLocatingAddress(false);
    }
  };

  const callRider = () => {
    if (data?.rider?.phone) Linking.openURL(`tel:${data.rider.phone}`);
  };

  if (loading) return <Loader />;
  if (error || !data) {
    return <EmptyState icon="navigate-circle-outline" title="Tracking unavailable" subtitle={error ?? ''} />;
  }

  const rider = riderPos ?? (data.riderLat != null && data.riderLng != null ? { lat: data.riderLat, lng: data.riderLng } : null);
  const recipient =
    data.recipientLat != null && data.recipientLng != null
      ? { lat: data.recipientLat, lng: data.recipientLng }
      : null;

  const initialRegion = {
    latitude: rider?.lat ?? recipient?.lat ?? KIGALI.latitude,
    longitude: rider?.lng ?? recipient?.lng ?? KIGALI.longitude,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  // OSRM geometry is [lng, lat]; react-native-maps wants {latitude, longitude}.
  const routeCoords =
    data.routeGeometry?.coordinates?.map(([lng, lat]) => ({ latitude: lat, longitude: lng })) ?? [];

  const showMap = !!(rider || recipient);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      {showMap ? (
        !MAPS_ENABLED ? (
          <View style={[styles.map, styles.mapPlaceholder]}>
            <Ionicons name="map-outline" size={40} color={colors.subtle} />
            <Text style={styles.muted}>
              The live map is not available in this build — the timeline below stays up to date.
            </Text>
          </View>
        ) : (
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={initialRegion}
          >
            {rider ? (
              <Marker coordinate={{ latitude: rider.lat, longitude: rider.lng }} title="Rider">
                <View style={styles.riderPin}>
                  <Ionicons name="bicycle" size={18} color="#fff" />
                </View>
              </Marker>
            ) : null}
            {recipient ? (
              <Marker
                coordinate={{ latitude: recipient.lat, longitude: recipient.lng }}
                title="Delivery location"
                pinColor={colors.success}
              />
            ) : null}
            {routeCoords.length > 1 ? (
              <Polyline coordinates={routeCoords} strokeColor={colors.primary} strokeWidth={4} />
            ) : null}
          </MapView>
        )
      ) : (
        <View style={[styles.map, styles.mapPlaceholder]}>
          <Ionicons name="map-outline" size={40} color={colors.subtle} />
          <Text style={styles.muted}>Live map appears once your rider is on the move.</Text>
        </View>
      )}

      <View style={styles.body}>
        {/* ETA + OTP */}
        <View style={styles.statRow}>
          {data.etaMinutes != null ? (
            <View style={styles.stat}>
              <Text style={styles.statValue}>{Math.round(data.etaMinutes)} min</Text>
              <Text style={styles.statLabel}>ETA</Text>
            </View>
          ) : null}
          {data.hubDistanceKm != null ? (
            <View style={styles.stat}>
              <Text style={styles.statValue}>{data.hubDistanceKm.toFixed(1)} km</Text>
              <Text style={styles.statLabel}>From hub</Text>
            </View>
          ) : null}
        </View>

        {data.deliveryOtp ? (
          <View style={styles.otpBox}>
            <Text style={styles.otpLabel}>Show this code to your rider</Text>
            <Text style={styles.otp}>{data.deliveryOtp}</Text>
            <View style={styles.otpWarn}>
              <Ionicons name="warning-outline" size={16} color="#b45309" />
              <Text style={styles.otpWarnText}>
                Only give this code to the rider AFTER the package is in your hands. Sharing it
                earlier confirms the delivery and releases payment.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Status timeline */}
        <Text style={styles.sectionTitle}>Status</Text>
        <DeliveryTimeline status={data.deliveryStatus} />

        {data.deliveryStatus === 'FAILED' && data.failureReason ? (
          <Text style={styles.failReason}>{data.failureReason}</Text>
        ) : null}

        {/* Rider */}
        {data.rider?.name ? (
          <>
            <Text style={styles.sectionTitle}>Your rider</Text>
            <View style={styles.riderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.riderName}>{data.rider.name}</Text>
                {data.rider.vehicleType ? (
                  <Text style={styles.muted}>{data.rider.vehicleType}</Text>
                ) : null}
              </View>
              {data.rider.phone ? (
                <TouchableOpacity style={styles.callBtn} onPress={callRider}>
                  <Ionicons name="call" size={18} color="#fff" />
                  <Text style={styles.callText}>Call</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </>
        ) : null}

        {/* Landmark */}
        {data.landmarkAddress ? (
          <>
            <Text style={styles.sectionTitle}>Delivery directions</Text>
            <Text style={styles.muted}>{data.landmarkAddress}</Text>
          </>
        ) : null}

        {/* Delivery location: sharing it is always the first option; the recorded
            address's geographic location is the second. */}
        {data.deliveryStatus !== 'DELIVERED' && data.deliveryStatus !== 'FAILED' ? (
          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            <Button
              label="Share my delivery location"
              variant="outline"
              onPress={shareLocation}
              loading={sharing}
            />
            <Text style={styles.hint}>Helps the rider find your exact spot.</Text>
            <Button
              label="Use the address on my booking instead"
              variant="ghost"
              onPress={locateFromAddress}
              loading={locatingAddress}
            />
            <Text style={styles.hint}>
              Can't share your location? The delivery distance is calculated from the geographic
              location of your recorded address.
            </Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  map: { width: '100%', height: 280 },
  riderPin: {
    backgroundColor: colors.primary,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  mapPlaceholder: {
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: spacing.xl,
  },
  body: { padding: spacing.lg, gap: spacing.sm },
  statRow: { flexDirection: 'row', gap: spacing.md },
  stat: {
    flex: 1,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.primaryDark,
    fontVariant: ['tabular-nums'],
  },
  statLabel: { fontSize: 12, color: colors.muted, fontFamily: fonts.medium, marginTop: 2 },
  otpBox: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primaryBorder,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: 4,
  },
  otpLabel: { fontSize: 13, color: colors.muted, fontFamily: fonts.medium },
  otpWarn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  otpWarnText: { flex: 1, fontSize: 12, color: '#92400e', fontFamily: fonts.medium, lineHeight: 17 },
  otp: {
    fontSize: 32,
    fontFamily: fonts.bold,
    letterSpacing: 8,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  failReason: { color: colors.danger, fontSize: 13, fontFamily: fonts.medium },
  riderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  riderName: { fontSize: 15, fontFamily: fonts.semibold, color: colors.text },
  muted: { fontSize: 13, color: colors.muted, fontFamily: fonts.regular },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 18,
    minHeight: 44,
  },
  callText: { color: colors.primaryText, fontFamily: fonts.bold },
  hint: {
    fontSize: 12,
    color: colors.subtle,
    textAlign: 'center',
    marginTop: 6,
    fontFamily: fonts.regular,
  },
});

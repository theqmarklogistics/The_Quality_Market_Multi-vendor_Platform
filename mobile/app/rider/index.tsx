// Rider Console — the mobile equivalent of components/rider/RiderConsole.jsx.
// Shows the rider's active corridor for today: a live map (own position + stops),
// per-stop actions (call, navigate, mark arriving, deliver via OTP or photo, mark
// failed), and a start/stop control for live location sharing. Updates over
// Socket.IO (join-rider-room) with a 25s polling fallback.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import {
  confirmDeliveryWithPhoto,
  getRiderAssignment,
  scanAssignPackage,
  setStopStatus,
  verifyDeliveryOtp,
  type RiderCorridor,
  type RiderStop,
} from '@/api/rider';
import { startRiderTracking, stopRiderTracking } from '@/rider/locationTracking';
import { useRealtimeRoom } from '@/realtime/useRealtimeRoom';
import { useMyRole, canAccessRider } from '@/hooks/useMyRole';
import { EmptyState, Loader } from '@/components/ui';
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

const KIGALI = { latitude: -1.9577, longitude: 30.1127 };

// Preset reasons keep failure data clean and consistent across riders.
const FAILURE_REASONS = [
  'Customer unreachable',
  'Wrong / incomplete address',
  'Customer not available',
  'Customer refused delivery',
  'Access blocked / gated',
  'Other',
];

const STATUS_BADGE: Record<string, { bg: string; fg: string }> = {
  SORTING: { bg: '#f1f5f9', fg: '#475569' },
  IN_TRANSIT: { bg: '#dbeafe', fg: '#1d4ed8' },
  ARRIVING: { bg: '#fef3c7', fg: '#b45309' },
  DELIVERED: { bg: '#dcfce7', fg: '#15803d' },
  FAILED: { bg: '#fee2e2', fg: '#b91c1c' },
};

export default function RiderConsoleScreen() {
  const router = useRouter();
  const { role, loading: roleLoading } = useMyRole();

  const [corridor, setCorridor] = useState<RiderCorridor | null>(null);
  const [stops, setStops] = useState<RiderStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [riderPos, setRiderPos] = useState<{ lat: number; lng: number } | null>(null);
  const [tracking, setTracking] = useState(false);
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  const [otpModal, setOtpModal] = useState<{ orderId: string } | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [scanCode, setScanCode] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scannedOnce = useRef(false);
  const [failModal, setFailModal] = useState<{ orderId: string } | null>(null);
  const [failReason, setFailReason] = useState(FAILURE_REASONS[0]);
  const [failNote, setFailNote] = useState('');

  const mapRef = useRef<any>(null);
  const didFit = useRef(false);

  const allowed = canAccessRider(role);

  const load = useCallback(
    async ({ silent }: { silent?: boolean } = {}) => {
      if (!silent) setLoading(true);
      try {
        const data = await getRiderAssignment();
        setCorridor(data.corridor);
        setStops(data.stops || []);
        if (data.corridor?.riderLat != null && data.corridor?.riderLng != null) {
          setRiderPos((prev) => prev || { lat: data.corridor!.riderLat!, lng: data.corridor!.riderLng! });
        }
      } catch (err: any) {
        if (!silent) Alert.alert('Could not load route', err?.message ?? 'Try again.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  // Realtime: customer location shares + status/corridor changes (mirrors web).
  useRealtimeRoom({
    enabled: allowed,
    join: { event: 'join-rider-room' },
    handlers: {
      'customer-location-update': (p: { orderId: string; lat: number; lng: number }) => {
        setStops((prev) =>
          prev.map((s) => (s.orderId === p.orderId ? { ...s, lat: p.lat, lng: p.lng } : s)),
        );
      },
      'delivery-status-update': () => load({ silent: true }),
      'corridor-update': () => load({ silent: true }),
    },
  });

  // Polling fallback (serverless / socket-disabled deployments).
  useEffect(() => {
    if (!allowed) return;
    const id = setInterval(() => load({ silent: true }), 25_000);
    return () => clearInterval(id);
  }, [allowed, load]);

  // Stop sharing if the screen unmounts.
  useEffect(() => () => { void stopRiderTracking(); }, []);

  const toggleTracking = async () => {
    if (tracking) {
      setTrackingBusy(true);
      await stopRiderTracking();
      setTracking(false);
      setTrackingBusy(false);
      return;
    }
    if (corridor?.status !== 'IN_TRANSIT') {
      Alert.alert('Not dispatched yet', "Your corridor hasn't been dispatched yet.");
      return;
    }
    setTrackingBusy(true);
    try {
      const { mode } = await startRiderTracking((pos) => setRiderPos(pos));
      setTracking(true);
      Alert.alert(
        'Live tracking on',
        mode === 'background'
          ? 'Customers can see you now — location keeps sharing while you ride, even with the screen off.'
          : 'Customers can see you now. Keep this screen open while you ride.',
      );
    } catch (err: any) {
      Alert.alert('Could not start tracking', err?.message ?? 'Try again.');
    } finally {
      setTrackingBusy(false);
    }
  };

  const markArriving = async (orderId: string) => {
    setBusy(true);
    try {
      await setStopStatus(orderId, 'ARRIVING');
      await load({ silent: true });
    } catch (err: any) {
      Alert.alert('Update failed', err?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmFail = async () => {
    if (!failModal) return;
    const reason =
      failReason === 'Other'
        ? failNote.trim() || 'Other'
        : failNote.trim()
          ? `${failReason} — ${failNote.trim()}`
          : failReason;
    setBusy(true);
    try {
      await setStopStatus(failModal.orderId, 'FAILED', reason);
      setFailModal(null);
      await load({ silent: true });
    } catch (err: any) {
      Alert.alert('Update failed', err?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmOtp = async () => {
    if (!otpModal) return;
    if (!/^\d{4}$/.test(otpInput)) {
      Alert.alert('Enter the code', 'Enter the 4-digit code from the customer.');
      return;
    }
    setBusy(true);
    try {
      await verifyDeliveryOtp(otpModal.orderId, otpInput);
      setOtpModal(null);
      setOtpInput('');
      Alert.alert('Delivered', 'Delivery confirmed.');
      await load({ silent: true });
    } catch (err: any) {
      Alert.alert('Could not confirm', err?.message ?? 'Check the code and try again.');
    } finally {
      setBusy(false);
    }
  };

  // Fallback proof: capture a photo when the recipient can't produce the OTP.
  const confirmWithPhoto = async () => {
    if (!otpModal) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera needed', 'Allow camera access to capture proof of delivery.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setBusy(true);
    try {
      await confirmDeliveryWithPhoto(otpModal.orderId, {
        uri: asset.uri,
        name: asset.fileName ?? `pod-${otpModal.orderId}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
      setOtpModal(null);
      setOtpInput('');
      Alert.alert('Delivered', 'Delivery confirmed with photo proof.');
      await load({ silent: true });
    } catch (err: any) {
      Alert.alert('Could not confirm', err?.message ?? 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  // --- access / loading gates ------------------------------------------------
  if (roleLoading || (allowed && loading)) return <Loader />;
  if (!allowed) {
    return (
      <EmptyState
        icon="bicycle-outline"
        title="Riders only"
        subtitle="This area is for delivery riders. Ask an admin to grant you the RIDER role."
      />
    );
  }
  const assignByCode = async (raw?: string) => {
    const code = (raw ?? scanCode).trim();
    if (!code) {
      Alert.alert('Package code needed', 'Scan the QR on the label or type the package code.');
      return;
    }
    setAssigning(true);
    try {
      const res = await scanAssignPackage(code);
      setScanCode('');
      Alert.alert(
        'Package assigned',
        res.stop?.recipientName ? `Assigned to you — ${res.stop.recipientName}.` : 'Assigned to you.',
      );
      await load({ silent: true });
    } catch (err: any) {
      Alert.alert('Could not assign', err?.message ?? 'Try again.');
    } finally {
      setAssigning(false);
    }
  };

  const openScanner = async () => {
    if (!cameraPermission?.granted) {
      const res = await requestCameraPermission();
      if (!res.granted) {
        Alert.alert('Camera needed', 'Allow camera access to scan package QR codes, or type the code instead.');
        return;
      }
    }
    scannedOnce.current = false;
    setScannerOpen(true);
  };

  const onQrScanned = ({ data }: { data: string }) => {
    if (scannedOnce.current) return;
    scannedOnce.current = true;
    setScannerOpen(false);
    assignByCode(data);
  };

  const scanAssignBox = (
    <View style={styles.scanBox}>
      <Text style={styles.scanTitle}>Scan a package</Text>
      <Text style={styles.scanSub}>
        Scan the QR on the package label (or type its code) to be assigned to it.
      </Text>
      <TouchableOpacity style={styles.scanCameraBtn} onPress={openScanner} disabled={assigning}>
        <Ionicons name="qr-code-outline" size={18} color="#fff" />
        <Text style={styles.scanBtnText}>Scan QR with camera</Text>
      </TouchableOpacity>
      <View style={styles.scanRow}>
        <TextInput
          style={styles.scanInput}
          placeholder="ord_…"
          placeholderTextColor={colors.subtle}
          autoCapitalize="none"
          value={scanCode}
          onChangeText={setScanCode}
        />
        <TouchableOpacity style={styles.scanBtn} onPress={() => assignByCode()} disabled={assigning}>
          {assigning ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.scanBtnText}>Assign</Text>
          )}
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.recordBtn} onPress={() => router.push('/external/book')}>
        <Ionicons name="add-circle-outline" size={16} color={colors.primaryDark} />
        <Text style={styles.recordText}>Record a new delivery</Text>
      </TouchableOpacity>

      {/* Camera QR scanner */}
      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <View style={styles.scannerWrap}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onQrScanned}
          />
          <View style={styles.scannerOverlay} pointerEvents="box-none">
            <Text style={styles.scannerHint}>Point the camera at the QR code on the label</Text>
            <TouchableOpacity style={styles.scannerClose} onPress={() => setScannerOpen(false)}>
              <Ionicons name="close" size={20} color="#fff" />
              <Text style={styles.scanBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );

  if (!corridor) {
    return (
      <ScrollView contentContainerStyle={styles.center}>
        <Ionicons name="cube-outline" size={44} color={colors.subtle} />
        <Text style={styles.emptyTitle}>No route assigned yet</Text>
        <Text style={styles.emptySub}>
          When dispatch assigns you a corridor for today, it will appear here — or assign
          yourself by scanning a package.
        </Text>
        {scanAssignBox}
        <TouchableOpacity onPress={() => load()} style={styles.refreshBtn}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const mapStops = stops.filter((s) => s.lat != null && s.lng != null);
  const pending = stops.filter((s) => !['DELIVERED', 'FAILED'].includes(s.deliveryStatus)).length;

  const initialRegion = {
    latitude: riderPos?.lat ?? mapStops[0]?.lat ?? KIGALI.latitude,
    longitude: riderPos?.lng ?? mapStops[0]?.lng ?? KIGALI.longitude,
    latitudeDelta: 0.06,
    longitudeDelta: 0.06,
  };

  // A light hint line through the stops in delivery order.
  const routeCoords = mapStops.map((s) => ({ latitude: s.lat!, longitude: s.lng! }));

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Summary header */}
        <View style={styles.header}>
          <Text style={styles.headerKicker}>RIDER CONSOLE</Text>
          <Text style={styles.headerTitle}>{corridor.name}</Text>
          <Text style={styles.headerSub}>
            {pending} stop{pending === 1 ? '' : 's'} remaining ·{' '}
            {corridor.status === 'IN_TRANSIT' ? 'Dispatched' : corridor.status}
          </Text>
        </View>

        {/* Scan a package to add it to this route / record a walk-up delivery */}
        <View style={{ paddingHorizontal: spacing.lg }}>{scanAssignBox}</View>

        {/* Map */}
        {!MAPS_ENABLED ? (
          <View style={[styles.map, styles.mapPlaceholder]}>
            <Ionicons name="map-outline" size={40} color={colors.subtle} />
            <Text style={styles.muted}>
              The live map is not available in this build — follow the stop list below.
            </Text>
          </View>
        ) : (
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={initialRegion}
            onLayout={() => {
              if (didFit.current || routeCoords.length < 2) return;
              didFit.current = true;
              mapRef.current?.fitToCoordinates(routeCoords, {
                edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
                animated: false,
              });
            }}
          >
            {riderPos ? (
              <Marker coordinate={{ latitude: riderPos.lat, longitude: riderPos.lng }} title="You">
                <View style={styles.riderPin}>
                  <Ionicons name="bicycle" size={16} color="#fff" />
                </View>
              </Marker>
            ) : null}
            {mapStops.map((s) => (
              <Marker
                key={s.orderId}
                coordinate={{ latitude: s.lat!, longitude: s.lng! }}
                title={`#${s.stopSequence} ${s.recipientName ?? ''}`.trim()}
              >
                <View style={styles.stopPin}>
                  <Text style={styles.stopPinText}>{s.stopSequence}</Text>
                </View>
              </Marker>
            ))}
            {routeCoords.length > 1 ? (
              <Polyline coordinates={routeCoords} strokeColor={colors.subtle} strokeWidth={3} />
            ) : null}
          </MapView>
        )}

        {/* Stops */}
        <View style={styles.body}>
          {stops.map((s) => {
            const done = s.deliveryStatus === 'DELIVERED';
            const failed = s.deliveryStatus === 'FAILED';
            const badge = STATUS_BADGE[s.deliveryStatus] ?? STATUS_BADGE.SORTING;
            const place = [s.sector, s.city].filter(Boolean).join(', ');
            return (
              <View
                key={s.orderId}
                style={[
                  styles.stopCard,
                  done && styles.stopCardDone,
                  failed && styles.stopCardFailed,
                ]}
              >
                <View style={styles.stopTop}>
                  <View style={styles.stopSeq}>
                    <Text style={styles.stopSeqText}>{s.stopSequence}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stopName}>{s.recipientName || 'Customer'}</Text>
                    {s.landmarkAddress ? (
                      <Text style={styles.stopLandmark}>{s.landmarkAddress}</Text>
                    ) : null}
                    {place ? <Text style={styles.stopPlace}>{place}</Text> : null}
                  </View>
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeText, { color: badge.fg }]}>{s.deliveryStatus}</Text>
                  </View>
                </View>

                {!done && !failed ? (
                  <View style={styles.actions}>
                    {s.recipientPhone ? (
                      <TouchableOpacity
                        style={styles.actionOutline}
                        onPress={() => Linking.openURL(`tel:${s.recipientPhone}`)}
                      >
                        <Ionicons name="call-outline" size={14} color={colors.text} />
                        <Text style={styles.actionOutlineText}>Call</Text>
                      </TouchableOpacity>
                    ) : null}
                    {s.lat != null && s.lng != null ? (
                      <TouchableOpacity
                        style={styles.actionOutline}
                        onPress={() =>
                          Linking.openURL(
                            `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`,
                          )
                        }
                      >
                        <Ionicons name="navigate-outline" size={14} color={colors.text} />
                        <Text style={styles.actionOutlineText}>Navigate</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      disabled={busy}
                      style={[styles.actionBtn, styles.actionArriving]}
                      onPress={() => markArriving(s.orderId)}
                    >
                      <Ionicons name="location-outline" size={14} color="#fff" />
                      <Text style={styles.actionBtnText}>Arriving</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={busy}
                      style={[styles.actionBtn, styles.actionDeliver]}
                      onPress={() => {
                        setOtpModal({ orderId: s.orderId });
                        setOtpInput('');
                      }}
                    >
                      <Ionicons name="checkmark-circle-outline" size={14} color="#fff" />
                      <Text style={styles.actionBtnText}>Deliver</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={busy}
                      style={styles.actionFail}
                      onPress={() => {
                        setFailModal({ orderId: s.orderId });
                        setFailReason(FAILURE_REASONS[0]);
                        setFailNote('');
                      }}
                    >
                      <Ionicons name="close-circle-outline" size={14} color={colors.danger} />
                      <Text style={styles.actionFailText}>Mark failed</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Sticky start/stop tracking */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.trackBtn, tracking ? styles.trackBtnStop : styles.trackBtnStart]}
          onPress={toggleTracking}
          disabled={trackingBusy}
          activeOpacity={0.85}
        >
          {trackingBusy ? (
            <ActivityIndicator color={tracking ? colors.danger : '#fff'} />
          ) : (
            <>
              <Ionicons
                name={tracking ? 'stop-circle-outline' : 'play-circle-outline'}
                size={18}
                color={tracking ? colors.danger : '#fff'}
              />
              <Text style={[styles.trackText, tracking && styles.trackTextStop]}>
                {tracking ? 'Stop sharing location' : 'Start route & share location'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* OTP modal */}
      <Modal visible={!!otpModal} transparent animationType="fade" onRequestClose={() => setOtpModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirm delivery</Text>
            <Text style={styles.modalSub}>Enter the 4-digit code the customer shows you.</Text>
            <TextInput
              value={otpInput}
              onChangeText={(t) => setOtpInput(t.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              autoFocus
              placeholder="0000"
              placeholderTextColor={colors.subtle}
              style={styles.otpInput}
              maxLength={4}
            />
            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setOtpModal(null)} disabled={busy}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={confirmOtp} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalConfirmText}>Confirm</Text>}
              </TouchableOpacity>
            </View>
            <View style={styles.photoDivider}>
              <Text style={styles.photoHint}>Customer can’t provide the code?</Text>
              <TouchableOpacity style={styles.photoBtn} onPress={confirmWithPhoto} disabled={busy}>
                <Ionicons name="camera-outline" size={16} color={colors.text} />
                <Text style={styles.photoBtnText}>Confirm with delivery photo</Text>
              </TouchableOpacity>
              <Text style={styles.photoNote}>
                Use this only if the recipient can’t give the code. The photo is logged as proof of delivery.
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* Fail modal */}
      <Modal visible={!!failModal} transparent animationType="fade" onRequestClose={() => setFailModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Mark delivery failed</Text>
            <Text style={styles.modalSub}>Pick a reason so dispatch can re-pool or follow up.</Text>
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {FAILURE_REASONS.map((r) => {
                const active = failReason === r;
                return (
                  <TouchableOpacity
                    key={r}
                    style={[styles.reason, active && styles.reasonActive]}
                    onPress={() => setFailReason(r)}
                  >
                    <Ionicons
                      name={active ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={active ? colors.danger : colors.subtle}
                    />
                    <Text style={[styles.reasonText, active && styles.reasonTextActive]}>{r}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              value={failNote}
              onChangeText={setFailNote}
              placeholder={failReason === 'Other' ? 'Describe the reason…' : 'Add a note (optional)'}
              placeholderTextColor={colors.subtle}
              style={styles.noteInput}
            />
            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setFailModal(null)} disabled={busy}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalFail} onPress={confirmFail} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalConfirmText}>Mark failed</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 6 },
  emptyTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.text, marginTop: 6 },
  emptySub: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  refreshBtn: { marginTop: spacing.md },
  refreshText: { color: colors.success, fontFamily: fonts.semibold, textDecorationLine: 'underline' },

  scanBox: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
    gap: 6,
  },
  scanTitle: { fontSize: 15, fontFamily: fonts.semibold, color: colors.text },
  scanSub: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  scanRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  scanInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    fontFamily: fonts.regular,
  },
  scanBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    justifyContent: 'center',
    minWidth: 80,
    alignItems: 'center',
  },
  scanBtnText: { color: '#fff', fontFamily: fonts.bold, fontSize: 14 },
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    minHeight: 40,
  },
  recordText: { color: colors.primaryDark, fontFamily: fonts.semibold, fontSize: 13.5 },
  scanCameraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingVertical: 12,
    marginTop: spacing.sm,
  },
  scannerWrap: { flex: 1, backgroundColor: '#000' },
  scannerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  scannerHint: {
    color: '#fff',
    fontFamily: fonts.medium,
    fontSize: 14,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  scannerClose: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: radius.full,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },

  header: {
    backgroundColor: '#0f172a',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  headerKicker: { color: 'rgba(255,255,255,0.6)', fontSize: 11, letterSpacing: 2, fontFamily: fonts.bold },
  headerTitle: { color: '#fff', fontSize: 20, fontFamily: fonts.bold, marginTop: 2 },
  headerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },

  map: { width: '100%', height: 240 },
  mapPlaceholder: {
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: spacing.xl,
  },
  muted: { fontSize: 13, color: colors.muted },
  riderPin: {
    backgroundColor: colors.success,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  stopPin: {
    backgroundColor: '#0f172a',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  stopPinText: { color: '#fff', fontSize: 12, fontFamily: fonts.bold },

  body: { padding: spacing.lg, gap: spacing.md },
  stopCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    backgroundColor: colors.bg,
  },
  stopCardDone: { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' },
  stopCardFailed: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  stopTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  stopSeq: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSeqText: { color: '#fff', fontFamily: fonts.bold, fontSize: 14 },
  stopName: { fontSize: 15, fontFamily: fonts.bold, color: colors.text },
  stopLandmark: { fontSize: 12, color: colors.muted, marginTop: 2 },
  stopPlace: { fontSize: 12, color: colors.subtle, marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontFamily: fonts.bold },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  actionOutline: {
    flexGrow: 1,
    flexBasis: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 10,
  },
  actionOutlineText: { fontSize: 12, fontFamily: fonts.semibold, color: colors.text },
  actionBtn: {
    flexGrow: 1,
    flexBasis: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.md,
    paddingVertical: 10,
  },
  actionArriving: { backgroundColor: colors.warning },
  actionDeliver: { backgroundColor: colors.success },
  actionBtnText: { fontSize: 12, fontFamily: fonts.bold, color: '#fff' },
  actionFail: {
    flexBasis: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: radius.md,
    paddingVertical: 10,
  },
  actionFailText: { fontSize: 12, fontFamily: fonts.semibold, color: colors.danger },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
  },
  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.lg,
    paddingVertical: 15,
  },
  trackBtnStart: { backgroundColor: colors.success },
  trackBtnStop: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  trackText: { color: '#fff', fontFamily: fonts.bold, fontSize: 14 },
  trackTextStop: { color: colors.danger },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.xl,
  },
  modalTitle: { fontSize: 18, fontFamily: fonts.bold, color: colors.text },
  modalSub: { fontSize: 13, color: colors.muted, marginTop: 4 },
  otpInput: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 14,
    textAlign: 'center',
    fontSize: 30,
    fontFamily: fonts.bold,
    letterSpacing: 12,
    color: colors.text,
  },
  modalRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  modalCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelText: { color: colors.muted, fontFamily: fonts.semibold },
  modalConfirm: {
    flex: 1,
    backgroundColor: colors.success,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalConfirmText: { color: '#fff', fontFamily: fonts.bold },
  modalFail: {
    flex: 1,
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  photoDivider: { marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  photoHint: { fontSize: 12, color: colors.muted, marginBottom: spacing.sm },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
  },
  photoBtnText: { fontSize: 13, fontFamily: fonts.semibold, color: colors.text },
  photoNote: { fontSize: 11, color: colors.subtle, marginTop: 6 },

  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  reasonActive: { borderColor: '#fca5a5', backgroundColor: '#fef2f2' },
  reasonText: { fontSize: 13, color: colors.muted },
  reasonTextActive: { color: colors.danger, fontFamily: fonts.semibold },
  noteInput: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
  },
});

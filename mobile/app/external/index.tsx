// External-seller (delivery partner) console — the mobile equivalent of the web's
// components/external/ExternalDashboard. Lists the partner's booked deliveries with
// live status, payment state, redeemable pooling credit, and per-delivery actions:
// track live, share the public tracking link, view the label summary, and upload a
// payment proof. Official documents (invoice, label, receipts) are staff-issued.
// Booking lives on the separate /external/book screen.
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  getExternalDeliveries,
  trackingLink,
  type ExternalDelivery,
} from '@/api/externalDelivery';
import { uploadPaymentProof } from '@/api/orders';
import { getPaymentConfig } from '@/api/paymentConfig';
import { useMyRole, canAccessExternalSeller } from '@/hooks/useMyRole';
import { EmptyState, Loader, Money } from '@/components/ui';
import { formatPrice } from '@/constants';
import type { PaymentConfig } from '@/api/types';
import { colors, fonts, radius, spacing } from '@/theme';

const DELIVERY_BADGE: Record<string, { bg: string; fg: string }> = {
  PENDING_INTAKE: { bg: '#f1f5f9', fg: '#475569' },
  SORTING: { bg: '#e0e7ff', fg: '#4338ca' },
  IN_TRANSIT: { bg: '#dbeafe', fg: '#1d4ed8' },
  ARRIVING: { bg: '#fef3c7', fg: '#b45309' },
  DELIVERED: { bg: '#dcfce7', fg: '#15803d' },
  FAILED: { bg: '#fee2e2', fg: '#b91c1c' },
};

function paymentState(d: ExternalDelivery): { label: string; bg: string; fg: string } {
  if (d.isPaid) return { label: 'Paid', bg: '#dcfce7', fg: '#15803d' };
  if (d.paymentStatus === 'EXPIRED') return { label: 'Expired — not paid in time', bg: '#fee2e2', fg: '#b91c1c' };
  if (d.paymentProofStatus === 'SUBMITTED') return { label: 'Payment under review', bg: '#fef3c7', fg: '#b45309' };
  if (d.paymentProofStatus === 'REJECTED') return { label: 'Payment rejected — re-upload', bg: '#fee2e2', fg: '#b91c1c' };
  return { label: 'Awaiting payment', bg: '#f1f5f9', fg: '#475569' };
}

const qrUrl = (link: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(link)}`;

export default function ExternalDashboardScreen() {
  const router = useRouter();
  const { role, loading: roleLoading } = useMyRole();
  const allowed = canAccessExternalSeller(role);

  const [deliveries, setDeliveries] = useState<ExternalDelivery[]>([]);
  const [creditBalance, setCreditBalance] = useState(0);
  const [momo, setMomo] = useState<PaymentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [labelView, setLabelView] = useState<ExternalDelivery | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([getExternalDeliveries(), getPaymentConfig().catch(() => null)]);
      setDeliveries(d.deliveries || []);
      setCreditBalance(d.creditBalance || 0);
      setMomo(p);
    } catch {
      // surfaced via empty state
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!allowed) return;
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [allowed, load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const shareLink = async (d: ExternalDelivery) => {
    const link = trackingLink(d.orderId, d.trackingToken);
    try {
      await Share.share({ message: `Track your delivery with The Quality Market: ${link}`, url: link });
    } catch {
      /* user dismissed */
    }
  };

  const uploadProof = async (orderId: string) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos needed', 'Allow photo access to attach your payment proof.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setUploadingId(orderId);
    try {
      await uploadPaymentProof(orderId, {
        uri: asset.uri,
        name: asset.fileName ?? `proof-${orderId}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
      Alert.alert('Proof submitted', 'Your payment proof is awaiting review.');
      await load();
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message ?? 'Try again.');
    } finally {
      setUploadingId(null);
    }
  };

  if (roleLoading || (allowed && loading)) return <Loader />;

  if (!allowed) {
    return (
      <EmptyState
        icon="cube-outline"
        title="Delivery partners only"
        subtitle="Enable delivery access on thequalitymarket.com to book and track deliveries."
      />
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {creditBalance > 0 ? (
          <View style={styles.creditBanner}>
            <Ionicons name="wallet-outline" size={18} color="#15803d" />
            <Text style={styles.creditText}>
              You have <Text style={styles.creditAmount}>{formatPrice(creditBalance)}</Text> in delivery credit from pooling
              savings — applied automatically to new bookings.
            </Text>
          </View>
        ) : null}

        {momo?.momoConfigured ? (
          <View style={styles.momoBanner}>
            <Text style={styles.momoText}>
              Pay the delivery fee to MoMo <Text style={styles.momoBold}>{momo.momoPayCode}</Text>
              {momo.momoAccountName ? ` (${momo.momoAccountName})` : ''}, then upload your proof on the delivery below.
            </Text>
          </View>
        ) : null}

        {momo?.ekashConfigured ? (
          <View style={styles.momoBanner}>
            <Text style={styles.momoText}>
              Pay the delivery fee via eKash to <Text style={styles.momoBold}>{momo.ekashNumber}</Text>
              {momo.ekashAccountName ? ` (${momo.ekashAccountName})` : ''}, then upload your proof on the delivery below.
            </Text>
          </View>
        ) : null}

        {deliveries.length === 0 ? (
          <EmptyState
            icon="cube-outline"
            title="No deliveries yet"
            subtitle="Book your first delivery with the button below."
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {deliveries.map((d) => {
              const pay = paymentState(d);
              const delivery = d.deliveryStatus ? DELIVERY_BADGE[d.deliveryStatus] : null;
              const needsProof =
                !d.isPaid && d.paymentStatus !== 'EXPIRED' && d.paymentProofStatus !== 'SUBMITTED';
              return (
                <View key={d.orderId} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.recipient}>{d.recipientName ?? 'Recipient'}</Text>
                      <Text style={styles.sector}>{d.recipientSector ?? '—'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      {delivery ? (
                        <View style={[styles.badge, { backgroundColor: delivery.bg }]}>
                          <Text style={[styles.badgeText, { color: delivery.fg }]}>{d.deliveryStatus}</Text>
                        </View>
                      ) : null}
                      <View style={[styles.badge, { backgroundColor: pay.bg }]}>
                        <Text style={[styles.badgeText, { color: pay.fg }]}>{pay.label}</Text>
                      </View>
                    </View>
                  </View>

                  {d.packageDescription ? <Text style={styles.pkg}>{d.packageDescription}</Text> : null}

                  <View style={styles.feeRow}>
                    <Text style={styles.feeText}>
                      Fee <Money value={d.total} style={styles.feeAmount} />
                    </Text>
                    {d.deliveryOtp ? <Text style={styles.otp}>Code {d.deliveryOtp}</Text> : null}
                  </View>

                  {d.creditApplied > 0 || d.poolingSavings ? (
                    <Text style={styles.savings}>
                      {d.creditApplied > 0
                        ? `Credit −${formatPrice(d.creditApplied)}${d.amountDue > 0 ? ` · pay ${formatPrice(d.amountDue)}` : ' · fully covered'}`
                        : ''}
                      {d.creditApplied > 0 && d.poolingSavings ? '  ·  ' : ''}
                      {d.poolingSavings ? `Saved ${formatPrice(d.poolingSavings)} by pooling` : ''}
                    </Text>
                  ) : null}

                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={styles.action}
                      onPress={() => router.push({ pathname: '/track/[orderId]', params: { orderId: d.orderId } })}
                    >
                      <Ionicons name="location-outline" size={15} color={colors.text} />
                      <Text style={styles.actionText}>Track</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.action} onPress={() => shareLink(d)}>
                      <Ionicons name="share-outline" size={15} color={colors.text} />
                      <Text style={styles.actionText}>Share</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.action} onPress={() => setLabelView(d)}>
                      <Ionicons name="document-text-outline" size={15} color={colors.text} />
                      <Text style={styles.actionText}>Label</Text>
                    </TouchableOpacity>
                  </View>

                  {needsProof ? (
                    <TouchableOpacity
                      style={styles.proofBtn}
                      onPress={() => uploadProof(d.orderId)}
                      disabled={uploadingId === d.orderId}
                    >
                      {uploadingId === d.orderId ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Ionicons name="cloud-upload-outline" size={15} color="#fff" />
                          <Text style={styles.proofBtnText}>Upload payment proof</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Book CTA + public departure schedule */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.bookBtn} onPress={() => router.push('/external/book')} activeOpacity={0.85}>
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={styles.bookBtnText}>Book a delivery</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.scheduleLink}
          onPress={() => router.push('/schedule')}
          accessibilityRole="button"
        >
          <Ionicons name="calendar-outline" size={14} color={colors.primaryDark} />
          <Text style={styles.scheduleLinkText}>Rider departure schedule</Text>
        </TouchableOpacity>
      </View>

      {/* Label modal */}
      <Modal visible={!!labelView} animationType="slide" transparent onRequestClose={() => setLabelView(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Delivery label</Text>
              <TouchableOpacity onPress={() => setLabelView(null)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            {labelView ? (
              <ScrollView contentContainerStyle={{ padding: spacing.lg, alignItems: 'center' }}>
                <Image
                  source={{ uri: qrUrl(trackingLink(labelView.orderId, labelView.trackingToken)) }}
                  style={styles.qr}
                  alt="Tracking QR code"
                />
                <Text style={styles.labelTracking}>{labelView.orderId}</Text>
                <View style={styles.labelDetails}>
                  <LabelRow label="Recipient" value={labelView.recipientName ?? '—'} />
                  <LabelRow label="Phone" value={labelView.recipientPhone ?? '—'} />
                  <LabelRow label="Sector" value={labelView.recipientSector ?? '—'} />
                  {labelView.deliveryOtp ? <LabelRow label="Delivery code" value={labelView.deliveryOtp} /> : null}
                  {labelView.packageDescription ? <LabelRow label="Package" value={labelView.packageDescription} /> : null}
                </View>

                <TouchableOpacity style={styles.labelShare} onPress={() => shareLink(labelView)}>
                  <Ionicons name="share-outline" size={16} color={colors.text} />
                  <Text style={styles.labelShareText}>Share tracking link</Text>
                </TouchableOpacity>
                <Text style={styles.labelNote}>
                  The official label, invoice and receipts are printed by The Quality Market staff at intake and delivery.
                </Text>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function LabelRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.labelRowLabel}>{label}</Text>
      <Text style={styles.labelRowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  creditBanner: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  creditText: { flex: 1, fontSize: 13, color: '#166534', lineHeight: 19 },
  creditAmount: { fontFamily: fonts.bold },

  momoBanner: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  momoText: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  momoBold: { fontFamily: fonts.bold, color: colors.text },

  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  recipient: { fontSize: 15, fontFamily: fonts.bold, color: colors.text },
  sector: { fontSize: 12, color: colors.muted, marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontFamily: fonts.bold },
  pkg: { fontSize: 13, color: colors.muted, marginTop: spacing.sm },

  feeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  feeText: { fontSize: 14, color: colors.text },
  feeAmount: { fontSize: 14 },
  otp: { fontSize: 13, fontFamily: fonts.bold, color: colors.text, letterSpacing: 2 },
  savings: { fontSize: 12, color: colors.success, marginTop: 4 },

  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 9,
  },
  actionText: { fontSize: 13, fontFamily: fonts.semibold, color: colors.text },

  proofBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0f172a',
    borderRadius: radius.md,
    paddingVertical: 11,
    marginTop: spacing.sm,
  },
  proofBtnText: { color: '#fff', fontFamily: fonts.bold, fontSize: 14 },

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
  bookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.success,
    borderRadius: radius.lg,
    paddingVertical: 15,
  },
  bookBtnText: { color: '#fff', fontFamily: fonts.bold, fontSize: 15 },
  scheduleLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: spacing.sm + 2,
    minHeight: 32,
  },
  scheduleLinkText: { color: colors.primaryDark, fontFamily: fonts.semibold, fontSize: 13 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.text },
  qr: { width: 200, height: 200, marginBottom: spacing.md },
  labelTracking: { fontSize: 16, fontFamily: fonts.bold, color: colors.text, letterSpacing: 1, marginBottom: spacing.lg },
  labelDetails: { alignSelf: 'stretch', gap: 8, marginBottom: spacing.lg },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  labelRowLabel: { fontSize: 13, color: colors.muted },
  labelRowValue: { fontSize: 13, fontFamily: fonts.bold, color: colors.text, flexShrink: 1, textAlign: 'right' },
  labelShare: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
  },
  labelShareText: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text },
  labelNote: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: spacing.md, lineHeight: 17 },
});

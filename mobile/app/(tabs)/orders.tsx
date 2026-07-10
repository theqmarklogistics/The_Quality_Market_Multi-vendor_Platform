// My Orders: list with status, items, payment-proof upload, and rating for
// delivered items. Pooled-delivery live tracking arrives in Phase 2.
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import * as ImagePicker from 'expo-image-picker';
import { getOrders, uploadPaymentProof } from '@/api/orders';
import { createConversation } from '@/api/chat';
import type { Order } from '@/api/types';
import { Badge, Button, EmptyState, Loader, Money } from '@/components/ui';
import { RatingModal } from '@/components/RatingModal';
import { SignedOutGate } from '@/components/SignedOutGate';
import { formatPrice } from '@/constants';
import { colors, fonts, radius, shadows, spacing } from '@/theme';

const statusTone: Record<string, 'warning' | 'info' | 'brand' | 'success' | 'neutral'> = {
  ORDER_PLACED: 'warning',
  PROCESSING: 'info',
  SHIPPED: 'brand',
  DELIVERED: 'success',
  OTHER: 'neutral',
};

export default function OrdersScreen() {
  return (
    <SignedOutGate
      title="Sign in to see your orders"
      subtitle="Your orders, delivery tracking and payment proofs live here once you're signed in."
    >
      <OrdersScreenInner />
    </SignedOutGate>
  );
}

function OrdersScreenInner() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [rateTarget, setRateTarget] = useState<{
    orderId: string;
    productId: string;
    productName: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await getOrders();
      setOrders(res.orders);
    } catch {
      // keep previous list; surfaced via empty state if nothing loaded
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const uploadProof = useCallback(
    async (orderId: string) => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo access to upload payment proof.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setUploadingId(orderId);
      try {
        await uploadPaymentProof(orderId, {
          uri: asset.uri,
          name: asset.fileName ?? `proof-${Date.now()}.jpg`,
          mimeType: asset.mimeType ?? 'image/jpeg',
        });
        Alert.alert('Uploaded', 'Payment proof submitted for review.');
        await load();
      } catch (err: any) {
        Alert.alert('Upload failed', err?.message ?? 'Please try again.');
      } finally {
        setUploadingId(null);
      }
    },
    [load],
  );

  const messageSeller = useCallback(
    async (order: Order) => {
      try {
        const { conversation } = await createConversation({
          targetType: 'STORE',
          orderId: order.id,
        });
        router.push({
          pathname: '/conversation/[id]',
          params: { id: conversation.id },
        });
      } catch (err: any) {
        Alert.alert('Could not open chat', err?.message ?? 'Try again.');
      }
    },
    [router],
  );

  if (loading) return <Loader />;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>My Orders</Text>
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="receipt-outline"
            title="No orders yet"
            subtitle="Your orders will appear here."
            actionLabel="Start shopping"
            onAction={() => router.push('/(tabs)')}
          />
        }
        renderItem={({ item }) => {
          const canUploadProof =
            !item.isPaid &&
            (item.paymentProofStatus === 'NOT_SUBMITTED' ||
              item.paymentProofStatus === 'REJECTED');
          const isDelivered = item.status === 'DELIVERED';

          return (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View>
                  <Text style={styles.orderId}>#{item.id.slice(-8)}</Text>
                  <Text style={styles.date}>
                    {format(new Date(item.createdAt), 'MMM d, yyyy')}
                  </Text>
                </View>
                <Badge
                  label={item.status.replace(/_/g, ' ')}
                  tone={statusTone[item.status] ?? 'neutral'}
                />
              </View>

              {item.orderItems.map((oi) => (
                <View key={String(oi.id)} style={styles.itemRow}>
                  <Image
                    source={{ uri: oi.product?.images?.[0] }}
                    style={styles.thumb}
                    alt={oi.product?.name ?? 'Product'}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {oi.product?.name ?? 'Product'}
                    </Text>
                    <Text style={styles.itemMeta}>
                      Qty {oi.quantity} · {formatPrice(oi.price)}
                    </Text>
                  </View>
                  {isDelivered ? (
                    <TouchableOpacity
                      style={styles.rateBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Rate ${oi.product?.name ?? 'product'}`}
                      onPress={() =>
                        setRateTarget({
                          orderId: item.id,
                          productId: oi.productId,
                          productName: oi.product?.name ?? 'product',
                        })
                      }
                    >
                      <Ionicons name="star" size={13} color={colors.primaryDark} />
                      <Text style={styles.rateText}>Rate</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}

              <View style={styles.totalRow}>
                <Text style={styles.muted}>Total</Text>
                <Money value={item.total} />
              </View>

              {/* Payment */}
              <View style={styles.payRow}>
                <View style={styles.payState}>
                  <Ionicons
                    name={item.isPaid ? 'checkmark-circle' : 'time-outline'}
                    size={15}
                    color={item.isPaid ? colors.success : colors.warning}
                  />
                  <Text style={styles.muted}>
                    Payment: {item.isPaid ? 'Paid' : item.paymentStatus}
                  </Text>
                </View>
                {item.paymentProofStatus !== 'NOT_SUBMITTED' ? (
                  <Text style={styles.proofStatus}>
                    Proof: {item.paymentProofStatus.replace(/_/g, ' ')}
                  </Text>
                ) : null}
              </View>
              {canUploadProof ? (
                <Button
                  label="Upload payment proof"
                  variant="outline"
                  size="md"
                  icon="cloud-upload-outline"
                  onPress={() => uploadProof(item.id)}
                  loading={uploadingId === item.id}
                />
              ) : null}

              {/* Delivery */}
              {item.deliveryType === 'KIGALI_POOL' ? (
                <View style={styles.deliveryBox}>
                  <View style={styles.deliveryHead}>
                    <Ionicons name="bicycle-outline" size={15} color={colors.primaryDark} />
                    <Text style={styles.deliveryLabel}>
                      Pooled delivery: {(item.deliveryStatus ?? 'PENDING_INTAKE').replace(/_/g, ' ')}
                    </Text>
                  </View>
                  {item.deliveryOtp ? (
                    <View style={styles.otpRow}>
                      <Text style={styles.otpLabel}>Delivery code</Text>
                      <Text style={styles.otp}>{item.deliveryOtp}</Text>
                    </View>
                  ) : null}
                  <TouchableOpacity
                    style={styles.linkBtn}
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({ pathname: '/track/[orderId]', params: { orderId: item.id } })
                    }
                  >
                    <Ionicons name="navigate" size={16} color={colors.primary} />
                    <Text style={styles.linkText}>Track delivery</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {item.storeId ? (
                <TouchableOpacity
                  style={styles.linkBtn}
                  accessibilityRole="button"
                  onPress={() => messageSeller(item)}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primary} />
                  <Text style={styles.linkText}>Message seller</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        }}
      />

      {rateTarget ? (
        <RatingModal
          visible
          orderId={rateTarget.orderId}
          productId={rateTarget.productId}
          productName={rateTarget.productName}
          onClose={() => setRateTarget(null)}
          onSubmitted={load}
        />
      ) : null}
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
  list: { padding: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orderId: { fontSize: 15, fontFamily: fonts.bold, color: colors.text },
  date: { fontSize: 12, color: colors.subtle, marginTop: 1, fontFamily: fonts.regular },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  thumb: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.card },
  itemName: { fontSize: 14, color: colors.text, fontFamily: fonts.medium },
  itemMeta: { fontSize: 12, color: colors.muted, fontFamily: fonts.regular },
  rateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    minHeight: 34,
  },
  rateText: { fontSize: 12.5, color: colors.primaryDark, fontFamily: fonts.semibold },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.sm,
  },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payState: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  muted: { fontSize: 13, color: colors.muted, fontFamily: fonts.regular },
  proofStatus: { fontSize: 12.5, color: colors.body, fontFamily: fonts.semibold },
  deliveryBox: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  deliveryHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deliveryLabel: { fontSize: 13, color: colors.primaryDark, fontFamily: fonts.semibold },
  otpRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  otpLabel: { fontSize: 12, color: colors.muted, fontFamily: fonts.regular },
  otp: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.text,
    letterSpacing: 3,
    fontVariant: ['tabular-nums'],
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    minHeight: 32,
  },
  linkText: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 14 },
});

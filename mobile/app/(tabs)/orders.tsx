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
import * as ImagePicker from 'expo-image-picker';
import { getOrders, uploadPaymentProof } from '@/api/orders';
import { createConversation } from '@/api/chat';
import type { Order } from '@/api/types';
import { Button, EmptyState, Loader, Money } from '@/components/ui';
import { RatingModal } from '@/components/RatingModal';
import { formatPrice } from '@/constants';
import { colors, radius, spacing } from '@/theme';

const statusColor: Record<string, string> = {
  ORDER_PLACED: colors.warning,
  PROCESSING: colors.warning,
  SHIPPED: colors.primary,
  DELIVERED: colors.success,
  OTHER: colors.muted,
};

export default function OrdersScreen() {
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <EmptyState icon="receipt-outline" title="No orders yet" subtitle="Your orders will appear here." />
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
                <Text style={styles.orderId}>#{item.id.slice(-8)}</Text>
                <View style={[styles.badge, { backgroundColor: statusColor[item.status] ?? colors.muted }]}>
                  <Text style={styles.badgeText}>{item.status.replace('_', ' ')}</Text>
                </View>
              </View>
              <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>

              {item.orderItems.map((oi) => (
                <View key={String(oi.id)} style={styles.itemRow}>
                  <Image source={{ uri: oi.product?.images?.[0] }} style={styles.thumb} />
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
                      onPress={() =>
                        setRateTarget({
                          orderId: item.id,
                          productId: oi.productId,
                          productName: oi.product?.name ?? 'product',
                        })
                      }
                    >
                      <Ionicons name="star-outline" size={14} color={colors.text} />
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
                <Text style={styles.muted}>
                  Payment: {item.isPaid ? 'Paid' : item.paymentStatus}
                </Text>
                {item.paymentProofStatus !== 'NOT_SUBMITTED' ? (
                  <Text style={styles.proofStatus}>Proof: {item.paymentProofStatus}</Text>
                ) : null}
              </View>
              {canUploadProof ? (
                <Button
                  label="Upload payment proof"
                  variant="outline"
                  onPress={() => uploadProof(item.id)}
                  loading={uploadingId === item.id}
                />
              ) : null}

              {/* Delivery */}
              {item.deliveryType === 'KIGALI_POOL' ? (
                <View style={styles.deliveryBox}>
                  <Text style={styles.muted}>
                    Pooled delivery: {item.deliveryStatus ?? 'PENDING_INTAKE'}
                  </Text>
                  {item.deliveryOtp ? (
                    <Text style={styles.otp}>Delivery code: {item.deliveryOtp}</Text>
                  ) : null}
                  <TouchableOpacity
                    style={styles.linkBtn}
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
                <TouchableOpacity style={styles.linkBtn} onPress={() => messageSeller(item)}>
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
  title: { fontSize: 24, fontWeight: '700', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  list: { padding: spacing.lg, gap: spacing.md },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { fontSize: 15, fontWeight: '700', color: colors.text },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  date: { fontSize: 12, color: colors.subtle },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  thumb: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.card },
  itemName: { fontSize: 14, color: colors.text },
  itemMeta: { fontSize: 12, color: colors.muted },
  rateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rateText: { fontSize: 12, color: colors.text },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  muted: { fontSize: 13, color: colors.muted },
  proofStatus: { fontSize: 13, color: colors.text, fontWeight: '600' },
  deliveryBox: {
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 4,
  },
  otp: { fontSize: 15, fontWeight: '800', color: colors.text, letterSpacing: 2 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  linkText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
});

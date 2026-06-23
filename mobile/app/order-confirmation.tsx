// Post-checkout: confirms the order(s) and shows payment instructions. For MTN MoMo
// we surface the pay code from /api/payment-config; for bank transfer we point the
// user to request an invoice. Payment proof is uploaded later from the Orders tab.
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getPaymentConfig } from '@/api/paymentConfig';
import type { PaymentConfig } from '@/api/types';
import { Button } from '@/components/ui';
import { PaymentMethod } from '@/constants';
import { colors, radius, spacing } from '@/theme';

export default function ConfirmationScreen() {
  const router = useRouter();
  const { ids, payment } = useLocalSearchParams<{ ids: string; payment: string }>();
  const orderIds = (ids ?? '').split(',').filter(Boolean);
  const isMomo = payment === PaymentMethod.MTN_MOMO;

  const [config, setConfig] = useState<PaymentConfig | null>(null);

  useEffect(() => {
    getPaymentConfig().then(setConfig).catch(() => {});
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.iconWrap}>
        <Ionicons name="checkmark-circle" size={64} color={colors.success} />
      </View>
      <Text style={styles.title}>Order placed!</Text>
      <Text style={styles.subtitle}>
        {orderIds.length > 1
          ? `${orderIds.length} orders created (split by seller).`
          : 'Your order has been created.'}
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Payment instructions</Text>
        {isMomo ? (
          config?.momoConfigured ? (
            <>
              <Text style={styles.line}>
                Pay with MTN Mobile Money to:
              </Text>
              <Text style={styles.payCode}>{config.momoPayCode}</Text>
              <Text style={styles.line}>{config.momoAccountName}</Text>
              <Text style={styles.hint}>
                After paying, upload your payment screenshot from the Orders tab so we can
                verify it faster.
              </Text>
            </>
          ) : (
            <Text style={styles.line}>
              MoMo details will be shared shortly. You can also upload your payment proof
              from the Orders tab once paid.
            </Text>
          )
        ) : (
          <Text style={styles.line}>
            For bank transfer, request an invoice from the Orders tab to receive the bank
            details, then upload your payment proof after transferring.
          </Text>
        )}
      </View>

      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        <Button label="View my orders" onPress={() => router.replace('/(tabs)/orders')} />
        <Button
          label="Continue shopping"
          variant="outline"
          onPress={() => router.replace('/(tabs)')}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  iconWrap: { alignItems: 'center', marginTop: spacing.xl },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginTop: spacing.md },
  subtitle: { fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: 4 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.xl,
    backgroundColor: colors.card,
    gap: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  line: { fontSize: 14, color: colors.text, lineHeight: 20 },
  payCode: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 1,
    marginVertical: 4,
  },
  hint: { fontSize: 13, color: colors.muted, marginTop: 6, lineHeight: 19 },
});

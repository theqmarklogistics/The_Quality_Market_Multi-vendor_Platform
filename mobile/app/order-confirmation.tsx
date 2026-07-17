// Post-checkout: confirms the order(s) and shows payment instructions. For MTN MoMo
// and eKash we surface the pay code / number from /api/payment-config; for bank
// transfer we point the user to request an invoice. Payment proof is uploaded later
// from the Orders tab.
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getPaymentConfig } from '@/api/paymentConfig';
import type { PaymentConfig } from '@/api/types';
import { Button } from '@/components/ui';
import { BrandLogo } from '@/components/BrandLogo';
import { PaymentMethod } from '@/constants';
import { colors, fonts, radius, shadows, spacing } from '@/theme';

export default function ConfirmationScreen() {
  const router = useRouter();
  const { ids, payment } = useLocalSearchParams<{ ids: string; payment: string }>();
  const orderIds = (ids ?? '').split(',').filter(Boolean);
  const isMomo = payment === PaymentMethod.MTN_MOMO;
  const isEkash = payment === PaymentMethod.EKASH;

  const [config, setConfig] = useState<PaymentConfig | null>(null);

  useEffect(() => {
    getPaymentConfig().then(setConfig).catch(() => {});
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BrandLogo direction="row" size={26} gap={7} showWordmark wordmarkSize={16} style={styles.brand} />
      <View style={styles.iconWrap}>
        <View style={styles.iconCircle}>
          <Ionicons name="checkmark" size={44} color={colors.primaryText} />
        </View>
      </View>
      <Text style={styles.title}>Order placed!</Text>
      <Text style={styles.subtitle}>
        {orderIds.length > 1
          ? `${orderIds.length} orders created (split by seller).`
          : 'Your order has been created.'}
      </Text>

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Ionicons name="wallet-outline" size={18} color={colors.primary} />
          <Text style={styles.cardTitle}>Payment instructions</Text>
        </View>
        {isMomo ? (
          config?.momoConfigured ? (
            <>
              <Text style={styles.line}>Pay with MTN Mobile Money to:</Text>
              <View style={styles.payCodeBox}>
                <Text style={styles.payCode}>{config.momoPayCode}</Text>
                <Text style={styles.payName}>{config.momoAccountName}</Text>
              </View>
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
        ) : isEkash ? (
          config?.ekashConfigured ? (
            <>
              <Text style={styles.line}>Send your payment via eKash to:</Text>
              <View style={styles.payCodeBox}>
                <Text style={styles.payCode}>{config.ekashNumber}</Text>
                {config.ekashAccountName ? (
                  <Text style={styles.payName}>{config.ekashAccountName}</Text>
                ) : null}
              </View>
              <Text style={styles.hint}>
                After paying, upload your payment screenshot from the Orders tab so we can
                verify it faster.
              </Text>
            </>
          ) : (
            <Text style={styles.line}>
              eKash details will be shared shortly. You can also upload your payment proof
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

      {/* What happens next */}
      <View style={styles.steps}>
        <Step n={1} icon="cash-outline" label="Pay with the details above" />
        <Step n={2} icon="cloud-upload-outline" label="Upload proof from the Orders tab" />
        <Step n={3} icon="bicycle-outline" label="We verify & dispatch your order" />
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

function Step({
  n,
  icon,
  label,
}: {
  n: number;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.stepIcon}>
        <Ionicons name={icon} size={18} color={colors.primaryDark} />
      </View>
      <Text style={styles.stepNum}>Step {n}</Text>
      <Text style={styles.stepLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  brand: { alignSelf: 'center', marginTop: spacing.sm, opacity: 0.9 },
  iconWrap: { alignItems: 'center', marginTop: spacing.lg },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 8,
    borderColor: colors.primaryTint,
  },
  title: {
    fontSize: 26,
    fontFamily: fonts.bold,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 4,
    fontFamily: fonts.regular,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    gap: 8,
    ...shadows.card,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text },
  line: { fontSize: 14, color: colors.body, lineHeight: 21, fontFamily: fonts.regular },
  payCodeBox: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  payCode: {
    fontSize: 26,
    fontFamily: fonts.bold,
    color: colors.primaryDark,
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },
  payName: { fontSize: 13, color: colors.body, fontFamily: fonts.medium },
  hint: { fontSize: 13, color: colors.muted, marginTop: 2, lineHeight: 19, fontFamily: fonts.regular },
  steps: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  step: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  stepNum: { fontSize: 11, color: colors.primaryDark, fontFamily: fonts.bold },
  stepLabel: {
    fontSize: 11.5,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 15,
    fontFamily: fonts.medium,
  },
});

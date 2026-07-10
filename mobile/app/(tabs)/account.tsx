// Account screen: shows the signed-in user, role-aware dashboard shortcuts (Rider
// console for riders/admins), and sign-out. Sign-out clears the Clerk session, the
// secure-store token cache, the cached role, and this device's push token.
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui';
import { unregisterCurrentPush } from '@/push/registerForPush';
import {
  useMyRole,
  canAccessRider,
  canAccessSeller,
  canAccessExternalSeller,
  canAccessOps,
  canAccessAdmin,
  canAccessFinancial,
  canAccessWarehouse,
  resetRoleCache,
} from '@/hooks/useMyRole';
import { SignedOutGate } from '@/components/SignedOutGate';
import { colors, fonts, radius, shadows, spacing } from '@/theme';

export default function AccountScreen() {
  return (
    <SignedOutGate
      title="You're browsing as a guest"
      subtitle="Sign in or create a free account to place orders, track deliveries and chat with support."
    >
      <AccountScreenInner />
    </SignedOutGate>
  );
}

function AccountScreenInner() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const { role } = useMyRole();
  const [signingOut, setSigningOut] = useState(false);

  const displayName =
    user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Account';
  const initials = (user?.fullName || user?.primaryEmailAddress?.emailAddress || 'A')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      // Unregister this device's push token while we still have a session.
      await unregisterCurrentPush();
      resetRoleCache();
      await signOut();
      router.replace('/(tabs)');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.screenTitle}>Account</Text>

        {/* Profile card */}
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {user?.primaryEmailAddress?.emailAddress}
            </Text>
          </View>
        </View>

        {/* Public rider departure schedule — available to everyone */}
        <View style={{ marginTop: spacing.lg }}>
          <Shortcut
            icon="calendar"
            iconBg={colors.info}
            title="Rider departure schedule"
            subtitle="When riders leave each hub along each corridor"
            onPress={() => router.push('/schedule')}
          />
        </View>

        {/* Role shortcuts */}
        {(canAccessOps(role) ||
          canAccessSeller(role) ||
          canAccessExternalSeller(role) ||
          canAccessRider(role)) && <Text style={styles.groupLabel}>Workspaces</Text>}

        <View style={{ gap: spacing.sm }}>
          {canAccessOps(role) ? (
            <Shortcut
              icon="speedometer"
              iconBg={colors.ink}
              title={canAccessAdmin(role) ? 'Admin console' : 'Dispatch board'}
              subtitle={
                canAccessAdmin(role)
                  ? 'Dashboard, dispatch, payments & approvals'
                  : 'Batch, assign riders & dispatch'
              }
              onPress={() => router.push('/admin')}
            />
          ) : null}

          {canAccessSeller(role) ? (
            <Shortcut
              icon="storefront"
              iconBg={colors.primary}
              title="Seller console"
              subtitle="Products, orders, payouts"
              onPress={() => router.push('/store')}
            />
          ) : null}

          {canAccessExternalSeller(role) ? (
            <Shortcut
              icon="cube"
              iconBg={colors.info}
              title="My deliveries"
              subtitle="Book & track delivery partner orders"
              onPress={() => router.push('/external')}
            />
          ) : null}

          {canAccessRider(role) ? (
            <Shortcut
              icon="bicycle"
              iconBg={colors.primaryDark}
              title="Rider console"
              subtitle="Your route, stops & live tracking"
              onPress={() => router.push('/rider')}
            />
          ) : null}
        </View>

        {/* Full web dashboards — every web feature, embedded in the app */}
        {(canAccessAdmin(role) ||
          canAccessOps(role) ||
          canAccessFinancial(role) ||
          canAccessWarehouse(role) ||
          canAccessSeller(role)) && <Text style={styles.groupLabel}>Full dashboards</Text>}

        <View style={{ gap: spacing.sm }}>
          {canAccessAdmin(role) ? (
            <Shortcut
              icon="globe"
              iconBg={colors.ink}
              title="Admin — full console"
              subtitle="Orders, coupons, returns, payouts, invoices, users, riders, hubs & corridors, banners, newsletter, categories, commissions, shipping, audit"
              onPress={() =>
                router.push({ pathname: '/web-dashboard', params: { path: '/admin', title: 'Admin console' } })
              }
            />
          ) : null}
          {canAccessOps(role) ? (
            <Shortcut
              icon="map"
              iconBg={colors.primaryDark}
              title="Logistics — dispatch board"
              subtitle="Full pooling, corridors, batching & live dispatch"
              onPress={() =>
                router.push({ pathname: '/web-dashboard', params: { path: '/logistics', title: 'Logistics' } })
              }
            />
          ) : null}
          {canAccessFinancial(role) ? (
            <Shortcut
              icon="cash"
              iconBg={colors.info}
              title="Financial operations"
              subtitle="Revenue, escrow, payouts & reconciliation"
              onPress={() =>
                router.push({ pathname: '/web-dashboard', params: { path: '/financial', title: 'Financial' } })
              }
            />
          ) : null}
          {canAccessWarehouse(role) ? (
            <Shortcut
              icon="cube"
              iconBg={colors.primary}
              title="Warehouse dashboard"
              subtitle="Stock intake & warehouse management"
              onPress={() =>
                router.push({ pathname: '/web-dashboard', params: { path: '/warehouse', title: 'Warehouse' } })
              }
            />
          ) : null}
          {canAccessSeller(role) ? (
            <Shortcut
              icon="storefront"
              iconBg={colors.success}
              title="Store — full dashboard"
              subtitle="Everything in the web seller console, incl. chat"
              onPress={() =>
                router.push({ pathname: '/web-dashboard', params: { path: '/store', title: 'Store dashboard' } })
              }
            />
          ) : null}
        </View>

        <View style={styles.signOutWrap}>
          <Button
            label="Sign out"
            variant="outline"
            icon="log-out-outline"
            onPress={onSignOut}
            loading={signingOut}
          />
          <Text style={styles.footerBrand}>
            The Quality <Text style={{ color: colors.primary }}>Market</Text>
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Shortcut({
  icon,
  iconBg,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.shortcut}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={[styles.shortcutIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={20} color={colors.primaryText} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.shortcutTitle}>{title}</Text>
        <Text style={styles.shortcutSub}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.subtle} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  screenTitle: { fontSize: 24, fontFamily: fonts.bold, color: colors.text },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.primaryText, fontSize: 19, fontFamily: fonts.bold },
  name: { fontSize: 18, fontFamily: fonts.bold, color: colors.text },
  email: { fontSize: 13, color: colors.muted, marginTop: 2, fontFamily: fonts.regular },
  groupLabel: {
    fontSize: 13,
    color: colors.subtle,
    fontFamily: fonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  shortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    minHeight: 68,
    ...shadows.card,
  },
  shortcutIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutTitle: { fontSize: 15, fontFamily: fonts.semibold, color: colors.text },
  shortcutSub: { fontSize: 12, color: colors.muted, marginTop: 2, fontFamily: fonts.regular },
  signOutWrap: { marginTop: 'auto', paddingTop: spacing.xl, gap: spacing.md },
  footerBrand: {
    textAlign: 'center',
    fontSize: 13,
    color: colors.subtle,
    fontFamily: fonts.semibold,
  },
});

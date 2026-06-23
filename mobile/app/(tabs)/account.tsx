// Account screen: shows the signed-in user, role-aware dashboard shortcuts (Rider
// console for riders/admins), and sign-out. Sign-out clears the Clerk session, the
// secure-store token cache, the cached role, and this device's push token.
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { unregisterCurrentPush } from '@/push/registerForPush';
import {
  useMyRole,
  canAccessRider,
  canAccessSeller,
  canAccessExternalSeller,
  canAccessOps,
  canAccessAdmin,
  resetRoleCache,
} from '@/hooks/useMyRole';

export default function AccountScreen() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const { role } = useMyRole();
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      // Unregister this device's push token while we still have a session.
      await unregisterCurrentPush();
      resetRoleCache();
      await signOut();
      router.replace('/(auth)/sign-in');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={{ gap: 24 }}>
        <View>
          <Text style={styles.name}>
            {user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Account'}
          </Text>
          <Text style={styles.email}>{user?.primaryEmailAddress?.emailAddress}</Text>
        </View>

        {canAccessOps(role) ? (
          <TouchableOpacity style={styles.shortcut} onPress={() => router.push('/admin')}>
            <View style={[styles.shortcutIcon, { backgroundColor: '#0f172a' }]}>
              <Ionicons name="speedometer" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.shortcutTitle}>
                {canAccessAdmin(role) ? 'Admin console' : 'Dispatch board'}
              </Text>
              <Text style={styles.shortcutSub}>
                {canAccessAdmin(role)
                  ? 'Dashboard, dispatch, payments & approvals'
                  : 'Batch, assign riders & dispatch'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>
        ) : null}

        {canAccessSeller(role) ? (
          <TouchableOpacity style={styles.shortcut} onPress={() => router.push('/store')}>
            <View style={styles.shortcutIcon}>
              <Ionicons name="storefront" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.shortcutTitle}>Seller console</Text>
              <Text style={styles.shortcutSub}>Products, orders, payouts</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>
        ) : null}

        {canAccessExternalSeller(role) ? (
          <TouchableOpacity style={styles.shortcut} onPress={() => router.push('/external')}>
            <View style={styles.shortcutIcon}>
              <Ionicons name="cube" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.shortcutTitle}>My deliveries</Text>
              <Text style={styles.shortcutSub}>Book & track delivery partner orders</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>
        ) : null}

        {canAccessRider(role) ? (
          <TouchableOpacity style={styles.shortcut} onPress={() => router.push('/rider')}>
            <View style={styles.shortcutIcon}>
              <Ionicons name="bicycle" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.shortcutTitle}>Rider console</Text>
              <Text style={styles.shortcutSub}>Your route, stops & live tracking</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>
        ) : null}
      </View>

      <TouchableOpacity
        style={[styles.button, signingOut && styles.buttonDisabled]}
        onPress={onSignOut}
        disabled={signingOut}
      >
        {signingOut ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign out</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'space-between' },
  name: { fontSize: 22, fontWeight: '700' },
  email: { fontSize: 14, color: '#666', marginTop: 4 },
  shortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 14,
  },
  shortcutIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1e8449',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  shortcutSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  button: {
    backgroundColor: '#c0392b',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

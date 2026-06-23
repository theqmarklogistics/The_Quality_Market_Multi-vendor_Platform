// Fetches the signed-in user's role from the existing GET /api/me/role and caches
// it for the session, so role-gated UI (the Rider console shortcut, the rider
// screen's access guard) doesn't refetch on every mount. The cache is cleared on
// sign-out via resetRoleCache (called from the Account screen).
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { getMyRole } from '@/api/me';
import type { UserRole } from '@/constants';

let cachedRole: UserRole | null | undefined; // undefined = not yet loaded
let inFlight: Promise<UserRole | null> | null = null;

export function resetRoleCache(): void {
  cachedRole = undefined;
  inFlight = null;
}

async function loadRole(): Promise<UserRole | null> {
  if (cachedRole !== undefined) return cachedRole;
  if (!inFlight) {
    inFlight = getMyRole()
      .then((r) => {
        cachedRole = r.role;
        return r.role;
      })
      .catch(() => null)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export function useMyRole(): { role: UserRole | null; loading: boolean } {
  const { isLoaded, isSignedIn } = useAuth();
  const [role, setRole] = useState<UserRole | null>(cachedRole ?? null);
  const [loading, setLoading] = useState(cachedRole === undefined);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(cachedRole === undefined);
    loadRole().then((r) => {
      if (active) {
        setRole(r);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn]);

  return { role, loading };
}

// Convenience: who may enter the rider console (mirrors app/rider/page.jsx).
export function canAccessRider(role: UserRole | null): boolean {
  return role === 'RIDER' || role === 'ADMIN';
}

// Who sees the Seller console shortcut. The store API still gates on an approved,
// active store (authSeller) — this only decides whether to surface the entry point.
export function canAccessSeller(role: UserRole | null): boolean {
  return role === 'SELLER' || role === 'ADMIN';
}

// Who sees the Delivery-partner (external-seller) console shortcut.
export function canAccessExternalSeller(role: UserRole | null): boolean {
  return role === 'EXTERNAL_SELLER' || role === 'ADMIN';
}

// Who sees the full Admin console (dashboard, payment review, store approvals).
// The backend's authAdmin still gates every admin endpoint.
export function canAccessAdmin(role: UserRole | null): boolean {
  return role === 'ADMIN';
}

// Who may open the dispatch board / Ops console entry. Mirrors authLogistics:
// a logistics manager or an admin. Logistics managers see only the dispatch board;
// admins additionally get the dashboard, payments and store approvals.
export function canAccessOps(role: UserRole | null): boolean {
  return role === 'ADMIN' || role === 'LOGISTICS_MANAGER';
}

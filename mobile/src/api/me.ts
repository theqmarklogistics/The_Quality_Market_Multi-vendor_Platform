// Current-user endpoints. `getMyRole` is the Phase 0 smoke test: it hits the
// existing GET /api/me/role with the Clerk bearer token to confirm the whole
// auth + API pipeline works end-to-end.
import { apiGet } from './client';
import type { UserRole } from '@/constants';

export interface MyRoleResponse {
  role: UserRole | null;
}

export function getMyRole(): Promise<MyRoleResponse> {
  return apiGet<MyRoleResponse>('/api/me/role');
}

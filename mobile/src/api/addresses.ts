// Address endpoints. lat/long are required by the backend (powers hub distance +
// rider routing), so the add-address UI must capture a pinned location.
import { apiGet, apiPost } from './client';
import type { Address, AddressInput } from './types';

export function getAddresses(): Promise<{ addresses: Address[] }> {
  return apiGet<{ addresses: Address[] }>('/api/address');
}

export function addAddress(
  address: AddressInput,
): Promise<{ newAddress: Address; message: string }> {
  return apiPost<{ newAddress: Address; message: string }>('/api/address', { address });
}

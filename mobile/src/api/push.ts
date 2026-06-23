// Register/unregister this device's Expo push token with the backend.
import { apiPost, api } from './client';

export function registerPushToken(input: {
  token: string;
  platform?: string;
  deviceId?: string;
}): Promise<{ success: boolean }> {
  return apiPost('/api/push/register', input);
}

export async function unregisterPushToken(token: string): Promise<void> {
  // DELETE with a body — axios takes it under `data`.
  await api.delete('/api/push/register', { data: { token } });
}

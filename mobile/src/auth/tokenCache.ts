// Secure token cache for Clerk, backed by expo-secure-store (Keychain / Keystore).
// Clerk uses this to persist the session across app restarts.
import * as SecureStore from 'expo-secure-store';

// Shape Clerk expects for `tokenCache` (defined locally to avoid a version-fragile
// deep import from the Clerk package internals).
interface TokenCache {
  getToken: (key: string) => Promise<string | null | undefined>;
  saveToken: (key: string, token: string) => Promise<void>;
  clearToken?: (key: string) => void | Promise<void>;
}

export const tokenCache: TokenCache = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      // If the stored value is corrupt, drop it so Clerk can re-auth cleanly.
      try {
        await SecureStore.deleteItemAsync(key);
      } catch {}
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Non-fatal: a failed save just means the user re-auths next launch.
    }
  },
  async clearToken(key: string) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {}
  },
};

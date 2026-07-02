// Lightweight crash reporting — no SDK, no new dependency. Fatal JS errors and
// ErrorBoundary catches are POSTed (best-effort) to the backend's
// /api/client-error, which logs them and alerts ops (webhook / email). Reports
// are skipped in dev and locally throttled so an error loop can't spam the API.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { api } from '@/api/client';

const THROTTLE_MS = 60_000; // at most 1 report per error message per minute
const lastSent = new Map<string, number>();

export function reportCrash(
  error: unknown,
  extra: { componentStack?: string; screen?: string; fatal?: boolean } = {},
): void {
  if (__DEV__) return;

  const err = error instanceof Error ? error : new Error(String(error));
  const key = `${err.name}:${err.message}`.slice(0, 160);
  const now = Date.now();
  if (now - (lastSent.get(key) ?? 0) < THROTTLE_MS) return;
  lastSent.set(key, now);

  // Fire-and-forget; a failed report must never cascade.
  api
    .post('/api/client-error', {
      platform: `mobile-${Platform.OS}`,
      name: err.name,
      message: err.message,
      stack: err.stack?.slice(0, 6000),
      componentStack: extra.componentStack?.slice(0, 3000),
      screen: extra.screen,
      appVersion: Constants.expoConfig?.version ?? 'unknown',
    })
    .catch(() => {});
}

/**
 * Install a global handler for uncaught JS errors (outside the render tree,
 * where the ErrorBoundary can't see them). Call once at app start.
 */
export function installGlobalErrorHandler(): void {
  // ErrorUtils is RN's built-in global error hook (not in the TS lib types).
  const errorUtils = (globalThis as any).ErrorUtils;
  if (!errorUtils?.setGlobalHandler) return;

  const previous = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    reportCrash(error, { fatal: !!isFatal });
    previous?.(error, isFatal);
  });
}

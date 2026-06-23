// Rider GPS tracking. Two paths, chosen at runtime:
//
//  • Background (dev/preview/production builds): expo-location's
//    startLocationUpdatesAsync drives an Android foreground service / iOS background
//    location session, so ticks keep flowing with the screen off or the app
//    backgrounded. A TaskManager task posts each tick.
//  • Foreground fallback (Expo Go, or if background perms are denied): a plain
//    watchPositionAsync subscription posts ticks while the console is open.
//
// Both paths funnel through the same throttled poster (LOCATION_MIN_MS, ~10s) and
// notify a single UI listener so the rider's own marker stays fresh on the map.
//
// Auth note: the poster reuses the shared axios client, which carries the Clerk
// bearer via the mounted token bridge. The foreground service keeps the JS process
// (and that bridge) alive in the background; if the OS still kills the process, a
// post may fail and is simply retried on the next tick.
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { postRiderLocation } from '@/api/rider';

export const RIDER_LOCATION_TASK = 'rider-location-updates';
const LOCATION_MIN_MS = 10_000;
const KEEP_AWAKE_TAG = 'rider-tracking';

export type TrackingMode = 'background' | 'foreground';

type PositionListener = (pos: { lat: number; lng: number }) => void;

// --- shared throttled poster -------------------------------------------------
let lastPostAt = 0;
let pendingPos: { lat: number; lng: number } | null = null;
let positionListener: PositionListener | null = null;

export function setPositionListener(cb: PositionListener | null): void {
  positionListener = cb;
}

// Try to flush the latest unsent position. Throttled; on failure the position stays
// queued and the next tick (or the retry timer) reattempts it — covers signal drops
// and a stationary rider whose updates won't fire again.
async function flush(): Promise<void> {
  const pending = pendingPos;
  if (!pending) return;
  const now = Date.now();
  if (now - lastPostAt < LOCATION_MIN_MS) return;
  lastPostAt = now;
  try {
    await postRiderLocation(pending.lat, pending.lng);
    if (pendingPos === pending) pendingPos = null;
  } catch {
    // Leave queued; allow a quicker retry than the normal cadence.
    lastPostAt = now - LOCATION_MIN_MS / 2;
  }
}

function handlePosition(lat: number, lng: number): void {
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    return;
  }
  positionListener?.({ lat, lng });
  pendingPos = { lat, lng };
  void flush();
}

// --- background task ---------------------------------------------------------
// defineTask runs at module load so the task is registered before any tick fires.
let taskDefined = false;
function ensureTaskDefined(): void {
  if (taskDefined) return;
  try {
    TaskManager.defineTask(RIDER_LOCATION_TASK, async ({ data, error }) => {
      if (error) return;
      const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
      const last = locations?.[locations.length - 1];
      if (last) handlePosition(last.coords.latitude, last.coords.longitude);
    });
    taskDefined = true;
  } catch {
    // TaskManager unavailable (e.g. Expo Go) — startTracking falls back to foreground.
  }
}
ensureTaskDefined();

// --- foreground watch + retry timer ------------------------------------------
let foregroundSub: Location.LocationSubscription | null = null;
let retryTimer: ReturnType<typeof setInterval> | null = null;
let activeMode: TrackingMode | null = null;

async function startBackground(): Promise<boolean> {
  ensureTaskDefined();
  if (!taskDefined) return false;
  try {
    // Requesting background permission (and the task itself) is unsupported in
    // Expo Go — any failure here falls back to foreground watching below.
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return false;
    await Location.startLocationUpdatesAsync(RIDER_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: LOCATION_MIN_MS,
      distanceInterval: 15,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Sharing your delivery location',
        notificationBody: 'Customers can see your live position while you’re on route.',
        notificationColor: '#1e8449',
      },
    });
    return true;
  } catch {
    return false;
  }
}

async function startForeground(): Promise<void> {
  foregroundSub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: 5_000, distanceInterval: 10 },
    (pos) => handlePosition(pos.coords.latitude, pos.coords.longitude),
  );
}

export interface StartResult {
  mode: TrackingMode;
}

// Begin sharing location. Resolves with the mode actually started, or throws if
// foreground permission is denied / GPS is unavailable.
export async function startRiderTracking(
  onPosition: PositionListener,
): Promise<StartResult> {
  setPositionListener(onPosition);

  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    throw new Error('Location permission denied. Enable it to share your position.');
  }

  // Reset throttle so the first fix posts immediately.
  lastPostAt = 0;
  pendingPos = null;

  const background = await startBackground();
  if (!background) await startForeground();
  activeMode = background ? 'background' : 'foreground';

  // Flush queued positions even when the rider is stationary.
  if (retryTimer) clearInterval(retryTimer);
  retryTimer = setInterval(() => void flush(), LOCATION_MIN_MS);

  void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});

  return { mode: activeMode };
}

export async function stopRiderTracking(): Promise<void> {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
  if (foregroundSub) {
    foregroundSub.remove();
    foregroundSub = null;
  }
  if (taskDefined) {
    try {
      const running = await Location.hasStartedLocationUpdatesAsync(RIDER_LOCATION_TASK);
      if (running) await Location.stopLocationUpdatesAsync(RIDER_LOCATION_TASK);
    } catch {
      // already stopped / unavailable
    }
  }
  pendingPos = null;
  activeMode = null;
  setPositionListener(null);
  try {
    deactivateKeepAwake(KEEP_AWAKE_TAG);
  } catch {
    // not active
  }
}

export function isTracking(): boolean {
  return activeMode !== null;
}

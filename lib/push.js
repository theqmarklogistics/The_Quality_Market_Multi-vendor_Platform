// Expo push notifications for the mobile app. Best-effort and never throws — safe
// to await inside API routes / notification helpers without guarding every call.
//
// Tokens are stored per device in the PushToken model and registered by the app via
// POST /api/push/register. This is a second delivery channel alongside Resend email
// (SMS remains intentionally disabled — see lib/deliveryNotifications.js).
import prisma from "@/lib/prisma";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Expo's own token format. Guards against junk rows reaching the push service.
function isExpoPushToken(token) {
  return (
    typeof token === "string" &&
    (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["))
  );
}

/**
 * Send a batch of Expo push messages. Returns the Expo tickets (or [] on failure).
 * `messages` is an array of { to, title, body, data?, sound? }.
 */
export async function sendExpoPush(messages) {
  const valid = (Array.isArray(messages) ? messages : []).filter((m) =>
    isExpoPushToken(m?.to)
  );
  if (!valid.length) return [];

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        valid.map((m) => ({
          to: m.to,
          title: m.title,
          body: m.body,
          data: m.data || {},
          sound: m.sound ?? "default",
        }))
      ),
    });
    const json = await res.json().catch(() => ({}));
    return json?.data ?? [];
  } catch (error) {
    console.error("[push] Expo send failed:", error.message);
    return [];
  }
}

/**
 * Look up a user's registered devices and push a notification to all of them.
 * No-op when the user has no tokens. Prunes tokens Expo reports as unregistered.
 *
 * @param {string} userId
 * @param {{ title: string, body: string, data?: object }} payload
 */
export async function notifyUserPush(userId, payload) {
  if (!userId || !payload?.title) return;
  let tokens = [];
  try {
    tokens = await prisma.pushToken.findMany({
      where: { userId },
      select: { token: true },
    });
  } catch (error) {
    console.error("[push] token lookup failed:", error.message);
    return;
  }
  if (!tokens.length) return;

  const tickets = await sendExpoPush(
    tokens.map((t) => ({
      to: t.token,
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
    }))
  );

  // Remove tokens Expo says are no longer valid (app uninstalled / token rotated).
  const dead = [];
  tickets.forEach((ticket, i) => {
    if (ticket?.status === "error" && ticket?.details?.error === "DeviceNotRegistered") {
      dead.push(tokens[i].token);
    }
  });
  if (dead.length) {
    prisma.pushToken
      .deleteMany({ where: { token: { in: dead } } })
      .catch((e) => console.error("[push] prune failed:", e.message));
  }
}

// Provider-agnostic SMS sender for The Quality Market.
//
// SMS is the highest-signal channel for delivery updates in the Rwandan market.
// This module ships a safe MOCK by default (logs to the console) and upgrades to
// a real provider automatically once credentials are present in the environment.
//
// To go live, set SMS_PROVIDER and the matching credentials. A Pindo
// (https://www.pindo.io) implementation is wired below as the reference; swap in
// Africa's Talking, MTN, or Twilio by adding another branch.
//
// Env:
//   SMS_PROVIDER   = "pindo" | "mock" (default: "mock" unless a token is set)
//   SMS_SENDER_ID  = alphanumeric sender shown to the recipient (e.g. "QMarket")
//   PINDO_API_TOKEN= bearer token for the Pindo API

const SENDER_ID = process.env.SMS_SENDER_ID || "QMarket";

function normalizeMsisdn(phone) {
  if (!phone) return null;
  let p = String(phone).trim().replace(/[\s-]/g, "");
  if (p.startsWith("+")) return p;
  if (p.startsWith("0")) return "+25" + p; // 07xxxxxxxx → +2507xxxxxxxx (Rwanda)
  if (p.startsWith("25")) return "+" + p;
  if (p.startsWith("7")) return "+250" + p;
  return p;
}

async function sendViaPindo({ to, message }) {
  const res = await fetch("https://api.pindo.io/v1/sms/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PINDO_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, text: message, sender: SENDER_ID }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Pindo SMS failed (${res.status}): ${detail}`);
  }
  return res.json().catch(() => ({}));
}

/**
 * Send a single SMS. Never throws — returns { sent: boolean, provider, error? }
 * so callers can fire-and-forget without guarding every call site.
 */
export async function sendSms({ to, message }) {
  const msisdn = normalizeMsisdn(to);
  if (!msisdn || !message) {
    return { sent: false, provider: "none", error: "missing recipient or message" };
  }

  const provider = process.env.SMS_PROVIDER || (process.env.PINDO_API_TOKEN ? "pindo" : "mock");

  try {
    if (provider === "pindo") {
      await sendViaPindo({ to: msisdn, message });
      return { sent: true, provider };
    }
    // ── MOCK ──────────────────────────────────────────────────────────────
    // No provider configured: log so the flow is observable in development.
    console.log(`[MOCK SMS → ${msisdn}] ${message}`);
    return { sent: true, provider: "mock" };
  } catch (error) {
    console.error("[SMS] send failed:", error.message);
    return { sent: false, provider, error: error.message };
  }
}

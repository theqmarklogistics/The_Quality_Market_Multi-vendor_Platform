import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// POST { token, platform?, deviceId? } — register/refresh this device's Expo push
// token for the current user. Upserts on the unique token; reassigns the token to
// the current user if it moved between accounts on the same device.
export async function POST(request) {
  try {
    const { userId } = getAuth(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { token, platform, deviceId } = await request.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    await prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform: platform ?? null, deviceId: deviceId ?? null },
      update: { userId, platform: platform ?? null, deviceId: deviceId ?? null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[push/register] POST error:", error.message);
    return NextResponse.json({ error: error.message || error.code }, { status: 400 });
  }
}

// DELETE { token } — unregister on sign-out so a shared device stops receiving the
// previous user's notifications.
export async function DELETE(request) {
  try {
    const { userId } = getAuth(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { token } = await request.json().catch(() => ({}));
    if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

    // Only delete a token that belongs to the requesting user.
    await prisma.pushToken.deleteMany({ where: { token, userId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[push/register] DELETE error:", error.message);
    return NextResponse.json({ error: error.message || error.code }, { status: 400 });
  }
}

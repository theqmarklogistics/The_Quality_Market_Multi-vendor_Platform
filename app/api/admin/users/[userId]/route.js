import { clerkClient, getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import prisma from "@/lib/prisma";
import { logAdminAction } from "@/lib/auditLog";

// Roles whose contact card (phone + location) is published on the public
// delivery-network page.
const STAFF_PROFILE_ROLES = ["AGENT", "LOGISTICS_MANAGER"];

// Shared guards: target must exist, an admin can never act on their own
// account, and other ADMIN accounts are off-limits.
async function loadTarget(adminId, targetUserId) {
    if (targetUserId === adminId) {
        return { error: "You cannot perform this action on your own account", status: 400 };
    }
    const target = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    if (!target) return { error: "User not found", status: 404 };
    if (target.role === "ADMIN") {
        return { error: "Admin accounts cannot be modified here", status: 403 };
    }
    return { target };
}

// PATCH /api/admin/users/:userId
//   { action: "deactivate" | "reactivate" }   — ban/unban sign-in via Clerk + flag in DB
//   { staffProfile: { phone?, sector?, landmark?, isPublic? } } — public contact card
export async function PATCH(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!(await authAdmin(userId))) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { userId: targetUserId } = await params;
        const body = await request.json();

        const { target, error, status } = await loadTarget(userId, targetUserId);
        if (error) return NextResponse.json({ error }, { status });

        const admin = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });

        // ── Deactivate / reactivate ─────────────────────────────────────────
        if (body?.action === "deactivate" || body?.action === "reactivate") {
            const deactivating = body.action === "deactivate";

            // Clerk ban blocks sign-in and revokes active sessions. Best-effort:
            // a user invited but never signed up has no Clerk record yet.
            try {
                const client = await clerkClient();
                if (deactivating) await client.users.banUser(targetUserId);
                else await client.users.unbanUser(targetUserId);
            } catch (clerkError) {
                console.error("Clerk ban/unban failed:", clerkError?.errors?.[0]?.message || clerkError.message);
            }

            await prisma.user.update({
                where: { id: targetUserId },
                data: { isActive: !deactivating },
            });

            logAdminAction({
                adminId: userId,
                adminName: admin?.name || "",
                action: deactivating ? "USER_DEACTIVATED" : "USER_REACTIVATED",
                targetType: "User",
                targetId: targetUserId,
                notes: target.email,
            });

            return NextResponse.json({
                message: deactivating
                    ? "User deactivated — they can no longer sign in"
                    : "User reactivated — they can sign in again",
            });
        }

        // ── Staff contact card (public phone + location) ────────────────────
        if (body?.staffProfile && typeof body.staffProfile === "object") {
            if (!STAFF_PROFILE_ROLES.includes(target.role)) {
                return NextResponse.json({ error: "Only agents and logistics managers have a public contact card" }, { status: 400 });
            }
            const p = body.staffProfile;
            const data = {
                phone: (p.phone || "").trim() || null,
                sector: (p.sector || "").trim() || null,
                landmark: (p.landmark || "").trim() || null,
                isPublic: typeof p.isPublic === "boolean" ? p.isPublic : true,
            };
            await prisma.staffProfile.upsert({
                where: { userId: targetUserId },
                update: data,
                create: { userId: targetUserId, ...data },
            });

            logAdminAction({
                adminId: userId,
                adminName: admin?.name || "",
                action: "STAFF_PROFILE_UPDATED",
                targetType: "User",
                targetId: targetUserId,
                notes: target.email,
                metadata: data,
            });

            return NextResponse.json({ message: "Contact card saved" });
        }

        return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}

// DELETE /api/admin/users/:userId — permanently remove a user (auth + database).
// Only allowed when the user has no orders, store, or return requests — those are
// business records that must survive; deactivate such accounts instead.
export async function DELETE(request, { params }) {
    try {
        const { userId } = getAuth(request);
        if (!(await authAdmin(userId))) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { userId: targetUserId } = await params;
        const { target, error, status } = await loadTarget(userId, targetUserId);
        if (error) return NextResponse.json({ error }, { status });

        const [orderCount, returnCount, store] = await Promise.all([
            prisma.order.count({ where: { userId: targetUserId } }),
            prisma.return.count({ where: { userId: targetUserId } }),
            prisma.store.findUnique({ where: { userId: targetUserId }, select: { id: true } }),
        ]);
        if (orderCount > 0 || returnCount > 0 || store) {
            return NextResponse.json({
                error: "This user has orders, a store, or return records that must be kept. Deactivate the account instead.",
            }, { status: 400 });
        }

        // Remove from Clerk first (best-effort: invited-but-never-signed-up users
        // may not exist there), then from the database — ratings, addresses, push
        // tokens, chat participation, and profiles cascade with the row.
        try {
            const client = await clerkClient();
            await client.users.deleteUser(targetUserId);
        } catch (clerkError) {
            console.error("Clerk delete failed:", clerkError?.errors?.[0]?.message || clerkError.message);
        }

        await prisma.user.delete({ where: { id: targetUserId } });

        const admin = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        logAdminAction({
            adminId: userId,
            adminName: admin?.name || "",
            action: "USER_DELETED",
            targetType: "User",
            targetId: targetUserId,
            notes: target.email,
        });

        return NextResponse.json({ message: "User permanently removed" });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message || error.code }, { status: 400 });
    }
}

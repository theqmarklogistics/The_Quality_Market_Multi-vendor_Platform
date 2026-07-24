import prisma from "@/lib/prisma";
import { STAFF_RECEIVER_ROLES } from "@/lib/constants";

// Resolve an optional "received by" staff selection to a { receivedById,
// receivedByName } pair to persist on an order. An empty/blank value clears the
// field (both null). A non-empty id must belong to an active internal staff
// member — otherwise this throws (err.status = 400) so the caller can reject it.
// The name is snapshotted alongside the id so delivery documents stay stable
// even if the staff record is later renamed or removed.
export async function resolveReceivedBy(receivedById) {
    const id = (receivedById || "").trim();
    if (!id) return { receivedById: null, receivedByName: null };

    const staff = await prisma.user.findFirst({
        where: { id, role: { in: STAFF_RECEIVER_ROLES }, isActive: true },
        select: { id: true, name: true },
    });
    if (!staff) {
        const err = new Error("Selected staff member is not available");
        err.status = 400;
        throw err;
    }
    return { receivedById: staff.id, receivedByName: staff.name };
}

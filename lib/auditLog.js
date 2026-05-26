import prisma from './prisma';

export function logAdminAction({ adminId, adminName = '', action, targetType, targetId, notes, metadata } = {}) {
    prisma.auditLog.create({
        data: {
            adminId,
            adminName,
            action,
            targetType,
            targetId,
            notes: notes || null,
            metadata: metadata || {},
        }
    }).catch(err => console.error('AuditLog write error:', err.message));
}

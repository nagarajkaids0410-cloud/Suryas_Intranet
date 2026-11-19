import { NextRequest, NextResponse } from 'next/server';
import { readAuditLog } from '@/lib/audit-log';
import { requireRole } from '@/lib/rbac';
import { getAllUsers } from '@/lib/user-database';

function getDisplayLogs() {
  const usersById = new Map(getAllUsers().map((user) => [user.id, user]));
  return readAuditLog().map(({ actorId, details, ...entry }) => {
    const {
      targetUserId,
      userId,
      members,
      ...safeDetails
    } = details || {};
    return {
      ...entry,
      actorEmployeeId: actorId ? usersById.get(actorId)?.employeeId || '' : '',
      details: {
        ...safeDetails,
        ...(targetUserId ? { targetEmployeeId: usersById.get(targetUserId)?.employeeId || '' } : {}),
        ...(userId ? { employeeId: usersById.get(userId)?.employeeId || '' } : {}),
        ...(Array.isArray(members)
          ? {
              members: members.map(({ userId: memberId, ...member }: { userId?: string; [key: string]: unknown }) => ({
                ...member,
                employeeId: memberId ? usersById.get(memberId)?.employeeId || '' : '',
              })),
            }
          : {}),
      },
    };
  });
}

export async function GET(req: NextRequest) {
  // Only admin/founder can view audit logs
  const check = requireRole(req, ['admin', 'founder']);
  if ((check as any)?.status === 403) return check as NextResponse;

  const logs = getDisplayLogs();
  return NextResponse.json({ success: true, logs });
}

export async function POST(req: NextRequest) {
  // Allow download/export (same role restriction)
  const check = requireRole(req, ['admin', 'founder']);
  if ((check as any)?.status === 403) return check as NextResponse;

  const logs = getDisplayLogs();
  return NextResponse.json({ success: true, logs });
}

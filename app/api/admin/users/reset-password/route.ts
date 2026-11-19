import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { addAuditEntry } from '@/lib/audit-log';
import { requireRole } from '@/lib/rbac';
import { findUserById, updateUserById } from '@/lib/user-database';
import { updateUserInDB } from '@/lib/user-db';

export async function POST(request: NextRequest) {
  const actor = requireRole(request, ['admin', 'founder']);
  if (actor instanceof NextResponse) return actor;

  try {
    const body = await request.json();
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!userId) {
      return NextResponse.json({ error: 'A valid user ID is required' }, { status: 400 });
    }

    const target = findUserById(userId);
    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (target.id === actor.id) {
      return NextResponse.json({ error: 'Use the password change page to update your own password' }, { status: 400 });
    }
    if (target.role === 'founder') {
      return NextResponse.json({ error: 'Founder account passwords cannot be reset from User Management' }, { status: 403 });
    }
    if (target.status !== 'active') {
      return NextResponse.json({ error: 'Only active users can have their password reset' }, { status: 409 });
    }

    const temporaryPassword = randomBytes(18).toString('base64url');
    const updates = {
      passwordHash: await bcrypt.hash(temporaryPassword, 12),
      mustChangePassword: true,
      sessionVersion: (target.sessionVersion ?? 0) + 1,
    };

    if (!updateUserInDB(target.id, updates)) {
      return NextResponse.json({ error: 'Unable to persist the password reset' }, { status: 500 });
    }
    if (!updateUserById(target.id, updates)) {
      console.error('Password reset persisted, but in-memory user cache could not be updated', { targetUserId: target.id });
      return NextResponse.json({ error: 'Password reset was saved but could not refresh the user session. Contact support.' }, { status: 500 });
    }

    const auditEntry = addAuditEntry({
      action: 'auth:admin_password_reset',
      actor: actor.username,
      actorId: actor.id,
      details: {
        targetEmployeeId: target.employeeId || '',
        targetUsername: target.username,
        mustChangePassword: true,
      },
    });
    if (!auditEntry) {
      console.error('Admin password reset succeeded, but its audit entry could not be written', {
        actorId: actor.id,
        targetUserId: target.id,
      });
    }

    return NextResponse.json(
      {
        success: true,
        user: {
          fullName: target.fullName,
          employeeId: target.employeeId || '',
          username: target.username,
        },
        temporaryPassword,
        mustChangePassword: true,
        auditLogged: Boolean(auditEntry),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Admin password reset failed:', error);
    return NextResponse.json({ error: 'Unable to reset the user password' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireRole } from '@/lib/rbac';
import { findUserById, updateUserById } from '@/lib/user-database';
import { updateUserInDB } from '@/lib/user-db';
import { addAuditEntry } from '@/lib/audit-log';

const ALLOWED_ROLES = [
  'founder', 'managing-partner', 'admin', 'employee', 'freelancer', 'senior-freelancer', 'intern', 'project-intern', 'user',
] as const;

export async function POST(request: NextRequest) {
  try {
    const actor = requireRole(request, [...ALLOWED_ROLES], { allowPasswordChange: true });
    if (actor instanceof NextResponse) return actor;

    const body = await request.json();
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    if (!currentPassword || newPassword.length < 12) {
      return NextResponse.json({ error: 'Current password and a new password of at least 12 characters are required' }, { status: 400 });
    }

    const user = findUserById(actor.id);
    if (!user || user.status !== 'active') {
      return NextResponse.json({ error: 'Active account not found' }, { status: 403 });
    }
    if (!await bcrypt.compare(currentPassword, user.passwordHash)) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
    }

    const updates = {
      passwordHash: await bcrypt.hash(newPassword, 12),
      mustChangePassword: false,
    };
    updateUserById(user.id, updates);
    if (!updateUserInDB(user.id, updates)) {
      return NextResponse.json({ error: 'Unable to persist password change' }, { status: 500 });
    }

    addAuditEntry({
      action: 'auth:password_changed',
      actor: actor.username,
      actorId: actor.id,
      details: { userId: actor.id },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unable to change password' }, { status: 500 });
  }
}
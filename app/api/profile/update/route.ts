import { NextRequest, NextResponse } from 'next/server';
import { findUserById, updateUserById } from '@/lib/user-database';
import { updateUserInDB } from '@/lib/user-db';
import { requireRole } from '@/lib/rbac';

export async function POST(request: NextRequest) {
  try {
    const auth = requireRole(request, [
      'founder',
      'managing-partner',
      'admin',
      'employee',
      'freelancer',
      'senior-freelancer',
      'intern',
      'project-intern',
      'user',
    ]);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const { updates } = body;

    // Handle regular profile updates
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return NextResponse.json({ error: 'Missing update payload' }, { status: 400 });
    }

    const currentUser = findUserById(auth.id);
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const editableFields = new Set([
      'fullName',
      'phone',
      'designation',
      'department',
      'profilePhoto',
      'profilePictureUploaded',
      'isProfileCompleted',
    ]);
    if (Object.keys(updates).some((key) => !editableFields.has(key))) {
      return NextResponse.json({ error: 'Updates contain unsupported fields' }, { status: 400 });
    }
    if (
      'designation' in updates &&
      (typeof updates.designation !== 'string' || !updates.designation.trim() || updates.designation.trim().length > 120)
    ) {
      return NextResponse.json({ error: 'Designation must contain 1 to 120 characters' }, { status: 400 });
    }
    if (
      'department' in updates &&
      (typeof updates.department !== 'string' || updates.department.trim().length > 120)
    ) {
      return NextResponse.json({ error: 'Team name must be 120 characters or fewer' }, { status: 400 });
    }

    const updatePayload = { ...updates } as Partial<typeof currentUser>;
    if (updatePayload.isProfileCompleted === true) {
      updatePayload.profileCompletedAt = new Date().toISOString();
    }
    if (typeof updatePayload.fullName === 'string') updatePayload.fullName = updatePayload.fullName.trim();
    if (typeof updatePayload.phone === 'string') updatePayload.phone = updatePayload.phone.trim();
    if (typeof updatePayload.designation === 'string') {
      const designation = updatePayload.designation.trim();
      updatePayload.designation = designation.charAt(0).toUpperCase() + designation.slice(1);
    }
    if (typeof updatePayload.department === 'string') {
      const department = updatePayload.department.trim();
      updatePayload.department = department.charAt(0).toUpperCase() + department.slice(1);
    }
    updateUserById(auth.id, updatePayload);
    const persisted = updateUserInDB(auth.id, updatePayload);

    if (!persisted) {
      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }

    const { passwordHash, ...userWithoutPassword } = persisted;

    return NextResponse.json({ success: true, user: userWithoutPassword });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { addUser, findUserById, findUserByUsername, getAllUsers, StoredUser, updateUserById } from '@/lib/user-database';
import { requireRole } from '@/lib/rbac';
import { loadUsersFromDB, saveUsersToDB, updateUserInDB } from '@/lib/user-db';
import { getNextEmployeeId } from '@/lib/employee-id';
import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { addAuditEntry } from '@/lib/audit-log';
import { isEligibleGuideRole, requiresGuideRole } from '@/lib/request-store';

export async function GET(request: NextRequest) {
  const auth = requireRole(request, ['admin', 'founder']);
  if (auth instanceof NextResponse) return auth;

  if (new URL(request.url).searchParams.get('scope') === 'request-filter') {
    const users = getAllUsers().map(({ id, employeeId, username, fullName, status, role }) => ({
      id,
      employeeId,
      username,
      fullName,
      status,
      role,
    }));
    return NextResponse.json({ success: true, users }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const users = getAllUsers().map(({ passwordHash, verificationToken, resetToken, resetTokenExpiresAt, ...rest }) => rest);
  return NextResponse.json({ success: true, users }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, ['founder']);
  if (auth instanceof NextResponse) return auth;
  if (auth.username.toLowerCase() !== 'gkbharath') {
    return NextResponse.json({ error: 'Only Bharath can create users from User Management' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const role = typeof body.role === 'string' ? body.role : '';
    const employmentType = body.employmentType === 'part-time' ? 'part-time' : 'full-time';
    const designation = typeof body.designation === 'string' ? body.designation.trim() : '';
    const department = typeof body.department === 'string' ? body.department.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const guideId = typeof body.guideId === 'string' ? body.guideId : '';
    const remarks = typeof body.remarks === 'string' ? body.remarks.trim() : '';

    if (
      !fullName ||
      username.length < 3 ||
      !/^[a-zA-Z0-9._-]+$/.test(username) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !['employee', 'intern', 'project-intern', 'user', 'managing-partner', 'freelancer', 'senior-freelancer'].includes(role)
    ) {
      return NextResponse.json({ error: 'Enter a name, valid username and email, and an allowed user type' }, { status: 400 });
    }
    if (findUserByUsername(username) || getAllUsers().some((user) => user.email.toLowerCase() === email)) {
      return NextResponse.json({ error: 'Username or email is already registered' }, { status: 409 });
    }

    let guide: ReturnType<typeof findUserById> = undefined;
    if (requiresGuideRole(role)) {
      guide = findUserById(guideId);
      if (
        !guide ||
        guide.status !== 'active' ||
        !isEligibleGuideRole(guide.role)
      ) {
        return NextResponse.json({ error: 'Choose an active employee, consultant, manager, or founder as guide' }, { status: 400 });
      }
    }

    const now = new Date().toISOString();
    const temporaryPassword = `${randomBytes(18).toString('base64url')}A1!`;
    const createdUser: StoredUser = {
      id: `SMIB-EMP-${randomUUID()}`,
      employeeId: getNextEmployeeId(getAllUsers().map((user) => user.employeeId)),
      username,
      email,
      passwordHash: await bcrypt.hash(temporaryPassword, 12),
      role: role as StoredUser['role'],
      employmentType,
      fullName,
      phone: phone || undefined,
      designation: designation || 'Not Set',
      department: department || undefined,
      profilePictureUploaded: false,
      status: 'active',
      approvedAt: now,
      createdAt: now,
      requestedAt: now,
      approvalRemarks: remarks || undefined,
      emailVerified: true,
      mustChangePassword: true,
      isProfileCompleted: false,
      ...(guide ? { guideId: guide.id, guideName: guide.fullName } : {}),
    };
    const updatedUsers = [...getAllUsers(), createdUser];
    saveUsersToDB(updatedUsers);
    if (!loadUsersFromDB().some((user) => user.id === createdUser.id)) {
      return NextResponse.json({ error: 'Unable to persist the new user' }, { status: 500 });
    }
    addUser(createdUser);

    const auditEntry = addAuditEntry({
      action: 'user:created_by_founder',
      actor: auth.username,
      actorId: auth.id,
      details: { targetUserId: createdUser.id, username: createdUser.username, role: createdUser.role },
    });
    if (!auditEntry) {
      console.error('User was created, but the audit entry could not be written', { targetUserId: createdUser.id });
    }

    return NextResponse.json({
      success: true,
      user: {
        fullName: createdUser.fullName,
        employeeId: createdUser.employeeId,
        username: createdUser.username,
      },
      temporaryPassword,
      auditLogged: Boolean(auditEntry),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Founder user creation failed:', error);
    return NextResponse.json({ error: 'Unable to create user' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = requireRole(request, ['admin', 'founder']);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const { userId, updates } = body as { userId: string; updates: Record<string, unknown> };

    if (typeof userId !== 'string' || !userId || !updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return NextResponse.json({ error: 'userId and updates are required' }, { status: 400 });
    }

    const editableFields = new Set([
      'fullName',
      'phone',
      'designation',
      'employmentType',
      'profilePhoto',
      'profilePictureUploaded',
      'isProfileCompleted',
      'guideId',
      'role',
      'status',
    ]);
    const updateKeys = Object.keys(updates);
    if (updateKeys.length === 0 || updateKeys.some((key) => !editableFields.has(key))) {
      return NextResponse.json({ error: 'Updates contain unsupported fields' }, { status: 400 });
    }

    const changesAccess = 'role' in updates || 'status' in updates;
    const changesGuide = 'guideId' in updates;
    if (changesGuide && auth.role !== 'founder') {
      return NextResponse.json({ error: 'Only the authorized final approver may assign intern guides' }, { status: 403 });
    }
    if (changesAccess && auth.role !== 'founder') {
      return NextResponse.json({ error: 'Only the Founder can change roles or account status' }, { status: 403 });
    }
    if (changesAccess && userId === auth.id) {
      return NextResponse.json({ error: 'You cannot change your own role or account status' }, { status: 403 });
    }

    const validRoles = ['founder', 'managing-partner', 'admin', 'employee', 'freelancer', 'senior-freelancer', 'intern', 'project-intern', 'guest', 'user'];
    const validStatuses = ['active', 'suspended'];
    if (typeof updates.role === 'string' && !validRoles.includes(updates.role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    if (typeof updates.status === 'string' && !validStatuses.includes(updates.status)) {
      return NextResponse.json({ error: 'Invalid account status' }, { status: 400 });
    }

    const targetUser = findUserById(userId);
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const nextRole = typeof updates.role === 'string' ? updates.role : targetUser.role;
    if (requiresGuideRole(nextRole) && !targetUser.guideId && !changesGuide) {
      return NextResponse.json({ error: 'Assign a guide when changing this user to a guide-required role' }, { status: 400 });
    }
    let safeUpdates: Record<string, unknown> = changesAccess
      ? { ...updates, sessionVersion: (targetUser.sessionVersion ?? 0) + 1 }
      : updates;
    if (changesGuide) {
      const guideId = updates.guideId;
      const guide = typeof guideId === 'string' ? findUserById(guideId) : undefined;
      if (
        targetUser.status !== 'active' ||
        !requiresGuideRole(nextRole) ||
        !guide ||
        guide.id === targetUser.id ||
        guide.status !== 'active' ||
        !isEligibleGuideRole(guide.role)
      ) {
        return NextResponse.json({ error: 'Choose an active guide for this user' }, { status: 400 });
      }
      safeUpdates = { ...safeUpdates, guideId: guide.id, guideName: guide.fullName };
    }
    if (targetUser.status === 'pending_approval' && 'status' in updates) {
      return NextResponse.json(
        { error: 'Pending registrations must be approved or rejected through the sequential registration workflow' },
        { status: 403 }
      );
    }
    if (
      updates.status === 'active' &&
      targetUser.status !== 'active' &&
      targetUser.status !== 'suspended' &&
      !targetUser.approvedAt
    ) {
      return NextResponse.json(
        { error: 'New accounts must complete the sequential registration approval workflow before activation' },
        { status: 403 }
      );
    }
    const updated = updateUserById(userId, safeUpdates);
    if (!updated) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (!updateUserInDB(userId, safeUpdates)) {
      return NextResponse.json({ error: 'Unable to persist user update' }, { status: 500 });
    }

    try {
      const { addAuditEntry } = await import('@/lib/audit-log');
      addAuditEntry({
        action: 'user:updated',
        actor: auth.username,
        actorId: auth.id,
        details: { targetUserId: userId, updatedFields: updateKeys },
      });
    } catch (e) {
      console.error('Failed to write audit entry for user update', e);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('User update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

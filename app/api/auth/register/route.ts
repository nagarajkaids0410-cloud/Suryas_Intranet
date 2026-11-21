import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { findUserByUsername, addUser, getAllUsers, StoredUser } from '@/lib/user-database';
import { loadUsersFromDB, saveUsersToDB } from '@/lib/user-db';
import { addNotificationDB } from '@/lib/notification-db';
import { getNextEmployeeId } from '@/lib/employee-id';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const designation = typeof body.designation === 'string' ? body.designation.trim() : '';
    const remarks = typeof body.remarks === 'string' ? body.remarks.trim() : '';
    const roleFromBody = typeof body.role === 'string' ? body.role : 'intern';
    const employmentType = body.employmentType === 'part-time' ? 'part-time' : 'full-time';

    if (!username || !email || !password || !fullName) {
      return NextResponse.json(
        { error: 'Name, username, email, and password are required' },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) {
      return NextResponse.json(
        { error: 'Enter a valid email and use a password of at least 12 characters' },
        { status: 400 }
      );
    }

    const allowedRegistration = ['employee', 'intern', 'project-intern', 'user'];
    if (!allowedRegistration.includes(roleFromBody)) {
      return NextResponse.json({ error: 'Registration for the requested role is not allowed' }, { status: 403 });
    }

    if (
      findUserByUsername(username) ||
      getAllUsers().some((existingUser) => existingUser.email.toLowerCase() === email)
    ) {
      return NextResponse.json(
        { error: 'Username or email is already registered' },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const role = roleFromBody;
    const status: 'pending_approval' | 'active' | 'rejected' = 'pending_approval';
    const existingUsers = loadUsersFromDB();

    // Create new user with PENDING_APPROVAL status for non-privileged users
    const newUser: StoredUser = {
      id: `SMIB-EMP-${randomUUID()}`,
      employeeId: getNextEmployeeId(existingUsers.map((user) => user.employeeId)),
      username,
      email,
      passwordHash,
      role: role as StoredUser['role'],
      employmentType: employmentType as StoredUser['employmentType'],
      fullName,
      designation: designation || 'User',
      profilePictureUploaded: false,
      status,
      approvalStage: 0,
      registrationApprovalVersion: 3,
      approvalHistory: [],
      approvalRemarks: remarks,
      emailVerified: false, // Do NOT verify email on signup
      verificationToken: undefined, // No verification token yet (sent after admin approval)
      verificationSentAt: undefined,
      requestedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    saveUsersToDB([...existingUsers, newUser]);
    const savedUser = addUser(newUser);

    addNotificationDB({
      type: 'user_access_request',
      title: `New User Access Request - ${fullName}`,
      message: `${fullName} (${email}) has requested access. Review the request and add remarks.`,
      targetUser: 'hareeshv',
      relatedId: savedUser.id,
      read: false,
    });

    // Return user data (without password hash)
    const { passwordHash: _, ...userWithoutPassword } = savedUser;

    return NextResponse.json({
      success: true,
      user: userWithoutPassword,
      message: 'Your access request has been submitted for approval.',
    });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

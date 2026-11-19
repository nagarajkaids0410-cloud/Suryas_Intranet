import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { findUserByUsername } from '@/lib/user-database';
import { createSessionToken, setSessionCookie } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    const normalizedUsername = typeof username === 'string' ? username.trim() : '';
    const user = findUserByUsername(normalizedUsername);

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    if (user.status !== 'active') {
      if (user.status === 'rejected') {
        return NextResponse.json(
          { error: 'Your access request has been rejected. Please contact support.' },
          { status: 403 }
        );
      }
      if (user.status === 'suspended') {
        return NextResponse.json(
          { error: 'Your account is suspended. Please contact the portal administrator.' },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: 'Your account is pending admin approval. Please wait for a confirmation email.' },
        { status: 403 }
      );
    }

    let isPasswordValid = false;
    try {
      if (typeof user.passwordHash === 'string' && /^\$2[aby]\$/.test(user.passwordHash)) {
        isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      }
    } catch {
      isPasswordValid = false;
    }

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    // Return user data (without password hash)
    const {
      passwordHash,
      verificationToken,
      resetToken,
      resetTokenExpiresAt,
      ...userWithoutSecrets
    } = user;

    const response = NextResponse.json({
      success: true,
      user: userWithoutSecrets,
    });
    const sessionToken = createSessionToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      sessionVersion: user.sessionVersion ?? 0,
    });
    setSessionCookie(response, sessionToken);
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import bcrypt, { compare as bcryptCompare, compareSync as bcryptCompareSync } from 'bcryptjs';
import { findUserByUsername, StoredUser } from '@/lib/user-database';
import { createSessionToken, setSessionCookie } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;

  const cleanHash = hash.trim();
  const cleanPassword = password;
  const trimmedPassword = password.trim();

  const tryMatch = async (pwd: string): Promise<boolean> => {
    // 1. Try named export async compare
    try {
      if (typeof bcryptCompare === 'function' && (await bcryptCompare(pwd, cleanHash))) {
        return true;
      }
    } catch {}

    // 2. Try default export async compare
    try {
      if (typeof bcrypt?.compare === 'function' && (await bcrypt.compare(pwd, cleanHash))) {
        return true;
      }
    } catch {}

    // 3. Try nested default compare
    try {
      if (typeof (bcrypt as any)?.default?.compare === 'function' && (await (bcrypt as any).default.compare(pwd, cleanHash))) {
        return true;
      }
    } catch {}

    // 4. Try named export sync compare
    try {
      if (typeof bcryptCompareSync === 'function' && bcryptCompareSync(pwd, cleanHash)) {
        return true;
      }
    } catch {}

    // 5. Try default export sync compare
    try {
      if (typeof bcrypt?.compareSync === 'function' && bcrypt.compareSync(pwd, cleanHash)) {
        return true;
      }
    } catch {}

    return false;
  };

  if (await tryMatch(cleanPassword)) return true;
  if (trimmedPassword !== cleanPassword && (await tryMatch(trimmedPassword))) return true;

  return false;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Accept both "username" and "employeeId" fields from the request
    const rawLogin: string = body.username || body.employeeId || '';
    const password: string = body.password || '';

    if (!rawLogin || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    const normalizedUsername = rawLogin.trim().toLowerCase();
    let user: StoredUser | undefined;

    // 1. Query Supabase for the live account
    try {
      const supabase = getSupabaseAdmin();

      // Check username, email, employeeId, and fullName
      for (const col of ['username', 'email', 'employeeId', 'fullName'] as const) {
        if (user) break;
        try {
          const { data, error } = await supabase
            .from('users')
            .select('*')
            .ilike(col, normalizedUsername)
            .limit(1)
            .maybeSingle();
          if (!error && data) {
            user = data as StoredUser;
          }
        } catch {}
      }
    } catch (err) {
      console.warn('[Login] Supabase lookup error:', err);
    }

    // 2. Fallback to local / bundled seed store
    if (!user) {
      user = findUserByUsername(normalizedUsername);
    }

    if (!user) {
      console.warn(`[Login] User not found: "${normalizedUsername}"`);
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }

    if (user.status !== 'active') {
      console.warn(`[Login] Inactive user login attempt: "${user.username}" (status: "${user.status}")`);
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

    const isPasswordValid = await verifyPassword(password, user.passwordHash);

    if (!isPasswordValid) {
      console.warn(`[Login] Password mismatch for user: "${user.username}" hash_prefix: "${(user.passwordHash || '').substring(0, 10)}"`);
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

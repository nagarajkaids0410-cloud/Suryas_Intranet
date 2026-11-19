import { NextRequest, NextResponse } from 'next/server';
import { findUserByUsername, updateUserById } from '@/lib/user-database';
import { updateUserInDB } from '@/lib/user-db';
import { sendEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  // Disable self-service password reset for users. Only administrators may reset passwords.
  return NextResponse.json(
    { error: 'Password reset disabled. Please contact your administrator to reset passwords.' },
    { status: 403 }
  );
}

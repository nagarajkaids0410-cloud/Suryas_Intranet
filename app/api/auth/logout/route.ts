import { NextResponse } from 'next/server';
import { clearSessionCookie, getSessionIdentity } from '@/lib/session';
import { findUserById, updateUserById } from '@/lib/user-database';
import { updateUserInDB } from '@/lib/user-db';

export async function POST(request: Request) {
  const identity = getSessionIdentity(request);
  if (identity) {
    const user = findUserById(identity.userId);
    if (user) {
      const sessionVersion = (user.sessionVersion ?? 0) + 1;
      updateUserById(user.id, { sessionVersion });
      updateUserInDB(user.id, { sessionVersion });
    }
  }
  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);
  return response;
}
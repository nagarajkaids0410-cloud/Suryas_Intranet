import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { ensureFounderSeed, getUserByEmployeeId } from '@/lib/portal-store';
import { createSessionToken, setSessionCookie } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const employeeId = String(body.employeeId || '').trim();
    const password = String(body.password || '');

    ensureFounderSeed();
    const user = getUserByEmployeeId(employeeId);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return NextResponse.json({ error: 'Invalid employee ID or password' }, { status: 401 });
    }

    if (user.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Account pending approval or inactive' }, { status: 403 });
    }

    const token = await createSessionToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      department: user.department,
    });

    await setSessionCookie(token);

    return NextResponse.json({ success: true, user: { id: user.id, employeeId: user.employeeId, email: user.email, name: user.name, role: user.role } });
  } catch (error) {
    return NextResponse.json({ error: 'Unable to sign in' }, { status: 500 });
  }
}

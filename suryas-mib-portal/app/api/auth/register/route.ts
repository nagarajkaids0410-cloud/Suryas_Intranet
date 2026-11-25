import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createRegistrationRequest, getUserByEmail, getUserByEmployeeId } from '@/lib/portal-store';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const employeeId = String(body.employeeId || '').trim();
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    const department = String(body.department || '').trim() || null;
    const designation = String(body.designation || '').trim() || null;
    const requestedRole = String(body.requestedRole || 'EMPLOYEE') as any;

    if (!employeeId || !name || !email || !password) {
      return NextResponse.json({ error: 'Missing required fields: employeeId, name, email, password' }, { status: 400 });
    }

    // Check for duplicates in DB
    const [existingEmail, existingEmpId] = await Promise.all([
      getUserByEmail(email),
      getUserByEmployeeId(employeeId),
    ]);

    if (existingEmail || existingEmpId) {
      return NextResponse.json({ error: 'Employee ID or email already exists' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await createRegistrationRequest({
      employeeId,
      name,
      email,
      phone: String(body.phone || '').trim() || null,
      department,
      designation,
      requestedRole,
      passwordHash,
      status: 'PENDING',
      remarks: 'Pending admin approval',
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('[register] error:', error);
    return NextResponse.json({ error: 'Registration request failed. Please try again.' }, { status: 500 });
  }
}

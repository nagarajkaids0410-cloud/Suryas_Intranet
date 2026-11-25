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
    const department = String(body.department || '').trim();
    const designation = String(body.designation || '').trim();
    const requestedRole = String(body.requestedRole || 'EMPLOYEE');

    if (!employeeId || !name || !email || !designation || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (getUserByEmail(email) || getUserByEmployeeId(employeeId)) {
      return NextResponse.json({ error: 'Employee already exists' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    createRegistrationRequest({
      employeeId,
      name,
      email,
      phone: String(body.phone || ''),
      department,
      designation,
      requestedRole: requestedRole as any,
      passwordHash,
      status: 'PENDING',
      remarks: 'Pending Bharath approval',
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Registration request failed' }, { status: 500 });
  }
}

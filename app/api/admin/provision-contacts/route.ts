import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { requireRole } from '@/lib/rbac';
import { loadUsersFromDB, saveUsersToDB } from '@/lib/user-db';
import { StoredUser } from '../../../../lib/user-database';
import { addAuditEntry } from '@/lib/audit-log';
import { getNextEmployeeId } from '@/lib/employee-id';

const CONTACTS: Array<{ fullName: string; email: string; designation: string; role: StoredUser['role']; username: string }> = [
  { fullName: 'HAREESH V', email: 'hareeshv@suryas.in', designation: 'Managing Partner - Projects & Administration', role: 'managing-partner', username: 'hareeshv' },
  { fullName: 'SANTHANA KUMAR V', email: 'santhanakumarv@suryas.in', designation: 'Managing Partner - Operations & Business Development', role: 'managing-partner', username: 'santhanakumarv' },
  { fullName: 'GOLLA KUMAR BHARATH', email: 'gollakumarbharath@suryas.in', designation: 'Founder & Chief Executive Partner', role: 'founder', username: 'gkbharath' },
];

export async function POST(req: Request) {
  const created: Array<{ employeeId: string; username: string; email: string; password: string; role: StoredUser['role']; fullName: string }> = [];
  const conflicts: Array<{ username: string; existingRole: string; requiredRole: string }> = [];
  const users = loadUsersFromDB();
  const founderExists = users.some((user) => user.role === 'founder');
  let actor = 'initial-setup';
  let actorId: string | undefined;

  if (founderExists) {
    const roleCheck = requireRole(req, ['founder']);
    if (roleCheck instanceof NextResponse) return roleCheck;
    actor = roleCheck.username;
    actorId = roleCheck.id;
  } else {
    const configuredToken = process.env.INITIAL_SETUP_TOKEN;
    const suppliedToken = req.headers.get('x-initial-setup-token');
    if (!configuredToken || !suppliedToken) {
      return NextResponse.json({ error: 'Initial setup is not configured' }, { status: 503 });
    }
    const expected = Buffer.from(configuredToken);
    const supplied = Buffer.from(suppliedToken);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      return NextResponse.json({ error: 'Invalid setup token' }, { status: 403 });
    }
  }

  for (const contact of CONTACTS) {
    const existing = users.find((user) =>
      user.username.toLowerCase() === contact.username.toLowerCase() ||
      user.email.toLowerCase() === contact.email.toLowerCase() ||
      (contact.role === 'founder' && user.role === 'founder')
    );
    if (existing) {
      if (existing.role !== contact.role) {
        conflicts.push({ username: existing.username, existingRole: existing.role, requiredRole: contact.role });
      }
      continue;
    }

    const password = randomBytes(24).toString('base64url');
    const user: StoredUser = {
      id: `SMIB-EMP-${randomUUID()}`,
      employeeId: getNextEmployeeId(users.map((existingUser) => existingUser.employeeId)),
      username: contact.username,
      email: contact.email,
      passwordHash: await bcrypt.hash(password, 12),
      role: contact.role,
      fullName: contact.fullName,
      designation: contact.designation,
      profilePictureUploaded: false,
      status: 'active',
      mustChangePassword: true,
      emailVerified: true,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    created.push({ employeeId: user.employeeId!, username: user.username, email: user.email, password, role: user.role, fullName: user.fullName });
  }

  try {
    saveUsersToDB(users);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to write users' }, { status: 500 });
  }

  if (created.length > 0) {
    addAuditEntry({
      action: 'users:bootstrap',
      actor,
      actorId,
      details: { created: created.map(({ password: _password, ...account }) => account) },
    });
  }

  const message = conflicts.length
    ? 'Some existing accounts have a different role. Resolve the listed role conflicts in user management; their passwords were not changed.'
    : created.length
      ? 'Temporary credentials are shown once. Store them securely and require password changes at first login.'
      : 'All bootstrap accounts already exist; no credentials were regenerated.';
  return NextResponse.json({ created, conflicts, message }, { status: 201 });
}

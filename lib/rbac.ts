import { NextResponse } from 'next/server';
import { getSessionIdentity } from '@/lib/session';
import { findUserById } from '@/lib/user-database';

// Expanded role list to support the new structure
export type Role =
  | 'founder'
  | 'managing-partner'
  | 'admin'
  | 'employee'
  | 'freelancer'
  | 'senior-freelancer'
  | 'intern'
  | 'project-intern'
  | 'user'
  | 'guest';

/**
 * Require an authenticated session with one of the allowed roles.
 * Returns an object { role, id, username } when allowed, otherwise returns a NextResponse JSON error.
 */
export function requireRole(
  req: Request | { headers: { get: (k: string) => string | null } },
  allowed: Role[] | Role,
  options: { allowPasswordChange?: boolean } = {}
) {
  const allowedRoles = Array.isArray(allowed) ? allowed : [allowed];
  const identity = getSessionIdentity(req);

  if (!identity) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 403 });
  }
  const user = findUserById(identity.userId);
  if (!user || user.status !== 'active') {
    return NextResponse.json({ error: 'Active account required' }, { status: 403 });
  }
  if ((user.sessionVersion ?? 0) !== identity.sessionVersion) {
    return NextResponse.json({ error: 'Session has been invalidated' }, { status: 403 });
  }
  if (user.mustChangePassword && !options.allowPasswordChange) {
    return NextResponse.json({ error: 'Change your temporary password before continuing' }, { status: 403 });
  }
  if (!allowedRoles.includes(identity.role as Role)) {
    return NextResponse.json({ error: 'Forbidden: insufficient role' }, { status: 403 });
  }
  return { role: identity.role as Role, id: identity.userId, username: identity.username };
}

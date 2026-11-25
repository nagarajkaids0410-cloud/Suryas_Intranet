/**
 * portal-store.ts
 * Database-backed user store using Prisma + Supabase PostgreSQL.
 * Replaces the former in-memory arrays so data persists across restarts.
 */
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

export type UserRole = 'SYSTEM_ADMIN' | 'MANAGING_PARTNER' | 'RECOMMENDER' | 'EMPLOYEE';
export type UserStatus = 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'REJECTED';

export type PortalUser = {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  phone?: string | null;
  passwordHash: string;
  role: UserRole;
  department?: string | null;
  departmentId?: string | null;
  designation?: string | null;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};

export type RegistrationRequest = {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  phone?: string | null;
  department?: string | null;
  designation?: string | null;
  requestedRole: UserRole;
  passwordHash: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  remarks?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
};

// ─── Helper: map Prisma user row → PortalUser ─────────────────────────────
function mapUser(u: any): PortalUser {
  return {
    id: u.id,
    employeeId: u.employeeId,
    name: u.name,
    email: u.email,
    phone: u.phone,
    passwordHash: u.passwordHash,
    role: u.role as UserRole,
    department: u.department?.name ?? null,
    departmentId: u.departmentId,
    designation: u.designation,
    status: u.status as UserStatus,
    createdAt: u.createdAt?.toISOString?.() ?? u.createdAt,
    updatedAt: u.updatedAt?.toISOString?.() ?? u.updatedAt,
  };
}

// ─── Helper: map Prisma registration row → RegistrationRequest ────────────
function mapReg(r: any): RegistrationRequest {
  return {
    id: r.id,
    employeeId: r.employeeId,
    name: r.name,
    email: r.email,
    phone: r.phone,
    department: r.department,
    designation: r.designation,
    requestedRole: r.requestedRole as UserRole,
    passwordHash: r.passwordHash,
    status: r.status as 'PENDING' | 'APPROVED' | 'REJECTED',
    remarks: r.remarks,
    createdAt: r.createdAt?.toISOString?.() ?? r.createdAt,
    reviewedAt: r.reviewedAt?.toISOString?.() ?? r.reviewedAt ?? null,
  };
}

// ─── Seed founder on first call if missing ────────────────────────────────
let founderSeeded = false;

export async function ensureFounderSeedAsync(): Promise<PortalUser> {
  // Check DB first
  const existing = await db.user.findFirst({
    where: { role: 'SYSTEM_ADMIN' },
    include: { department: true },
  });
  if (existing) {
    founderSeeded = true;
    return mapUser(existing);
  }

  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!password) {
    throw new Error('Set BOOTSTRAP_ADMIN_PASSWORD in .env before the first run.');
  }

  const hash = await bcrypt.hash(password, 10);

  // Ensure department exists
  const dept = await db.department.upsert({
    where: { name: 'Executive' },
    update: {},
    create: { name: 'Executive', description: 'Executive leadership' },
  });

  const founder = await db.user.create({
    data: {
      employeeId: 'MIB01',
      name: 'G K Bharath',
      email: 'bharath@suryas.in',
      phone: '+91-90000-00001',
      passwordHash: hash,
      role: 'SYSTEM_ADMIN',
      departmentId: dept.id,
      designation: 'Founder & Chief Executive Partner',
      status: 'ACTIVE',
    },
    include: { department: true },
  });

  founderSeeded = true;
  return mapUser(founder);
}

/** Sync wrapper – used by legacy login route. Schedules async seed but does
 *  not block.  Call ensureFounderSeedAsync() in async contexts instead. */
export function ensureFounderSeed(): void {
  if (!founderSeeded) {
    ensureFounderSeedAsync().catch(() => {});
  }
}

// ─── User queries ─────────────────────────────────────────────────────────

export async function getUsers(): Promise<PortalUser[]> {
  const rows = await db.user.findMany({ include: { department: true }, orderBy: { createdAt: 'asc' } });
  return rows.map(mapUser);
}

export async function getUserByEmail(email: string): Promise<PortalUser | null> {
  const row = await db.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: { department: true },
  });
  return row ? mapUser(row) : null;
}

export async function getUserByEmployeeId(employeeId: string): Promise<PortalUser | null> {
  const row = await db.user.findFirst({
    where: { employeeId: { equals: employeeId, mode: 'insensitive' } },
    include: { department: true },
  });
  return row ? mapUser(row) : null;
}

// ─── Registration requests ────────────────────────────────────────────────

export async function createRegistrationRequest(
  input: Omit<RegistrationRequest, 'id' | 'status' | 'createdAt' | 'reviewedAt'> & {
    status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  }
): Promise<RegistrationRequest> {
  const row = await db.registrationRequest.create({
    data: {
      employeeId: input.employeeId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      department: input.department,
      designation: input.designation,
      requestedRole: input.requestedRole,
      passwordHash: input.passwordHash,
      status: input.status ?? 'PENDING',
      remarks: input.remarks,
    },
  });
  return mapReg(row);
}

export async function getRegistrationRequests(): Promise<RegistrationRequest[]> {
  const rows = await db.registrationRequest.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(mapReg);
}

export async function approveRegistrationRequest(id: string): Promise<PortalUser | null> {
  const request = await db.registrationRequest.findUnique({ where: { id } });
  if (!request) return null;

  // Check for duplicate email in users table
  const dup = await db.user.findFirst({ where: { email: { equals: request.email, mode: 'insensitive' } } });
  if (dup) throw new Error('Duplicate email');

  // Upsert department if provided
  let deptId: string | undefined;
  if (request.department) {
    const dept = await db.department.upsert({
      where: { name: request.department },
      update: {},
      create: { name: request.department },
    });
    deptId = dept.id;
  }

  const user = await db.user.create({
    data: {
      employeeId: request.employeeId,
      name: request.name,
      email: request.email,
      phone: request.phone,
      passwordHash: request.passwordHash,
      role: request.requestedRole,
      departmentId: deptId,
      designation: request.designation,
      status: 'ACTIVE',
    },
    include: { department: true },
  });

  await db.registrationRequest.update({
    where: { id },
    data: { status: 'APPROVED', reviewedAt: new Date() },
  });

  return mapUser(user);
}

export async function findUserByCredentials(email: string, password: string): Promise<PortalUser | null> {
  const user = await getUserByEmail(email);
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;
  return user;
}

export async function listDashboardStats() {
  const [totalUsers, activeUsers, pendingReg, admins] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { status: 'ACTIVE' } }),
    db.registrationRequest.count({ where: { status: 'PENDING' } }),
    db.user.count({ where: { role: 'SYSTEM_ADMIN' } }),
  ]);
  return { totalUsers, activeUsers, pendingRegistrations: pendingReg, admins };
}

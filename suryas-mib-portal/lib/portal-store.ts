import bcrypt from 'bcryptjs';

export type UserRole = 'SYSTEM_ADMIN' | 'MANAGING_PARTNER' | 'RECOMMENDER' | 'EMPLOYEE';
export type UserStatus = 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'REJECTED';

export type PortalUser = {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  phone?: string;
  passwordHash: string;
  role: UserRole;
  department?: string;
  designation?: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};

export type RegistrationRequest = {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  phone?: string;
  department?: string;
  designation?: string;
  requestedRole: UserRole;
  passwordHash: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  remarks?: string;
  createdAt: string;
  reviewedAt?: string;
};

const users: PortalUser[] = [];
const registrationRequests: RegistrationRequest[] = [];

export function ensureFounderSeed() {
  const existing = users.find((u) => u.role === 'SYSTEM_ADMIN');
  if (existing) return existing;

  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!password) {
    throw new Error('Set BOOTSTRAP_ADMIN_PASSWORD before initializing the Founder account.');
  }
  const hash = bcrypt.hashSync(password, 10);
  const founder: PortalUser = {
    id: 'founder-001',
    employeeId: 'MIB01',
    name: 'G K Bharath',
    email: 'bharath@suryas.in',
    phone: '+91-00000-00000',
    passwordHash: hash,
    role: 'SYSTEM_ADMIN',
    department: 'Executive',
    designation: 'Founder & Chief Executive Partner',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  users.push(founder);
  return founder;
}

export function getUsers() {
  return users;
}

export function getUserByEmail(email: string) {
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export function getUserByEmployeeId(employeeId: string) {
  return users.find((u) => u.employeeId.toLowerCase() === employeeId.toLowerCase());
}

export function createRegistrationRequest(input: Omit<RegistrationRequest, 'id' | 'status' | 'createdAt' | 'reviewedAt'> & { status?: 'PENDING' | 'APPROVED' | 'REJECTED' }) {
  const request: RegistrationRequest = {
    ...input,
    id: `reg-${Date.now()}`,
    status: input.status || 'PENDING',
    createdAt: new Date().toISOString(),
  };
  registrationRequests.push(request);
  return request;
}

export function getRegistrationRequests() {
  return registrationRequests;
}

export function approveRegistrationRequest(id: string) {
  const request = registrationRequests.find((r) => r.id === id);
  if (!request) return null;

  if (getUserByEmail(request.email)) {
    throw new Error('Duplicate email');
  }

  const user: PortalUser = {
    id: `user-${Date.now()}`,
    employeeId: request.employeeId,
    name: request.name,
    email: request.email,
    phone: request.phone,
    passwordHash: request.passwordHash,
    role: request.requestedRole,
    department: request.department,
    designation: request.designation,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  users.push(user);
  request.status = 'APPROVED';
  request.reviewedAt = new Date().toISOString();
  return user;
}

export function findUserByCredentials(email: string, password: string) {
  const user = getUserByEmail(email);
  if (!user) return null;
  const valid = bcrypt.compareSync(password, user.passwordHash);
  if (!valid) return null;
  return user;
}

export function listDashboardStats() {
  const activeUsers = users.filter((u) => u.status === 'ACTIVE').length;
  return {
    totalUsers: users.length,
    activeUsers,
    pendingRegistrations: registrationRequests.filter((r) => r.status === 'PENDING').length,
    admins: users.filter((u) => u.role === 'SYSTEM_ADMIN').length,
  };
}

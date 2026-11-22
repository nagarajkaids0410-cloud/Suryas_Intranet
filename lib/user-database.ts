import fs from 'fs';
import path from 'path';
import { getSupabaseAdmin } from './supabase';
import usersSeed from './users-seed.json';

export interface StoredUser {
  id: string;
  employeeId?: string;
  username: string;
  email: string;
  passwordHash: string;
  role:
    | 'founder'
    | 'managing-partner'
    | 'admin'
    | 'employee'
    | 'freelancer'
    | 'senior-freelancer'
    | 'intern'
    | 'project-intern'
    | 'guest'
    | 'user';
  employmentType?: 'full-time' | 'part-time';
  fullName: string;
  phone?: string;
  profilePhoto?: string;
  profilePictureUploaded?: boolean;
  designation?: string;
  department?: string;
  guideId?: string;
  guideName?: string;
  status?: 'pending_approval' | 'active' | 'rejected' | 'suspended';
  mustChangePassword?: boolean;
  sessionVersion?: number;
  requestedAt?: string;
  approvalStage?: number;
  registrationApprovalVersion?: number;
  approvalHistory?: Array<{
    actorId: string;
    actorUsername: string;
    actorRole: string;
    decision: 'approve' | 'deny';
    remarks: string;
    createdAt: string;
  }>;
  approvalRemarks?: string;
  approvedAt?: string;
  rejectedAt?: string;
  emailVerified?: boolean;
  verificationToken?: string;
  verificationSentAt?: string;
  resetToken?: string;
  resetTokenExpiresAt?: string;
  createdAt: string;
  isProfileCompleted?: boolean;
  profileCompletedAt?: string;
  selectedRole?: string;
}

// Load default seed users
function initializeUsers(): StoredUser[] {
  // 1. Try loading from file DB (.data/users.json) if available locally
  try {
    const { loadUsersFromDB } = require('./user-db');
    const loaded = loadUsersFromDB();
    if (loaded && loaded.length > 0) {
      return loaded;
    }
  } catch {}

  // 2. Bundled seed imported statically (guaranteed in serverless / Netlify)
  if (Array.isArray(usersSeed) && usersSeed.length > 0) {
    return usersSeed as StoredUser[];
  }

  return [];
}

let users: StoredUser[] = initializeUsers();

export function findUserByUsername(username: string): StoredUser | undefined {
  const normalizedUsername = (username || '').trim().toLowerCase();
  if (!normalizedUsername) return undefined;

  let user = users.find(
    (u) =>
      u.username.toLowerCase() === normalizedUsername ||
      u.email.toLowerCase() === normalizedUsername ||
      u.employeeId?.toLowerCase() === normalizedUsername
  );

  if (!user) {
    try {
      const { loadUsersFromDB } = require('./user-db');
      const fileUsers = loadUsersFromDB();
      if (fileUsers && fileUsers.length > 0) {
        user = fileUsers.find(
          (u: StoredUser) =>
            u.username.toLowerCase() === normalizedUsername ||
            u.email.toLowerCase() === normalizedUsername ||
            u.employeeId?.toLowerCase() === normalizedUsername
        );
        if (user) {
          const idx = users.findIndex((u) => u.id === user!.id);
          if (idx !== -1) users[idx] = user;
          else users.push(user);
        }
      }
    } catch {}
  }

  return user;
}

export function findUserById(id: string): StoredUser | undefined {
  if (!id) return undefined;

  let user = users.find((u) => u.id === id);

  if (!user) {
    try {
      const { loadUsersFromDB } = require('./user-db');
      const fileUsers = loadUsersFromDB();
      if (fileUsers && fileUsers.length > 0) {
        user = fileUsers.find((u: StoredUser) => u.id === id);
        if (user) {
          const idx = users.findIndex((u) => u.id === user!.id);
          if (idx !== -1) users[idx] = user;
          else users.push(user);
        }
      }
    } catch {}
  }

  return user;
}

export function findUserByVerificationToken(token: string): StoredUser | undefined {
  if (!token) return undefined;
  return users.find((u) => u.verificationToken === token);
}

export function findUserByResetToken(token: string): StoredUser | undefined {
  if (!token) return undefined;
  return users.find((u) => u.resetToken === token && !!u.resetTokenExpiresAt);
}

export function addUser(user: StoredUser): StoredUser {
  const idx = users.findIndex((u) => u.id === user.id);
  if (idx !== -1) users[idx] = user;
  else users.push(user);

  // Sync to Supabase in background
  try {
    const supabase = getSupabaseAdmin();
    Promise.resolve(supabase.from('users').upsert(user)).catch(() => {});
  } catch {}

  return user;
}

export function getAllUsers(): StoredUser[] {
  try {
    const { loadUsersFromDB } = require('./user-db');
    const persistedUsers = loadUsersFromDB();
    if (persistedUsers && persistedUsers.length > 0) {
      users = persistedUsers;
    }
  } catch {}

  return users;
}

export function getPendingUsers(): StoredUser[] {
  return users.filter((u) => u.status === 'pending_approval');
}

export function isUsernameTaken(username: string): boolean {
  return !!findUserByUsername(username);
}

export function approveUser(
  userId: string,
  username?: string,
  passwordHash?: string,
  updates?: Partial<StoredUser>
): StoredUser | undefined {
  const index = users.findIndex((u) => u.id === userId);
  if (index !== -1) {
    users[index] = {
      ...users[index],
      username: username || users[index].username,
      passwordHash: passwordHash || users[index].passwordHash,
      status: 'active',
      approvedAt: new Date().toISOString(),
      ...updates,
    };

    // Sync to Supabase in background
    try {
      const supabase = getSupabaseAdmin();
      Promise.resolve(supabase.from('users').update(users[index]).eq('id', userId)).catch(() => {});
    } catch {}

    return users[index];
  }
  return undefined;
}

export function denyUser(userId: string): boolean {
  const initial = users.length;
  users = users.filter((u) => u.id !== userId);

  // Sync to Supabase in background
  try {
    const supabase = getSupabaseAdmin();
    Promise.resolve(supabase.from('users').delete().eq('id', userId)).catch(() => {});
  } catch {}

  return users.length !== initial;
}

export function updateUser(username: string, updates: Partial<StoredUser>): StoredUser | undefined {
  const index = users.findIndex((u) => u.username === username);
  if (index !== -1) {
    users[index] = { ...users[index], ...updates };

    // Sync to Supabase in background
    try {
      const supabase = getSupabaseAdmin();
      Promise.resolve(supabase.from('users').update(updates).eq('username', username)).catch(() => {});
    } catch {}

    return users[index];
  }
  return undefined;
}

export function updateUserById(userId: string, updates: Partial<StoredUser>): StoredUser | undefined {
  const index = users.findIndex((u) => u.id === userId);
  if (index !== -1) {
    users[index] = { ...users[index], ...updates };

    // Sync to Supabase in background
    try {
      const supabase = getSupabaseAdmin();
      Promise.resolve(supabase.from('users').update(updates).eq('id', userId)).catch(() => {});
    } catch {}

    return users[index];
  }
  return undefined;
}

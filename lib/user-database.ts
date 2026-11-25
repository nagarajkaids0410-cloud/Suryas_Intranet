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

export const USER_METADATA_COLUMNS =
  'id,employeeId,username,email,passwordHash,role,employmentType,fullName,phone,profilePictureUploaded,designation,department,guideId,guideName,status,mustChangePassword,sessionVersion,passwordUpdatedAt,requestedAt,approvalStage,registrationApprovalVersion,approvalHistory,approvalRemarks,approvedAt,rejectedAt,emailVerified,verificationToken,verificationSentAt,resetToken,resetTokenExpiresAt,createdAt,isProfileCompleted,profileCompletedAt,selectedRole';

const INLINE_PHOTO_MAX_CHARS = 150_000;

export function toSafeClientPhoto(userId: string, profilePhoto?: string): string | undefined {
  if (!profilePhoto) return undefined;
  if (profilePhoto.length <= INLINE_PHOTO_MAX_CHARS) return profilePhoto;
  return `/api/users/photo?id=${encodeURIComponent(userId)}`;
}

function mergeUserIntoCache(incoming: StoredUser): StoredUser {
  const idx = users.findIndex((u) => u.id === incoming.id);
  if (idx !== -1) {
    users[idx] = {
      ...users[idx],
      ...incoming,
      profilePhoto: incoming.profilePhoto !== undefined ? incoming.profilePhoto : users[idx].profilePhoto,
    };
    return users[idx];
  }
  users.push(incoming);
  return incoming;
}

function toSupabaseUpdate(updates: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(updates)) {
    result[k] = v === undefined ? null : v;
  }
  return result;
}

function toSupabaseRow(user: StoredUser): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(user)) {
    if (v !== undefined) row[k] = v;
  }
  return row;
}

export async function getAllUsersAsync(options?: { includePhotos?: boolean }): Promise<StoredUser[]> {
  try {
    const supabase = getSupabaseAdmin();
    const cols = options?.includePhotos ? '*' : USER_METADATA_COLUMNS;
    const { data, error } = await supabase.from('users').select(cols);
    if (!error && Array.isArray(data) && data.length > 0) {
      const merged = (data as unknown as StoredUser[]).map(mergeUserIntoCache);
      return merged;
    }
  } catch (err) {
    console.warn('[Supabase getAllUsersAsync error]:', err);
  }
  return getAllUsers();
}

export async function findUserByIdAsync(id: string, options?: { includePhoto?: boolean }): Promise<StoredUser | undefined> {
  if (!id) return undefined;
  try {
    const supabase = getSupabaseAdmin();
    const cols = options?.includePhoto ? '*' : USER_METADATA_COLUMNS;
    const { data, error } = await supabase
      .from('users')
      .select(cols)
      .eq('id', id)
      .maybeSingle();
    if (!error && data) {
      return mergeUserIntoCache(data as unknown as StoredUser);
    }
    const { data: byUsername, error: err2 } = await supabase
      .from('users')
      .select(cols)
      .ilike('username', id)
      .limit(1)
      .maybeSingle();
    if (!err2 && byUsername) {
      return mergeUserIntoCache(byUsername as unknown as StoredUser);
    }
  } catch (err) {
    console.warn('[Supabase findUserByIdAsync error]:', err);
  }
  return findUserById(id);
}

export async function findUserByUsernameAsync(username: string, options?: { includePhoto?: boolean }): Promise<StoredUser | undefined> {
  const normalized = (username || '').trim().toLowerCase();
  if (!normalized) return undefined;
  try {
    const supabase = getSupabaseAdmin();
    const cols = options?.includePhoto ? '*' : USER_METADATA_COLUMNS;
    for (const col of ['username', 'email', 'employeeId', 'fullName'] as const) {
      const { data, error } = await supabase
        .from('users')
        .select(cols)
        .ilike(col, normalized)
        .limit(1)
        .maybeSingle();
      if (!error && data) {
        return mergeUserIntoCache(data as unknown as StoredUser);
      }
    }
  } catch (err) {
    console.warn('[Supabase findUserByUsernameAsync error]:', err);
  }
  return findUserByUsername(normalized);
}

export async function findUserByVerificationTokenAsync(token: string): Promise<StoredUser | undefined> {
  if (!token) return undefined;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('users')
      .select(USER_METADATA_COLUMNS)
      .eq('verificationToken', token)
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      return mergeUserIntoCache(data as unknown as StoredUser);
    }
  } catch {}
  return findUserByVerificationToken(token);
}

export async function findUserByResetTokenAsync(token: string): Promise<StoredUser | undefined> {
  if (!token) return undefined;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('users')
      .select(USER_METADATA_COLUMNS)
      .eq('resetToken', token)
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      return mergeUserIntoCache(data as unknown as StoredUser);
    }
  } catch {}
  return findUserByResetToken(token);
}

export async function addUserAndSync(user: StoredUser): Promise<StoredUser> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('users').upsert(toSupabaseRow(user));
  if (error) {
    console.error('[Supabase addUserAndSync error]:', error);
    throw new Error(error.message || 'Failed to save user to database');
  }
  mergeUserIntoCache(user);
  try {
    const { saveUsersToDB } = require('./user-db');
    saveUsersToDB(users, { skipSupabase: true });
  } catch {}
  return user;
}

export async function updateUserByIdAndSync(userId: string, updates: Partial<StoredUser>): Promise<StoredUser | undefined> {
  const supabase = getSupabaseAdmin();
  const cleanUpdates = toSupabaseUpdate(updates as Record<string, unknown>);
  const { data, error } = await supabase
    .from('users')
    .update(cleanUpdates)
    .eq('id', userId)
    .select(USER_METADATA_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error('[Supabase updateUserByIdAndSync error]:', error);
    throw new Error(error.message || 'Failed to update user in database');
  }

  let merged: StoredUser | undefined;
  if (data) {
    merged = mergeUserIntoCache(data as unknown as StoredUser);
    if (typeof updates.profilePhoto === 'string') {
      merged.profilePhoto = updates.profilePhoto;
    }
  } else {
    const idx = users.findIndex((u) => u.id === userId);
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...updates };
      merged = users[idx];
    }
  }

  if (merged) {
    try {
      const { updateUserInDB } = require('./user-db');
      updateUserInDB(userId, updates, { skipSupabase: true });
    } catch {}
  }

  return merged;
}

export function findUserByUsername(username: string): StoredUser | undefined {
  const normalizedUsername = (username || '').trim().toLowerCase();
  if (!normalizedUsername) return undefined;

  let user = users.find(
    (u) =>
      u.username.toLowerCase() === normalizedUsername ||
      u.email.toLowerCase() === normalizedUsername ||
      u.employeeId?.toLowerCase() === normalizedUsername ||
      u.fullName?.toLowerCase() === normalizedUsername
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
            u.employeeId?.toLowerCase() === normalizedUsername ||
            u.fullName?.toLowerCase() === normalizedUsername
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

  let user = users.find((u) => u.id === id || u.username.toLowerCase() === id.toLowerCase());

  if (!user) {
    try {
      const { loadUsersFromDB } = require('./user-db');
      const fileUsers = loadUsersFromDB();
      if (fileUsers && fileUsers.length > 0) {
        user = fileUsers.find((u: StoredUser) => u.id === id || u.username.toLowerCase() === id.toLowerCase());
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

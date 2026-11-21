import { getSupabaseAdmin } from './supabase';

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

const defaultUsers: StoredUser[] = [];

// Initialize from file DB if available (for local offline fallback)
function initializeUsers(): StoredUser[] {
  try {
    const { loadUsersFromDB } = require('./user-db');
    const loaded = loadUsersFromDB();
    if (loaded && loaded.length > 0) {
      return loaded;
    }
  } catch {
    // Fallback to empty defaults
  }
  return defaultUsers;
}

let users: StoredUser[] = initializeUsers();

export async function findUserByUsername(username: string): Promise<StoredUser | undefined> {
  const normalizedUsername = (username || '').trim().toLowerCase();
  if (!normalizedUsername) return undefined;

  // 1. Query Supabase
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .or(`username.ilike.${normalizedUsername},email.ilike.${normalizedUsername},employeeId.ilike.${normalizedUsername}`)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      const foundUser = data as StoredUser;
      const index = users.findIndex((u) => u.id === foundUser.id);
      if (index !== -1) users[index] = foundUser;
      else users.push(foundUser);
      return foundUser;
    }
  } catch (err) {
    console.warn('[Supabase findUserByUsername error]:', err);
  }

  // 2. Fallback to in-memory / local cache
  return users.find((u) =>
    u.username.toLowerCase() === normalizedUsername ||
    u.email.toLowerCase() === normalizedUsername ||
    u.employeeId?.toLowerCase() === normalizedUsername
  );
}

export async function findUserById(id: string): Promise<StoredUser | undefined> {
  if (!id) return undefined;

  // 1. Query Supabase
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      const foundUser = data as StoredUser;
      const index = users.findIndex((u) => u.id === foundUser.id);
      if (index !== -1) users[index] = foundUser;
      else users.push(foundUser);
      return foundUser;
    }
  } catch (err) {
    console.warn('[Supabase findUserById error]:', err);
  }

  // 2. Fallback to in-memory
  return users.find((u) => u.id === id);
}

export async function findUserByVerificationToken(token: string): Promise<StoredUser | undefined> {
  if (!token) return undefined;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('verificationToken', token)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return data as StoredUser;
    }
  } catch (err) {
    console.warn('[Supabase findUserByVerificationToken error]:', err);
  }

  return users.find((u) => u.verificationToken === token);
}

export async function findUserByResetToken(token: string): Promise<StoredUser | undefined> {
  if (!token) return undefined;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('resetToken', token)
      .limit(1)
      .maybeSingle();

    if (!error && data && data.resetTokenExpiresAt) {
      return data as StoredUser;
    }
  } catch (err) {
    console.warn('[Supabase findUserByResetToken error]:', err);
  }

  return users.find((u) => u.resetToken === token && !!u.resetTokenExpiresAt);
}

export async function addUser(user: StoredUser): Promise<StoredUser> {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('users').upsert(user);
  } catch (err) {
    console.warn('[Supabase addUser error]:', err);
  }

  const idx = users.findIndex((u) => u.id === user.id);
  if (idx !== -1) users[idx] = user;
  else users.push(user);
  return user;
}

export async function getAllUsers(): Promise<StoredUser[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('createdAt', { ascending: false });

    if (!error && data && data.length > 0) {
      users = data as StoredUser[];
      return users;
    }
  } catch (err) {
    console.warn('[Supabase getAllUsers error]:', err);
  }

  return users;
}

export function getPendingUsers(): StoredUser[] {
  return users.filter((u) => u.status === 'pending_approval');
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  const user = await findUserByUsername(username);
  return !!user;
}

export async function approveUser(
  userId: string,
  username?: string,
  passwordHash?: string,
  updates?: Partial<StoredUser>
): Promise<StoredUser | undefined> {
  const updatePayload: Partial<StoredUser> = {
    ...(username ? { username } : {}),
    ...(passwordHash ? { passwordHash } : {}),
    status: 'active',
    approvedAt: new Date().toISOString(),
    ...updates,
  };

  return updateUserById(userId, updatePayload);
}

export async function denyUser(userId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('users').delete().eq('id', userId);
  } catch (err) {
    console.warn('[Supabase denyUser error]:', err);
  }

  const initial = users.length;
  users = users.filter((u) => u.id !== userId);
  return users.length !== initial;
}

export async function updateUser(username: string, updates: Partial<StoredUser>): Promise<StoredUser | undefined> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('users')
      .update(updates)
      .eq('username', username)
      .select()
      .maybeSingle();

    if (data) {
      const idx = users.findIndex((u) => u.username === username);
      if (idx !== -1) users[idx] = data as StoredUser;
      return data as StoredUser;
    }
  } catch (err) {
    console.warn('[Supabase updateUser error]:', err);
  }

  const index = users.findIndex((u) => u.username === username);
  if (index !== -1) {
    users[index] = { ...users[index], ...updates };
    return users[index];
  }
  return undefined;
}

export async function updateUserById(userId: string, updates: Partial<StoredUser>): Promise<StoredUser | undefined> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .maybeSingle();

    if (data) {
      const idx = users.findIndex((u) => u.id === userId);
      if (idx !== -1) users[idx] = data as StoredUser;
      return data as StoredUser;
    }
  } catch (err) {
    console.warn('[Supabase updateUserById error]:', err);
  }

  const index = users.findIndex((u) => u.id === userId);
  if (index !== -1) {
    users[index] = { ...users[index], ...updates };
    return users[index];
  }
  return undefined;
}

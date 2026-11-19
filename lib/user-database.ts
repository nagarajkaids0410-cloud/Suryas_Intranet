// Simple in-memory user storage (can be replaced with PostgreSQL)
// For production, use a real database

export interface StoredUser {
  id: string;
  employeeId?: string;
  username: string;
  email: string;
  passwordHash: string;
  // Role is now the primary role; employmentType is optional for part/full-time
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

// Initialize from file DB or use defaults
function initializeUsers(): StoredUser[] {
  try {
    const { loadUsersFromDB } = require('./user-db');
    const loaded = loadUsersFromDB();
    if (loaded && loaded.length > 0) {
      console.log('[USER-DB-INIT] Loaded', loaded.length, 'users from file DB');
      return loaded;
    }
  } catch (err) {
    console.log('[USER-DB-INIT] Could not load from file, using defaults');
  }
  return defaultUsers;
}

let users: StoredUser[] = initializeUsers();

export function findUserByUsername(username: string): StoredUser | undefined {
  const normalizedUsername = username.trim().toLowerCase();
  // First check in-memory
  let user = users.find((u) =>
    u.username.toLowerCase() === normalizedUsername ||
    u.email.toLowerCase() === normalizedUsername ||
    u.employeeId?.toLowerCase() === normalizedUsername
  );
  
  // If not found or to ensure we have the latest version, also check file DB
  try {
    const { loadUsersFromDB } = require('./user-db');
    const fileUsers = loadUsersFromDB();
    if (fileUsers && fileUsers.length > 0) {
      const fileUser = fileUsers.find((u: StoredUser) =>
        u.username.toLowerCase() === normalizedUsername ||
        u.email.toLowerCase() === normalizedUsername ||
        u.employeeId?.toLowerCase() === normalizedUsername
      );
      if (fileUser) {
        // Update in-memory with latest from file
        const index = users.findIndex((u) => u.id === fileUser.id);
        if (index !== -1) {
          users[index] = fileUser;
        } else {
          users.push(fileUser);
        }
        return fileUser;
      }
    }
  } catch (err) {
    // Fallback to in-memory
  }
  
  return user;
}

export function findUserById(id: string): StoredUser | undefined {
  // First check in-memory
  let user = users.find((u) => u.id === id);
  
  // If not found or to ensure we have the latest version, also check file DB
  try {
    const { loadUsersFromDB } = require('./user-db');
    const fileUsers = loadUsersFromDB();
    if (fileUsers && fileUsers.length > 0) {
      const fileUser = fileUsers.find((u: StoredUser) => u.id === id);
      if (fileUser) {
        // Update in-memory with latest from file
        const index = users.findIndex((u) => u.id === id);
        if (index !== -1) {
          users[index] = fileUser;
        } else {
          users.push(fileUser);
        }
        return fileUser;
      }
    }
  } catch (err) {
    // Fallback to in-memory
  }
  
  return user;
}

export function findUserByVerificationToken(token: string): StoredUser | undefined {
  // First check in-memory
  let user = users.find((u) => u.verificationToken === token);
  
  // Also check file DB
  try {
    const { loadUsersFromDB } = require('./user-db');
    const fileUsers = loadUsersFromDB();
    if (fileUsers && fileUsers.length > 0) {
      const fileUser = fileUsers.find((u: StoredUser) => u.verificationToken === token);
      if (fileUser) {
        const index = users.findIndex((u) => u.id === fileUser.id);
        if (index !== -1) {
          users[index] = fileUser;
        } else {
          users.push(fileUser);
        }
        return fileUser;
      }
    }
  } catch (err) {
    // Fallback to in-memory
  }
  
  return user;
}

export function findUserByResetToken(token: string): StoredUser | undefined {
  // First check in-memory
  let user = users.find((u) => u.resetToken === token && !!u.resetTokenExpiresAt);
  
  // Also check file DB
  try {
    const { loadUsersFromDB } = require('./user-db');
    const fileUsers = loadUsersFromDB();
    if (fileUsers && fileUsers.length > 0) {
      const fileUser = fileUsers.find((u: StoredUser) => u.resetToken === token && !!u.resetTokenExpiresAt);
      if (fileUser) {
        const index = users.findIndex((u) => u.id === fileUser.id);
        if (index !== -1) {
          users[index] = fileUser;
        } else {
          users.push(fileUser);
        }
        return fileUser;
      }
    }
  } catch (err) {
    // Fallback to in-memory
  }
  
  return user;
}

export function addUser(user: StoredUser): StoredUser {
  users.push(user);
  return user;
}

export function getAllUsers(): StoredUser[] {
  try {
    const { loadUsersFromDB } = require('./user-db');
    const persistedUsers = loadUsersFromDB();
    if (persistedUsers.length > 0) users = persistedUsers;
  } catch {
    // Keep the in-memory list available if the file database cannot be read.
  }
  return users;
}

export function getPendingUsers(): StoredUser[] {
  console.log('[getPendingUsers] Total users in DB:', users.length);
  users.forEach(u => console.log('  - User:', u.username, 'Status:', u.status));
  const pending = users.filter((u) => u.status === 'pending_approval');
  console.log('[getPendingUsers] Pending users found:', pending.length);
  return pending;
}

export function isUsernameTaken(username: string): boolean {
  return !!findUserByUsername(username);
}

export function approveUser(userId: string, username?: string, passwordHash?: string, updates?: Partial<StoredUser>): StoredUser | undefined {
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
    return users[index];
  }
  return undefined;
}

export function denyUser(userId: string): boolean {
  const initial = users.length;
  users = users.filter((u) => u.id !== userId);
  return users.length !== initial;
}

export function updateUser(username: string, updates: Partial<StoredUser>): StoredUser | undefined {
  const index = users.findIndex((u) => u.username === username);
  if (index !== -1) {
    users[index] = { ...users[index], ...updates };
    return users[index];
  }
  return undefined;
}

export function updateUserById(userId: string, updates: Partial<StoredUser>): StoredUser | undefined {
  const index = users.findIndex((u) => u.id === userId);
  if (index !== -1) {
    users[index] = { ...users[index], ...updates };
    return users[index];
  }
  return undefined;
}

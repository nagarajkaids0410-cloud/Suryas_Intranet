import fs from 'fs';
import path from 'path';
import { StoredUser } from './user-database';
import { getSupabaseAdmin } from './supabase';

const DB_FILE = path.join(process.cwd(), '.data', 'users.json');
let cachedUsers: StoredUser[] | undefined;
let cachedFileSignature = '';

function ensureDBDir() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
}

function readDB(): StoredUser[] {
  try {
    ensureDBDir();
    if (!fs.existsSync(DB_FILE)) {
      return cachedUsers || [];
    }
    const stats = fs.statSync(DB_FILE);
    const fileSignature = `${stats.mtimeMs}:${stats.size}`;
    if (cachedUsers && cachedFileSignature === fileSignature) return cachedUsers;
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    const users: StoredUser[] = JSON.parse(data) || [];
    cachedUsers = users;
    cachedFileSignature = fileSignature;
    return users;
  } catch (error) {
    return cachedUsers || [];
  }
}

function writeDB(users: StoredUser[]): boolean {
  try {
    ensureDBDir();
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
    cachedUsers = users;
    const stats = fs.statSync(DB_FILE);
    cachedFileSignature = `${stats.mtimeMs}:${stats.size}`;
    return true;
  } catch {
    cachedUsers = users;
    return true; // Still allow memory update on read-only systems
  }
}

export function saveUsersToDB(users: StoredUser[]) {
  writeDB(users);
  try {
    const supabase = getSupabaseAdmin();
    supabase.from('users').upsert(users).then(() => {}).catch(() => {});
  } catch {}
}

export function loadUsersFromDB(): StoredUser[] {
  return readDB();
}

export function updateUserInDB(id: string, updates: Partial<StoredUser>) {
  const users = readDB();
  const index = users.findIndex((u) => u.id === id);
  if (index !== -1) {
    users[index] = { ...users[index], ...updates };
    writeDB(users);
  }

  try {
    const supabase = getSupabaseAdmin();
    supabase.from('users').update(updates).eq('id', id).then(() => {}).catch(() => {});
  } catch {}

  return index !== -1 ? users[index] : undefined;
}

export function updateUserByUsernameInDB(username: string, updates: Partial<StoredUser>) {
  const users = readDB();
  const index = users.findIndex((u) => u.username === username);
  if (index !== -1) {
    users[index] = { ...users[index], ...updates };
    writeDB(users);
  }

  try {
    const supabase = getSupabaseAdmin();
    supabase.from('users').update(updates).eq('username', username).then(() => {}).catch(() => {});
  } catch {}

  return index !== -1 ? users[index] : undefined;
}

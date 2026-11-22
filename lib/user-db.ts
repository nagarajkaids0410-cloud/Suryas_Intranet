import fs from 'fs';
import path from 'path';
import { StoredUser } from './user-database';
import { getSupabaseAdmin } from './supabase';
import usersSeed from './users-seed.json';

const DB_FILE = path.join(process.cwd(), '.data', 'users.json');

let cachedUsers: StoredUser[] | undefined;
let cachedFileSignature = '';

function readDB(): StoredUser[] {
  try {
    // 1. Try .data/users.json if it exists (local dev)
    if (fs.existsSync(DB_FILE)) {
      const stats = fs.statSync(DB_FILE);
      const fileSignature = `${stats.mtimeMs}:${stats.size}`;
      if (cachedUsers && cachedFileSignature === fileSignature) return cachedUsers;
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      const users: StoredUser[] = JSON.parse(data) || [];
      cachedUsers = users;
      cachedFileSignature = fileSignature;
      return users;
    }

    // 2. Fallback to bundled seed (works in Netlify serverless)
    if (Array.isArray(usersSeed) && usersSeed.length > 0) {
      cachedUsers = usersSeed as StoredUser[];
      return cachedUsers;
    }

    return cachedUsers || [];
  } catch (error) {
    return cachedUsers || (usersSeed as StoredUser[]) || [];
  }
}

function writeDB(users: StoredUser[]): boolean {
  cachedUsers = users;
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
    const stats = fs.statSync(DB_FILE);
    cachedFileSignature = `${stats.mtimeMs}:${stats.size}`;
  } catch {
    // Read-only filesystem on Netlify is expected
  }
  return true;
}

export function saveUsersToDB(users: StoredUser[]) {
  writeDB(users);
  try {
    const supabase = getSupabaseAdmin();
    Promise.resolve(supabase.from('users').upsert(users)).catch(() => {});
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
    Promise.resolve(supabase.from('users').update(updates).eq('id', id)).catch(() => {});
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
    Promise.resolve(supabase.from('users').update(updates).eq('username', username)).catch(() => {});
  } catch {}

  return index !== -1 ? users[index] : undefined;
}

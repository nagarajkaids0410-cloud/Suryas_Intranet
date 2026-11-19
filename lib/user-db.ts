import fs from 'fs';
import path from 'path';
import { StoredUser } from './user-database';

const DB_FILE = path.join(process.cwd(), '.data', 'users.json');
let cachedUsers: StoredUser[] | undefined;
let cachedFileSignature = '';

function ensureDBDir() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readDB(): StoredUser[] {
  try {
    ensureDBDir();
    if (!fs.existsSync(DB_FILE)) {
      const emptyUsers: StoredUser[] = [];
      cachedUsers = emptyUsers;
      cachedFileSignature = '';
      return emptyUsers;
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
    console.error('Error reading user DB:', error);
    return [];
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
  } catch (error) {
    console.error('Error writing user DB:', error);
    return false;
  }
}

export function saveUsersToDB(users: StoredUser[]) {
  writeDB(users);
}

export function loadUsersFromDB(): StoredUser[] {
  return readDB();
}

export function updateUserInDB(id: string, updates: Partial<StoredUser>) {
  const users = readDB();
  const index = users.findIndex((u) => u.id === id);
  if (index !== -1) {
    users[index] = { ...users[index], ...updates };
    return writeDB(users) ? users[index] : undefined;
  }
  return undefined;
}

export function updateUserByUsernameInDB(username: string, updates: Partial<StoredUser>) {
  const users = readDB();
  const index = users.findIndex((u) => u.username === username);
  if (index !== -1) {
    users[index] = { ...users[index], ...updates };
    return writeDB(users) ? users[index] : undefined;
  }
  return undefined;
}

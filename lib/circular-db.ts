import fs from 'fs';
import path from 'path';
import type { Circular } from '@/app/api/circulars/route';

const DB_PATH = path.join(process.cwd(), '.data', 'circulars.json');

function ensureDBDir() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

export function getCircularsDB(): Circular[] {
  ensureDBDir();
  if (!fs.existsSync(DB_PATH)) return [];

  const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')) as unknown;
  if (!Array.isArray(data)) {
    throw new Error('Circular store must contain an array');
  }
  return data as Circular[];
}

function writeCircularsDB(circulars: Circular[]) {
  ensureDBDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(circulars, null, 2), 'utf-8');
}

export function addCircularDB(circular: Circular): Circular {
  const circulars = getCircularsDB();
  circulars.unshift(circular);
  writeCircularsDB(circulars);
  return circular;
}

export function updateCircularDB(
  id: string,
  updates: Pick<Circular, 'title' | 'content' | 'priority' | 'meta'>
): Circular | undefined {
  const circulars = getCircularsDB();
  const index = circulars.findIndex((circular) => circular.id === id);
  if (index === -1) return undefined;

  circulars[index] = { ...circulars[index], ...updates };
  writeCircularsDB(circulars);
  return circulars[index];
}

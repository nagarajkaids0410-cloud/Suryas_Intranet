import fs from 'fs';
import path from 'path';
import type { Circular } from '@/app/api/circulars/route';
import { getSupabaseAdmin } from './supabase';

const DB_PATH = path.join(process.cwd(), '.data', 'circulars.json');
let cachedCirculars: Circular[] | undefined;

function ensureDBDir() {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {}
}

export function getCircularsDB(): Circular[] {
  if (cachedCirculars) return cachedCirculars;
  try {
    ensureDBDir();
    if (!fs.existsSync(DB_PATH)) return [];

    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')) as unknown;
    if (Array.isArray(data)) {
      cachedCirculars = data as Circular[];
      return cachedCirculars;
    }
  } catch {}
  return cachedCirculars || [];
}

function writeCircularsDB(circulars: Circular[]) {
  cachedCirculars = circulars;
  try {
    ensureDBDir();
    fs.writeFileSync(DB_PATH, JSON.stringify(circulars, null, 2), 'utf-8');
  } catch {}
}

export async function fetchCircularsFromSupabase(): Promise<Circular[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('circulars').select('*').order('postedAt', { ascending: false });
    if (!error && data) {
      cachedCirculars = data as Circular[];
      return cachedCirculars;
    }
  } catch (err) {
    console.warn('[Supabase fetchCirculars error]:', err);
  }
  return getCircularsDB();
}

export function addCircularDB(circular: Circular): Circular {
  const circulars = cachedCirculars || getCircularsDB();
  circulars.unshift(circular);
  writeCircularsDB(circulars);

  // Background sync
  try {
    const supabase = getSupabaseAdmin();
    Promise.resolve(supabase.from('circulars').upsert(circular)).catch(() => {});
  } catch {}

  return circular;
}

export async function addCircularAndSyncDB(circular: Circular): Promise<Circular> {
  addCircularDB(circular);
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('circulars').upsert(circular);
  } catch (err) {
    console.warn('[Supabase addCircularAndSyncDB error]:', err);
  }
  return circular;
}

export function updateCircularDB(
  id: string,
  updates: Pick<Circular, 'title' | 'content' | 'priority' | 'meta'>
): Circular | undefined {
  const circulars = cachedCirculars || getCircularsDB();
  const index = circulars.findIndex((circular) => circular.id === id);
  if (index === -1) return undefined;

  circulars[index] = { ...circulars[index], ...updates };
  writeCircularsDB(circulars);

  // Background sync
  try {
    const supabase = getSupabaseAdmin();
    Promise.resolve(supabase.from('circulars').update(updates).eq('id', id)).catch(() => {});
  } catch {}

  return circulars[index];
}

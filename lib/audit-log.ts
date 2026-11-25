import fs from 'fs';
import path from 'path';
import { getSupabaseAdmin } from './supabase';

const AUDIT_FILE = path.join(process.cwd(), '.data', 'audit-log.json');
const AUDIT_JOURNAL_FILE = path.join(process.cwd(), '.data', 'audit-log.jsonl');

function ensureDir() {
  const dir = path.dirname(AUDIT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(AUDIT_FILE)) fs.writeFileSync(AUDIT_FILE, JSON.stringify([]));
}

export interface AuditEntry {
  id: string;
  action: string;
  actor?: string;
  actorId?: string;
  details?: Record<string, any>;
  timestamp: string;
}

function buildAuditEntry(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
  return {
    id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
}

function appendLocalAuditEntry(next: AuditEntry) {
  try {
    ensureDir();
    fs.appendFileSync(AUDIT_JOURNAL_FILE, `${JSON.stringify(next)}\n`, 'utf-8');
  } catch {
    // Read-only filesystem on Netlify is expected
  }
}

export function addAuditEntry(entry: Omit<AuditEntry, 'id' | 'timestamp'>, options?: { skipSupabase?: boolean }) {
  const next = buildAuditEntry(entry);
  appendLocalAuditEntry(next);

  if (!options?.skipSupabase) {
    try {
      const supabase = getSupabaseAdmin();
      Promise.resolve(supabase.from('audit_logs').upsert(next)).catch((err) => {
        console.warn('[Supabase addAuditEntry error]:', err);
      });
    } catch {}
  }

  return next;
}

export async function addAuditEntryAndSync(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<AuditEntry> {
  const next = buildAuditEntry(entry);
  appendLocalAuditEntry(next);

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('audit_logs').upsert(next);
    if (error) {
      console.error('[Supabase addAuditEntryAndSync error]:', error);
    }
  } catch (err) {
    console.error('[Supabase addAuditEntryAndSync exception]:', err);
  }

  return next;
}

export async function readAuditLogFromSupabase(): Promise<AuditEntry[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(1000);
    if (!error && Array.isArray(data)) {
      return data as AuditEntry[];
    }
  } catch (err) {
    console.warn('[Supabase readAuditLogFromSupabase error]:', err);
  }
  return readAuditLog();
}

export function readAuditLog(): AuditEntry[] {
  try {
    ensureDir();
    const raw = fs.readFileSync(AUDIT_FILE, 'utf-8');
    const legacyEntries: AuditEntry[] = JSON.parse(raw) || [];
    if (!fs.existsSync(AUDIT_JOURNAL_FILE)) return legacyEntries;
    const journalEntries = fs.readFileSync(AUDIT_JOURNAL_FILE, 'utf-8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AuditEntry)
      .reverse();
    return [...journalEntries, ...legacyEntries];
  } catch (error) {
    return [];
  }
}

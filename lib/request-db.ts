import fs from 'fs';
import path from 'path';
import { randomInt } from 'node:crypto';
import { RequestItem } from './request-store';
import { addAuditEntry } from './audit-log';
import { getSupabaseAdmin } from './supabase';

const DB_FILE = path.join(process.cwd(), '.data', 'requests.json');
let cachedRequests: RequestItem[] | undefined;
let cachedFileSignature = '';

export function generateRequestIdentifiers(): { id: string; submissionId: string } {
  const usedIds = new Set(
    readDB().flatMap((request) => [request.id, request.submissionId].filter(Boolean) as string[])
  );
  const generateId = () => {
    for (let attempt = 0; attempt < 10000; attempt += 1) {
      const id = String(randomInt(1000, 10000));
      if (!usedIds.has(id)) {
        usedIds.add(id);
        return id;
      }
    }
    throw new Error('No available four-digit request identifiers remain');
  };

  return { id: generateId(), submissionId: generateId() };
}

function ensureDBDir() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
}

function readDB(): RequestItem[] {
  try {
    ensureDBDir();
    if (!fs.existsSync(DB_FILE)) {
      return cachedRequests || [];
    }
    const stats = fs.statSync(DB_FILE);
    const fileSignature = `${stats.mtimeMs}:${stats.size}`;
    if (cachedRequests && cachedFileSignature === fileSignature) return cachedRequests;
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    const requests: RequestItem[] = JSON.parse(data) || [];
    cachedRequests = requests;
    cachedFileSignature = fileSignature;
    return requests;
  } catch (error) {
    return cachedRequests || [];
  }
}

function writeDB(requests: RequestItem[]) {
  cachedRequests = requests;
  try {
    ensureDBDir();
    fs.writeFileSync(DB_FILE, JSON.stringify(requests));
    const stats = fs.statSync(DB_FILE);
    cachedFileSignature = `${stats.mtimeMs}:${stats.size}`;
  } catch (error) {
    // Read-only filesystem on Netlify is expected
  }
}

export async function fetchRequestsFromSupabase(): Promise<RequestItem[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .order('createdAt', { ascending: false });

    if (!error && data) {
      cachedRequests = data as RequestItem[];
      return cachedRequests;
    }
  } catch (err) {
    console.warn('[Supabase fetchRequests error]:', err);
  }
  return cachedRequests || readDB();
}

export function addRequestDB(request: RequestItem): RequestItem {
  const requests = cachedRequests || readDB();
  requests.unshift(request);
  writeDB(requests);

  // Sync to Supabase in background
  try {
    const supabase = getSupabaseAdmin();
    Promise.resolve(supabase.from('requests').upsert(request)).catch((err) => {
      console.warn('[Supabase addRequest error]:', err);
    });
  } catch {}

  try {
    addAuditEntry({ action: 'request:created', actor: request.createdBy, actorId: request.createdById, details: { id: request.id, type: request.type, title: request.title } });
  } catch (e) {
    console.error('Audit log failed for addRequestDB', e);
  }
  return request;
}

export async function persistRequestDB(request: RequestItem): Promise<RequestItem> {
  addRequestDB(request);
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('requests').upsert(request);
    if (error) console.error('[Supabase persistRequestDB error]:', error);
  } catch (err) {
    console.error('[Supabase persistRequestDB exception]:', err);
  }
  return request;
}

export function getRequestsByTargetDB(target: 'admin' | 'founder' | 'all'): RequestItem[] {
  const requests = cachedRequests || readDB();
  if (target === 'all') {
    return [...requests];
  }
  return requests.filter((req) => req.target === target);
}

export function getRequestByIdDB(id: string): RequestItem | undefined {
  const requests = cachedRequests || readDB();
  return requests.find((req) => req.id === id);
}

export function updateRequestStatusDB(
  id: string,
  status: 'pending' | 'approved' | 'rejected' | 'signed' | 'forwarded',
  updates?: Partial<RequestItem>
): RequestItem | undefined {
  const requests = cachedRequests || readDB();
  const index = requests.findIndex((req) => req.id === id);
  if (index !== -1) {
    const updated = {
      ...requests[index],
      status,
      updatedAt: new Date().toISOString(),
      ...updates,
    };
    requests[index] = updated;
    writeDB(requests);

    // Sync to Supabase in background
    try {
      const supabase = getSupabaseAdmin();
      Promise.resolve(supabase.from('requests').upsert(updated)).catch((err) => {
        console.warn('[Supabase updateRequestStatus error]:', err);
      });
    } catch {}

    try {
      addAuditEntry({ action: `request:${status}`, actor: updates?.forwardedTo || requests[index].createdBy, actorId: requests[index].createdById, details: { id, updates } });
    } catch (e) {
      console.error('Audit log failed for updateRequestStatusDB', e);
    }
    return requests[index];
  }
  return undefined;
}

export async function updateRequestStatusAndSyncDB(
  id: string,
  status: 'pending' | 'approved' | 'rejected' | 'signed' | 'forwarded',
  updates?: Partial<RequestItem>
): Promise<RequestItem | undefined> {
  const updated = updateRequestStatusDB(id, status, updates);
  if (updated) {
    try {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.from('requests').upsert(updated);
      if (error) console.error('[Supabase updateRequestStatusAndSyncDB error]:', error);
    } catch (err) {
      console.error('[Supabase updateRequestStatusAndSyncDB exception]:', err);
    }
  }
  return updated;
}

export function updateRequestPayloadDB(
  id: string,
  payloadUpdates: Record<string, any>
): RequestItem | undefined {
  const requests = readDB();
  const index = requests.findIndex((req) => req.id === id);
  if (index !== -1) {
    const updated = {
      ...requests[index],
      payload: {
        ...requests[index].payload,
        ...payloadUpdates,
      },
      updatedAt: new Date().toISOString(),
    };
    requests[index] = updated;
    writeDB(requests);

    // Sync to Supabase in background
    try {
      const supabase = getSupabaseAdmin();
      Promise.resolve(supabase.from('requests').update(updated).eq('id', id)).catch((err) => {
        console.warn('[Supabase updateRequestPayload error]:', err);
      });
    } catch {}

    return requests[index];
  }
  return undefined;
}

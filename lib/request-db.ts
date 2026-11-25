import fs from 'fs';
import path from 'path';
import { randomInt } from 'node:crypto';
import { RequestItem } from './request-store';
import { addAuditEntry, addAuditEntryAndSync } from './audit-log';
import { getSupabaseAdmin } from './supabase';

const DB_FILE = path.join(process.cwd(), '.data', 'requests.json');
let cachedRequests: RequestItem[] | undefined;
let cachedFileSignature = '';

const REQUEST_SCALAR_COLS =
  'id,submissionId,type,title,createdBy,createdByUsername,createdById,createdByRole,createdByDesignation,createdByEmployeeId,createdByDepartment,createdByPhone,remarks,target,status,forwardedTo,signatureFrom,signatureStatus,circular,createdAt,updatedAt';

const REQUEST_FILE_META_COLS =
  'uf_name:uploadedFile->>name,uf_size:uploadedFile->>size,uf_type:uploadedFile->>type,uf_uploadedAt:uploadedFile->>uploadedAt,' +
  'od_name:officialDocument->>name,od_size:officialDocument->>size,od_type:officialDocument->>type,od_uploadedAt:officialDocument->>uploadedAt,od_issuedBy:officialDocument->>issuedBy,od_issuedAt:officialDocument->>issuedAt';

const LEAVE_COMPACT_COLS =
  `${REQUEST_SCALAR_COLS},${REQUEST_FILE_META_COLS},` +
  'p_id:payload->id,p_name:payload->name,p_email:payload->email,p_phone:payload->phone,' +
  'p_designation:payload->designation,p_department:payload->department,' +
  'p_leaveType:payload->leaveType,p_fromDate:payload->fromDate,p_toDate:payload->toDate,' +
  'p_reason:payload->reason,p_remarks:payload->remarks,p_isPastDateRequest:payload->isPastDateRequest,' +
  'p_filledFormFileName:payload->filledFormFileName,p_guideId:payload->guideId,' +
  'p_guideUsername:payload->guideUsername,p_approvalChain:payload->approvalChain,' +
  'p_currentApproverIndex:payload->currentApproverIndex,p_comments:payload->comments,' +
  'p_submittedAt:payload->submittedAt,' +
  'p_med_name:payload->medicalDocument->>name,p_med_size:payload->medicalDocument->>size,' +
  'p_med_type:payload->medicalDocument->>type,p_med_uploadedAt:payload->medicalDocument->>uploadedAt';

const NON_LEAVE_COMPACT_COLS = `${REQUEST_SCALAR_COLS},${REQUEST_FILE_META_COLS},payload`;

function omitBase64Fields(value: any): any {
  if (Array.isArray(value)) return value.map(omitBase64Fields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'base64')
      .map(([key, nestedValue]) => [key, omitBase64Fields(nestedValue)])
  );
}

function hydrateCompactRow(row: any): RequestItem {
  const uploadedFile = row.uf_name
    ? {
        name: row.uf_name,
        size: Number(row.uf_size) || 0,
        type: row.uf_type || 'application/pdf',
        uploadedAt: row.uf_uploadedAt || row.createdAt,
      }
    : undefined;

  const officialDocument = row.od_name
    ? {
        name: row.od_name,
        size: Number(row.od_size) || 0,
        type: row.od_type || 'application/pdf',
        uploadedAt: row.od_uploadedAt || row.updatedAt || row.createdAt,
        issuedBy: row.od_issuedBy || '',
        issuedAt: row.od_issuedAt || row.updatedAt || row.createdAt,
      }
    : undefined;

  let payload: Record<string, any>;
  if (row.payload && typeof row.payload === 'object') {
    payload = omitBase64Fields(row.payload);
  } else {
    payload = {};
    for (const [k, v] of Object.entries(row)) {
      if (k.startsWith('p_') && !k.startsWith('p_med_') && v !== null && v !== undefined) {
        payload[k.slice(2)] = v;
      }
    }
    if (row.p_med_name) {
      payload.medicalDocument = {
        name: row.p_med_name,
        size: Number(row.p_med_size) || 0,
        type: row.p_med_type || 'application/pdf',
        uploadedAt: row.p_med_uploadedAt || row.createdAt,
      };
    }
  }

  return {
    id: row.id,
    submissionId: row.submissionId ?? undefined,
    type: row.type,
    title: row.title,
    createdBy: row.createdBy,
    createdByUsername: row.createdByUsername ?? undefined,
    createdById: row.createdById ?? undefined,
    createdByRole: row.createdByRole ?? undefined,
    createdByDesignation: row.createdByDesignation ?? undefined,
    createdByEmployeeId: row.createdByEmployeeId ?? undefined,
    createdByDepartment: row.createdByDepartment ?? undefined,
    createdByPhone: row.createdByPhone ?? undefined,
    payload,
    remarks: row.remarks ?? undefined,
    target: row.target,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? undefined,
    forwardedTo: row.forwardedTo ?? undefined,
    uploadedFile: uploadedFile as any,
    signatureFrom: row.signatureFrom ?? undefined,
    signatureStatus: row.signatureStatus ?? undefined,
    officialDocument: officialDocument as any,
    circular: row.circular ?? undefined,
  };
}

function toSupabaseRequestRow(request: RequestItem): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(request)) {
    if (v !== undefined) row[k] = v;
  }
  return row;
}

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

export async function generateRequestIdentifiersAsync(): Promise<{ id: string; submissionId: string }> {
  const usedIds = new Set(
    readDB().flatMap((request) => [request.id, request.submissionId].filter(Boolean) as string[])
  );

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('requests').select('id,submissionId');
    if (!error && Array.isArray(data)) {
      for (const row of data as Array<{ id?: string; submissionId?: string }>) {
        if (row.id) usedIds.add(String(row.id));
        if (row.submissionId) usedIds.add(String(row.submissionId));
      }
    }
  } catch (err) {
    console.warn('[Supabase generateRequestIdentifiersAsync warning]:', err);
  }

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

export async function fetchRequestsFromSupabase(options?: {
  compact?: boolean;
  type?: string;
  createdById?: string;
}): Promise<RequestItem[]> {
  try {
    const supabase = getSupabaseAdmin();

    if (options?.compact) {
      if (options.type === 'leave') {
        let q = supabase
          .from('requests')
          .select(LEAVE_COMPACT_COLS)
          .eq('type', 'leave')
          .order('createdAt', { ascending: false });
        if (options.createdById) q = q.eq('createdById', options.createdById);
        const { data, error } = await q;
        if (!error && Array.isArray(data)) {
          return data.map(hydrateCompactRow);
        }
      } else if (options.type) {
        let q = supabase
          .from('requests')
          .select(NON_LEAVE_COMPACT_COLS)
          .eq('type', options.type)
          .order('createdAt', { ascending: false });
        if (options.createdById) q = q.eq('createdById', options.createdById);
        const { data, error } = await q;
        if (!error && Array.isArray(data)) {
          return data.map(hydrateCompactRow);
        }
      } else {
        let leaveQuery = supabase
          .from('requests')
          .select(LEAVE_COMPACT_COLS)
          .eq('type', 'leave')
          .order('createdAt', { ascending: false });
        let otherQuery = supabase
          .from('requests')
          .select(NON_LEAVE_COMPACT_COLS)
          .neq('type', 'leave')
          .order('createdAt', { ascending: false });
        if (options.createdById) {
          leaveQuery = leaveQuery.eq('createdById', options.createdById);
          otherQuery = otherQuery.eq('createdById', options.createdById);
        }
        const [leaveRes, otherRes] = await Promise.all([leaveQuery, otherQuery]);
        if (!leaveRes.error && !otherRes.error && Array.isArray(leaveRes.data) && Array.isArray(otherRes.data)) {
          const combined = [...leaveRes.data, ...otherRes.data].map(hydrateCompactRow);
          combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          return combined;
        }
      }
    }

    let query = supabase
      .from('requests')
      .select('*')
      .order('createdAt', { ascending: false });
    if (options?.type) query = query.eq('type', options.type);
    if (options?.createdById) query = query.eq('createdById', options.createdById);

    const { data, error } = await query;
    if (!error && data) {
      const rows = data as RequestItem[];
      if (!options?.type && !options?.createdById) {
        cachedRequests = rows;
      }
      return rows;
    }
  } catch (err) {
    console.warn('[Supabase fetchRequests error]:', err);
  }
  const fallback = cachedRequests || readDB();
  return fallback.filter(
    (item) =>
      (!options?.type || item.type === options.type) &&
      (!options?.createdById || item.createdById === options.createdById)
  );
}

export async function fetchRequestByIdFromSupabase(id: string): Promise<RequestItem | undefined> {
  if (!id) return undefined;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!error && data) {
      const item = data as RequestItem;
      const list = cachedRequests || readDB();
      const idx = list.findIndex((r) => r.id === item.id);
      if (idx !== -1) list[idx] = item;
      else list.unshift(item);
      cachedRequests = list;
      return item;
    }
  } catch (err) {
    console.warn('[Supabase fetchRequestByIdFromSupabase error]:', err);
  }
  return getRequestByIdDB(id);
}

export function addRequestDB(
  request: RequestItem,
  options?: { skipSupabase?: boolean; skipAudit?: boolean }
): RequestItem {
  const requests = cachedRequests || readDB();
  requests.unshift(request);
  writeDB(requests);

  // Sync to Supabase in background unless caller awaits it
  if (!options?.skipSupabase) {
    try {
      const supabase = getSupabaseAdmin();
      Promise.resolve(supabase.from('requests').upsert(toSupabaseRequestRow(request))).catch((err) => {
        console.warn('[Supabase addRequest error]:', err);
      });
    } catch {}
  }

  if (!options?.skipAudit) {
    try {
      addAuditEntry({ action: 'request:created', actor: request.createdBy, actorId: request.createdById, details: { id: request.id, type: request.type, title: request.title } });
    } catch (e) {
      console.error('Audit log failed for addRequestDB', e);
    }
  }
  return request;
}

export async function persistRequestDB(request: RequestItem): Promise<RequestItem> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('requests').upsert(toSupabaseRequestRow(request));
  if (error) {
    console.error('[Supabase persistRequestDB error]:', error);
    throw new Error(error.message || 'Failed to persist request to database');
  }

  addRequestDB(request, { skipSupabase: true, skipAudit: true });
  try {
    await addAuditEntryAndSync({
      action: 'request:created',
      actor: request.createdBy,
      actorId: request.createdById,
      details: { id: request.id, type: request.type, title: request.title },
    });
  } catch (e) {
    console.error('Audit log failed for persistRequestDB', e);
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
      Promise.resolve(supabase.from('requests').upsert(toSupabaseRequestRow(updated))).catch((err) => {
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
  const existing = await fetchRequestByIdFromSupabase(id);
  if (!existing) return undefined;

  const updated: RequestItem = {
    ...existing,
    status,
    updatedAt: new Date().toISOString(),
    ...updates,
  };

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('requests').upsert(toSupabaseRequestRow(updated));
  if (error) {
    console.error('[Supabase updateRequestStatusAndSyncDB error]:', error);
    throw new Error(error.message || 'Failed to update request status in database');
  }

  const requests = cachedRequests || readDB();
  const index = requests.findIndex((req) => req.id === id);
  if (index !== -1) requests[index] = updated;
  else requests.unshift(updated);
  writeDB(requests);

  try {
    await addAuditEntryAndSync({
      action: `request:${status}`,
      actor: updates?.forwardedTo || existing.createdBy,
      actorId: existing.createdById,
      details: { id, updates },
    });
  } catch (e) {
    console.error('Audit log failed for updateRequestStatusAndSyncDB', e);
  }
  return updated;
}

export function updateRequestPayloadDB(
  id: string,
  payloadUpdates: Record<string, any>
): RequestItem | undefined {
  const requests = cachedRequests || readDB();
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
      Promise.resolve(supabase.from('requests').update({ payload: updated.payload, updatedAt: updated.updatedAt }).eq('id', id)).catch((err) => {
        console.warn('[Supabase updateRequestPayload error]:', err);
      });
    } catch {}

    return requests[index];
  }
  return undefined;
}

export async function updateRequestPayloadAndSyncDB(
  id: string,
  payloadUpdates: Record<string, any>
): Promise<RequestItem | undefined> {
  const existing = await fetchRequestByIdFromSupabase(id);
  if (!existing) return undefined;

  const updated: RequestItem = {
    ...existing,
    payload: {
      ...(existing.payload || {}),
      ...payloadUpdates,
    },
    updatedAt: new Date().toISOString(),
  };

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('requests')
    .update({ payload: updated.payload, updatedAt: updated.updatedAt })
    .eq('id', id);
  if (error) {
    console.error('[Supabase updateRequestPayloadAndSyncDB error]:', error);
    throw new Error(error.message || 'Failed to update request payload in database');
  }

  const requests = cachedRequests || readDB();
  const index = requests.findIndex((req) => req.id === id);
  if (index !== -1) requests[index] = updated;
  else requests.unshift(updated);
  writeDB(requests);

  return updated;
}

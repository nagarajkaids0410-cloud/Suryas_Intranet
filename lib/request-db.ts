import fs from 'fs';
import path from 'path';
import { randomInt } from 'node:crypto';
import { RequestItem } from './request-store';
import { addAuditEntry } from './audit-log';

const DB_FILE = path.join(process.cwd(), '.data', 'requests.json');
const LEGACY_FOUNDER_CHAIN = ['hareeshv', 'santhanakumarv', 'gkbharath'];
const FOUNDER_REQUEST_CHAIN = ['hareeshv', 'santhanakumarv'];
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

function migrateFounderRequestChains(requests: RequestItem[]): boolean {
  let migrated = false;
  for (const request of requests) {
    const chain = request.payload?.approvalChain;
    const isFounderRequest = request.createdById === 'founder-001' ||
      request.createdByUsername?.toLowerCase() === 'gkbharath';
    if (
      !isFounderRequest ||
      !['leave', 'ta', 'report'].includes(request.type) ||
      !['pending', 'forwarded'].includes(request.status) ||
      !Array.isArray(chain) ||
      chain.length !== LEGACY_FOUNDER_CHAIN.length ||
      chain.some((approver, index) => approver !== LEGACY_FOUNDER_CHAIN[index])
    ) {
      continue;
    }

    const oldStage = request.status === 'pending' ? 0 : request.payload.currentApproverIndex;
    if (!Number.isInteger(oldStage) || oldStage < 0 || oldStage >= LEGACY_FOUNDER_CHAIN.length) {
      continue;
    }
    const currentStage = Math.min(oldStage, FOUNDER_REQUEST_CHAIN.length - 1);
    request.payload = {
      ...request.payload,
      approvalChain: FOUNDER_REQUEST_CHAIN,
      currentApproverIndex: currentStage,
    };
    if (request.status === 'forwarded') {
      request.forwardedTo = FOUNDER_REQUEST_CHAIN[currentStage];
    } else {
      delete request.forwardedTo;
    }
    migrated = true;
    try {
      addAuditEntry({
        action: 'request:approval-chain-migrated',
        actor: 'system',
        actorId: 'system',
        details: { requestId: request.id, oldChain: LEGACY_FOUNDER_CHAIN, newChain: FOUNDER_REQUEST_CHAIN, currentApprover: FOUNDER_REQUEST_CHAIN[currentStage] },
      });
    } catch (error) {
      console.error('Audit log failed for founder approval-chain migration', error);
    }
  }
  return migrated;
}

function ensureDBDir() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readDB(): RequestItem[] {
  try {
    ensureDBDir();
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify([]));
      cachedRequests = [];
      const stats = fs.statSync(DB_FILE);
      cachedFileSignature = `${stats.mtimeMs}:${stats.size}`;
      return cachedRequests;
    }
    const stats = fs.statSync(DB_FILE);
    const fileSignature = `${stats.mtimeMs}:${stats.size}`;
    if (cachedRequests && cachedFileSignature === fileSignature) return cachedRequests;
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    const requests: RequestItem[] = JSON.parse(data) || [];
    if (migrateFounderRequestChains(requests)) {
      writeDB(requests);
    } else {
      cachedRequests = requests;
      cachedFileSignature = fileSignature;
    }
    return requests;
  } catch (error) {
    console.error('Error reading request DB:', error);
    return [];
  }
}

function writeDB(requests: RequestItem[]) {
  try {
    ensureDBDir();
    fs.writeFileSync(DB_FILE, JSON.stringify(requests));
    cachedRequests = requests;
    const stats = fs.statSync(DB_FILE);
    cachedFileSignature = `${stats.mtimeMs}:${stats.size}`;
  } catch (error) {
    console.error('Error writing request DB:', error);
  }
}

export function addRequestDB(request: RequestItem): RequestItem {
  const requests = readDB();
  requests.unshift(request);
  writeDB(requests);
  try {
    addAuditEntry({ action: 'request:created', actor: request.createdBy, actorId: request.createdById, details: { id: request.id, type: request.type, title: request.title } });
  } catch (e) {
    console.error('Audit log failed for addRequestDB', e);
  }
  return request;
}

export function getRequestsByTargetDB(target: 'admin' | 'founder' | 'all'): RequestItem[] {
  const requests = readDB();
  if (target === 'all') {
    return [...requests];
  }
  return requests.filter((req) => req.target === target);
}

export function getRequestByIdDB(id: string): RequestItem | undefined {
  const requests = readDB();
  return requests.find((req) => req.id === id);
}

export function updateRequestStatusDB(
  id: string,
  status: 'pending' | 'approved' | 'rejected' | 'signed' | 'forwarded',
  updates?: Partial<RequestItem>
): RequestItem | undefined {
  const requests = readDB();
  const index = requests.findIndex((req) => req.id === id);
  if (index !== -1) {
    requests[index] = {
      ...requests[index],
      status,
      updatedAt: new Date().toISOString(),
      ...updates,
    };
    writeDB(requests);
    try {
      addAuditEntry({ action: `request:${status}`, actor: updates?.forwardedTo || requests[index].createdBy, actorId: requests[index].createdById, details: { id, updates } });
    } catch (e) {
      console.error('Audit log failed for updateRequestStatusDB', e);
    }
    return requests[index];
  }
  return undefined;
}

export function updateRequestPayloadDB(
  id: string,
  payloadUpdates: Record<string, any>
): RequestItem | undefined {
  const requests = readDB();
  const index = requests.findIndex((req) => req.id === id);
  if (index !== -1) {
    requests[index] = {
      ...requests[index],
      payload: {
        ...requests[index].payload,
        ...payloadUpdates,
      },
      updatedAt: new Date().toISOString(),
    };
    writeDB(requests);
    return requests[index];
  }
  return undefined;
}

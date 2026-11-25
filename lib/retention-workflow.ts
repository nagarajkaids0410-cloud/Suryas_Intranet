import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import { addAuditEntry } from './audit-log';
import { addNotificationDB, readNotificationsDB } from './notification-db';

const DATA_DIR = path.join(process.cwd(), '.data');
const WORKFLOW_FILE = path.join(DATA_DIR, 'retention-workflow.json');
const ARCHIVE_DIR = path.join(DATA_DIR, 'archives');
const CYCLE_DAYS = 90;
const CELL_CHUNK_SIZE = 30000;
const MAX_WORKSHEET_ROWS = 1048576;
const PROTECTED_FILES = new Set(['users.json', 'retention-config.json', 'retention-workflow.json']);

export const RETENTION_APPROVERS = [
  { username: 'hareeshv', id: 'user-002', role: 'managing-partner' },
  { username: 'santhanakumarv', id: 'user-003', role: 'managing-partner' },
  { username: 'gkbharath', id: 'founder-001', role: 'founder' },
] as const;

export interface RetentionDecision {
  username: string;
  decision: 'approve' | 'reject';
  comment: string;
  at: string;
}

export interface RetentionCycle {
  id: string;
  status: 'pending' | 'resetting' | 'approved' | 'rejected';
  requestedAt: string;
  archiveCreatedAt?: string;
  completedAt?: string;
  archiveFile: string;
  approvalChain: string[];
  currentApproverIndex: number;
  decisions: RetentionDecision[];
}

export interface RetentionWorkflow {
  nextRunAt: string;
  lastCompletedAt?: string;
  cycle?: RetentionCycle;
}

const DEFAULT_WORKFLOW: RetentionWorkflow = {
  nextRunAt: '2026-10-01T00:00:00+05:30',
};

function readWorkflow(): RetentionWorkflow {
  if (!fs.existsSync(WORKFLOW_FILE)) return { ...DEFAULT_WORKFLOW };
  const parsed: unknown = JSON.parse(fs.readFileSync(WORKFLOW_FILE, 'utf8'));
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('nextRunAt' in parsed) ||
    typeof parsed.nextRunAt !== 'string' ||
    !Number.isFinite(Date.parse(parsed.nextRunAt))
  ) {
    throw new Error('Retention workflow file has an invalid format');
  }
  return parsed as RetentionWorkflow;
}

function writeWorkflow(workflow: RetentionWorkflow): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporaryFile = `${WORKFLOW_FILE}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(workflow, null, 2), 'utf8');
  fs.renameSync(temporaryFile, WORKFLOW_FILE);
}

export function getRetentionWorkflow(): RetentionWorkflow {
  const workflow = readWorkflow();
  if (workflow.cycle && !workflow.cycle.archiveCreatedAt) {
    try {
      workflow.cycle.archiveCreatedAt = fs.statSync(getRetentionArchivePath(workflow.cycle.archiveFile)).mtime.toISOString();
    } catch {
      // Older cycles may reference an archive that is no longer available.
    }
  }
  return workflow;
}

function getOperationalFiles(): string[] {
  return fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((entry) =>
      entry.isFile() &&
      (entry.name.endsWith('.json') || entry.name === 'audit-log.jsonl') &&
      !PROTECTED_FILES.has(entry.name)
    )
    .map((entry) => path.join(DATA_DIR, entry.name))
    .sort();
}

function splitCell(value: string): string[] {
  const chunks: string[] = [];
  for (let start = 0; start < value.length;) {
    let end = Math.min(start + CELL_CHUNK_SIZE, value.length);
    if (end < value.length && end > start) {
      const lastCodeUnit = value.charCodeAt(end - 1);
      if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) end -= 1;
    }
    chunks.push(value.slice(start, end));
    start = end;
  }
  return chunks.length ? chunks : [''];
}

function createArchive(now: Date): string {
  const workbook = XLSX.utils.book_new();
  const sources = getOperationalFiles();
  const metadata: (string | number)[][] = [['Source file', 'Records', 'Archived at']];

  for (const file of sources) {
    const name = path.basename(file);
    const fileContents = fs.readFileSync(file, 'utf8');
    const data: unknown = name === 'audit-log.jsonl'
      ? fileContents.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
      : JSON.parse(fileContents);
    const records = Array.isArray(data)
      ? data
      : data && typeof data === 'object'
        ? Object.entries(data).map(([key, value]) => ({ key, value }))
        : [data];
    const rows: (string | number)[][] = [['Record', 'Part', 'Data']];

    records.forEach((record, index) => {
      const serialized = JSON.stringify(record);
      const chunks = splitCell(serialized);
      chunks.forEach((chunk, part) => rows.push([index + 1, part + 1, chunk]));
    });
    if (rows.length > MAX_WORKSHEET_ROWS) {
      throw new Error(`Cannot archive ${name}: Excel worksheet row limit exceeded`);
    }

    const sheetName = name.replace(/[\[\]:*?/\\]/g, '_').slice(0, 31);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName);
    metadata.push([name, records.length, now.toISOString()]);
  }

  if (metadata.length === 1) {
    metadata.push(['No operational JSON data', 0, now.toISOString()]);
  }
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(metadata), 'Archive index');

  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const archiveFile = `operational-data-${now.toISOString().replace(/[:.]/g, '-')}.xlsx`;
  const archivePath = path.join(ARCHIVE_DIR, archiveFile);
  const temporaryPath = `${archivePath}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporaryPath, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  fs.renameSync(temporaryPath, archivePath);
  return archiveFile;
}

function notifyApprover(cycle: RetentionCycle, username: string): void {
  const existing = readNotificationsDB().some((notification) =>
    notification.type === 'data_retention_approval' &&
    notification.relatedId === cycle.id &&
    notification.targetUser === username
  );
  if (existing) return;

  const notification = addNotificationDB({
    type: 'data_retention_approval',
    title: '90-day data archive approval required',
    message: `Review the operational data archive and approve or reject the scheduled reset in Request Approvals.`,
    targetUser: username,
    relatedId: cycle.id,
    read: false,
  });
  if (!readNotificationsDB().some((item) => item.id === notification.id)) {
    throw new Error(`Unable to notify retention approver ${username}`);
  }
}

function preserveRetentionNotifications(data: unknown): unknown {
  if (!Array.isArray(data)) throw new Error('Notification database has an invalid format');
  return data.filter((notification) =>
    notification &&
    typeof notification === 'object' &&
    typeof notification.type === 'string' &&
    notification.type.startsWith('data_retention_')
  );
}

function clearOperationalData(): void {
  const files = getOperationalFiles();
  const originalContents = new Map(files.map((file) => [file, fs.readFileSync(file)]));
  const stagedFiles: string[] = [];

  try {
    for (const file of files) {
      const name = path.basename(file);
      const currentData: unknown = name === 'audit-log.jsonl'
        ? []
        : JSON.parse(originalContents.get(file)!.toString('utf8'));
      let emptyData: unknown;
      if (name === 'audit-log.jsonl') {
        emptyData = '';
      } else if (name === 'notifications.json') {
        emptyData = preserveRetentionNotifications(currentData);
      } else if (name === 'company-ledger.json') {
        emptyData = { balance: 0, transactions: [] };
      } else if (Array.isArray(currentData)) {
        emptyData = [];
      } else {
        throw new Error(`Cannot safely reset ${name}: unsupported data format`);
      }
      const temporaryFile = `${file}.${randomUUID()}.tmp`;
      fs.writeFileSync(temporaryFile, name === 'audit-log.jsonl' ? '' : JSON.stringify(emptyData, null, 2), 'utf8');
      stagedFiles.push(temporaryFile);
    }
    files.forEach((file, index) => fs.renameSync(stagedFiles[index], file));
  } catch (error) {
    for (const [file, contents] of originalContents) {
      fs.writeFileSync(file, contents);
    }
    throw error;
  } finally {
    for (const temporaryFile of stagedFiles) {
      if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
    }
  }
}

function completeApprovedReset(workflow: RetentionWorkflow, now: Date): RetentionWorkflow {
  const cycle = workflow.cycle;
  if (!cycle || cycle.status !== 'resetting') {
    throw new Error('No approved retention reset is ready to complete');
  }

  clearOperationalData();
  const completedCycle: RetentionCycle = { ...cycle, status: 'approved' };
  const completedWorkflow: RetentionWorkflow = {
    ...workflow,
    cycle: completedCycle,
    lastCompletedAt: cycle.completedAt,
    nextRunAt: new Date(now.getTime() + CYCLE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  };
  writeWorkflow(completedWorkflow);

  const finalApprover = RETENTION_APPROVERS.at(-1)!;
  addAuditEntry({
    action: 'data-retention:reset-completed',
    actor: finalApprover.username,
    actorId: finalApprover.id,
    details: { archiveFile: cycle.archiveFile, cycleId: cycle.id },
  });
  const completionNotification = addNotificationDB({
    type: 'data_retention_completed',
    title: '90-day data archive and reset completed',
    message: `Operational data was archived to ${cycle.archiveFile} and reset after final approval.`,
    targetUser: 'all',
    relatedId: cycle.id,
    read: false,
  });
  if (!readNotificationsDB().some((item) => item.id === completionNotification.id)) {
    throw new Error('Unable to notify approvers that the retention reset completed');
  }
  return completedWorkflow;
}

export function runRetentionSchedule(now = new Date()): { started: boolean; workflow: RetentionWorkflow } {
  const workflow = readWorkflow();
  if (workflow.cycle?.status === 'resetting') {
    return { started: false, workflow: completeApprovedReset(workflow, now) };
  }
  if (workflow.cycle?.status === 'pending') {
    notifyApprover(workflow.cycle, workflow.cycle.approvalChain[workflow.cycle.currentApproverIndex]);
    return { started: false, workflow };
  }
  if (Date.parse(workflow.nextRunAt) > now.getTime()) {
    return { started: false, workflow };
  }

  const archiveFile = createArchive(now);
  const cycle: RetentionCycle = {
    id: randomUUID(),
    status: 'pending',
    requestedAt: now.toISOString(),
    archiveCreatedAt: now.toISOString(),
    archiveFile,
    approvalChain: RETENTION_APPROVERS.map((approver) => approver.username),
    currentApproverIndex: 0,
    decisions: [],
  };
  const nextWorkflow = { ...workflow, cycle };
  writeWorkflow(nextWorkflow);
  notifyApprover(cycle, cycle.approvalChain[0]);
  return { started: true, workflow: nextWorkflow };
}

export function decideRetentionCycle(
  username: string,
  decision: 'approve' | 'reject',
  comment: string,
  now = new Date()
): RetentionWorkflow {
  const workflow = readWorkflow();
  const cycle = workflow.cycle;
  if (!cycle || cycle.status !== 'pending') {
    throw new Error('There is no pending data-retention approval');
  }

  const expectedApprover = cycle.approvalChain[cycle.currentApproverIndex];
  if (username.toLowerCase() !== expectedApprover) {
    throw new Error('Only the current retention approver may act on this request');
  }

  const decisionRecord: RetentionDecision = {
    username,
    decision,
    comment,
    at: now.toISOString(),
  };
  const decisions = [...cycle.decisions, decisionRecord];

  if (decision === 'reject') {
    const completedCycle: RetentionCycle = { ...cycle, status: 'rejected', completedAt: now.toISOString(), decisions };
    const nextWorkflow: RetentionWorkflow = {
      ...workflow,
      cycle: completedCycle,
      nextRunAt: new Date(now.getTime() + CYCLE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    };
    writeWorkflow(nextWorkflow);
    const notification = addNotificationDB({
      type: 'data_retention_rejected',
      title: '90-day data reset rejected',
      message: `The data-retention reset was rejected by ${username}. No live data was cleared.`,
      targetUser: 'all',
      relatedId: cycle.id,
      read: false,
    });
    if (!readNotificationsDB().some((item) => item.id === notification.id)) {
      throw new Error('Unable to notify approvers that the retention reset was rejected');
    }
    return nextWorkflow;
  }

  if (cycle.currentApproverIndex < cycle.approvalChain.length - 1) {
    const nextIndex = cycle.currentApproverIndex + 1;
    const updatedCycle: RetentionCycle = { ...cycle, currentApproverIndex: nextIndex, decisions };
    const nextWorkflow = { ...workflow, cycle: updatedCycle };
    writeWorkflow(nextWorkflow);
    notifyApprover(updatedCycle, updatedCycle.approvalChain[nextIndex]);
    return nextWorkflow;
  }

  const finalArchive = createArchive(now);
  const resettingCycle: RetentionCycle = {
    ...cycle,
    status: 'resetting',
    completedAt: now.toISOString(),
    archiveCreatedAt: now.toISOString(),
    archiveFile: finalArchive,
    decisions,
  };
  const resettingWorkflow = { ...workflow, cycle: resettingCycle };
  writeWorkflow(resettingWorkflow);
  return completeApprovedReset(resettingWorkflow, now);
}

export function getRetentionArchivePath(archiveFile: string): string {
  if (path.basename(archiveFile) !== archiveFile || !archiveFile.endsWith('.xlsx')) {
    throw new Error('Invalid archive file name');
  }
  const archivePath = path.join(ARCHIVE_DIR, archiveFile);
  if (!fs.existsSync(archivePath) || !fs.statSync(archivePath).isFile()) {
    throw new Error('Retention archive file is missing');
  }
  return archivePath;
}

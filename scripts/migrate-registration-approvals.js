const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const dataDirectory = path.resolve('.data');
const usersPath = path.join(dataDirectory, 'users.json');
const notificationsPath = path.join(dataDirectory, 'notifications.json');
const auditPath = path.join(dataDirectory, 'audit-log.json');
const approvers = ['hareeshv', 'santhanakumarv', 'gkbharath'];
const workflowVersion = 3;

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

if (!fs.existsSync(usersPath)) {
  throw new Error('User store not found; no data was changed.');
}

const users = readJson(usersPath);
const notifications = readJson(notificationsPath);
const auditEntries = readJson(auditPath);
const migrations = [];
const timestamp = new Date().toISOString();

for (const user of users) {
  if (user.status !== 'pending_approval' || user.registrationApprovalVersion === workflowVersion) continue;

  const previousStage = Number.isInteger(user.approvalStage) ? user.approvalStage : 0;
  const previousVersion = user.registrationApprovalVersion ?? 1;
  const history = Array.isArray(user.approvalHistory) ? user.approvalHistory : [];
  const hareeshApproved = history.some(
    (entry) => ['hareesh', 'hareeshv'].includes((entry.actorUsername || '').toLowerCase()) && entry.decision === 'approve'
  );
  const santhanaApproved = history.some(
    (entry) => ['santhanakumar', 'santhanakumarv'].includes((entry.actorUsername || '').toLowerCase()) && entry.decision === 'approve'
  ) || (previousVersion === 1 && previousStage >= 2) || (previousVersion === 2 && previousStage >= 1);
  const legacyHareeshApproval = previousVersion === 1 && previousStage >= 1;
  const approvalStage = santhanaApproved ? 2 : (hareeshApproved || legacyHareeshApproval) ? 1 : 0;
  const nextApprover = approvers[approvalStage];

  user.approvalStage = approvalStage;
  user.registrationApprovalVersion = workflowVersion;

  if (!notifications.some((item) =>
    item.relatedId === user.id &&
    item.targetUser === nextApprover &&
    item.type === 'registration_approval' &&
    !item.read
  )) {
    notifications.unshift({
      id: `notif-${crypto.randomUUID()}`,
      type: 'registration_approval',
      title: `Registration review required - ${user.fullName}`,
      message: santhanaApproved
        ? `${user.fullName}'s registration is ready for the Founder's decision.`
        : approvalStage === 1
          ? `${user.fullName}'s registration is ready for Santhana's review.`
          : `${user.fullName}'s registration is ready for Hareesh's review.`,
      targetUser: nextApprover,
      relatedId: user.id,
      timestamp,
      read: false,
    });
  }

  auditEntries.unshift({
    id: `audit-${crypto.randomUUID()}`,
    action: 'registration:workflow_migrated',
    actor: 'system',
    details: { userId: user.id, previousStage, approvalStage, nextApprover },
    timestamp,
  });
  migrations.push({ name: user.fullName, nextApprover });
}

if (migrations.length === 0) {
  console.log('No pending registrations required migration.');
  process.exit(0);
}

const backupDirectory = path.join(dataDirectory, 'backups');
fs.mkdirSync(backupDirectory, { recursive: true });
const backupPrefix = `registration-workflow-v${workflowVersion}-${timestamp.replace(/[:.]/g, '-')}`;
const pathsToUpdate = [usersPath, notificationsPath, auditPath];
const backups = new Map();
for (const filePath of pathsToUpdate) {
  if (fs.existsSync(filePath)) {
    const backupPath = path.join(backupDirectory, `${backupPrefix}-${path.basename(filePath)}`);
    fs.copyFileSync(filePath, backupPath);
    backups.set(filePath, backupPath);
  }
}

try {
  writeJsonAtomic(usersPath, users);
  writeJsonAtomic(notificationsPath, notifications);
  writeJsonAtomic(auditPath, auditEntries);
} catch (error) {
  for (const [filePath, backupPath] of backups) {
    fs.copyFileSync(backupPath, filePath);
  }
  throw error;
}

for (const migration of migrations) {
  console.log(`Migrated ${migration.name}: pending with ${migration.nextApprover}`);
}
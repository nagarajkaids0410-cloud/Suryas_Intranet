import fs from 'fs';
import path from 'path';

const NOTIFICATIONS_DB_FILE = path.join(process.cwd(), '.data', 'notifications.json');

export interface DataRetentionNotification {
  id: string;
  type: 'data-retention-warning' | 'data-retention-critical' | 'data-reset-complete';
  title: string;
  message: string;
  recipient: 'admin' | 'founder' | 'all';
  createdAt: string;
  read: boolean;
  excelDownloadUrl?: string;
  daysRemaining?: number;
}

function ensureNotificationsDir() {
  const dir = path.dirname(NOTIFICATIONS_DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readNotifications(): DataRetentionNotification[] {
  try {
    ensureNotificationsDir();
    if (!fs.existsSync(NOTIFICATIONS_DB_FILE)) {
      fs.writeFileSync(NOTIFICATIONS_DB_FILE, JSON.stringify([]));
      return [];
    }
    const data = fs.readFileSync(NOTIFICATIONS_DB_FILE, 'utf-8');
    return JSON.parse(data) || [];
  } catch (error) {
    console.error('Error reading notifications:', error);
    return [];
  }
}

function writeNotifications(notifications: DataRetentionNotification[]) {
  try {
    ensureNotificationsDir();
    fs.writeFileSync(NOTIFICATIONS_DB_FILE, JSON.stringify(notifications, null, 2));
  } catch (error) {
    console.error('Error writing notifications:', error);
  }
}

export function createDataRetentionNotification(
  type: 'data-retention-warning' | 'data-retention-critical' | 'data-reset-complete',
  daysRemaining: number,
  recipient: 'admin' | 'founder' | 'all' = 'all'
): DataRetentionNotification {
  return {
    id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    title: 'Data retention auto-reset is disabled',
    message: 'Request data is retained and no automatic reset is triggered.',
    recipient,
    createdAt: new Date().toISOString(),
    read: false,
    daysRemaining,
  };
}

export function getDataRetentionNotifications(
  recipient: 'admin' | 'founder' | 'all'
): DataRetentionNotification[] {
  return [];
}

export function markNotificationAsRead(notificationId: string): boolean {
  return false;
}

export function getUnreadDataRetentionNotificationCount(recipient: 'admin' | 'founder'): number {
  return 0;
}

export function deleteOldNotifications(olderThanDays: number = 90) {
  return 0;
}

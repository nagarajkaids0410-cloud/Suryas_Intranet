import fs from 'fs';
import path from 'path';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  targetUser: string; // 'all' or specific user ID
  relatedId?: string;
  timestamp: string;
  read: boolean;
  userId?: string; // User who created the notification (e.g., admin approving)
}

const DB_PATH = path.join(process.cwd(), '.data', 'notifications.json');
type NewNotification = Omit<Notification, 'id' | 'timestamp'>;

function ensureDBDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function readNotificationsDB(): Notification[] {
  ensureDBDir();
  if (!fs.existsSync(DB_PATH)) {
    return [];
  }
  try {
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(data) || [];
  } catch (err) {
    console.error('Error reading notifications DB:', err);
    return [];
  }
}

export function writeNotificationsDB(notifications: Notification[]): void {
  ensureDBDir();
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(notifications, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing notifications DB:', err);
  }
}

export function addNotificationsDB(entries: NewNotification[]): Notification[] {
  if (entries.length === 0) return [];
  const notifications = readNotificationsDB();
  const inserted: Notification[] = [];
  const results = entries.map((entry) => {
    const signature = entry.relatedId
      ? JSON.stringify([entry.type, entry.targetUser, entry.relatedId, entry.title, entry.message])
      : undefined;
    const existing = signature
      ? notifications.find((notification) => !notification.read && JSON.stringify([
          notification.type,
          notification.targetUser,
          notification.relatedId,
          notification.title,
          notification.message,
        ]) === signature)
      : undefined;
    if (existing) return existing;
    const batchedDuplicate = signature && inserted.find((notification) => JSON.stringify([
      notification.type,
      notification.targetUser,
      notification.relatedId,
      notification.title,
      notification.message,
    ]) === signature);
    if (batchedDuplicate) return batchedDuplicate;

    const notification: Notification = {
      ...entry,
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    };
    inserted.push(notification);
    return notification;
  });
  if (inserted.length > 0) {
    notifications.unshift(...inserted);
    writeNotificationsDB(notifications);
  }
  return results;
}

export function addNotificationDB(notification: NewNotification): Notification {
  return addNotificationsDB([notification])[0];
}

export function getNotificationsByTargetDB(targetUsers: string | string[]): Notification[] {
  const notifications = readNotificationsDB();
  const targets = Array.isArray(targetUsers) ? targetUsers : [targetUsers];
  return notifications.filter(
    (n) => n.targetUser === 'all' || targets.includes(n.targetUser) || !n.targetUser
  );
}

export function markAsReadDB(notificationId: string): boolean {
  const notifications = readNotificationsDB();
  const index = notifications.findIndex((n) => n.id === notificationId);
  if (index !== -1) {
    notifications[index].read = true;
    writeNotificationsDB(notifications);
    return true;
  }
  return false;
}

export function markAllAsReadDB(targetUsers: string | string[]): void {
  const notifications = readNotificationsDB();
  const targets = Array.isArray(targetUsers) ? targetUsers : [targetUsers];
  const updated = notifications.map((n) => 
    (targets.includes(n.targetUser) || n.targetUser === 'all') ? { ...n, read: true } : n
  );
  writeNotificationsDB(updated);
}

export function markNotificationsByRelatedIdDB(
  relatedId: string,
  options?: { type?: string; targetUsers?: string[] }
): number {
  const notifications = readNotificationsDB();
  let updatedCount = 0;

  const updated = notifications.map((n) => {
    const matchRelated = n.relatedId === relatedId;
    const matchType = !options?.type || n.type === options.type;
    const matchTarget = !options?.targetUsers || options.targetUsers.includes(n.targetUser);

    if (matchRelated && matchType && matchTarget && !n.read) {
      updatedCount += 1;
      return { ...n, read: true };
    }
    return n;
  });

  if (updatedCount > 0) {
    writeNotificationsDB(updated);
  }

  return updatedCount;
}

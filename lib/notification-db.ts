import fs from 'fs';
import path from 'path';
import { getSupabaseAdmin } from './supabase';

export interface Notification {
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
export type NewNotification = Omit<Notification, 'id' | 'timestamp'>;

let cachedNotifications: Notification[] | undefined;

function ensureDBDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
}

export function readNotificationsDB(): Notification[] {
  try {
    ensureDBDir();
    if (!fs.existsSync(DB_PATH)) {
      return cachedNotifications || [];
    }
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(data) || [];
    cachedNotifications = parsed;
    return parsed;
  } catch {
    return cachedNotifications || [];
  }
}

export function writeNotificationsDB(notifications: Notification[]): void {
  cachedNotifications = notifications;
  try {
    ensureDBDir();
    fs.writeFileSync(DB_PATH, JSON.stringify(notifications, null, 2), 'utf-8');
  } catch {
    // Read-only filesystem on Netlify is expected
  }
}

export async function fetchNotificationsFromSupabase(targetUsers: string | string[]): Promise<Notification[]> {
  const targets = Array.isArray(targetUsers) ? targetUsers : [targetUsers];
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .in('targetUser', [...targets, 'all'])
      .order('timestamp', { ascending: false });

    if (!error && data) {
      cachedNotifications = data as Notification[];
      return cachedNotifications;
    }
  } catch (err) {
    console.warn('[Supabase fetchNotifications error]:', err);
  }
  return getNotificationsByTargetDB(targets);
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

    // Sync to Supabase in background
    try {
      const supabase = getSupabaseAdmin();
      Promise.resolve(supabase.from('notifications').upsert(inserted)).catch(() => {});
    } catch {}
  }
  return results;
}

export async function addNotificationsAndSyncDB(entries: NewNotification[]): Promise<Notification[]> {
  const results = addNotificationsDB(entries);
  if (results.length > 0) {
    try {
      const supabase = getSupabaseAdmin();
      await supabase.from('notifications').upsert(results);
    } catch (err) {
      console.warn('[Supabase addNotificationsAndSyncDB error]:', err);
    }
  }
  return results;
}

export function addNotificationDB(notification: NewNotification): Notification {
  return addNotificationsDB([notification])[0];
}

export async function addNotificationAndSyncDB(notification: NewNotification): Promise<Notification> {
  const res = await addNotificationsAndSyncDB([notification]);
  return res[0];
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

    // Sync to Supabase
    try {
      const supabase = getSupabaseAdmin();
      Promise.resolve(supabase.from('notifications').update({ read: true }).eq('id', notificationId)).catch(() => {});
    } catch {}

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

  // Sync to Supabase
  try {
    const supabase = getSupabaseAdmin();
    Promise.resolve(supabase.from('notifications').update({ read: true }).in('targetUser', [...targets, 'all'])).catch(() => {});
  } catch {}
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

    // Sync to Supabase
    try {
      const supabase = getSupabaseAdmin();
      Promise.resolve(supabase.from('notifications').update({ read: true }).eq('relatedId', relatedId)).catch(() => {});
    } catch {}
  }

  return updatedCount;
}

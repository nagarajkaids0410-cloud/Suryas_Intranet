import { addNotificationDB } from './notification-db';
import { getAllUsers } from './user-database';
import { addRequestDB, getRequestsByTargetDB } from './request-db';

/**
 * Check if a reminder should be sent based on schedule:
 * - Weekly: every Saturday
 * - Monthly: last day of the month
 */
export function checkAndSendReminders() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const isLastDayOfMonth = dayOfMonth === daysInMonth;
  const isSaturday = dayOfWeek === 6;

  if (isSaturday) {
    sendWeeklyReminder();
  }

  if (isLastDayOfMonth) {
    sendMonthlyReminder();
  }
}

function sendWeeklyReminder() {
  const admins = getAllUsers().filter((u) => u.role === 'admin' || u.role === 'founder');

  admins.forEach((admin) => {
    // Check if they already submitted a weekly report this week
    const weekStart = getWeekStart(new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const allReports = getRequestsByTargetDB('all').filter(
      (r) => r.type === 'report' && r.payload?.reportFrequency === 'weekly'
    );

    const thisWeekReport = allReports.find(
      (r) =>
        r.createdById === admin.id &&
        new Date(r.createdAt) >= weekStart &&
        new Date(r.createdAt) < weekEnd
    );

    if (!thisWeekReport) {
      // Send reminder notification
      addNotificationDB({
        type: 'weekly-report-reminder',
        title: 'Weekly Report Reminder',
        message: `Please submit your weekly report by end of this week (${new Date(weekEnd).toDateString()})`,
        targetUser: admin.id,
        read: false,
      });
    }
  });
}

function sendMonthlyReminder() {
  const admins = getAllUsers().filter((u) => u.role === 'admin' || u.role === 'founder');

  admins.forEach((admin) => {
    // Check if they already submitted a monthly report this month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const allReports = getRequestsByTargetDB('all').filter(
      (r) => r.type === 'report' && r.payload?.reportFrequency === 'monthly'
    );

    const thisMonthReport = allReports.find(
      (r) =>
        r.createdById === admin.id &&
        new Date(r.createdAt) >= monthStart &&
        new Date(r.createdAt) < monthEnd
    );

    if (!thisMonthReport) {
      // Send reminder notification
      addNotificationDB({
        type: 'monthly-report-reminder',
        title: 'Monthly Report Reminder',
        message: `Please submit your monthly report by end of this month (${new Date(monthEnd.getTime() - 86400000).toDateString()})`,
        targetUser: admin.id,
        read: false,
      });
    }
  });
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day; // adjust to start of week (Sunday: 0)
  return new Date(d.setDate(diff));
}

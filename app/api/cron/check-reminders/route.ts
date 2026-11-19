import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { checkAndSendReminders } from '@/lib/reminders';
import { runRetentionSchedule } from '@/lib/retention-workflow';
import { autoCheckOutForDate } from '@/lib/attendance-db';
import { addAuditEntry } from '@/lib/audit-log';

function getIndiaDateAndHour() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { date: `${values.year}-${values.month}-${values.day}`, hour: Number(values.hour) };
}

/**
 * Endpoint for cron job or scheduled task to check and send reminders.
 * This should ideally be called:
 * - Weekly (Saturdays) for weekly report reminders
 * - Monthly (last day of month) for monthly report reminders
 * 
 * Usage:
 * - Curl: curl -X POST http://localhost:3000/api/cron/check-reminders
 * - Schedule with: external cron service, GitHub Actions, or system cron job
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('x-cron-token');
    const validToken = process.env.CRON_TOKEN;
    if (!validToken || !token) {
      return NextResponse.json({ error: 'Cron authorization is not configured' }, { status: 503 });
    }
    const supplied = Buffer.from(token);
    const expected = Buffer.from(validToken);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { date, hour } = getIndiaDateAndHour();
    const checkedOutRecords = hour >= 17 ? autoCheckOutForDate(date) : [];
    if (checkedOutRecords.length > 0) {
      addAuditEntry({
        action: 'attendance:auto-checkout',
        actor: 'system',
        details: {
          date,
          checkedOutAt: checkedOutRecords[0].checkOut,
          userIds: checkedOutRecords.map((record) => record.userId),
        },
      });
    }

    checkAndSendReminders();
    const retention = runRetentionSchedule();

    return NextResponse.json({
      success: true,
      message: 'Reminders checked and sent if applicable',
      attendanceAutoCheckedOut: checkedOutRecords.length,
      retentionCycleStarted: retention.started,
      retentionNextRunAt: retention.workflow.nextRunAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in check-reminders cron:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { addRequestDB, getRequestsByTargetDB } from '@/lib/request-db';
import { requireRole } from '@/lib/rbac';
import { RequestItem } from '@/lib/request-store';
import { addNotificationsDB } from '@/lib/notification-db';
import { getAllUsers } from '@/lib/user-database';
import { addAuditEntry } from '@/lib/audit-log';
import { getApprovalChainForUser } from '@/lib/request-store';
import { generateRequestIdentifiers } from '@/lib/request-db';
import { findUserById } from '@/lib/user-database';
import { withCurrentSubmitterProfile } from '@/lib/request-profile';
import { isReportSubmissionRestricted } from '@/lib/report-access';
import { isValidDocumentUpload, STANDARD_DOCUMENT_MAX_BYTES } from '@/lib/document-upload';
import { resolveReportPeriod, type ReportPeriodMode } from '@/lib/report-period';
import { isEligibleGuideRole, requiresGuideRole } from '@/lib/request-store';

const REPORT_READ_ROLES = [
  'admin', 'founder', 'managing-partner', 'employee', 'freelancer', 'senior-freelancer', 'intern', 'project-intern', 'user',
] as const;
const REPORT_SUBMIT_ROLES = REPORT_READ_ROLES.filter((role) => role !== 'managing-partner');

function reportPeriodKey(value: string, frequency: 'weekly' | 'monthly'): string {
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value));
  if (frequency === 'monthly') return localDate.slice(0, 7);
  const [year, month, day] = localDate.split('-').map(Number);
  const monday = new Date(Date.UTC(year, month - 1, day));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, [...REPORT_SUBMIT_ROLES]);
  if (auth instanceof NextResponse) return auth;
  if (isReportSubmissionRestricted(auth.username)) {
    return NextResponse.json({ error: 'Report submission is not available for this account' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { title, description, reportFrequency, reportPeriodMode, reportYear, reportMonth, reportWeek, reportDate, periodStartDate, periodEndDate, attachments, remarks } = body as {
      title: string;
      description: string;
      reportFrequency: 'weekly' | 'monthly';
      reportPeriodMode: ReportPeriodMode;
      reportYear: number;
      reportMonth?: number;
      reportWeek?: number;
      reportDate?: string;
      periodStartDate: string;
      periodEndDate: string;
      attachments?: Array<{ name: string; size: number; type: string; base64: string }>;
      remarks?: string;
    };
    const optionalRemarks = typeof remarks === 'string' ? remarks.trim() : '';

    if (
      typeof title !== 'string' || !title.trim() ||
      typeof description !== 'string' || !description.trim() ||
      !['weekly', 'monthly'].includes(reportFrequency) ||
      (remarks !== undefined && typeof remarks !== 'string')
    ) {
      return NextResponse.json(
        { error: 'Valid title, description, and report frequency are required' },
        { status: 400 }
      );
    }

    const reportPeriod = resolveReportPeriod({
      frequency: reportFrequency,
      mode: reportPeriodMode,
      year: reportYear,
      month: reportMonth,
      week: reportWeek,
      fromDate: periodStartDate,
      toDate: periodEndDate,
    });
    if (!reportPeriod || reportPeriod.fromDate !== periodStartDate || reportPeriod.toDate !== periodEndDate) {
      return NextResponse.json({ error: 'Choose a valid month, week, or report date range' }, { status: 400 });
    }
    if (reportDate !== undefined && (
      typeof reportDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(reportDate) ||
      Number.isNaN(new Date(`${reportDate}T00:00:00Z`).getTime()) ||
      new Date(`${reportDate}T00:00:00Z`).toISOString().slice(0, 10) !== reportDate ||
      reportDate < reportPeriod.fromDate ||
      reportDate > reportPeriod.toDate
    )) {
      return NextResponse.json({ error: 'Choose a date within the selected report week' }, { status: 400 });
    }
    if (attachments !== undefined && (!Array.isArray(attachments) ||
      !attachments.every((attachment) => isValidDocumentUpload(attachment, ['pdf'], STANDARD_DOCUMENT_MAX_BYTES)))) {
      return NextResponse.json({ error: 'Report attachments must be PDF files up to 5 MB each' }, { status: 400 });
    }

    const currentPeriodKey = reportPeriodKey(reportPeriod.fromDate, reportFrequency);
    const duplicateReport = getRequestsByTargetDB('all').some((item) =>
      item.type === 'report' &&
      item.createdById === auth.id &&
      item.payload?.reportFrequency === reportFrequency &&
      reportPeriodKey(item.payload?.periodStartDate || item.createdAt, reportFrequency) === currentPeriodKey
    );
    if (duplicateReport) {
      return NextResponse.json({ error: `You have already submitted a ${reportFrequency} report for this period` }, { status: 409 });
    }

    const identifiers = generateRequestIdentifiers();
    const submitter = findUserById(auth.id);
    if (!submitter || submitter.status !== 'active') {
      return NextResponse.json({ error: 'An active account is required' }, { status: 403 });
    }
    if (!submitter.phone?.trim()) {
      return NextResponse.json({ error: 'Add a phone number to your profile before submitting a report' }, { status: 400 });
    }
    const guide = submitter.guideId ? findUserById(submitter.guideId) : undefined;
    if (requiresGuideRole(auth.role) && (!guide || guide.status !== 'active' || !isEligibleGuideRole(guide.role))) {
      return NextResponse.json({ error: 'An authorized guide must be assigned before submitting reports' }, { status: 409 });
    }
    const guideUsername = requiresGuideRole(auth.role) ? guide?.username.toLowerCase() : undefined;
    const approvalChain = getApprovalChainForUser(auth.username, auth.role, 'report', guideUsername);
    const newReport: RequestItem = {
      id: identifiers.id,
      submissionId: identifiers.submissionId,
      type: 'report',
      title: title.trim(),
      createdBy: submitter.fullName,
      createdByUsername: auth.username,
      createdById: auth.id,
      createdByRole: auth.role,
      createdByDesignation: submitter.designation,
      createdByEmployeeId: submitter.employeeId,
      createdByDepartment: submitter.department,
      createdByPhone: submitter.phone,
      payload: {
        description: description.trim(),
        reportFrequency, // 'weekly' or 'monthly'
        reportPeriodMode,
        reportPeriodYear: reportYear,
        reportPeriodMonth: reportMonth,
        reportPeriodWeek: reportWeek,
        periodStartDate: reportPeriod.fromDate,
        periodEndDate: reportPeriod.toDate,
        periodLabel: reportFrequency === 'weekly' ? (reportDate || reportPeriod.fromDate) : reportPeriod.label,
        ...(reportFrequency === 'weekly' ? { reportDate: reportDate || reportPeriod.fromDate } : {}),
        attachments: attachments || [],
        ...(guideUsername ? { guideId: guide?.id, guideUsername } : {}),
        approvalChain,
        currentApproverIndex: 0,
      },
      remarks: optionalRemarks,
      target: 'admin',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const saved = addRequestDB(newReport);

    addNotificationsDB([
      {
        type: 'report-submitted',
        title: `${reportFrequency === 'weekly' ? 'Weekly' : 'Monthly'} Report Submitted`,
        message: `${auth.username} submitted "${title.trim()}" for ${reportPeriod.label}.`,
        targetUser: approvalChain[0],
        relatedId: saved.id,
        read: false,
      },
      {
        type: 'report-submitted',
        title: `${reportFrequency === 'weekly' ? 'Weekly' : 'Monthly'} Report Received`,
        message: `Your report "${title.trim()}" was submitted for approval.`,
        targetUser: auth.username,
        relatedId: saved.id,
        read: false,
      },
    ]);

    try {
      addAuditEntry({
        action: 'report:submitted',
        actor: auth.username,
        actorId: auth.id,
        details: { id: saved.id, title: title.trim(), reportFrequency, periodStartDate: reportPeriod.fromDate, periodEndDate: reportPeriod.toDate, remarks: optionalRemarks },
      });
    } catch (e) {
      console.error('Audit log failed', e);
    }

    return NextResponse.json({
      success: true,
      report: { id: saved.id, submissionId: saved.submissionId, title: saved.title, status: saved.status, createdAt: saved.createdAt },
    });
  } catch (error) {
    console.error('Report submission error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, [...REPORT_READ_ROLES]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const frequency = searchParams.get('frequency') as 'weekly' | 'monthly' | null;

  const allReports = getRequestsByTargetDB('all').filter((r) => r.type === 'report');
  let filtered = allReports.filter((report) => {
    const chain = report.payload?.approvalChain;
    const stage = report.status === 'forwarded'
      ? report.payload?.currentApproverIndex
      : report.status === 'pending'
        ? 0
        : -1;
    return report.createdById === auth.id ||
      (Array.isArray(chain) && Number.isInteger(stage) && chain[stage] === auth.username.toLowerCase());
  });
  if (frequency) {
    filtered = filtered.filter((r) => r.payload?.reportFrequency === frequency);
  }

  return NextResponse.json({ success: true, reports: filtered.map(withCurrentSubmitterProfile) });
}

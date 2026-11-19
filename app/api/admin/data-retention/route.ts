import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/rbac';
import {
  decideRetentionCycle,
  getRetentionWorkflow,
  RETENTION_APPROVERS,
} from '@/lib/retention-workflow';

function isNamedApprover(identity: { id: string; role: string; username: string }): boolean {
  return RETENTION_APPROVERS.some((approver) =>
    approver.id === identity.id &&
    approver.role === identity.role &&
    approver.username === identity.username.toLowerCase()
  );
}

export async function GET(request: NextRequest) {
  try {
    const auth = requireRole(request, ['admin', 'founder', 'managing-partner']);
    if (auth instanceof NextResponse) return auth;
    if (!isNamedApprover(auth) && auth.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const workflow = getRetentionWorkflow();
    const action = request.nextUrl.searchParams.get('action');
    const status = workflow.cycle?.status === 'pending'
      ? 'approval-required'
      : workflow.cycle?.status === 'resetting'
        ? 'reset-in-progress'
        : 'scheduled';
    const daysRemaining = Math.max(0, Math.ceil(
      (Date.parse(workflow.nextRunAt) - Date.now()) / (24 * 60 * 60 * 1000)
    ));
    if (action === 'check') {
      return NextResponse.json({
        status,
        message: 'Operational data is archived before any reset and reset only after all three sequential approvals.',
        daysRemaining,
        nextRunAt: workflow.nextRunAt,
        retentionDisabled: false,
      });
    }
    if (action === 'notifications') {
      return NextResponse.json({
        notifications: workflow.cycle?.status === 'pending' ? [workflow.cycle] : [],
        count: workflow.cycle?.status === 'pending' ? 1 : 0,
        unreadCount: workflow.cycle?.status === 'pending' ? 1 : 0,
      });
    }

    return NextResponse.json({
      success: true,
      status,
      daysRemaining,
      workflow,
      retentionDisabled: false,
    });
  } catch (error) {
    console.error('Data retention status error:', error);
    return NextResponse.json({ error: 'Unable to load data-retention status' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireRole(request, ['founder', 'managing-partner']);
    if (auth instanceof NextResponse) return auth;
    if (!isNamedApprover(auth)) {
      return NextResponse.json({ error: 'Only a named retention approver may act on this request' }, { status: 403 });
    }

    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid decision request' }, { status: 400 });
    }
    const { action, comment } = body as { action?: unknown; comment?: unknown };
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'Action must be approve or reject' }, { status: 400 });
    }
    if (comment !== undefined && comment !== null && typeof comment !== 'string') {
      return NextResponse.json({ error: 'Decision remarks must be text' }, { status: 400 });
    }

    const workflow = decideRetentionCycle(auth.username, action, typeof comment === 'string' ? comment.trim() : '');
    return NextResponse.json({ success: true, workflow });
  } catch (error) {
    if (error instanceof Error && (
      error.message === 'There is no pending data-retention approval' ||
      error.message === 'Only the current retention approver may act on this request'
    )) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Data retention decision error:', error);
    return NextResponse.json({ error: 'Unable to process data-retention decision' }, { status: 500 });
  }
}

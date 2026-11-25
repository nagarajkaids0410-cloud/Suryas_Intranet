import { NextRequest, NextResponse } from 'next/server';
import { getApprovalChainForUser, isEligibleGuideRole, RequestItem, RequestTarget, RequestType, requiresGuideRole, UploadedFile } from '@/lib/request-store';
import { addRequestDB, generateRequestIdentifiers, getRequestsByTargetDB, fetchRequestsFromSupabase, persistRequestDB } from '@/lib/request-db';
import { requireRole } from '@/lib/rbac';
import { findUserById } from '@/lib/user-database';
import { addNotificationsDB, addNotificationsAndSyncDB } from '@/lib/notification-db';
import { withCurrentSubmitterProfiles } from '@/lib/request-profile';
import { EXTENDED_DOCUMENT_MAX_BYTES, isValidDocumentUpload, STANDARD_DOCUMENT_MAX_BYTES } from '@/lib/document-upload';
import { getSupabaseAdmin } from '@/lib/supabase';

const approvalAuthorities: Record<string, { id: string; role: string }> = {
  hareeshv: { id: 'user-002', role: 'managing-partner' },
  santhanakumarv: { id: 'user-003', role: 'managing-partner' },
  gkbharath: { id: 'founder-001', role: 'founder' },
};

function omitFileContents(value: any): any {
  if (Array.isArray(value)) return value.map(omitFileContents);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'base64')
      .map(([key, nestedValue]) => [key, omitFileContents(nestedValue)])
  );
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, [
    'founder',
    'managing-partner',
    'admin',
    'employee',
    'freelancer',
    'senior-freelancer',
    'intern',
    'project-intern',
    'user',
  ]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const target = (searchParams.get('target') || 'admin') as RequestTarget;
  const authority = approvalAuthorities[auth.username.toLowerCase()];
  const isNamedApprover = !!authority &&
    authority.id === auth.id &&
    authority.role === auth.role;
  const isFounderTeamAssigner = auth.role === 'founder' &&
    auth.username.toLowerCase() === 'gkbharath' &&
    auth.id === 'founder-001';
  const isFounderOrAdmin = auth.role === 'admin' || (auth.role === 'founder' && auth.username.toLowerCase() === 'gkbharath') || auth.role === 'founder';
  const isAdminDashboardScope = target === 'all' &&
    searchParams.get('scope') === 'dashboard' &&
    (auth.role === 'admin' || (auth.role === 'founder' && auth.username.toLowerCase() === 'gkbharath' && auth.id === 'founder-001'));
  const requestId = searchParams.get('requestId');
  const compact = searchParams.get('compact') === 'true';
  const mineOnly = searchParams.get('mine') === 'true';
  const requestedType = searchParams.get('type');
  const allRequests = await fetchRequestsFromSupabase();
  const items = allRequests.filter((item) => {
    if (requestedType && item.type !== requestedType) return false;
    if (mineOnly) return item.createdById === auth.id && item.type !== 'internal-service';
    if (isFounderOrAdmin) return true;
    const chain = item.payload?.approvalChain;
    const stageIndex = item.status === 'forwarded'
      ? item.payload?.currentApproverIndex
      : item.status === 'pending'
        ? 0
        : -1;
    const isCurrentApprover = Array.isArray(chain) &&
      Number.isInteger(stageIndex) &&
      typeof chain[stageIndex] === 'string' &&
      chain[stageIndex].toLowerCase() === auth.username.toLowerCase();
    const isApprovalParticipant = isNamedApprover &&
      Array.isArray(chain) &&
      chain.some((approver) =>
        typeof approver === 'string' &&
        approver.toLowerCase() === auth.username.toLowerCase()
      );
    const isRequester = item.createdById === auth.id;
    const isAssignedProjectMember = item.type === 'proposal' &&
      item.payload?.projectTeam?.some((member: { userId?: string }) => member.userId === auth.id);
    const comments = item.payload?.comments;
    const isFinallyApprovedProject = isFounderTeamAssigner &&
      item.type === 'proposal' &&
      item.status === 'approved' &&
      Array.isArray(chain) &&
      chain.at(-1) === 'gkbharath' &&
      item.payload?.currentApproverIndex === chain.length - 1 &&
      Array.isArray(comments) &&
      comments[0]?.by === 'gkbharath' &&
      comments[0]?.decision === 'approve';
    return isAdminDashboardScope || isRequester || isCurrentApprover || isApprovalParticipant || isAssignedProjectMember || isFinallyApprovedProject;
  }).filter((item) => (isFounderOrAdmin || target === 'founder') ? true : item.target === target || target === 'all');
  if (requestId) {
    let item = items.find((candidate) => candidate.id === requestId);
    try {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase.from('requests').select('*').eq('id', requestId).maybeSingle();
      if (data) item = data as RequestItem;
    } catch {}
    if (!item) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    const enrichedItem = withCurrentSubmitterProfiles([item])[0];
    return NextResponse.json({ success: true, request: compact ? omitFileContents(enrichedItem) : enrichedItem });
  }
  const enrichedItems = withCurrentSubmitterProfiles(items);
  return NextResponse.json({
    success: true,
    requests: compact || isAdminDashboardScope ? omitFileContents(enrichedItems) : enrichedItems,
  });
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireRole(request, [
      'founder',
      'managing-partner',
      'admin',
      'employee',
      'freelancer',
      'senior-freelancer',
      'intern',
      'project-intern',
      'user',
    ]);
    if (auth instanceof NextResponse) return auth;

    const user = findUserById(auth.id);
    if (!user || user.status !== 'active') {
      return NextResponse.json({ error: 'An active account is required' }, { status: 403 });
    }
    if (!user.phone?.trim()) {
      return NextResponse.json({ error: 'Add a phone number to your profile before submitting an application' }, { status: 400 });
    }

    const body = await request.json();
    const {
      type,
      title,
      payload,
      remarks,
      uploadedFile,
      signatureFrom,
    } = body as {
      type: RequestType;
      title: string;
      payload: Record<string, any>;
      remarks?: string;
      uploadedFile?: UploadedFile;
      signatureFrom?: string;
    };

    const allowedTypes: RequestType[] = ['leave', 'ta', 'proposal', 'report', 'attendance-report', 'certificate', 'relieving', 'internal-service'];
    if (
      typeof type !== 'string' ||
      !allowedTypes.includes(type as RequestType) ||
      typeof title !== 'string' ||
      !title.trim() ||
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      return NextResponse.json({ error: 'Missing request data' }, { status: 400 });
    }

    const effectiveRemarks = typeof remarks === 'string' ? remarks.trim() : typeof payload?.remarks === 'string' ? payload.remarks.trim() : '';
    const allowanceBillRequired = type === 'ta' && payload.claimType !== 'bill';
    if (type === 'ta' && payload.claimType !== 'bill' && payload.claimType !== 'expenses') {
      return NextResponse.json({ error: 'Choose Expenses or Non-Bill Expenses for the allowance claim' }, { status: 400 });
    }
    if (allowanceBillRequired && !uploadedFile) {
      return NextResponse.json({ error: 'Attach a PDF bill or receipt up to 5 MB for Expenses claims' }, { status: 400 });
    }
    if (uploadedFile && type !== 'proposal' &&
      !isValidDocumentUpload(uploadedFile, ['pdf'], STANDARD_DOCUMENT_MAX_BYTES, true)) {
      return NextResponse.json({ error: 'Request uploads must be PDF files up to 5 MB' }, { status: 400 });
    }
    if (type === 'proposal' &&
      !isValidDocumentUpload(uploadedFile, ['pdf', 'doc', 'docx'], EXTENDED_DOCUMENT_MAX_BYTES, true)) {
      return NextResponse.json({ error: 'Project proposal documents must be PDF or DOC/DOCX files up to 10 MB' }, { status: 400 });
    }
    if (type === 'ta' && payload.filledFormFile &&
      !isValidDocumentUpload(payload.filledFormFile, ['pdf'], STANDARD_DOCUMENT_MAX_BYTES, true)) {
      return NextResponse.json({ error: 'Allowance form uploads must be a PDF file up to 5 MB' }, { status: 400 });
    }
    if (type === 'leave') {
      const leaveType = payload.leaveType;
      if (!['casual', 'medical', 'loss-of-pay'].includes(leaveType)) {
        return NextResponse.json({ error: 'Choose Casual Leave, Medical Leave, or Loss of Pay' }, { status: 400 });
      }
      if (
        typeof payload.fromDate !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(payload.fromDate) ||
        payload.toDate !== payload.fromDate
      ) {
        return NextResponse.json({ error: 'A leave request must be for one date only' }, { status: 400 });
      }
      const duplicateDate = getRequestsByTargetDB('all').some((item) => {
        if (item.type !== 'leave' || item.createdById !== auth.id) return false;
        if (item.status === 'rejected') return false;
        const existingStart = item.payload?.fromDate;
        const existingEnd = item.payload?.toDate || existingStart;
        return typeof existingStart === 'string' &&
          typeof existingEnd === 'string' &&
          existingStart <= payload.fromDate &&
          existingEnd >= payload.fromDate;
      });
      if (duplicateDate) {
        return NextResponse.json({ error: 'You already have a leave request for this date' }, { status: 409 });
      }
      if (leaveType === 'medical') {
        if (!isValidDocumentUpload(payload.medicalDocument, ['pdf'], STANDARD_DOCUMENT_MAX_BYTES, true)) {
          return NextResponse.json({ error: 'A medical certificate or prescription PDF up to 5 MB is required for Medical Leave' }, { status: 400 });
        }
      }
    }

    if (type === 'certificate') {
      const certificateType = payload.certificateType;
      const experienceCertificateRoles = ['employee', 'freelancer', 'senior-freelancer', 'admin', 'founder', 'managing-partner', 'user', 'intern', 'project-intern'];
      if (
        certificateType !== 'experience' ||
        !experienceCertificateRoles.includes(auth.role)
      ) {
        return NextResponse.json({ error: 'This certificate type is not available for your account' }, { status: 400 });
      }
    }
    if (type === 'relieving' && (auth.role === 'guest' || !uploadedFile)) {
      return NextResponse.json({ error: 'Attach the relieving email copy as a PDF to submit a relieving request' }, { status: 400 });
    }
    if (type === 'attendance-report' && (!payload.fromDate || !payload.toDate)) {
      return NextResponse.json({ error: 'Attendance report start and end dates are required' }, { status: 400 });
    }

    let guideUsername: string | undefined;
    if (requiresGuideRole(auth.role)) {
      if (!user.guideId) {
        return NextResponse.json({ error: 'An active guide must be assigned before submitting requests' }, { status: 409 });
      }
      const guide = findUserById(user.guideId);
      if (!guide || guide.status !== 'active' || !isEligibleGuideRole(guide.role)) {
        return NextResponse.json({ error: 'Your assigned guide is unavailable. Contact an administrator.' }, { status: 409 });
      }
      guideUsername = guide.username.toLowerCase();
    }

    const enforcedTarget: RequestTarget = 'admin';
    const normalizedPayload = {
      ...payload,
      remarks: effectiveRemarks,
      ...(guideUsername ? { guideId: user.guideId, guideUsername } : {}),
      approvalChain: getApprovalChainForUser(auth.username, auth.role, type, guideUsername),
      currentApproverIndex: 0,
    };
    const identifiers = generateRequestIdentifiers();

    const newRequest: RequestItem = {
      id: identifiers.id,
      submissionId: identifiers.submissionId,
      type: type as RequestType,
      title: title.trim(),
      createdBy: user.fullName,
      createdByUsername: user.username,
      createdById: user.id,
      createdByRole: user.role,
      createdByDesignation: user.designation,
      createdByEmployeeId: user.employeeId,
      createdByDepartment: user.department,
      createdByPhone: user.phone,
      payload: normalizedPayload,
      remarks: effectiveRemarks,
      target: enforcedTarget,
      status: 'pending',
      createdAt: new Date().toISOString(),
      uploadedFile,
      signatureFrom,
    };

    const saved = await persistRequestDB(newRequest);
    try {
      const firstApprover = normalizedPayload.approvalChain[0];
      await addNotificationsAndSyncDB([
        {
          type: 'request_submitted',
          title: `Request submitted - ${saved.title}`,
          message: `${saved.createdBy} submitted ${saved.title}; it is awaiting your review.`,
          targetUser: firstApprover,
          relatedId: saved.id,
          read: false,
        },
        {
          type: 'request_submitted',
          title: `Submission received - ${saved.title}`,
          message: `Your request ${saved.title} was submitted for approval.`,
          targetUser: auth.username,
          relatedId: saved.id,
          read: false,
        },
      ]);
    } catch (error) {
      console.error('Failed to notify request submission', error);
    }

    return NextResponse.json({
      success: true,
      request: { id: saved.id, submissionId: saved.submissionId, type: saved.type, title: saved.title, status: saved.status, createdAt: saved.createdAt },
    });
  } catch (error) {
    console.error('Request creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

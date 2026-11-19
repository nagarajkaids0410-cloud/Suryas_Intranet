import { NextRequest, NextResponse } from 'next/server';
import { addRequestDB, generateRequestIdentifiers, getRequestsByTargetDB, getRequestByIdDB, updateRequestPayloadDB } from '@/lib/request-db';
import { requireRole } from '@/lib/rbac';
import { getApprovalChainForUser, isEligibleGuideRole, RequestItem, requiresGuideRole } from '@/lib/request-store';
import { addNotificationDB } from '@/lib/notification-db';
import { findUserById } from '@/lib/user-database';
import { addAuditEntry } from '@/lib/audit-log';
import { withCurrentSubmitterProfile } from '@/lib/request-profile';
import { EXTENDED_DOCUMENT_MAX_BYTES, isValidDocumentUpload } from '@/lib/document-upload';

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ['admin', 'founder', 'managing-partner', 'employee', 'freelancer', 'senior-freelancer', 'intern', 'project-intern', 'user']);
  if (auth instanceof NextResponse) return auth;

  const userId = (auth as any).id;
  // Get all internal-service requests from the DB
  const allRequests = getRequestsByTargetDB('all').filter((r) => r.type === 'internal-service');
  const visibleRequests = allRequests.filter(
    (r) => r.createdById === userId || r.payload?.assignedHeadId === userId
  );

  return NextResponse.json({
    success: true,
    requests: visibleRequests.map((item) => {
      const enriched = withCurrentSubmitterProfile(item);
      return {
        ...enriched,
        status: item.status === 'conversation' ? 'conversation' : item.status,
        payload: { ...enriched.payload, status: undefined },
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ['admin', 'founder', 'managing-partner', 'employee', 'freelancer', 'senior-freelancer', 'intern', 'project-intern', 'user', 'guest']);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { description, remarks, files, assignedHeadId } = body as {
      description: string;
      remarks?: string;
      files?: Array<{ name: string; size: number; type: string; base64: string }>;
      assignedHeadId?: string;
    };
    if (remarks !== undefined && remarks !== null && typeof remarks !== 'string') {
      return NextResponse.json({ error: 'Remarks must be text' }, { status: 400 });
    }
    const optionalRemarks = typeof remarks === 'string' ? remarks.trim() : '';

    if (!description || !description.trim()) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }
    if (files !== undefined && (!Array.isArray(files) ||
      !files.every((file) => isValidDocumentUpload(file, ['pdf', 'doc', 'docx'], EXTENDED_DOCUMENT_MAX_BYTES)))) {
      return NextResponse.json({ error: 'Attachments must be PDF or DOC/DOCX files up to 10 MB each' }, { status: 400 });
    }

    const authAny = auth as any;
    const creatorId = authAny.id;
    const selectedUser = findUserById(creatorId);
    if (!selectedUser || selectedUser.status !== 'active') {
      return NextResponse.json({ error: 'Selected member is not an active portal user' }, { status: 400 });
    }
    if (!selectedUser.phone?.trim()) {
      return NextResponse.json({ error: 'Add a phone number to your profile before submitting an internal request' }, { status: 400 });
    }
    const recipient = findUserById(assignedHeadId || '');
    if (!recipient || recipient.status !== 'active' || recipient.id === creatorId) {
      return NextResponse.json({ error: 'Choose an active recipient other than the requester' }, { status: 400 });
    }
    const creatorUser = {
      id: selectedUser.id,
      name: selectedUser.fullName || selectedUser.username,
      username: selectedUser.username,
      role: selectedUser.role,
      designation: selectedUser.designation || '',
      employeeId: selectedUser.employeeId,
      department: selectedUser.department || '',
      phone: selectedUser.phone || '',
    };
    const needsGuide = requiresGuideRole(selectedUser.role);
    let firstRecipient = recipient;
    let approvalChain: string[] | undefined;
    let guideId: string | undefined;
    let guideUsername: string | undefined;
    if (needsGuide) {
      const guide = selectedUser.guideId ? findUserById(selectedUser.guideId) : undefined;
      if (!guide || guide.status !== 'active' || !isEligibleGuideRole(guide.role)) {
        return NextResponse.json({ error: 'An active guide must be assigned before submitting this request' }, { status: 409 });
      }
      firstRecipient = guide;
      guideId = guide.id;
      guideUsername = guide.username.toLowerCase();
      approvalChain = getApprovalChainForUser(selectedUser.username, selectedUser.role, 'internal-service', guideUsername);
    }

    // Create the request with replies array
    const identifiers = generateRequestIdentifiers();
    const newRequest: RequestItem = {
      id: identifiers.id,
      submissionId: identifiers.submissionId,
      type: 'internal-service',
      title: `Internal Service Request from ${creatorUser.name}`,
      createdBy: creatorUser.name,
      createdById: creatorId,
      createdByRole: creatorUser.role,
      createdByDesignation: creatorUser.designation,
      createdByEmployeeId: creatorUser.employeeId,
      createdByDepartment: creatorUser.department,
      createdByPhone: creatorUser.phone,
      payload: {
        description,
        id: creatorUser.employeeId,
        designation: creatorUser.designation,
        department: creatorUser.department,
        phone: creatorUser.phone,
        remarks: optionalRemarks,
        files: files || [],
        assignedHeadId: firstRecipient.id,
        ...(needsGuide ? {
          requestedRecipientId: recipient.id,
          guideId,
          guideUsername,
          approvalChain,
          currentApproverIndex: 0,
        } : {}),
        replies: [] as Array<{
          repliedBy: string;
          repliedById: string;
          repliedAt: string;
          message: string;
        }>,
      },
      target: 'admin',
      status: needsGuide ? 'pending' : 'conversation',
      createdAt: new Date().toISOString(),
    };

    const saved = addRequestDB(newRequest);

    addNotificationDB({
      type: 'internal-service-request',
      title: 'Internal request assigned to you',
      message: `${creatorUser.name} sent you a request: "${description.substring(0, 50)}..."`,
      targetUser: firstRecipient.username,
      relatedId: saved.id,
      read: false,
    });

    try {
      addAuditEntry({
        action: 'internal-request:created',
        actor: creatorUser.name,
        actorId: creatorId,
        details: { id: saved.id, description: description.substring(0, 100) },
      });
    } catch (e) {
      console.error('Audit log failed', e);
    }

    return NextResponse.json({
      success: true,
      request: { id: saved.id, submissionId: saved.submissionId, type: saved.type, title: saved.title, status: saved.status, createdAt: saved.createdAt },
    });
  } catch (error) {
    console.error('Internal request creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = requireRole(req, ['admin', 'founder', 'managing-partner', 'employee', 'freelancer', 'senior-freelancer', 'intern', 'project-intern', 'user']);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { requestId, action, message } = body as {
      requestId: string;
      action: 'reply';
      message?: string;
    };

    if (!requestId || !action) {
      return NextResponse.json({ error: 'Missing requestId or action' }, { status: 400 });
    }

    const reqItem = getRequestByIdDB(requestId);
    if (!reqItem || reqItem.type !== 'internal-service') {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    const authAny = auth as any;

    // Only the requester or assigned head can reply.
    const isCreator = reqItem.createdById === authAny.id;
    const isHead = reqItem.payload?.assignedHeadId === authAny.id;
    if (action === 'reply' && !isCreator && !isHead) {
      return NextResponse.json({ error: 'Only the requester or assigned recipient can reply' }, { status: 403 });
    }
    if (action !== 'reply' || (!isCreator && !isHead)) {
      return NextResponse.json({ error: 'Forbidden: cannot act on this request' }, { status: 403 });
    }

    if (message?.trim()) {
      const replies = reqItem.payload?.replies || [];
      replies.push({
        repliedBy: authAny.username,
        repliedById: authAny.id,
        repliedAt: new Date().toISOString(),
        message: message.trim(),
      });

      const updated = updateRequestPayloadDB(requestId, { replies });

      // Notify the other party
      try {
        addAuditEntry({
          action: 'internal-request:replied',
          actor: authAny.username,
          actorId: authAny.id,
          details: { requestId, message: message.trim().substring(0, 100) },
        });
      } catch (e) {
        console.error('Audit log failed', e);
      }

      // Send notification to creator or assigned head
      if (isHead && !isCreator) {
        const requester = reqItem.createdById ? findUserById(reqItem.createdById) : undefined;
        addNotificationDB({
          type: 'internal-service-reply',
          title: 'Reply on Your Internal Request',
          message: `${authAny.username}: "${message.trim().substring(0, 50)}..."`,
          targetUser: requester?.username || reqItem.createdById || 'all',
          relatedId: requestId,
          read: false,
        });
      } else if (isCreator && !isHead && reqItem.payload?.assignedHeadId) {
        const assignedRecipient = findUserById(reqItem.payload.assignedHeadId);
        addNotificationDB({
          type: 'internal-service-reply',
          title: 'Reply on Internal Request',
          message: `${authAny.username}: "${message.trim().substring(0, 50)}..."`,
          targetUser: assignedRecipient?.username || reqItem.payload.assignedHeadId,
          relatedId: requestId,
          read: false,
        });
      }

      return NextResponse.json({ success: true, request: updated });
    }

    return NextResponse.json({ error: 'A non-empty reply message is required' }, { status: 400 });
  } catch (error) {
    console.error('Internal request PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

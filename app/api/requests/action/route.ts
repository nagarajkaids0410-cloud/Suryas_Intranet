import { NextRequest, NextResponse } from 'next/server';
import { getRequestByIdDB, updateRequestStatusDB, updateRequestStatusAndSyncDB } from '@/lib/request-db';
import { addLedgerTransaction, addLedgerTransactionAndSync } from '@/lib/company-ledger';
import { requireRole } from '@/lib/rbac';
import { addNotificationDB, addNotificationsDB, addNotificationsAndSyncDB, addNotificationAndSyncDB } from '@/lib/notification-db';
import { isValidDocumentUpload, STANDARD_DOCUMENT_MAX_BYTES } from '@/lib/document-upload';
import { getAllUsers } from '@/lib/user-database';
import { addAuditEntry } from '@/lib/audit-log';
import { getApprovalChainForUser } from '@/lib/request-store';
import { isEligibleGuideRole, requiresGuideRole } from '@/lib/request-store';
import { findUserById } from '@/lib/user-database';

const approvalAuthorities: Record<string, { id: string; role: string }> = {
  hareeshv: { id: 'user-002', role: 'managing-partner' },
  santhanakumarv: { id: 'user-003', role: 'managing-partner' },
  gkbharath: { id: 'founder-001', role: 'founder' },
};
const isIntern = (designation?: string) => !!designation && designation.toLowerCase().includes('intern');

function omitFileContents(value: any): any {
  if (Array.isArray(value)) return value.map(omitFileContents);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'base64')
      .map(([key, nestedValue]) => [key, omitFileContents(nestedValue)])
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, requestId } = body as { action: string; requestId: string };

    if (!action || !requestId) {
      return NextResponse.json({ error: 'Missing action or requestId' }, { status: 400 });
    }
    if (!['approve', 'reject', 'sign', 'recommend', 'issue'].includes(action)) {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    const caller = requireRole(request, [
      'admin',
      'founder',
      'managing-partner',
      'employee',
      'freelancer',
      'senior-freelancer',
      'intern',
      'project-intern',
    ]);
    if (caller instanceof NextResponse) return caller;

    let current = getRequestByIdDB(requestId);
    if (!current) {
      try {
        const { getSupabaseAdmin } = require('@/lib/supabase');
        const supabase = getSupabaseAdmin();
        const { data } = await supabase.from('requests').select('*').eq('id', requestId).maybeSingle();
        if (data) current = data;
      } catch {}
    }
    if (!current) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }
    if (current.type === 'registration') {
      return NextResponse.json({ error: 'Registrations must be completed through the sequential access-request workflow' }, { status: 409 });
    }
    const currentPayload = { ...(current.payload || {}) } as any;
    const chain = Array.isArray(currentPayload.approvalChain) && currentPayload.approvalChain.every((id: unknown) => typeof id === 'string')
      ? currentPayload.approvalChain as string[]
      : [];
    if (chain.length === 0) {
      return NextResponse.json({ error: 'Request approval chain is missing' }, { status: 409 });
    }
    const requester = current.createdById ? findUserById(current.createdById) : undefined;
    const guideId = typeof currentPayload.guideId === 'string' ? currentPayload.guideId : undefined;
    const guideUsername = typeof currentPayload.guideUsername === 'string' ? currentPayload.guideUsername.toLowerCase() : undefined;
    const assignedGuide = guideId ? findUserById(guideId) : undefined;
    const requesterRole = current.createdByRole || requester?.role;
    const expectedChain = requester
      ? getApprovalChainForUser(
          current.createdByUsername || requester.username,
          requesterRole || requester.role,
          current.type,
          guideUsername
        )
      : [];
    if (
      !requester ||
      (requiresGuideRole(requesterRole || requester.role) &&
        (!guideId || requester.guideId !== guideId || !assignedGuide || assignedGuide.status !== 'active' || !isEligibleGuideRole(assignedGuide.role) || assignedGuide.username.toLowerCase() !== guideUsername)) ||
      chain.length !== expectedChain.length ||
      chain.some((approver, index) => approver !== expectedChain[index])
    ) {
      return NextResponse.json({ error: 'Request approval chain is invalid' }, { status: 409 });
    }
    const authority = approvalAuthorities[caller.username.toLowerCase()];
    const stageIndex = current.status === 'forwarded'
      ? currentPayload.currentApproverIndex
      : 0;
    if (
      (current.status !== 'pending' && current.status !== 'forwarded') ||
      !Number.isInteger(stageIndex) ||
      stageIndex < 0 ||
      stageIndex >= chain.length
    ) {
      return NextResponse.json({ error: 'Request is not awaiting an approval action' }, { status: 409 });
    }
    if (current.status === 'forwarded' && current.forwardedTo !== chain[stageIndex]) {
      return NextResponse.json({ error: 'Request approval stage is inconsistent' }, { status: 409 });
    }
    const isFounder = caller.role === 'founder' || caller.username.toLowerCase() === 'gkbharath';
    const isCurrentStageApprover = caller.username.toLowerCase() === chain[stageIndex].toLowerCase();

    if (!isCurrentStageApprover && !isFounder) {
      return NextResponse.json({ error: 'Forbidden: you are not the current approver' }, { status: 403 });
    }
    const isAuthorizedLeader = isFounder || (!!authority && authority.id === caller.id && authority.role === caller.role);
    const isAssignedGuide = stageIndex === 0 &&
      requiresGuideRole(requesterRole || requester.role) &&
      guideId === caller.id &&
      guideUsername === caller.username.toLowerCase();
    if (!isAuthorizedLeader && !isAssignedGuide) {
      return NextResponse.json({ error: 'Only an assigned guide or named leadership approver may process this request' }, { status: 403 });
    }
    if (isAssignedGuide && action !== 'recommend') {
      return NextResponse.json({ error: 'Guides may verify and recommend, but cannot make approval or rejection decisions' }, { status: 403 });
    }
    if (action === 'recommend' && !isAssignedGuide) {
      return NextResponse.json({ error: 'Only the allocated guide may submit a recommendation' }, { status: 403 });
    }
    const isFinalApprover =
      isFounder || (
        stageIndex === chain.length - 1 &&
        caller.username.toLowerCase() === chain.at(-1)?.toLowerCase() &&
        isAuthorizedLeader
      );
    if (current.createdById === caller.id && !isFinalApprover) {
      return NextResponse.json({ error: 'You cannot act on your own request' }, { status: 403 });
    }
    if (stageIndex === chain.length - 1 && !isFinalApprover) {
      return NextResponse.json({ error: 'Only the designated final approver can make the final decision' }, { status: 403 });
    }
    if (body.comment !== undefined && body.comment !== null && typeof body.comment !== 'string') {
      return NextResponse.json({ error: 'Decision remarks must be text' }, { status: 400 });
    }
    const comment = typeof body.comment === 'string' ? body.comment.trim() : '';

    if (isAssignedGuide) {
      const nextApprover = chain[stageIndex + 1];
      if (!nextApprover) {
        return NextResponse.json({ error: 'A guide recommendation must be followed by an authorized approver' }, { status: 409 });
      }
      const comments = Array.isArray(currentPayload.comments) ? currentPayload.comments : [];
      const updated = updateRequestStatusDB(requestId, 'forwarded', {
        payload: {
          ...currentPayload,
          currentApproverIndex: stageIndex + 1,
          comments: [{ by: caller.username, comment, decision: 'recommend', stageIndex, at: new Date().toISOString() }, ...comments],
        },
        forwardedTo: nextApprover,
      });
      addAuditEntry({
        action: 'request:guide-recommendation',
        actor: caller.username,
        actorId: caller.id,
        details: { requestId, nextApprover, remarks: comment },
      });
      addNotificationDB({
        type: 'request_forwarded',
        title: `Guide recommendation submitted - ${current.title}`,
        message: `The guide has recommended this request for authorized approval.`,
        targetUser: nextApprover,
        relatedId: requestId,
        read: false,
      });
      return NextResponse.json({ success: true, request: omitFileContents(updated), forwardedTo: nextApprover });
    }

    if (action === 'recommend') {
      return NextResponse.json({ error: 'This request cannot be recommended by this user' }, { status: 403 });
    }
    const isDocumentRequest = current.type === 'certificate' || current.type === 'relieving';
    const uploadedDocument = body.officialDocument;
    if (action === 'issue') {
      if (!isDocumentRequest || !isFinalApprover) {
        return NextResponse.json({ error: 'Only the designated final approver may issue official request documents' }, { status: 403 });
      }
      if (!isValidDocumentUpload(uploadedDocument, ['pdf'], STANDARD_DOCUMENT_MAX_BYTES, true)) {
        return NextResponse.json({ error: 'Attach the issued official PDF document (up to 5 MB)' }, { status: 400 });
      }
    } else if ((action === 'approve' || action === 'sign') && isDocumentRequest && isFinalApprover) {
      return NextResponse.json({ error: 'Use the issue action and attach the official PDF to complete this request' }, { status: 400 });
    } else if (action === 'issue' && !isDocumentRequest) {
      return NextResponse.json({ error: 'Document issuance is only available for relieving and certificate requests' }, { status: 400 });
    }

    if (action === 'approve' || action === 'sign' || action === 'issue') {
      currentPayload.currentApproverIndex = stageIndex;

      if (Array.isArray(currentPayload.approvalChain) && typeof currentPayload.currentApproverIndex === 'number') {
        const chain: string[] = currentPayload.approvalChain;
        const idx: number = currentPayload.currentApproverIndex || 0;
        const expected = chain[idx];
        if (!expected) {
          return NextResponse.json({ error: 'Invalid approval chain' }, { status: 500 });
        }
        const actingUsername = caller.username;

          // If there are remaining approvers and caller is NOT founder giving final approval, forward to next
          if (idx + 1 < chain.length && !isFounder) {
            const nextApprover = chain[idx + 1];
            const comments = Array.isArray(currentPayload.comments) ? currentPayload.comments : [];
            const updated = await updateRequestStatusAndSyncDB(requestId, 'forwarded', {
              payload: {
                ...currentPayload,
                currentApproverIndex: idx + 1,
                comments: [{ by: actingUsername, comment, decision: 'approve', stageIndex: idx, at: new Date().toISOString() }, ...comments],
              },
              forwardedTo: nextApprover,
            });
            // audit: forward
            try {
              addAuditEntry({ action: 'request:forward', actor: actingUsername, actorId: caller.id, details: { requestId, from: expected, to: nextApprover, remarks: comment } });
            } catch (e) {
              console.error('Audit log failed for forward', e);
            }
            try {
              const notifications: Parameters<typeof addNotificationsDB>[0] = [{
                type: 'request_forwarded',
                title: `Request forwarded - ${current.title}`,
                message: `Request ${current.title} has been forwarded to you for approval.`,
                targetUser: nextApprover,
                relatedId: requestId,
                read: false,
              }];
              if (current.createdById) {
                const applicant = getAllUsers().find((user) => user.id === current.createdById);
                if (applicant) notifications.push({
                  type: 'request_status_changed',
                  title: `Request advanced - ${current.title}`,
                  message: `Your request was approved by ${actingUsername} and forwarded to the next approver.`,
                  targetUser: applicant.username,
                  relatedId: requestId,
                  read: false,
                });
              }
              await addNotificationsAndSyncDB(notifications);
            } catch (error) {
              console.error('Failed to add request-forwarding notifications', error);
            }
            return NextResponse.json({ success: true, request: omitFileContents(updated), forwardedTo: nextApprover });
          }

        if (current.type === 'ta' || current.type === 'proposal') {
          const rawAmount = current.type === 'ta'
            ? current.payload?.amount
            : current.payload?.projectAmount;
          const hasAmount = rawAmount !== undefined && rawAmount !== null && String(rawAmount).trim() !== '';
          const amount = hasAmount ? Number(rawAmount) : 0;
          if (
            (current.type === 'ta' && (!Number.isFinite(amount) || amount <= 0)) ||
            (current.type === 'proposal' && hasAmount && (!Number.isFinite(amount) || amount < 0))
          ) {
            return NextResponse.json({ error: 'Invalid amount for approval' }, { status: 400 });
          }

          if (amount > 0) {
            addLedgerTransaction({
              amount,
              purpose: current.type === 'ta'
                ? current.payload?.description || 'Allowance Claim'
                : current.payload?.projectTitle || 'Project Approval',
              remarks: comment,
              type: current.type === 'ta' ? 'debited' : 'credited',
              requestId: current.id,
              requestType: current.type,
              amountBy: current.createdBy,
              modeOfPayment: current.payload?.modeOfPayment || '',
            });
          }
        }

        const comments = Array.isArray(currentPayload.comments) ? currentPayload.comments : [];
        const finalPayload = {
          ...currentPayload,
          comments: [{ by: actingUsername, comment, decision: action === 'issue' ? 'issue' : 'approve', stageIndex: idx, at: new Date().toISOString() }, ...comments],
          ...(current.type === 'internal-service' && typeof currentPayload.requestedRecipientId === 'string'
            ? { assignedHeadId: currentPayload.requestedRecipientId }
            : {}),
        };
        const finalUpdated = await updateRequestStatusAndSyncDB(requestId, 'approved', {
          payload: finalPayload,
          ...(action === 'issue' ? {
            officialDocument: {
              ...uploadedDocument,
              uploadedAt: new Date().toISOString(),
              issuedBy: caller.username,
              issuedAt: new Date().toISOString(),
            },
          } : {}),
        });

        // audit: approval
        try {
          addAuditEntry({ action: 'request:approve', actor: actingUsername, actorId: caller.id, details: { requestId, remarks: comment } });
        } catch (e) {
          console.error('Audit log failed for approve', e);
        }
        if (current.createdById) {
          const applicant = getAllUsers().find((user) => user.id === current.createdById);
          if (applicant) {
            try {
              await addNotificationAndSyncDB({
                type: 'request_approved',
                title: `Request approved - ${current.title}`,
                message: `Your request ${current.title} received final approval.`,
                targetUser: applicant.username,
                relatedId: requestId,
                read: false,
              });
            } catch (error) {
              console.error('Failed to notify applicant about final approval', error);
            }
          }
          if (current.type === 'internal-service' && typeof currentPayload.requestedRecipientId === 'string') {
            const recipient = findUserById(currentPayload.requestedRecipientId);
            if (recipient) {
              try {
                await addNotificationAndSyncDB({
                  type: 'internal-service-request',
                  title: 'Approved internal request assigned to you',
                  message: `${current.createdBy} has an approved internal request assigned to you.`,
                  targetUser: recipient.username,
                  relatedId: requestId,
                  read: false,
                });
              } catch (error) {
                console.error('Failed to notify the approved internal-request recipient', error);
              }
            }
          }
        }

        return NextResponse.json({ success: true, request: omitFileContents(finalUpdated) });
      }

      // Default behavior: Only admin can approve allowance (ta) claims and project approvals should follow configured workflow
      const check = requireRole(request, ['admin', 'founder']);
      if ((check as any)?.status === 403) return check as NextResponse;

      if (current.type === 'ta' || current.type === 'proposal') {
        const rawAmount = current.type === 'ta'
          ? current.payload?.amount
          : current.payload?.projectAmount;
        const hasAmount = rawAmount !== undefined && rawAmount !== null && String(rawAmount).trim() !== '';
        const amount = hasAmount ? Number(rawAmount) : 0;
        if (
          (current.type === 'ta' && (!Number.isFinite(amount) || amount <= 0)) ||
          (current.type === 'proposal' && hasAmount && (!Number.isFinite(amount) || amount < 0))
        ) {
          return NextResponse.json({ error: 'Invalid amount for approval' }, { status: 400 });
        }

        if (amount > 0) {
          const purpose = current.type === 'ta'
            ? (current.payload?.description || 'Allowance Claim')
            : (current.payload?.projectTitle || 'Project Approval');
          const remarks = current.type === 'ta' ? (current.payload?.claimType || current.payload?.billFileName || '') : '';
          const amountBy = current.createdBy;
          const modeOfPayment = current.payload?.modeOfPayment || '';

          await addLedgerTransactionAndSync({
            amount,
            purpose,
            remarks,
            type: current.type === 'ta' ? 'debited' : 'credited',
            requestId: current.id,
            requestType: current.type,
            amountBy,
            modeOfPayment,
          });
        }

        const updated = await updateRequestStatusAndSyncDB(requestId, 'approved');
        return NextResponse.json({ success: true, request: omitFileContents(updated) });
      }
      // For non-TA/proposal approvals, perform a forward flow — only admin can forward requests to founder
      const roleCheck = requireRole(request, ['admin']);
      if ((roleCheck as any)?.status === 403) return roleCheck as NextResponse;

      const forwardedTo = current.signatureFrom === 'Hareesh' || isIntern(current.createdByDesignation) ? 'Hareesh' : 'Founder';
      const target = forwardedTo === 'Founder' ? 'founder' : 'admin';
      const updated = await updateRequestStatusAndSyncDB(requestId, 'forwarded', { target, forwardedTo, signatureStatus: 'pending' });
      return NextResponse.json({ success: true, request: omitFileContents(updated), forwardedTo });
    }

    if (action === 'reject') {
      const actingUsername = caller.username;

      // append comment to payload.comments
      const existingComments = (current.payload && (current.payload as any).comments) || [];
      const nextComments = [{ by: actingUsername, comment, decision: 'reject', stageIndex, at: new Date().toISOString() }, ...existingComments];
      const updated = await updateRequestStatusAndSyncDB(requestId, 'rejected', { payload: { ...(current.payload || {}), comments: nextComments } });

      try {
        addAuditEntry({ action: 'request:reject', actor: actingUsername, actorId: caller.id, details: { requestId, remarks: comment } });
      } catch (e) {
        console.error('Audit log failed for reject', e);
      }
      if (current.createdById) {
        const applicant = getAllUsers().find((user) => user.id === current.createdById);
        if (applicant) {
          try {
            await addNotificationAndSyncDB({
              type: 'request_rejected',
              title: `Request rejected - ${current.title}`,
              message: `Your request ${current.title} was rejected by ${actingUsername}. Remarks: ${comment}`,
              targetUser: applicant.username,
              relatedId: requestId,
              read: false,
            });
          } catch (error) {
            console.error('Failed to notify applicant about rejection', error);
          }
        }
      }

      return NextResponse.json({ success: true, request: omitFileContents(updated) });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Request action error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

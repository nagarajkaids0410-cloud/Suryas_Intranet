import { NextRequest, NextResponse } from 'next/server';
import {
  updateUserById,
  findUserById,
} from '@/lib/user-database';
import { updateUserInDB, loadUsersFromDB } from '@/lib/user-db';
import { sendEmail } from '@/lib/email';
import { addNotificationDB, markNotificationsByRelatedIdDB } from '@/lib/notification-db';
import { requireRole } from '@/lib/rbac';
import { addAuditEntry } from '@/lib/audit-log';
import { isEligibleGuideRole, requiresGuideRole } from '@/lib/request-store';

const ACCESS_APPROVAL_CHAIN: string[] = ['hareeshv', 'santhanakumarv', 'gkbharath'];
const REGISTRATION_WORKFLOW_VERSION = 3;

export async function GET(request: NextRequest) {
  try {
    const actor = requireRole(request, ['admin', 'founder', 'managing-partner', 'employee', 'intern', 'project-intern']);
    if (actor instanceof NextResponse) return actor;
    if (!ACCESS_APPROVAL_CHAIN.includes(actor.username)) {
      return NextResponse.json({ error: 'Not an assigned registration approver' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const includeHistory = searchParams.get('includeHistory') === 'true';
    const usersFromDb = loadUsersFromDB();
    for (const user of usersFromDb) {
      if (user.status !== 'pending_approval' || user.registrationApprovalVersion === REGISTRATION_WORKFLOW_VERSION) continue;
      const previousStage = user.approvalStage ?? 0;
      const history = user.approvalHistory || [];
      const previousVersion = user.registrationApprovalVersion ?? 1;
      const hareeshApproved = history.some(
        (entry) => ['hareesh', 'hareeshv'].includes((entry.actorUsername || '').toLowerCase()) && entry.decision === 'approve'
      ) || (previousVersion === 1 && previousStage >= 1);
      const santhanaApproved = history.some(
        (entry) => ['santhanakumar', 'santhanakumarv'].includes((entry.actorUsername || '').toLowerCase()) && entry.decision === 'approve'
      ) || (previousVersion === 1 && previousStage >= 2) || (previousVersion === 2 && previousStage >= 1);
      const approvalStage = santhanaApproved ? 2 : hareeshApproved ? 1 : 0;
      user.approvalStage = approvalStage;
      user.registrationApprovalVersion = REGISTRATION_WORKFLOW_VERSION;
      user.approvalHistory ||= [];
      updateUserById(user.id, { approvalStage, registrationApprovalVersion: REGISTRATION_WORKFLOW_VERSION });
      updateUserInDB(user.id, { approvalStage, registrationApprovalVersion: REGISTRATION_WORKFLOW_VERSION });
      addAuditEntry({
        action: 'registration:workflow_migrated',
        actor: 'system',
        details: { userId: user.id, previousStage, approvalStage },
      });
      const nextApprover = ACCESS_APPROVAL_CHAIN[approvalStage];
      addNotificationDB({
        type: 'registration_approval',
        title: `Registration review required - ${user.fullName}`,
        message: santhanaApproved
          ? `${user.fullName}'s registration is ready for the Founder's decision.`
          : hareeshApproved
            ? `${user.fullName}'s registration is ready for Santhana's review.`
            : `${user.fullName}'s registration is ready for Hareesh's review.`,
        targetUser: nextApprover,
        relatedId: user.id,
        read: false,
      });
    }
    const pending = usersFromDb.filter(
      (user) =>
        user.status === 'pending_approval' &&
        ACCESS_APPROVAL_CHAIN[user.approvalStage ?? 0] === actor.username
    );
    
    const requests = pending.map((user) => ({
      id: user.id,
      employeeId: user.employeeId,
      fullName: user.fullName,
      designation: user.designation,
      department: user.department,
      phone: user.phone,
      role: user.role,
      email: user.email,
      requestedAt: user.requestedAt || user.createdAt,
      approvalStage: user.approvalStage ?? 0,
      approvalHistory: user.approvalHistory || [],
    }));

    let history: any[] = [];
    if (includeHistory) {
      history = usersFromDb
        .filter((user) =>
          !!user.requestedAt &&
          (user.status === 'active' || user.status === 'rejected')
        )
        .map((user) => ({
          id: user.id,
          employeeId: user.employeeId,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          status: user.status,
          requestedAt: user.requestedAt || user.createdAt,
          approvedAt: user.approvedAt,
          rejectedAt: user.rejectedAt,
        }))
        .sort((a, b) => {
          const aTime = new Date(a.approvedAt || a.rejectedAt || a.requestedAt).getTime();
          const bTime = new Date(b.approvedAt || b.rejectedAt || b.requestedAt).getTime();
          return bTime - aTime;
        });
    }

    return NextResponse.json({
      success: true,
      approver: actor.username,
      requests,
      history,
    });
  } catch (error) {
    console.error('Access request fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch access requests' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = requireRole(request, ['admin', 'founder', 'managing-partner', 'employee', 'intern', 'project-intern']);
    if (actor instanceof NextResponse) return actor;
    if (!ACCESS_APPROVAL_CHAIN.includes(actor.username)) {
      return NextResponse.json({ error: 'Not an assigned registration approver' }, { status: 403 });
    }

    const body = await request.json();
    const { action, userId, remarks, guideId } = body;
    const decisionRemarks = typeof remarks === 'string' ? remarks.trim() : '';

    if (!['approve', 'deny'].includes(action) || typeof userId !== 'string' || !userId || (remarks !== undefined && remarks !== null && typeof remarks !== 'string')) {
      return NextResponse.json(
        { error: 'A valid action and user ID are required' },
        { status: 400 }
      );
    }

    const user = findUserById(userId);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    if (user.status !== 'pending_approval') {
      return NextResponse.json({ error: 'Access request is no longer pending' }, { status: 409 });
    }
    if (actor.id === user.id) {
      return NextResponse.json({ error: 'Applicants cannot approve their own access request' }, { status: 403 });
    }

    const stage = user.approvalStage ?? 0;
    if (ACCESS_APPROVAL_CHAIN[stage] !== actor.username) {
      return NextResponse.json({ error: 'You are not the current registration approver' }, { status: 403 });
    }
    if (stage === ACCESS_APPROVAL_CHAIN.length - 1 && actor.role !== 'founder') {
      return NextResponse.json({ error: 'Only the Founder can make the final registration decision' }, { status: 403 });
    }

    const decisionHistory = [
      ...(user.approvalHistory || []),
      {
        actorId: actor.id,
        actorUsername: actor.username,
        actorRole: actor.role,
        decision: action as 'approve' | 'deny',
        remarks: decisionRemarks,
        createdAt: new Date().toISOString(),
      },
    ];

    if (action === 'deny') {
      const updated = updateUserById(userId, {
        status: 'rejected',
        rejectedAt: new Date().toISOString(),
        approvalHistory: decisionHistory,
        approvalRemarks: decisionRemarks,
      });

      if (!updated) {
        return NextResponse.json(
          { error: 'Failed to update user status' },
          { status: 500 }
        );
      }

      updateUserInDB(userId, {
        status: 'rejected',
        rejectedAt: updated.rejectedAt,
        approvalHistory: decisionHistory,
        approvalRemarks: decisionRemarks,
      });

      addAuditEntry({
        action: 'registration:rejected',
        actor: actor.username,
        actorId: actor.id,
        details: { userId, stage, remarks: decisionRemarks },
      });
      addNotificationDB({
        type: 'user_rejected',
        title: 'Registration request rejected',
        message: decisionRemarks || 'Your access request was rejected.',
        targetUser: user.username,
        relatedId: userId,
        read: false,
      });

      // Send rejection email
      try {
        await sendEmail({
          to: user.email,
          subject: 'Access Request Rejected',
          html: `
            <p>Hello ${user.fullName},</p>
            <p>Your account access request has been reviewed and rejected.</p>
            <p>If you have questions, please contact support.</p>
          `,
        });
      } catch (err) {
        console.error('Failed to send rejection email:', err);
        // Continue - rejection is already persisted
      }

      // Mark related access-request notifications as read
      markNotificationsByRelatedIdDB(userId, {
        type: 'user_access_request',
        targetUsers: ['admin', 'founder', 'hareeshv', 'santhanakumarv', 'gkbharath'],
      });

      // Notify admin and founder about rejection
      addNotificationDB({
        type: 'user_rejected',
        title: `User Rejected: ${user.fullName}`,
        message: `Access request for ${user.email} has been rejected.`,
        targetUser: 'admin',
        relatedId: userId,
        read: true,
      });

      addNotificationDB({
        type: 'user_rejected',
        title: `User Rejected: ${user.fullName}`,
        message: `Access request for ${user.email} has been rejected.`,
        targetUser: 'founder',
        relatedId: userId,
        read: true,
      });

      return NextResponse.json({
        success: true,
        message: 'User access request denied',
      });
    }

    if (action === 'approve') {
      if (stage < ACCESS_APPROVAL_CHAIN.length - 1) {
        const nextApprover = ACCESS_APPROVAL_CHAIN[stage + 1];
        const updated = updateUserById(userId, {
          approvalStage: stage + 1,
          approvalHistory: decisionHistory,
          approvalRemarks: decisionRemarks,
        });
        if (!updated) {
          return NextResponse.json({ error: 'Failed to advance registration approval' }, { status: 500 });
        }
        updateUserInDB(userId, {
          approvalStage: stage + 1,
          approvalHistory: decisionHistory,
          approvalRemarks: decisionRemarks,
        });
        addAuditEntry({
          action: 'registration:forwarded',
          actor: actor.username,
          actorId: actor.id,
          details: { userId, stage, nextApprover, remarks: decisionRemarks },
        });
        addNotificationDB({
          type: 'registration_approval',
          title: `Registration review required - ${user.fullName}`,
          message: `${user.fullName}'s registration is ready for your review.`,
          targetUser: nextApprover,
          relatedId: userId,
          read: false,
        });
        return NextResponse.json({ success: true, forwardedTo: nextApprover });
      }

      let assignedGuide: { id: string; fullName: string } | undefined;
      if (requiresGuideRole(user.role)) {
        if (typeof guideId !== 'string' || !guideId) {
          return NextResponse.json({ error: 'Assign a guide before final approval' }, { status: 400 });
        }
        const guide = findUserById(guideId);
        if (
          !guide ||
          guide.id === user.id ||
          guide.status !== 'active' ||
          !isEligibleGuideRole(guide.role)
        ) {
          return NextResponse.json({ error: 'Choose an active, eligible guide' }, { status: 400 });
        }
        assignedGuide = { id: guide.id, fullName: guide.fullName };
      }

      const updated = updateUserById(userId, {
        status: 'active',
        emailVerified: true,
        verificationToken: undefined,
        verificationSentAt: undefined,
        approvedAt: new Date().toISOString(),
        approvalHistory: decisionHistory,
        approvalRemarks: decisionRemarks,
        ...(assignedGuide ? { guideId: assignedGuide.id, guideName: assignedGuide.fullName } : {}),
      });

      if (!updated) {
        return NextResponse.json(
          { error: 'Failed to approve user' },
          { status: 500 }
        );
      }

      updateUserInDB(userId, {
        status: 'active',
        emailVerified: true,
        verificationToken: undefined,
        verificationSentAt: undefined,
        approvedAt: updated.approvedAt,
        approvalHistory: decisionHistory,
        approvalRemarks: decisionRemarks,
        ...(assignedGuide ? { guideId: assignedGuide.id, guideName: assignedGuide.fullName } : {}),
      });
      addAuditEntry({
        action: 'registration:approved',
        actor: actor.username,
        actorId: actor.id,
        details: { userId, stage, remarks: decisionRemarks },
      });
      addNotificationDB({
        type: 'user_approved',
        title: 'Registration request approved',
        message: 'Your account is active. Sign in and change your temporary password if prompted.',
        targetUser: user.username,
        relatedId: userId,
        read: false,
      });

      // Mark related access-request notifications as read
      markNotificationsByRelatedIdDB(userId, {
        type: 'user_access_request',
        targetUsers: ['admin', 'founder', 'hareeshv', 'santhanakumarv', 'gkbharath'],
      });

      // Notify admin and founder about approval
      addNotificationDB({
        type: 'user_approved',
        title: `User Approved: ${user.fullName}`,
        message: `Access approved for ${user.email}.`,
        targetUser: 'admin',
        relatedId: userId,
        read: true,
      });

      addNotificationDB({
        type: 'user_approved',
        title: `User Approved: ${user.fullName}`,
        message: `Access approved for ${user.email}.`,
        targetUser: 'founder',
        relatedId: userId,
        read: true,
      });

      return NextResponse.json({
        success: true,
        message: 'User access approved. User can log in immediately.',
        credentials: {
          username: user.username,
          email: user.email,
          fullName: user.fullName,
        },
      });
    }

    return NextResponse.json(
      { error: 'Unknown action. Use "approve" or "deny".' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Access request error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}

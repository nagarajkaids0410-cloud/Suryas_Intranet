export type UserRole =
  | 'SYSTEM_ADMIN'
  | 'MANAGING_PARTNER'
  | 'RECOMMENDER'
  | 'GUIDE'
  | 'EMPLOYEE';

export type ModuleType =
  | 'LEAVE'
  | 'ALLOWANCE_CLAIM'
  | 'PROJECT_REQUEST'
  | 'EVENT_REQUEST'
  | 'REPORT';

export type WorkflowMode = 'ALL' | 'ANY';
export type DecisionType = 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES';
export type RequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_RECOMMENDATION'
  | 'PENDING_FINAL_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'CHANGES_REQUESTED'
  | 'CANCELLED';

export type WorkflowReviewer = {
  userId: string;
  role: 'RECOMMENDER' | 'GUIDE' | 'FINAL_APPROVER';
};

export type AuditEntry = {
  id: string;
  actorId: string;
  actorRole: UserRole;
  action: DecisionType;
  previousStatus: RequestStatus;
  newStatus: RequestStatus;
  remarks: string;
  createdAt: string;
};

export type NotificationItem = {
  id: string;
  userId: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
};

export type ApprovalDecision = {
  id: string;
  actorId: string;
  actorRole: UserRole;
  decision: DecisionType;
  remarks: string;
  createdAt: string;
};

export type ApprovalRequest = {
  id: string;
  moduleType: ModuleType;
  reference: string;
  createdBy: string;
  employeeId: string;
  reviewers: WorkflowReviewer[];
  workflowMode: WorkflowMode;
  status: RequestStatus;
  finalApproverIds: string[];
  decisions: ApprovalDecision[];
  auditTrail: AuditEntry[];
  notifications: NotificationItem[];
  requiresGuideReview: boolean;
};

export type Actor = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

const REFERENCE_PREFIXES: Record<ModuleType, string> = {
  LEAVE: 'LV',
  ALLOWANCE_CLAIM: 'TA',
  PROJECT_REQUEST: 'PRJ',
  EVENT_REQUEST: 'EVT',
  REPORT: 'RPT',
};

const referenceCounters = new Map<string, number>();
const referenceRegistry = new Set<string>();

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function generateReference(moduleType: ModuleType): string {
  const prefix = REFERENCE_PREFIXES[moduleType];
  const year = new Date().getFullYear();
  const key = `${moduleType}:${year}`;
  const nextValue = (referenceCounters.get(key) ?? 0) + 1;
  referenceCounters.set(key, nextValue);

  const reference = `${prefix}-${year}-${String(nextValue).padStart(4, '0')}`;
  if (referenceRegistry.has(reference)) {
    return generateReference(moduleType);
  }

  referenceRegistry.add(reference);
  return reference;
}

export function assertUniqueReference(reference: string): void {
  if (referenceRegistry.has(reference)) {
    throw new Error(`Duplicate reference detected: ${reference}`);
  }
}

export function createApprovalRequest(input: {
  id: string;
  moduleType: ModuleType;
  reference?: string;
  createdBy: string;
  employeeId: string;
  reviewers: WorkflowReviewer[];
  workflowMode?: WorkflowMode;
  finalApproverIds?: string[];
  requiresGuideReview?: boolean;
}): ApprovalRequest {
  const reference = input.reference ?? generateReference(input.moduleType);
  if (input.reference) {
    assertUniqueReference(reference);
  }
  referenceRegistry.add(reference);

  return {
    id: input.id,
    moduleType: input.moduleType,
    reference,
    createdBy: input.createdBy,
    employeeId: input.employeeId,
    reviewers: input.reviewers,
    workflowMode: input.workflowMode ?? 'ALL',
    status: 'SUBMITTED',
    finalApproverIds: input.finalApproverIds ?? ['SURYA-001'],
    decisions: [],
    auditTrail: [],
    notifications: [],
    requiresGuideReview: input.requiresGuideReview ?? false,
  };
}

function isBharathActor(actor: Actor): boolean {
  return actor.id === 'SURYA-001' || actor.email.toLowerCase() === 'bharath@suryas.in';
}

function getRecommenderIds(request: ApprovalRequest): string[] {
  return request.reviewers
    .filter((reviewer) => reviewer.role === 'RECOMMENDER')
    .map((reviewer) => reviewer.userId);
}

function getGuideIds(request: ApprovalRequest): string[] {
  return request.reviewers
    .filter((reviewer) => reviewer.role === 'GUIDE')
    .map((reviewer) => reviewer.userId);
}

function hasApprovedDecision(request: ApprovalRequest, actorId: string): boolean {
  return request.decisions.some(
    (decision) => decision.actorId === actorId && decision.decision === 'APPROVE'
  );
}

function resolveRecommendationStatus(request: ApprovalRequest): RequestStatus {
  const recommenderIds = getRecommenderIds(request);
  const approvers = recommenderIds.filter((id) => hasApprovedDecision(request, id));

  if (request.moduleType === 'REPORT' && request.requiresGuideReview) {
    const guideIds = getGuideIds(request);
    const guideApprovals = guideIds.filter((id) => hasApprovedDecision(request, id));
    const guideStageComplete =
      guideIds.length > 0 &&
      (request.workflowMode === 'ANY'
        ? guideApprovals.length > 0
        : guideApprovals.length === guideIds.length);
    if (!guideStageComplete) {
      return 'UNDER_RECOMMENDATION';
    }
  }

  if (recommenderIds.length === 0) {
    return 'PENDING_FINAL_APPROVAL';
  }

  if (request.workflowMode === 'ANY') {
    return approvers.length > 0 ? 'PENDING_FINAL_APPROVAL' : 'UNDER_RECOMMENDATION';
  }

  return approvers.length === recommenderIds.length
    ? 'PENDING_FINAL_APPROVAL'
    : 'UNDER_RECOMMENDATION';
}

function getNextReviewerIds(request: ApprovalRequest, reviewerIds: string[]): string[] {
  const pendingReviewerIds = reviewerIds.filter((id) => !hasApprovedDecision(request, id));
  if (request.workflowMode === 'ANY') {
    return pendingReviewerIds;
  }
  return pendingReviewerIds.slice(0, 1);
}

function isCurrentReviewer(request: ApprovalRequest, actorId: string): boolean {
  if (request.status !== 'SUBMITTED' && request.status !== 'UNDER_RECOMMENDATION') {
    return false;
  }

  const recommenderIds = getRecommenderIds(request);
  const approvedRecommenderCount = recommenderIds.filter((id) => hasApprovedDecision(request, id)).length;
  const recommenderStageComplete =
    recommenderIds.length === 0 ||
    (request.workflowMode === 'ANY'
      ? approvedRecommenderCount > 0
      : approvedRecommenderCount === recommenderIds.length);

  if (!recommenderStageComplete) {
    return getNextReviewerIds(request, recommenderIds).includes(actorId);
  }

  if (request.moduleType === 'REPORT' && request.requiresGuideReview) {
    return getNextReviewerIds(request, getGuideIds(request)).includes(actorId);
  }

  return false;
}

function buildNotification(userId: string, title: string, message: string): NotificationItem {
  return {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId,
    title,
    message,
    read: false,
    createdAt: new Date().toISOString(),
  };
}

export function applyApprovalDecision(
  request: ApprovalRequest,
  actor: Actor,
  decision: DecisionType,
  remarks: string
): ApprovalRequest {
  const trimmedRemarks = remarks?.trim() ?? '';
  if (!trimmedRemarks) {
    throw new Error('Remarks are mandatory for every approval decision.');
  }

  const snapshot = clone(request);

  try {
    if (actor.id === request.createdBy || actor.id === request.employeeId) {
      throw new Error('Self-approval is not allowed.');
    }

    if (request.status === 'APPROVED' || request.status === 'REJECTED' || request.status === 'CANCELLED') {
      throw new Error(`Request is already ${request.status.toLowerCase()}.`);
    }

    const previousStatus = request.status;
    const isFinalApprover = request.finalApproverIds.includes(actor.id) || isBharathActor(actor);

    if (
      decision === 'APPROVE' &&
      !isFinalApprover &&
      request.decisions.some((item) => item.actorId === actor.id)
    ) {
      throw new Error('A decision from this actor is already recorded.');
    }

    if (!isFinalApprover && !isCurrentReviewer(request, actor.id)) {
      throw new Error('Actor is not authorized to decide on this request.');
    }

    if (
      decision === 'APPROVE' &&
      isFinalApprover &&
      request.moduleType === 'REPORT' &&
      request.requiresGuideReview &&
      getGuideIds(request).every((id) => !hasApprovedDecision(request, id))
    ) {
      throw new Error('Guide review is mandatory before final approval for reports.');
    }

    if (isFinalApprover) {
      if (!isBharathActor(actor)) {
        throw new Error('Only Bharath can perform the final approval.');
      }
      if (previousStatus !== 'PENDING_FINAL_APPROVAL') {
        throw new Error('Final decisions require the request to be pending final approval.');
      }
    } else if (previousStatus !== 'SUBMITTED' && previousStatus !== 'UNDER_RECOMMENDATION') {
      throw new Error('Reviewer decisions require the request to be under recommendation.');
    }

    if (decision === 'REJECT' || decision === 'REQUEST_CHANGES') {
      request.status = decision === 'REJECT' ? 'REJECTED' : 'CHANGES_REQUESTED';
      request.decisions.push({
        id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        actorId: actor.id,
        actorRole: actor.role,
        decision,
        remarks: trimmedRemarks,
        createdAt: new Date().toISOString(),
      });
      request.auditTrail.push({
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        actorId: actor.id,
        actorRole: actor.role,
        action: decision,
        previousStatus,
        newStatus: request.status,
        remarks: trimmedRemarks,
        createdAt: new Date().toISOString(),
      });
      request.notifications.push(
        buildNotification(
          request.createdBy,
          'Approval decision recorded',
          `${actor.name} ${decision === 'REJECT' ? 'rejected' : 'requested changes to'} ${request.reference}.`
        )
      );
      return request;
    }

    if (isFinalApprover) {
      if (request.moduleType === 'REPORT' && request.requiresGuideReview) {
        const guideApprovals = getGuideIds(request).filter((id) => hasApprovedDecision(request, id));
        if (guideApprovals.length === 0) {
          throw new Error('Guide review is mandatory before final approval for reports.');
        }
      }
      request.status = 'APPROVED';
    } else {
      request.decisions.push({
        id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        actorId: actor.id,
        actorRole: actor.role,
        decision: 'APPROVE',
        remarks: trimmedRemarks,
        createdAt: new Date().toISOString(),
      });

      const nextStatus = resolveRecommendationStatus(request);
      request.status = nextStatus;
    }

    request.auditTrail.push({
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      actorId: actor.id,
      actorRole: actor.role,
      action: 'APPROVE',
      previousStatus,
      newStatus: request.status,
      remarks: trimmedRemarks,
      createdAt: new Date().toISOString(),
    });

    request.notifications.push(
      buildNotification(
        request.createdBy,
        'Approval update',
        `${actor.name} approved ${request.reference}. Current status: ${request.status}.`
      )
    );

    return request;
  } catch (error) {
    Object.assign(request, snapshot);
    throw error;
  }
}

export function createDecisionSummary(request: ApprovalRequest): {
  approvedRecommenders: string[];
  guideApprovals: string[];
  finalApprover: string | null;
  canProceedToFinalApproval: boolean;
} {
  const recommenderIds = getRecommenderIds(request);
  const guideIds = getGuideIds(request);
  const approvedRecommenders = recommenderIds.filter((id) => hasApprovedDecision(request, id));
  const guideApprovals = guideIds.filter((id) => hasApprovedDecision(request, id));
  const finalApprover = request.finalApproverIds[0] ?? null;
  const recommenderGate =
    request.workflowMode === 'ANY'
      ? approvedRecommenders.length > 0
      : approvedRecommenders.length === recommenderIds.length;
  const guideGate = request.requiresGuideReview ? guideApprovals.length === guideIds.length : true;
  const canProceedToFinalApproval = recommenderGate && guideGate;

  return {
    approvedRecommenders,
    guideApprovals,
    finalApprover,
    canProceedToFinalApproval,
  };
}

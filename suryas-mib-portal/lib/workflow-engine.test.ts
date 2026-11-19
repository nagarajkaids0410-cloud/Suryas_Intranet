import { describe, expect, it } from 'vitest';
import {
  applyApprovalDecision,
  createApprovalRequest,
  createDecisionSummary,
  generateReference,
  assertUniqueReference,
} from './workflow-engine';

describe('Approval workflow engine', () => {
  it('creates unique references per module type', () => {
    const first = generateReference('LEAVE');
    const second = generateReference('ALLOWANCE_CLAIM');
    const third = generateReference('LEAVE');

    expect(first).toMatch(/^LV-\d{4}-\d{4}$/);
    expect(second).toMatch(/^TA-\d{4}-\d{4}$/);
    expect(third).not.toBe(first);
  });

  it('rejects duplicate references', () => {
    const ref = generateReference('PROJECT_REQUEST');
    expect(() => assertUniqueReference(ref)).toThrow(/Duplicate reference/);
  });

  it('supports ALL rule with multiple recommenders before final approval', () => {
    const request = createApprovalRequest({
      id: 'req-1',
      moduleType: 'LEAVE',
      createdBy: 'emp-1',
      employeeId: 'emp-1',
      reviewers: [
        { userId: 'rec-1', role: 'RECOMMENDER' },
        { userId: 'rec-2', role: 'RECOMMENDER' },
      ],
      workflowMode: 'ALL',
      finalApproverIds: ['SURYA-001'],
    });

    const recOne = { id: 'rec-1', name: 'R1', email: 'r1@test.com', role: 'RECOMMENDER' as const };
    const recTwo = { id: 'rec-2', name: 'R2', email: 'r2@test.com', role: 'RECOMMENDER' as const };

    applyApprovalDecision(request, recOne, 'APPROVE', 'Looks good');
    expect(request.status).toBe('UNDER_RECOMMENDATION');

    applyApprovalDecision(request, recTwo, 'APPROVE', 'Approved by second recommender');
    expect(request.status).toBe('PENDING_FINAL_APPROVAL');
  });

  it('supports ANY rule when one recommender approval is enough', () => {
    const request = createApprovalRequest({
      id: 'req-2',
      moduleType: 'PROJECT_REQUEST',
      createdBy: 'emp-2',
      employeeId: 'emp-2',
      reviewers: [
        { userId: 'rec-1', role: 'RECOMMENDER' },
        { userId: 'rec-2', role: 'RECOMMENDER' },
      ],
      workflowMode: 'ANY',
      finalApproverIds: ['SURYA-001'],
    });

    const recOne = { id: 'rec-1', name: 'R1', email: 'r1@test.com', role: 'RECOMMENDER' as const };
    applyApprovalDecision(request, recOne, 'APPROVE', 'One is enough');

    expect(request.status).toBe('PENDING_FINAL_APPROVAL');
  });

  it('requires guide review for reports before final approval', () => {
    const request = createApprovalRequest({
      id: 'req-3',
      moduleType: 'REPORT',
      createdBy: 'emp-3',
      employeeId: 'emp-3',
      reviewers: [
        { userId: 'rec-1', role: 'RECOMMENDER' },
        { userId: 'guide-1', role: 'GUIDE' },
      ],
      workflowMode: 'ALL',
      finalApproverIds: ['SURYA-001'],
      requiresGuideReview: true,
    });

    const recOne = { id: 'rec-1', name: 'R1', email: 'r1@test.com', role: 'RECOMMENDER' as const };
    const guide = { id: 'guide-1', name: 'Guide', email: 'guide@test.com', role: 'GUIDE' as const };

    applyApprovalDecision(request, recOne, 'APPROVE', 'Recommender approved');
    expect(() => applyApprovalDecision(request, { id: 'SURYA-001', name: 'Bharath', email: 'bharath@suryas.in', role: 'SYSTEM_ADMIN' }, 'APPROVE', 'Final approval before guide review')).toThrow(/Guide review is mandatory/i);

    applyApprovalDecision(request, guide, 'APPROVE', 'Guide approved');
    expect(request.status).toBe('PENDING_FINAL_APPROVAL');

    applyApprovalDecision(request, { id: 'SURYA-001', name: 'Bharath', email: 'bharath@suryas.in', role: 'SYSTEM_ADMIN' }, 'APPROVE', 'Final approval granted');
    expect(request.status).toBe('APPROVED');
  });

  it('blocks self-approval and unauthorized decision makers', () => {
    const request = createApprovalRequest({
      id: 'req-4',
      moduleType: 'EVENT_REQUEST',
      createdBy: 'emp-4',
      employeeId: 'emp-4',
      reviewers: [{ userId: 'rec-1', role: 'RECOMMENDER' }],
      workflowMode: 'ALL',
      finalApproverIds: ['SURYA-001'],
    });

    expect(() => applyApprovalDecision(request, { id: 'emp-4', name: 'Employee', email: 'emp-4@test.com', role: 'EMPLOYEE' }, 'APPROVE', 'Cannot approve own request')).toThrow(/Self-approval/);

    expect(() => applyApprovalDecision(request, { id: 'random-user', name: 'No Access', email: 'x@test.com', role: 'EMPLOYEE' }, 'APPROVE', 'No rights')).toThrow(/not authorized/i);
  });

  it('blocks unauthorized users from rejecting or returning a request', () => {
    const request = createApprovalRequest({
      id: 'req-4b',
      moduleType: 'LEAVE',
      createdBy: 'emp-4b',
      employeeId: 'emp-4b',
      reviewers: [{ userId: 'rec-1', role: 'RECOMMENDER' }],
      finalApproverIds: ['SURYA-001'],
    });
    const unauthorizedActor = {
      id: 'random-user',
      name: 'No Access',
      email: 'x@test.com',
      role: 'EMPLOYEE' as const,
    };

    expect(() => applyApprovalDecision(request, unauthorizedActor, 'REJECT', 'Not authorized')).toThrow(/not authorized/i);
    expect(() => applyApprovalDecision(request, unauthorizedActor, 'REQUEST_CHANGES', 'Not authorized')).toThrow(/not authorized/i);
    expect(request.status).toBe('SUBMITTED');
    expect(request.decisions).toHaveLength(0);
    expect(request.auditTrail).toHaveLength(0);
  });

  it('requires ALL reviewers to act in configured order', () => {
    const request = createApprovalRequest({
      id: 'req-4c',
      moduleType: 'LEAVE',
      createdBy: 'emp-4c',
      employeeId: 'emp-4c',
      reviewers: [
        { userId: 'hareesh', role: 'RECOMMENDER' },
        { userId: 'santhana', role: 'RECOMMENDER' },
      ],
      workflowMode: 'ALL',
      finalApproverIds: ['SURYA-001'],
    });
    const secondReviewer = {
      id: 'santhana',
      name: 'Santhana Kumar V',
      email: 'santhana@suryas.in',
      role: 'MANAGING_PARTNER' as const,
    };

    expect(() => applyApprovalDecision(request, secondReviewer, 'APPROVE', 'Reviewed')).toThrow(/not authorized/i);
    expect(() => applyApprovalDecision(request, secondReviewer, 'REJECT', 'Not ready')).toThrow(/not authorized/i);
    expect(() => applyApprovalDecision(request, secondReviewer, 'REQUEST_CHANGES', 'Needs correction')).toThrow(/not authorized/i);
    expect(request.status).toBe('SUBMITTED');
    expect(request.decisions).toHaveLength(0);
  });

  it('requires remarks and records audit trail and notifications', () => {
    const request = createApprovalRequest({
      id: 'req-5',
      moduleType: 'ALLOWANCE_CLAIM',
      createdBy: 'emp-5',
      employeeId: 'emp-5',
      reviewers: [{ userId: 'rec-1', role: 'RECOMMENDER' }],
      workflowMode: 'ALL',
      finalApproverIds: ['SURYA-001'],
    });

    expect(() => applyApprovalDecision(request, { id: 'rec-1', name: 'R1', email: 'r1@test.com', role: 'RECOMMENDER' }, 'APPROVE', '')).toThrow(/Remarks are mandatory/i);

    applyApprovalDecision(request, { id: 'rec-1', name: 'R1', email: 'r1@test.com', role: 'RECOMMENDER' }, 'APPROVE', 'Approved by recommender');

    expect(request.decisions).toHaveLength(1);
    expect(request.auditTrail).toHaveLength(1);
    expect(request.notifications).toHaveLength(1);
    expect(request.status).toBe('PENDING_FINAL_APPROVAL');
  });

  it('rolls back status changes when a decision is rejected as invalid', () => {
    const request = createApprovalRequest({
      id: 'req-5b',
      moduleType: 'LEAVE',
      createdBy: 'emp-5b',
      employeeId: 'emp-5b',
      reviewers: [{ userId: 'rec-1', role: 'RECOMMENDER' }],
      workflowMode: 'ALL',
      finalApproverIds: ['SURYA-001'],
    });

    const snapshotStatus = request.status;
    const snapshotAuditCount = request.auditTrail.length;
    const snapshotDecisionCount = request.decisions.length;

    expect(() => applyApprovalDecision(request, { id: 'rec-1', name: 'R1', email: 'r1@test.com', role: 'RECOMMENDER' }, 'APPROVE', 'First approval')).not.toThrow();
    expect(() => applyApprovalDecision(request, { id: 'rec-1', name: 'R1', email: 'r1@test.com', role: 'RECOMMENDER' }, 'APPROVE', 'Duplicate')).toThrow(/already recorded/i);

    expect(request.status).toBe('PENDING_FINAL_APPROVAL');
    expect(request.auditTrail.length).toBeGreaterThan(snapshotAuditCount);
    expect(request.decisions.length).toBeGreaterThan(snapshotDecisionCount);
    expect(request.status).not.toBe(snapshotStatus);
  });

  it('only Bharath can do final approval', () => {
    const request = createApprovalRequest({
      id: 'req-6',
      moduleType: 'LEAVE',
      createdBy: 'emp-6',
      employeeId: 'emp-6',
      reviewers: [{ userId: 'rec-1', role: 'RECOMMENDER' }],
      workflowMode: 'ALL',
      finalApproverIds: ['other-final'],
    });

    applyApprovalDecision(request, { id: 'rec-1', name: 'R1', email: 'r1@test.com', role: 'RECOMMENDER' }, 'APPROVE', 'Recommender ok');

    expect(() => applyApprovalDecision(request, { id: 'other-final', name: 'Other', email: 'other@test.com', role: 'MANAGING_PARTNER' }, 'APPROVE', 'Wrong approver')).toThrow(/Only Bharath can perform the final approval/);
    expect(request.status).toBe('PENDING_FINAL_APPROVAL');
  });

  it('summarizes pending approval decisions correctly', () => {
    const request = createApprovalRequest({
      id: 'req-7',
      moduleType: 'REPORT',
      createdBy: 'emp-7',
      employeeId: 'emp-7',
      reviewers: [
        { userId: 'rec-1', role: 'RECOMMENDER' },
        { userId: 'guide-1', role: 'GUIDE' },
      ],
      workflowMode: 'ALL',
      finalApproverIds: ['SURYA-001'],
      requiresGuideReview: true,
    });

    applyApprovalDecision(request, { id: 'rec-1', name: 'R1', email: 'r1@test.com', role: 'RECOMMENDER' }, 'APPROVE', 'Approved');
    applyApprovalDecision(request, { id: 'guide-1', name: 'Guide', email: 'guide@test.com', role: 'GUIDE' }, 'APPROVE', 'Guide approved');

    const summary = createDecisionSummary(request);
    expect(summary.approvedRecommenders).toContain('rec-1');
    expect(summary.guideApprovals).toContain('guide-1');
    expect(summary.canProceedToFinalApproval).toBe(true);
  });
});

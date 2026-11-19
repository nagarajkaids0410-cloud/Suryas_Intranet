import React, { useEffect, useState } from 'react';

const approverNames: Record<string, string> = {
  hareeshv: 'Hareesh V',
  santhanakumarv: 'Santhana Kumar V',
  gkbharath: 'Golla Kumar Bharath',
};

let approverDirectoryPromise: Promise<Record<string, { fullName?: string; designation?: string }>> | undefined;

function loadApproverDirectory() {
  if (!approverDirectoryPromise) {
    approverDirectoryPromise = fetch('/api/users/directory')
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load approver names');
        const data = await response.json();
        return Object.fromEntries(
          (data.users || []).map((user: { username: string; fullName?: string; designation?: string }) => [
            user.username.toLowerCase(),
            { fullName: user.fullName, designation: user.designation },
          ])
        );
      })
      .catch((error) => {
        approverDirectoryPromise = undefined;
        throw error;
      });
  }
  return approverDirectoryPromise;
}

interface RequestApprovalDetailsProps {
  request: {
    id: string;
    submissionId?: string;
    status: string;
    forwardedTo?: string;
    createdAt: string;
    remarks?: string;
    payload?: Record<string, any>;
  };
}

export function RequestApprovalDetails({ request }: RequestApprovalDetailsProps) {
  const [directory, setDirectory] = useState<Record<string, { fullName?: string; designation?: string }>>({});
  useEffect(() => {
    let active = true;
    loadApproverDirectory()
      .then((users) => { if (active) setDirectory(users); })
      .catch((error) => console.error('Approval name lookup failed:', error));
    return () => { active = false; };
  }, []);

  const chain: string[] = Array.isArray(request.payload?.approvalChain)
    ? request.payload.approvalChain
    : [];
  const history: Array<{ by?: string; byDisplayName?: string; comment?: string; decision?: string; at?: string; stageIndex?: number }> =
    Array.isArray(request.payload?.comments) ? request.payload.comments : [];
  const currentIndex = request.status === 'forwarded'
    ? request.payload?.currentApproverIndex
    : request.status === 'pending'
      ? 0
      : -1;
  const currentApprover = Number.isInteger(currentIndex) ? chain[currentIndex] : undefined;
  const finalDecision = request.status === 'approved' || request.status === 'rejected'
    ? history.find((entry) => entry.decision === request.status || (request.status === 'approved' && entry.decision === 'issue'))
    : undefined;
  const nameFor = (username?: string) => username
    ? approverNames[username.toLowerCase()] ||
      directory[username.toLowerCase()]?.fullName ||
      directory[username.toLowerCase()]?.designation ||
      username
    : 'Approver';
  const formatStatus = (status: string) => status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

  return (
    <details className="mt-3 rounded border border-slate-200 bg-white p-3 text-sm">
      <summary className="cursor-pointer font-medium text-slate-800">Approval details</summary>
      <div className="mt-3 space-y-2 text-slate-600">
        <p><strong>Reference:</strong> {request.submissionId || request.id}</p>
        <p><strong>Next approver:</strong> {currentApprover ? nameFor(currentApprover) : 'None'}</p>
        <p><strong>Status:</strong> {request.status === 'forwarded' ? `Forwarded to ${nameFor(request.forwardedTo || currentApprover)}` : formatStatus(request.status)}</p>
        {finalDecision && (
          <p>
            <strong>Decision:</strong> {request.status === 'approved' ? 'Approved' : 'Rejected'} by {finalDecision.byDisplayName || nameFor(finalDecision.by)}
            {finalDecision.at ? ` on ${new Date(finalDecision.at).toLocaleString('en-IN')}` : ''}
          </p>
        )}
        <div>
          <strong>Approval steps:</strong>
          {chain.length > 0 ? (
            <ol className="ml-5 mt-1 list-decimal">
              {chain.map((username, index) => {
                const action = history.find((entry) => entry.stageIndex === index) || history.find((entry) =>
                  entry.stageIndex === undefined &&
                  entry.by?.toLowerCase() === username.toLowerCase() &&
                  (entry.decision === 'approve' || entry.decision === 'reject' || entry.decision === 'recommend' || entry.decision === 'issue')
                );
                return (
                  <li key={`${username}-${index}`}>
                    {nameFor(username)} — {action
                      ? `${action.decision === 'recommend' ? 'Recommended' : action.decision === 'reject' ? 'Rejected' : action.decision === 'issue' ? 'Approved and issued' : index < chain.length - 1 ? 'Approved & Forwarded' : 'Approved'}${action.at ? ` · ${new Date(action.at).toLocaleString('en-IN')}` : ''}`
                      : index === currentIndex
                        ? 'Awaiting decision'
                        : 'Not reached'}
                    {action?.comment ? <span className="block pl-2">Remarks: {action.comment}</span> : null}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-1">No approval route is recorded.</p>
          )}
        </div>
        <p><strong>Remarks:</strong> {request.remarks || request.payload?.remarks || '—'}</p>
        <p><strong>Submitted:</strong> {new Date(request.createdAt).toLocaleString('en-IN')}</p>
      </div>
    </details>
  );
}

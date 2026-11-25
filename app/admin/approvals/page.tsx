"use client";

import React, { useEffect, useState } from 'react';
import MainLayout from '@/components/main-layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { RequestApprovalDetails } from '@/components/request-approval-details';
import FileViewerModal from '@/components/file-viewer-modal';
import { requestIsInReportingPeriod, useReportingPeriod } from '@/lib/reporting-period';

const requestTypeOptions = [
  ['all', 'All'],
  ['leave', 'Leave'],
  ['ta', 'Allowance'],
  ['proposal', 'Project Proposal'],
  ['report', 'Report'],
  ['attendance-report', 'Attendance'],
  ['certificate', 'Certificate'],
  ['relieving', 'Relieving Letter'],
  ['internal-service', 'Internal Request'],
];

export default function ApprovalsPage() {
  const { isAuthenticated, user } = useAuth();
  const { period, selectedDate } = useReportingPeriod();
  const router = useRouter();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [documents, setDocuments] = useState<Record<string, File | undefined>>({});
  const [viewingFile, setViewingFile] = useState<{ name: string; type: string; base64: string }>();
  const [directoryNames, setDirectoryNames] = useState<Record<string, string>>({});
  const [requestView, setRequestView] = useState<'pending' | 'history'>('pending');
  const [requestType, setRequestType] = useState('all');
  const [requestedRequestId, setRequestedRequestId] = useState('');
  const isRetentionApprover = ['hareeshv', 'santhanakumarv', 'gkbharath'].includes(user?.username?.toLowerCase() || '');

  const isFounderOrAdmin = user?.role === 'admin' || user?.role === 'founder' || user?.username?.toLowerCase() === 'gkbharath';

  const canActOnRequest = (request: any) => {
    if (isFounderOrAdmin) return true;
    const chain = request.payload?.approvalChain;
    if (!Array.isArray(chain)) return false;
    const index = request.status === 'forwarded'
      ? request.payload?.currentApproverIndex
      : request.status === 'pending'
        ? 0
        : -1;
    return Number.isInteger(index) &&
      typeof chain[index] === 'string' &&
      chain[index].toLowerCase() === user?.username?.toLowerCase();
  };
  const typedRequests = requests.filter((request) => requestType === 'all' || request.type === requestType);
  const pendingRequests = typedRequests.filter((request) =>
    (request.status === 'pending' || request.status === 'forwarded') &&
    requestIsInReportingPeriod(request, period, selectedDate) &&
    canActOnRequest(request)
  );
  const visibleRequests = requestView === 'pending'
    ? pendingRequests
    : typedRequests
      .filter((request) => request.id === requestedRequestId || requestIsInReportingPeriod(request, period, selectedDate))
        .slice()
        .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const requestedType = searchParams.get('type');
    const requestedId = searchParams.get('requestId') || '';
    if (requestTypeOptions.some(([value]) => value === requestedType)) {
      setRequestType(requestedType || 'all');
    }
    if (requestedId) {
      setRequestedRequestId(requestedId);
      setRequestView('history');
    }

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    const fetchRequests = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/requests?target=all&compact=true&scope=dashboard');
        if (!res.ok) return;
        const data = await res.json();
        setRequests(data.requests || []);
      } catch (e) {
        console.error('Failed to load approvals', e);
      } finally {
        setLoading(false);
      }
    };

    const fetchDirectory = async () => {
      try {
        const response = await fetch('/api/users/directory');
        if (!response.ok) throw new Error('Unable to load approver names');
        const data = await response.json();
        setDirectoryNames(Object.fromEntries(
          (data.users || []).map((candidate: any) => [
            candidate.username.toLowerCase(),
            candidate.fullName || candidate.designation || candidate.username,
          ])
        ));
      } catch (error) {
        console.error('Approval name lookup failed:', error);
      }
    };

    fetchRequests();
    fetchDirectory();
    const i = setInterval(() => {
      fetchRequests();
    }, 10000);
    const directoryInterval = setInterval(fetchDirectory, 5000);
    window.addEventListener('focus', fetchDirectory);
    return () => {
      clearInterval(i);
      clearInterval(directoryInterval);
      window.removeEventListener('focus', fetchDirectory);
    };
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (!requestedRequestId || !visibleRequests.some((request) => request.id === requestedRequestId)) return;
    document.getElementById(`approval-${requestedRequestId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [requestedRequestId, visibleRequests]);

  const approverName = (username?: string) => {
    if (!username) return 'the next authorized approver';
    const fallback: Record<string, string> = {
      hareeshv: 'Hareesh V',
      santhanakumarv: 'Santhana Kumar V',
      gkbharath: 'Golla Kumar Bharath',
    };
    return directoryNames[username.toLowerCase()] || fallback[username.toLowerCase()] || username;
  };

  const viewRequestFile = async (
    request: any,
    source: 'medicalDocument' | 'uploadedFile' | 'attachment' | 'filledFormFile' | 'internalFile' | 'officialDocument',
    index = 0
  ) => {
    const getFile = (item: any) => {
      if (source === 'medicalDocument') return item.payload?.medicalDocument;
      if (source === 'uploadedFile') return item.uploadedFile;
      if (source === 'filledFormFile') return item.payload?.filledFormFile;
      if (source === 'internalFile') return item.payload?.files?.[index];
      if (source === 'officialDocument') return item.officialDocument;
      return item.payload?.attachments?.[index];
    };
    let file = getFile(request);
    if (!file?.base64) {
      try {
        const params = new URLSearchParams({ target: 'all', requestId: request.id });
        if (user?.role === 'admin' || (user?.role === 'founder' && user.username.toLowerCase() === 'gkbharath')) {
          params.set('scope', 'dashboard');
        }
        const response = await fetch(`/api/requests?${params.toString()}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load file');
        file = getFile(data.request);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to load file');
        return;
      }
    }
    if (!file?.base64) return toast.error('No file data available');
    setViewingFile({
      ...file,
      base64: file.base64.startsWith('data:')
        ? file.base64
        : `data:${file.type || 'application/octet-stream'};base64,${file.base64}`,
    });
  };

  const performAction = async (id: string, action: 'approve' | 'reject' | 'recommend' | 'issue', comment?: string) => {
    const document = documents[id];
    if (action === 'issue' && (!document || document.type !== 'application/pdf' || document.size > 10 * 1024 * 1024)) {
      toast.error('Select an official PDF document up to 10 MB to issue');
      return;
    }
    const officialDocument = action === 'issue' && document
      ? await new Promise<{ name: string; size: number; type: string; base64: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({
            name: document.name,
            size: document.size,
            type: document.type,
            base64: String(reader.result),
          });
          reader.onerror = () => reject(reader.error || new Error('Unable to read document'));
          reader.readAsDataURL(document);
        }).catch((error) => {
          console.error('Unable to read issued document:', error);
          toast.error('Unable to read the selected document');
          return undefined;
        })
      : undefined;
    if (action === 'issue' && !officialDocument) return;
    const res = await fetch('/api/requests/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': user?.role || '',
        'x-user-id': user?.id || '',
        'x-user-username': user?.username || user?.fullName || '',
      },
      body: JSON.stringify({ requestId: id, action, comment, ...(officialDocument ? { officialDocument } : {}) }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || 'Action failed');
      return;
    }
    const data = await res.json();
    const refreshed = await fetch('/api/requests?target=all&compact=true');
    if (refreshed.ok) {
      const refreshedData = await refreshed.json();
      setRequests(refreshedData.requests || []);
    }
    toast.success(data.forwardedTo
      ? `Request forwarded to ${data.forwardedTo}`
      : 'Request action completed');
  };

  return (
    <MainLayout>
      <div className="max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Request Approvals</h1>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter requests by type">
            {requestTypeOptions.map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={requestType === value ? 'default' : 'outline'}
                onClick={() => setRequestType(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant={requestView === 'pending' ? 'default' : 'outline'} onClick={() => setRequestView('pending')}>
              Awaiting My Action ({pendingRequests.length})
            </Button>
            <Button variant={requestView === 'history' ? 'default' : 'outline'} onClick={() => setRequestView('history')}>
              All Request History ({requests.length})
            </Button>
          </div>
          {loading && <Card className="p-4">Loading...</Card>}
          {!loading && visibleRequests.length === 0 && <Card className="p-8 text-center">{requestView === 'pending' ? 'No pending requests assigned to you' : 'No request history available'}</Card>}

          {visibleRequests.map((req) => {
            const stageIndex = req.status === 'forwarded' ? req.payload?.currentApproverIndex : 0;
            const isGuide = stageIndex === 0 && req.payload?.guideId === user?.id;
            const isDocumentRequest = req.type === 'certificate' || req.type === 'relieving';
            const isFinalStage = stageIndex === req.payload?.approvalChain?.length - 1;
            const senderDetails = [
              (req.createdByEmployeeId || req.payload?.id) && `ID: ${req.createdByEmployeeId || req.payload?.id}`,
              (req.createdByDepartment || req.payload?.department) && `Team: ${req.createdByDepartment || req.payload?.department}`,
              (req.createdByPhone || req.payload?.phone) && `Phone: ${req.createdByPhone || req.payload?.phone}`,
            ].filter(Boolean);
            return (
            <Card id={`approval-${req.id}`} key={req.id} className={`p-4 ${req.status === 'pending' || req.status === 'forwarded' ? 'border-l-4 border-yellow-400' : ''}`}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-slate-600">{req.type.replace('-', ' ').toUpperCase()}</p>
                  <p className="text-lg font-bold text-slate-900">{req.title}</p>
                  <p className="text-sm text-slate-600">From: {req.createdBy || 'Unknown'}{(req.createdByDesignation || req.createdByRole) ? ` · ${req.createdByDesignation || req.createdByRole}` : ''}</p>
                  {senderDetails.length > 0 && <p className="text-xs text-slate-500">{senderDetails.join(' · ')}</p>}
                  <p className="mt-1 text-sm font-medium text-slate-700">
                    Status: {req.status === 'forwarded' ? `Forwarded to ${approverName(req.forwardedTo)}` : req.status}
                  </p>
                </div>
                {requestView === 'pending' && canActOnRequest(req) && (
                  <div className="flex gap-2">
                    {isGuide ? (
                        <div className="flex flex-col items-end gap-1">
                          <Button size="sm" className="bg-blue-600" onClick={() => performAction(req.id, 'recommend', comments[req.id] || '')}>Recommend & Forward</Button>
                        </div>
                    ) : isDocumentRequest && isFinalStage ? (
                      <>
                        <label className="flex items-center text-xs">
                          <span className="sr-only">Official PDF</span>
                          <input type="file" accept="application/pdf,.pdf" onChange={(event) => setDocuments((current) => ({ ...current, [req.id]: event.target.files?.[0] }))} />
                        </label>
                        <Button size="sm" className="bg-blue-600" onClick={() => performAction(req.id, 'issue', comments[req.id] || '')}>Issue & Approve</Button>
                        <Button size="sm" className="bg-red-500" onClick={() => performAction(req.id, 'reject', comments[req.id] || '')}>Reject</Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" className="bg-blue-600" onClick={() => performAction(req.id, 'approve', comments[req.id] || '')}>Approve / Forward</Button>
                        <Button size="sm" className="bg-red-500" onClick={() => performAction(req.id, 'reject', comments[req.id] || '')}>Reject</Button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {req.type === 'leave' && (
                <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3">
                  <h3 className="font-semibold text-slate-900">Leave request details</h3>
                  <div className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                    <p><strong>Leave type:</strong> {req.payload?.leaveType || 'Not specified'}</p>
                    <p><strong>Dates:</strong> {req.payload?.fromDate || 'Not specified'} – {req.payload?.toDate || 'Not specified'}</p>
                    <p><strong>Past-date request:</strong> {req.payload?.isPastDateRequest ? 'Yes' : 'No'}</p>
                    <p><strong>Reason:</strong> {req.payload?.reason || '—'}</p>
                    <p className="sm:col-span-2"><strong>Applicant remarks:</strong> {req.payload?.remarks || req.remarks || '—'}</p>
                    {req.payload?.medicalDocument?.name && (
                      <div className="sm:col-span-2">
                        <p><strong>Medical document:</strong> {req.payload.medicalDocument.name}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-1"
                          onClick={() => viewRequestFile(req, 'medicalDocument')}
                        >
                          View medical document
                        </Button>
                      </div>
                    )}
                    {req.uploadedFile?.name && (
                      <div className="sm:col-span-2">
                        <p><strong>Uploaded leave form:</strong> {req.uploadedFile.name}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-1"
                          onClick={() => viewRequestFile(req, 'uploadedFile')}
                        >
                          View leave form
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {req.type === 'report' && (
                <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3">
                  <h3 className="font-semibold text-slate-900">Report details</h3>
                  <div className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                    <p><strong>Frequency:</strong> {req.payload?.reportFrequency === 'monthly' ? 'Monthly' : 'Weekly'}</p>
                    <p><strong>{req.payload?.reportFrequency === 'weekly' ? 'Report date' : 'Report period'}:</strong> {req.payload?.reportFrequency === 'weekly'
                      ? req.payload?.reportDate || req.payload?.periodStartDate || 'Not specified'
                      : req.payload?.periodLabel || 'Not specified'}</p>
                    <p className="sm:col-span-2"><strong>Description:</strong> {req.payload?.description || '—'}</p>
                    {Array.isArray(req.payload?.attachments) && req.payload.attachments.length > 0 && (
                      <div className="sm:col-span-2">
                        <strong>Attachments:</strong>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {req.payload.attachments.map((file: any, index: number) => (
                            <Button
                              key={`${file.name}-${index}`}
                              size="sm"
                              variant="outline"
                              onClick={() => viewRequestFile(req, 'attachment', index)}
                            >
                              View {file.name}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {req.type === 'proposal' && (
                <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3">
                  <h3 className="font-semibold text-slate-900">Project proposal details</h3>
                  <div className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                    <p><strong>Project:</strong> {req.payload?.projectTitle || req.title}</p>
                    <p><strong>Client:</strong> {req.payload?.clientOrganization || req.payload?.clientName || '—'}</p>
                    <p><strong>Project status:</strong> {req.payload?.projectStatus || '—'}</p>
                    <p><strong>Project value:</strong> {req.payload?.projectAmount ? `₹${Number(req.payload.projectAmount).toLocaleString('en-IN')}` : '—'}</p>
                    {req.payload?.clientDesignation && <p><strong>Client contact:</strong> {req.payload.clientDesignation}</p>}
                    {req.payload?.clientPhone && <p><strong>Client phone:</strong> {req.payload.clientPhone}</p>}
                    {req.payload?.clientEmail && <p><strong>Client email:</strong> {req.payload.clientEmail}</p>}
                    {req.payload?.clientAddress && <p className="sm:col-span-2"><strong>Client address:</strong> {req.payload.clientAddress}</p>}
                    {(req.remarks || req.payload?.remarks) && <p className="sm:col-span-2"><strong>Remarks:</strong> {req.remarks || req.payload.remarks}</p>}
                    {req.uploadedFile?.name && (
                      <div className="sm:col-span-2">
                        <p><strong>Proposal document:</strong> {req.uploadedFile.name}</p>
                        <Button size="sm" variant="outline" className="mt-1" onClick={() => viewRequestFile(req, 'uploadedFile')}>View proposal document</Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {req.type === 'ta' && (
                <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3">
                  <h3 className="font-semibold text-slate-900">Allowance claim details</h3>
                  <div className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                    <p><strong>Claim type:</strong> {req.payload?.claimType || '—'}</p>
                    <p><strong>Amount:</strong> ₹{Number(req.payload?.amount || 0).toLocaleString('en-IN')}</p>
                    <p className="sm:col-span-2"><strong>Description:</strong> {req.payload?.description || '—'}</p>
                    {(req.remarks || req.payload?.remarks) && <p className="sm:col-span-2"><strong>Remarks:</strong> {req.remarks || req.payload.remarks}</p>}
                    {req.uploadedFile?.name && (
                      <div className="sm:col-span-2">
                        <p><strong>Bill / receipt:</strong> {req.uploadedFile.name}</p>
                        <Button size="sm" variant="outline" className="mt-1" onClick={() => viewRequestFile(req, 'uploadedFile')}>View bill / receipt</Button>
                      </div>
                    )}
                    {req.payload?.filledFormFile?.name && (
                      <div className="sm:col-span-2">
                        <p><strong>Filled claim form:</strong> {req.payload.filledFormFile.name}</p>
                        <Button size="sm" variant="outline" className="mt-1" onClick={() => viewRequestFile(req, 'filledFormFile')}>View filled form</Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {req.type === 'attendance-report' && (
                <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3">
                  <h3 className="font-semibold text-slate-900">Attendance report details</h3>
                  <div className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                    <p><strong>From:</strong> {req.payload?.fromDate || '—'}</p>
                    <p><strong>To:</strong> {req.payload?.toDate || '—'}</p>
                    <p><strong>Days recorded:</strong> {req.payload?.daysRecorded ?? req.payload?.attendance?.length ?? 0}</p>
                    {(req.remarks || req.payload?.remarks) && <p><strong>Remarks:</strong> {req.remarks || req.payload.remarks}</p>}
                  </div>
                  {Array.isArray(req.payload?.attendance) && req.payload.attendance.length > 0 && (
                    <details className="mt-2 text-sm text-slate-700">
                      <summary className="cursor-pointer font-medium">View daily records ({req.payload.attendance.length})</summary>
                      <div className="mt-2 space-y-1">
                        {req.payload.attendance.map((record: any, index: number) => (
                          <p key={`${record.date}-${index}`}>{record.date}: {record.checkIn ? new Date(record.checkIn).toLocaleTimeString('en-IN') : 'No check-in'} – {record.checkOut ? new Date(record.checkOut).toLocaleTimeString('en-IN') : 'No check-out'}</p>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}

              {(req.type === 'certificate' || req.type === 'relieving') && (
                <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3">
                  <h3 className="font-semibold text-slate-900">{req.type === 'certificate' ? 'Certificate request details' : 'Relieving request details'}</h3>
                  <p className="mt-2 text-sm text-slate-700"><strong>Purpose:</strong> {req.payload?.purpose || '—'}</p>
                  {(req.remarks || req.payload?.remarks) && <p className="mt-1 text-sm text-slate-700"><strong>Remarks:</strong> {req.remarks || req.payload.remarks}</p>}
                  {req.uploadedFile?.name && (
                    <div className="mt-2">
                      <p className="text-sm text-slate-700"><strong>Uploaded document:</strong> {req.uploadedFile.name}</p>
                      <Button size="sm" variant="outline" className="mt-1" onClick={() => viewRequestFile(req, 'uploadedFile')}>View uploaded document</Button>
                    </div>
                  )}
                </div>
              )}

              {req.type === 'internal-service' && (
                <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3">
                  <h3 className="font-semibold text-slate-900">Internal request details</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{req.payload?.description || '—'}</p>
                  {(req.remarks || req.payload?.remarks) && <p className="mt-1 text-sm text-slate-700"><strong>Remarks:</strong> {req.remarks || req.payload.remarks}</p>}
                  {Array.isArray(req.payload?.files) && req.payload.files.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {req.payload.files.map((file: any, index: number) => (
                        <Button key={`${file.name}-${index}`} size="sm" variant="outline" onClick={() => viewRequestFile(req, 'internalFile', index)}>
                          View {file.name}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3">
                {requestView === 'pending' && canActOnRequest(req) && (
                  <>
                    <label className="block text-xs text-slate-500 mb-1">Approval note</label>
                    <textarea
                      value={comments[req.id] || ''}
                      onChange={(e) => setComments((p) => ({ ...p, [req.id]: e.target.value }))}
                      className="w-full p-2 border rounded text-sm"
                      rows={2}
                      placeholder="Add a brief reason or context (optional)"
                    />
                  </>
                )}
                <RequestApprovalDetails request={req} />
                {req.payload?.signatures && req.payload.signatures.length > 0 && (
                  <div className="mt-2 text-sm text-slate-600">
                    <p className="font-semibold">Signatures:</p>
                    <ul className="list-disc pl-5">
                      {req.payload.signatures.map((s: any, i: number) => (
                        <li key={i}>{s.by} ({new Date(s.at).toLocaleString()}): {s.note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
            );
          })}
        </div>
      </div>
      <FileViewerModal file={viewingFile} onClose={() => setViewingFile(undefined)} />
    </MainLayout>
  );
}

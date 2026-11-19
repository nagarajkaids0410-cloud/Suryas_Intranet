'use client';

import React, { useEffect, useState } from 'react';
import MainLayout from '@/components/main-layout';
import { useAuth } from '@/lib/auth-context';
import { exportToExcel, requestTrackingColumns, toRequestExportRow } from '@/lib/excel-export';
import { RequestApprovalDetails } from '@/components/request-approval-details';
import { isInReportingPeriod, useReportingPeriod } from '@/lib/reporting-period';
import { EXTENDED_DOCUMENT_MAX_BYTES, isValidDocumentFile } from '@/lib/document-upload';

interface Reply {
  repliedBy: string;
  repliedById: string;
  repliedAt: string;
  message: string;
}

interface InternalRequest {
  id: string;
  submissionId?: string;
  type: string;
  title: string;
  createdBy: string;
  createdById: string;
  createdByEmployeeId?: string;
  createdByDesignation?: string;
  createdByDepartment?: string;
  createdByPhone?: string;
  createdAt: string;
  status: string;
  payload: {
    [key: string]: any;
    description: string;
    remarks?: string;
    files?: Array<{ name: string; size: number; type: string; base64: string }>;
    replies?: Reply[];
    assignedHeadId?: string;
  };
}

export default function InternalRequestsPage() {
  const { user } = useAuth();
  const { period, selectedDate } = useReportingPeriod();
  const [description, setDescription] = useState('');
  const [remarks, setRemarks] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState('');
  const [requests, setRequests] = useState<InternalRequest[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [memberQuery, setMemberQuery] = useState('');
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<{ [key: string]: string }>({});

  const periodRequests = requests.filter((request) =>
    request.id === expandedRequestId || isInReportingPeriod(request.createdAt, period, selectedDate)
  );

  useEffect(() => {
    const requestedRequestId = new URLSearchParams(window.location.search).get('requestId');
    if (requestedRequestId) setExpandedRequestId(requestedRequestId);
    fetchRequests();
    fetchMembers();
    const interval = setInterval(fetchMembers, 5000);
    window.addEventListener('focus', fetchMembers);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', fetchMembers);
    };
  }, [user?.id]);

  async function fetchRequests() {
    const res = await fetch('/api/internal-requests', { 
      headers: { 
        'x-user-role': user?.role || '', 
        'x-user-id': user?.id || '',
        'x-user-username': user?.username || '',
      } 
    });
    const data = await res.json();
    if (data?.success) setRequests(data.requests || []);
  }

  async function fetchMembers() {
    const res = await fetch('/api/users/directory');
    const data = await res.json();
    if (data?.success) setMembers(data.users || []);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list) return;
    const selected = Array.from(list);
    if (!selected.every((file) => isValidDocumentFile(file, ['pdf', 'doc', 'docx'], EXTENDED_DOCUMENT_MAX_BYTES))) {
      e.target.value = '';
      setFiles([]);
      alert('Attachments must be PDF or DOC/DOCX files up to 10 MB each');
      return;
    }
    setFiles(selected);
  }

  async function toBase64(file: File) {
    return new Promise<{ name: string; size: number; type: string; base64: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || '';
        resolve({ name: file.name, size: file.size, type: file.type, base64 });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return alert('Description is required');
    if (!user?.phone?.trim()) return alert('Add a phone number to your profile before submitting an internal request');
    if (!selectedRecipientId) return alert('Choose a person to receive this request');
    const encodedFiles = await Promise.all(files.map((f) => toBase64(f)));

    const res = await fetch('/api/internal-requests', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-user-role': user?.role || '',
        'x-user-id': user?.id || '',
        'x-user-username': user?.username || '',
      },
      body: JSON.stringify({ description, remarks, files: encodedFiles, assignedHeadId: selectedRecipientId }),
    });
    const data = await res.json();
    if (data?.success) {
      setDescription('');
      setRemarks('');
      setFiles([]);
      setSelectedRecipientId('');
      fetchRequests();
      alert('Request submitted');
    } else {
      alert('Failed to submit');
    }
  }

  async function handleReply(requestId: string) {
    const message = replyText[requestId]?.trim();
    if (!message) return alert('Reply message is required');

    const res = await fetch('/api/internal-requests', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': user?.role || '',
        'x-user-id': user?.id || '',
        'x-user-username': user?.username || '',
      },
      body: JSON.stringify({ requestId, action: 'reply', message }),
    });

    const data = await res.json();
    if (data?.success) {
      setReplyText({ ...replyText, [requestId]: '' });
      fetchRequests();
      alert('Reply sent');
    } else {
      alert('Failed to send reply');
    }
  }

  function downloadFile(base64: string, name: string, type = 'application/octet-stream') {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleExport() {
    const columns = [
      ...requestTrackingColumns,
      { key: 'attachments', header: 'Attachments' },
      { key: 'replies', header: 'Conversation Replies' },
    ];
    const rows = periodRequests.map((request) => ({
      ...toRequestExportRow(request),
      attachments: (request.payload?.files || []).map((file: any) => file.name).join('; '),
      replies: (request.payload?.replies || []).map((reply: any) =>
        `${reply.repliedBy}: ${reply.message} (${new Date(reply.repliedAt).toLocaleString('en-IN')})`
      ).join('; '),
    }));

    exportToExcel(rows, columns, 'internal-requests');
  }

  const visibleMembers = members.filter((m) => {
    if (!memberQuery) return true;
    const q = memberQuery.toLowerCase();
    return (m.fullName || m.username || '').toLowerCase().includes(q) || (m.designation || '').toLowerCase().includes(q) || (m.role || '').toLowerCase().includes(q);
  });

  return (
    <MainLayout>
      <div className="max-w-5xl">
        <h1 className="text-2xl font-bold mb-4">Request Service Internally</h1>

        <form onSubmit={handleSubmit} className="space-y-4 mb-8">
          <p className="text-sm text-slate-600">Phone Number *: {user?.phone || 'Update your profile phone number'}</p>
          <div>
            <label className="block text-sm font-medium text-slate-700">Request Description *</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border rounded p-2 mt-1" rows={4} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Attachments</label>
            <input type="file" multiple onChange={handleFileChange} className="mt-2" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Remarks</label>
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className="w-full border rounded p-2 mt-1" />
          </div>

          <p className="text-sm text-slate-600">Submitted by: {user?.fullName || user?.username || 'Current user'}</p>

          <div>
            <label className="block text-sm font-medium text-slate-700">Send To *</label>
            <select value={selectedRecipientId} onChange={(e) => setSelectedRecipientId(e.target.value)} className="w-full border rounded p-2 mt-1" required>
              <option value="">Choose a portal user</option>
              {members.filter((member) => member.id !== user?.id).map((member) => (
                <option key={member.id} value={member.id}>{member.fullName || member.username} — {member.designation || member.role}</option>
              ))}
            </select>
          </div>

          <div>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Submit Request</button>
          </div>
        </form>

        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">All Members</h2>
          <input placeholder="Search members" value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} className="w-full border rounded p-2 mb-2" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {visibleMembers.map((m) => (
              <div key={m.id || m.username} className="flex items-start gap-3 rounded border p-3">
                {m.profilePhoto ? (
                  <img src={m.profilePhoto} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700">
                    {(m.fullName || m.username || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="font-medium">{m.fullName || m.username}</div>
                  <div className="text-sm font-mono text-slate-600">Employee ID: {m.employeeId || 'Not Set'}</div>
                  <div className="text-sm text-slate-600">{m.designation || 'Designation not set'}</div>
                  <div className="text-sm text-slate-600">Team: {m.department || 'Not Set'}</div>
                  <div className="text-sm text-slate-600">Role: {m.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Submitted Requests</h2>
          <div className="mb-2">
            <button onClick={handleExport} className="px-3 py-1 mr-2 bg-green-600 text-white rounded">Export to Excel</button>
            <button onClick={fetchRequests} className="px-3 py-1 bg-slate-200 rounded">Refresh</button>
          </div>
          <div className="space-y-3">
            {requests.length === 0 ? (
              <div className="text-slate-600">No requests found</div>
            ) : (
              periodRequests.map((r) => {
                const isCreator = r.createdById === user?.id;
                const isAssignedHead = r.payload?.assignedHeadId === user?.id;
                const canReply = isCreator || isAssignedHead;

                return (
                  <div key={r.id} className="p-4 border rounded">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-medium">{r.createdBy}</div>
                        <div className="text-sm text-slate-600">{r.createdByDesignation || ''} • {new Date(r.createdAt).toLocaleString()}</div>
                        <div className="mt-1 text-sm font-medium text-slate-700">Status: {r.status}</div>
                        {r.payload?.assignedHeadId && (
                          <div className="text-sm text-slate-600 mt-1">
                            <strong>Sent to:</strong> {members.find((member) => member.id === r.payload.assignedHeadId)?.fullName || members.find((member) => member.id === r.payload.assignedHeadId)?.username || 'Portal user'}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => setExpandedRequestId(expandedRequestId === r.id ? null : r.id)}
                        className="px-3 py-1 text-sm bg-slate-200 rounded"
                      >
                        {expandedRequestId === r.id ? 'Collapse' : 'Details'}
                      </button>
                    </div>

                    {expandedRequestId === r.id && (
                      <div className="mt-4 p-3 bg-slate-50 rounded space-y-3">
                        {Array.isArray(r.payload?.approvalChain) && <RequestApprovalDetails request={r} />}
                        <div>
                          <div className="font-medium">Description:</div>
                          <div className="text-sm text-slate-700 mt-1">{r.payload?.description}</div>
                        </div>

                        {r.payload?.remarks && (
                          <div>
                            <div className="font-medium">Remarks:</div>
                            <div className="text-sm text-slate-700 mt-1">{r.payload.remarks}</div>
                          </div>
                        )}

                        {r.payload?.files && r.payload.files.length > 0 && (
                          <div>
                            <div className="font-medium">Attachments:</div>
                            <div className="space-y-1 mt-1">
                              {r.payload.files.map((f: any, idx: number) => (
                                <button
                                  key={idx}
                                  onClick={() => downloadFile(f.base64, f.name, f.type)}
                                  className="block text-blue-600 underline text-sm"
                                >
                                  {f.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {r.payload?.replies && r.payload.replies.length > 0 && (
                          <div>
                            <div className="font-medium">Replies:</div>
                            <div className="space-y-2 mt-1">
                              {r.payload.replies.map((reply: Reply, idx: number) => (
                                <div key={idx} className="p-2 bg-white border rounded text-sm">
                                  <div className="font-medium">{reply.repliedBy}</div>
                                  <div className="text-xs text-slate-600">{new Date(reply.repliedAt).toLocaleString()}</div>
                                  <div className="mt-1">{reply.message}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {canReply && (
                          <div>
                            <div className="font-medium">Add Reply:</div>
                            <textarea
                              value={replyText[r.id] || ''}
                              onChange={(e) => setReplyText({ ...replyText, [r.id]: e.target.value })}
                              className="w-full border rounded p-2 mt-1 text-sm"
                              rows={2}
                              placeholder="Enter your reply..."
                            />
                            <button
                              onClick={() => handleReply(r.id)}
                              className="px-2 py-1 mt-1 text-sm bg-blue-600 text-white rounded"
                            >
                              Send Reply
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

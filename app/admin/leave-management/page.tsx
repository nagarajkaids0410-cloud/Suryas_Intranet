'use client';

import React, { useEffect, useState } from 'react';
import MainLayout from '@/components/main-layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Clock, Search, Filter, FileDown, Eye, Download } from 'lucide-react';
import { toast } from 'sonner';
import { collectDecisionRemarks } from '@/lib/approval-remarks';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import FileViewerModal from '@/components/file-viewer-modal';
import { exportToExcel, requestTrackingColumns, toRequestExportRow } from '@/lib/excel-export';
import { RequestApprovalDetails } from '@/components/request-approval-details';
import { requestIsInReportingPeriod, useReportingPeriod } from '@/lib/reporting-period';

export default function LeaveManagement() {
  const { isAuthenticated, user } = useAuth();
  const { period, selectedDate } = useReportingPeriod();
  const router = useRouter();
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('pending');
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [viewingFile, setViewingFile] = useState<any>(null);

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
    return Number.isInteger(index) && chain[index] === user?.username?.toLowerCase();
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    const fetchRequests = async () => {
      const response = await fetch('/api/requests?target=all&type=leave&compact=true');
      if (!response.ok) return;
      const data = await response.json();
      setLeaveRequests(data.requests || []);
    };

    fetchRequests();
    const interval = setInterval(fetchRequests, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, router]);

  const handleApprove = async (id: string) => {
    const comment = collectDecisionRemarks('approve');
    if (comment === null) return;
    const response = await fetch('/api/requests/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-role': user?.role || '', 'x-user-id': user?.id || '' },
      body: JSON.stringify({ requestId: id, action: 'approve', comment }),
    });

    if (!response.ok) {
      toast.error('Unable to approve request');
      return;
    }

    toast.success('Leave request approved');
  };

  const handleReject = async (id: string) => {
    const comment = collectDecisionRemarks('reject');
    if (comment === null) return;
    const response = await fetch('/api/requests/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-role': user?.role || '', 'x-user-id': user?.id || '' },
      body: JSON.stringify({ requestId: id, action: 'reject', comment }),
    });

    if (!response.ok) {
      toast.error('Leave request rejected');
      return;
    }

    toast.error('Leave request rejected');
  };

  const handleExportToExcel = () => {
    try {
      if (filteredRequests.length === 0) {
        toast.error('No data to export');
        return;
      }

      const exportData = filteredRequests.map(toRequestExportRow);

      const dateStamp = new Date().toISOString().split('T')[0];
      exportToExcel(exportData, requestTrackingColumns, `Leave_Requests_${dateStamp}`);
      toast.success('Leave requests exported to Excel');
    } catch (error) {
      toast.error('Failed to export data');
      console.error(error);
    }
  };

  const loadLeaveFile = async (request: any, source: 'uploadedFile' | 'medicalDocument') => {
    const getFile = (item: any) => source === 'uploadedFile' ? item.uploadedFile : item.payload?.medicalDocument;
    let file = getFile(request);
    if (!file?.base64) {
      try {
        const response = await fetch(`/api/requests?target=all&requestId=${encodeURIComponent(request.id)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load document');
        file = getFile(data.request);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to load document');
        return undefined;
      }
    }
    if (!file?.base64) {
      toast.error('No file available');
      return undefined;
    }
    return file;
  };

  const viewLeaveFile = async (request: any, source: 'uploadedFile' | 'medicalDocument') => {
    const file = await loadLeaveFile(request, source);
    if (!file) return;
    setViewingFile({
      ...file,
      base64: file.base64.startsWith('data:')
        ? file.base64
        : `data:${file.type || 'application/octet-stream'};base64,${file.base64}`,
    });
  };

  const downloadUploadedFile = async (request: any) => {
    const file = await loadLeaveFile(request, 'uploadedFile');
    if (!file) return;
    const link = document.createElement('a');
    link.href = file.base64.startsWith('data:')
      ? file.base64
      : `data:${file.type || 'application/octet-stream'};base64,${file.base64}`;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadRequestPdf = (request: any) => {
    const payload = request.payload || {};
    const html = `
      <html>
        <head>
          <title>${request.title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #0f172a; }
            h1 { font-size: 20px; margin-bottom: 8px; }
            .meta { font-size: 12px; color: #475569; margin-bottom: 16px; }
            .line { margin: 6px 0; }
          </style>
        </head>
        <body>
          <h1>${request.title}</h1>
          <div class="meta">Submitted by ${request.createdBy} • ${new Date(request.createdAt).toLocaleString('en-IN')}</div>
          <div class="line">Leave Type: ${payload.leaveType}</div>
          <div class="line">Past-Date Request: ${payload.isPastDateRequest ? 'Yes' : 'No'}</div>
          <div class="line">Dates: ${payload.fromDate} - ${payload.toDate}</div>
          <div class="line">Reason: ${payload.reason}</div>
          <div class="line">Status: ${request.status}</div>
        </body>
      </html>
    `;

    const pdfWindow = window.open('', '_blank');
    if (!pdfWindow) return;
    pdfWindow.document.write(html);
    pdfWindow.document.close();
    pdfWindow.focus();
    setTimeout(() => pdfWindow.print(), 300);
  };

  const periodLeaveRequests = leaveRequests.filter((request) => requestIsInReportingPeriod(request, period, selectedDate));
  const filteredRequests = periodLeaveRequests
    .filter((req) => filterStatus === 'pending'
      ? req.status === 'pending' || req.status === 'forwarded'
      : req.status === filterStatus)
    .filter(
      (req) =>
        req.createdBy.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (req.payload?.reason || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
      case 'forwarded':
        return 'bg-yellow-50 border-l-4 border-yellow-500';
      case 'approved':
        return 'bg-green-50 border-l-4 border-green-500';
      case 'rejected':
        return 'bg-red-50 border-l-4 border-red-500';
      default:
        return 'bg-slate-50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
      case 'forwarded':
        return <Clock className="text-yellow-500" size={20} />;
      case 'approved':
        return <CheckCircle className="text-green-500" size={20} />;
      case 'rejected':
        return <XCircle className="text-red-500" size={20} />;
      default:
        return null;
    }
  };

  return (
    <MainLayout>
      <div className="max-w-7xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Leave Management</h1>
          <p className="text-slate-600">Review and approve/reject employee leave requests</p>
        </div>

        {/* Search and Filter */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search by employee name or reason..."
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Filter size={20} className="mt-2 text-slate-500" />
            <select
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="pending">Awaiting My Action</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <Button
            onClick={handleExportToExcel}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            disabled={periodLeaveRequests.length === 0}
          >
            <Download size={18} className="mr-2" />
            Download Excel
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-yellow-50 p-4 border-l-4 border-yellow-500">
            <p className="text-sm text-slate-600">Pending Requests</p>
            <p className="text-2xl font-bold text-yellow-600">
              {periodLeaveRequests.filter((r) => r.status === 'pending' || r.status === 'forwarded').length}
            </p>
          </Card>
          <Card className="bg-green-50 p-4 border-l-4 border-green-500">
            <p className="text-sm text-slate-600">Approved</p>
            <p className="text-2xl font-bold text-green-600">
              {periodLeaveRequests.filter((r) => r.status === 'approved').length}
            </p>
          </Card>
          <Card className="bg-red-50 p-4 border-l-4 border-red-500">
            <p className="text-sm text-slate-600">Rejected</p>
            <p className="text-2xl font-bold text-red-600">
              {periodLeaveRequests.filter((r) => r.status === 'rejected').length}
            </p>
          </Card>
          <Card className="bg-blue-50 p-4 border-l-4 border-blue-500">
            <p className="text-sm text-slate-600">Total Requests</p>
            <p className="text-2xl font-bold text-blue-600">{periodLeaveRequests.length}</p>
          </Card>
        </div>

        {/* Leave Requests Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {filteredRequests.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-slate-600">No leave requests found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-100 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Employee</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Type</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Dates</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Reason</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Status</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-slate-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((request) => (
                    <tr key={request.id} className={`border-b border-slate-200 hover:bg-slate-50 transition`}>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{request.createdBy}</p>
                          <p className="text-xs text-slate-500">{request.createdByDesignation || 'Employee'}</p>
                          <p className="text-xs font-mono text-slate-500">Employee ID: {request.createdByEmployeeId || request.payload?.id || 'Not Set'}</p>
                          <p className="text-xs text-slate-500">Team: {request.createdByDepartment || request.payload?.department || 'Not Set'}</p>
                          <p className="text-xs text-slate-500">Phone: {request.createdByPhone || request.payload?.phone || 'Not Set'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                          {request.payload?.leaveType}
                        </span>
                        {request.payload?.isPastDateRequest && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            Past Date
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {request.payload?.fromDate} - {request.payload?.toDate}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{request.payload?.reason}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(request.status)}
                          <span className={`text-sm font-semibold ${
                            request.status === 'pending' || request.status === 'forwarded'
                              ? 'text-yellow-600'
                              : request.status === 'approved'
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}>
                            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                          </span>
                        </div>
                        <RequestApprovalDetails request={request} />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-wrap gap-2 justify-center">
                          {request.uploadedFile && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => viewLeaveFile(request, 'uploadedFile')}
                              title="View uploaded form"
                            >
                              Form
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedRequest(request)}
                          >
                            <Eye size={14} className="mr-1" /> View
                          </Button>
                          {request.uploadedFile && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => downloadUploadedFile(request)}
                              title="Download uploaded form"
                            >
                              <FileDown size={14} className="mr-1" /> Form
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => downloadRequestPdf(request)}
                          >
                            <FileDown size={14} className="mr-1" /> Summary
                          </Button>
                          {canActOnRequest(request) && (
                            <>
                              <Button
                                size="sm"
                                className="bg-green-500 hover:bg-green-600 text-white"
                                onClick={() => handleApprove(request.id)}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                className="bg-red-500 hover:bg-red-600 text-white"
                                onClick={() => handleReject(request.id)}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          {!canActOnRequest(request) && request.status !== 'approved' && request.status !== 'rejected' && (
                            <span className="text-xs text-slate-500">Awaiting {request.forwardedTo || 'first approver'}</span>
                          )}
                          {(request.status === 'approved' || request.status === 'rejected') && (
                            <span className="text-xs text-slate-500">Processed</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selectedRequest && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="bg-white w-full max-w-lg p-6 space-y-4">
              <h2 className="text-xl font-bold text-slate-900">Leave Request Details</h2>
              <div className="space-y-2 text-sm text-slate-700">
                <p><strong>Employee:</strong> {selectedRequest.createdBy}</p>
                <p><strong>Leave Type:</strong> {selectedRequest.payload?.leaveType}</p>
                <p><strong>Past-Date Request:</strong> {selectedRequest.payload?.isPastDateRequest ? 'Yes' : 'No'}</p>
                <p><strong>Dates:</strong> {selectedRequest.payload?.fromDate} - {selectedRequest.payload?.toDate}</p>
                <p><strong>Reason:</strong> {selectedRequest.payload?.reason}</p>
                <p><strong>Status:</strong> {selectedRequest.status}</p>
                {selectedRequest.payload?.medicalDocument?.name && <p><strong>Medical Certificate / Prescription:</strong> {selectedRequest.payload.medicalDocument.name}</p>}
                {selectedRequest.payload?.medicalDocument?.name && (
                  <Button
                    variant="outline"
                    onClick={() => viewLeaveFile(selectedRequest, 'medicalDocument')}
                  >
                    View Medical Document
                  </Button>
                )}
                {selectedRequest.uploadedFile && (
                  <p><strong>Uploaded Form:</strong> {selectedRequest.uploadedFile.name}</p>
                )}
              </div>
              <div className="flex gap-2">
                {selectedRequest.uploadedFile && (
                  <Button
                    variant="outline"
                    onClick={() => viewLeaveFile(selectedRequest, 'uploadedFile')}
                    className="flex-1"
                  >
                    View Form
                  </Button>
                )}
                <Button variant="outline" onClick={() => setSelectedRequest(null)} className="flex-1">
                  Close
                </Button>
              </div>
            </Card>
          </div>
        )}

        <FileViewerModal file={viewingFile} onClose={() => setViewingFile(null)} />
      </div>
    </MainLayout>
  );
}

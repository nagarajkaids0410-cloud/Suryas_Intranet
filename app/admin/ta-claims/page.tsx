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

export default function TAClaims() {
  const { isAuthenticated, user } = useAuth();
  const { period, selectedDate } = useReportingPeriod();
  const router = useRouter();
  const [taClaims, setTAClaims] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClaim, setSelectedClaim] = useState<any | null>(null);
  const [viewingFile, setViewingFile] = useState<any>(null);
  const [commentText, setCommentText] = useState('');

  const canActOnRequest = (claim: any) => {
    const chain = claim.payload?.approvalChain;
    if (!Array.isArray(chain)) return false;
    const index = claim.status === 'forwarded'
      ? claim.payload?.currentApproverIndex
      : claim.status === 'pending'
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
      const response = await fetch('/api/requests?target=all&type=ta&compact=true');
      if (!response.ok) return;
      const data = await response.json();
      setTAClaims(data.requests || []);
    };

    fetchRequests();
    const interval = setInterval(fetchRequests, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, router, user]);

  const handleApprove = async (id: string) => {
    const comment = collectDecisionRemarks('approve');
    if (comment === null) return;
    const response = await fetch('/api/requests/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-role': user?.role || '', 'x-user-id': user?.id || '' },
      body: JSON.stringify({ requestId: id, action: 'approve', comment }),
    });

    if (!response.ok) {
      toast.error('Unable to approve claim');
      return;
    }

    toast.success('Allowance claim approved');
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
      toast.error('Allowance claim rejected');
      return;
    }

    toast.error('Allowance claim rejected');
  };

  const loadClaimFile = async (claim: any, source: 'uploadedFile' | 'filledFormFile') => {
    const getFile = (item: any) => source === 'uploadedFile' ? item.uploadedFile : item.payload?.filledFormFile;
    let file = getFile(claim);
    if (!file?.base64) {
      try {
        const response = await fetch(`/api/requests?target=all&requestId=${encodeURIComponent(claim.id)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load claim file');
        file = getFile(data.request);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to load claim file');
        return undefined;
      }
    }
    if (!file?.base64) {
      toast.error('No file available');
      return undefined;
    }
    return file;
  };

  const downloadUploadedFile = async (claim: any, source: 'uploadedFile' | 'filledFormFile' = 'uploadedFile') => {
    const file = await loadClaimFile(claim, source);
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

  const downloadRequestPdf = (claim: any) => {
    const payload = claim.payload || {};
    const html = `
      <html>
        <head>
          <title>${claim.title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #0f172a; }
            h1 { font-size: 20px; margin-bottom: 8px; }
            .meta { font-size: 12px; color: #475569; margin-bottom: 16px; }
            .line { margin: 6px 0; }
          </style>
        </head>
        <body>
          <h1>${claim.title}</h1>
          <div class="meta">Submitted by ${claim.createdBy} • ${new Date(claim.createdAt).toLocaleString('en-IN')}</div>
          <div class="line">Amount: ₹${payload.amount}</div>
          <div class="line">Description: ${payload.description}</div>
          <div class="line">Status: ${claim.status}</div>
          ${payload.billFileName ? `<div class="line">Receipt: ${payload.billFileName}</div>` : ''}
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

  const viewClaimFile = async (claim: any, source: 'uploadedFile' | 'filledFormFile', closeDetails = false) => {
    const file = await loadClaimFile(claim, source);
    if (!file) return;
    setViewingFile({
      ...file,
      base64: file.base64.startsWith('data:')
        ? file.base64
        : `data:${file.type || 'application/octet-stream'};base64,${file.base64}`,
    });
      if (closeDetails) setSelectedClaim(null);
  };

  const periodClaims = taClaims.filter((claim) => requestIsInReportingPeriod(claim, period, selectedDate));
  const filteredClaims = periodClaims.filter((claim) =>
    ['pending', 'forwarded'].includes(claim.status) &&
    canActOnRequest(claim) &&
    (
      claim.createdBy.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (claim.payload?.description || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const getTotalAmount = () => {
    return filteredClaims.reduce((sum, claim) => sum + Number(claim.payload?.amount || 0), 0);
  };

  const handleExportToExcel = () => {
    try {
      if (filteredClaims.length === 0) {
        toast.error('No data to export');
        return;
      }

      const exportData = filteredClaims.map(toRequestExportRow);

      const dateStamp = new Date().toISOString().split('T')[0];
      exportToExcel(exportData, requestTrackingColumns, `TA_Claims_${dateStamp}`);
      toast.success('Allowance claims exported to Excel');
    } catch (error) {
      toast.error('Failed to export data');
      console.error(error);
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
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Pending Allowance Approvals</h1>
          <p className="text-slate-600">Claims awaiting your approval, with employee name and claim details</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search by employee or description..."
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Filter size={20} className="mt-2 text-slate-500" />
            <p className="py-2 text-sm font-medium text-slate-700">Pending approvals assigned to you</p>
          </div>
          <Button
            onClick={handleExportToExcel}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            disabled={periodClaims.length === 0}
          >
            <Download size={18} className="mr-2" />
            Download Excel
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="bg-yellow-50 p-4 border-l-4 border-yellow-500">
            <p className="text-sm text-slate-600">Pending Claims</p>
            <p className="text-2xl font-bold text-yellow-600">
              {periodClaims.filter((r) => r.status === 'pending' || r.status === 'forwarded').length}
            </p>
          </Card>
          <Card className="bg-green-50 p-4 border-l-4 border-green-500">
            <p className="text-sm text-slate-600">Approved</p>
            <p className="text-2xl font-bold text-green-600">
              {periodClaims.filter((r) => r.status === 'approved').length}
            </p>
          </Card>
          <Card className="bg-red-50 p-4 border-l-4 border-red-500">
            <p className="text-sm text-slate-600">Rejected</p>
            <p className="text-2xl font-bold text-red-600">
              {periodClaims.filter((r) => r.status === 'rejected').length}
            </p>
          </Card>
          <Card className="bg-purple-50 p-4 border-l-4 border-purple-500">
            <p className="text-sm text-slate-600">Total Amount</p>
            <p className="text-2xl font-bold text-purple-600">₹{getTotalAmount().toLocaleString()}</p>
          </Card>
          <Card className="bg-blue-50 p-4 border-l-4 border-blue-500">
            <p className="text-sm text-slate-600">Total Claims</p>
            <p className="text-2xl font-bold text-blue-600">{periodClaims.length}</p>
          </Card>
        </div>

        <div className="space-y-4">
          {filteredClaims.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-slate-600">No allowance claims found</p>
            </Card>
          ) : (
            filteredClaims.map((claim) => (
              <Card
                key={claim.id}
                className={`p-6 border-l-4 ${
                  claim.status === 'pending' || claim.status === 'forwarded'
                    ? 'border-yellow-500 bg-yellow-50'
                    : claim.status === 'approved'
                    ? 'border-green-500 bg-green-50'
                    : 'border-red-500 bg-red-50'
                }`}
              >
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
                  <div>
                    <p className="text-xs text-slate-600 mb-1">EMPLOYEE</p>
                    <p className="text-sm font-semibold text-slate-900">{claim.createdBy}</p>
                    <p className="text-xs font-mono text-slate-500">Employee ID: {claim.createdByEmployeeId || claim.payload?.id || 'Not Set'}</p>
                    <p className="text-xs text-slate-500">{claim.createdByDesignation || 'Employee'}</p>
                    <p className="text-xs text-slate-500">Team: {claim.createdByDepartment || claim.payload?.department || 'Not Set'}</p>
                    <p className="text-xs text-slate-500">Phone: {claim.createdByPhone || claim.payload?.phone || 'Not Set'}</p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-600 mb-1">AMOUNT</p>
                    <div className="flex items-center gap-1">
                      <p className="text-xl font-bold text-slate-900">₹{Number(claim.payload?.amount || 0).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <p className="text-xs text-slate-600 mb-1">DESCRIPTION</p>
                    <p className="text-sm text-slate-700">{claim.payload?.description}</p>
                    {(claim.payload?.filledFormFileName || claim.payload?.billFileName) && <div className="mt-2 space-y-1">
                      {claim.payload?.filledFormFileName && <p className="text-xs text-slate-500">Form: {claim.payload.filledFormFileName}</p>}
                      {claim.payload?.billFileName && <p className="text-xs text-slate-500">Proofs: {claim.payload.billFileName}</p>}
                    </div>}
                  </div>

                  <div>
                    <p className="text-xs text-slate-600 mb-1">STATUS</p>
                    <div className="flex items-center gap-2 mb-3">
                      {getStatusIcon(claim.status)}
                      <span
                        className={`text-sm font-semibold ${
                          claim.status === 'pending'
                            ? 'text-yellow-600'
                            : claim.status === 'approved'
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}
                      >
                        {claim.status.charAt(0).toUpperCase() + claim.status.slice(1)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{new Date(claim.createdAt).toLocaleDateString('en-IN')}</p>
                  </div>
                </div>

                <RequestApprovalDetails request={claim} />

                {canActOnRequest(claim) && (
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2">
                        <textarea
                          placeholder="Add a review note or comment..."
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={2}
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2 flex-col justify-end">
                        <Button size="sm" variant="outline" className="w-full" onClick={() => setSelectedClaim(claim)}>
                          <Eye size={14} className="mr-1" /> View
                        </Button>
                        {claim.uploadedFile && (
                          <Button size="sm" variant="outline" className="w-full" onClick={() => viewClaimFile(claim, 'uploadedFile')}>
                            <FileDown size={14} className="mr-1" /> View Bill / Receipt
                          </Button>
                        )}
                        {claim.uploadedFile && (
                          <Button size="sm" variant="outline" className="w-full" onClick={() => downloadUploadedFile(claim)}>
                            <FileDown size={14} className="mr-1" /> Download Bill / Receipt
                          </Button>
                        )}
                        {claim.payload?.filledFormFile && (
                          <Button size="sm" variant="outline" className="w-full" onClick={() => viewClaimFile(claim, 'filledFormFile')}>
                            <FileDown size={14} className="mr-1" /> View Filled Form
                          </Button>
                        )}
                        {claim.payload?.filledFormFile && (
                          <Button size="sm" variant="outline" className="w-full" onClick={() => downloadUploadedFile(claim, 'filledFormFile')}>
                            <FileDown size={14} className="mr-1" /> Download Filled Form
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="w-full" onClick={() => downloadRequestPdf(claim)}>
                          <FileDown size={14} className="mr-1" /> Summary
                        </Button>
                        <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white w-full" onClick={() => handleApprove(claim.id)}>
                          Approve
                        </Button>
                        <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white w-full" onClick={() => handleReject(claim.id)}>
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                {claim.status !== 'pending' && (
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setSelectedClaim(claim)}>
                      <Eye size={14} className="mr-1" /> View
                    </Button>
                    {claim.uploadedFile && (
                      <Button size="sm" variant="outline" onClick={() => viewClaimFile(claim, 'uploadedFile')}>
                        <FileDown size={14} className="mr-1" /> View Bill / Receipt
                      </Button>
                    )}
                    {claim.uploadedFile && (
                      <Button size="sm" variant="outline" onClick={() => downloadUploadedFile(claim)}>
                        <FileDown size={14} className="mr-1" /> Download Bill / Receipt
                      </Button>
                    )}
                    {claim.payload?.filledFormFile && (
                      <Button size="sm" variant="outline" onClick={() => viewClaimFile(claim, 'filledFormFile')}>
                        <FileDown size={14} className="mr-1" /> View Filled Form
                      </Button>
                    )}
                    {claim.payload?.filledFormFile && (
                      <Button size="sm" variant="outline" onClick={() => downloadUploadedFile(claim, 'filledFormFile')}>
                        <FileDown size={14} className="mr-1" /> Download Filled Form
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => downloadRequestPdf(claim)}>
                      <FileDown size={14} className="mr-1" /> Summary
                    </Button>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      </div>

      {selectedClaim && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="bg-white w-full max-w-lg p-6 space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Allowance Claim Details</h2>
            <div className="space-y-2 text-sm text-slate-700">
              <p><strong>Employee:</strong> {selectedClaim.createdBy}</p>
              <p><strong>Amount:</strong> ₹{selectedClaim.payload?.amount}</p>
              <p><strong>Description:</strong> {selectedClaim.payload?.description}</p>
              <p><strong>Status:</strong> {selectedClaim.status}</p>
              {selectedClaim.payload?.billFileName && <p><strong>Receipt:</strong> {selectedClaim.payload.billFileName}</p>}
              {selectedClaim.uploadedFile && (
                <p><strong>Bill / receipt:</strong> {selectedClaim.uploadedFile.name}</p>
              )}
              {selectedClaim.payload?.filledFormFile && (
                <p><strong>Filled form:</strong> {selectedClaim.payload.filledFormFile.name}</p>
              )}
            </div>
            <div className="flex gap-2">
              {selectedClaim.uploadedFile && (
                <Button
                  variant="outline"
                  onClick={() => viewClaimFile(selectedClaim, 'uploadedFile', true)}
                  className="flex-1"
                >
                  View Bill / Receipt
                </Button>
              )}
              {selectedClaim.payload?.filledFormFile && (
                <Button
                  variant="outline"
                  onClick={() => viewClaimFile(selectedClaim, 'filledFormFile', true)}
                  className="flex-1"
                >
                  View Filled Form
                </Button>
              )}
              <Button variant="outline" onClick={() => setSelectedClaim(null)} className="flex-1">
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}

      <FileViewerModal file={viewingFile} onClose={() => setViewingFile(null)} />
    </MainLayout>
  );
}

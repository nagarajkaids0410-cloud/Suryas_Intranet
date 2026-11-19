'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/main-layout';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/lib/auth-context';
import { RequestApprovalDetails } from '@/components/request-approval-details';
import { Button } from '@/components/ui/button';
import { exportToExcel, requestTrackingColumns, toRequestExportRow } from '@/lib/excel-export';
import { toast } from 'sonner';
import { requestIsInReportingPeriod, useReportingPeriod } from '@/lib/reporting-period';

const typeLabels: Record<string, string> = {
  leave: 'Leave',
  proposal: 'Project',
  ta: 'Allowance',
  report: 'Report',
  'attendance-report': 'Attendance Report',
  certificate: 'Certificate',
  relieving: 'Relieving letter',
};

export default function MyRequestsPage() {
  const { isAuthenticated, user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { period, selectedDate } = useReportingPeriod();
  const router = useRouter();
  const [requests, setRequests] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [requestedRequestId, setRequestedRequestId] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    const searchParams = new URLSearchParams(window.location.search);
    const requestedType = searchParams.get('type');
    if (requestedType && typeLabels[requestedType]) setFilter(requestedType);
    setRequestedRequestId(searchParams.get('requestId') || '');

    let active = true;
    const fetchRequests = async () => {
      try {
        const response = await fetch('/api/requests?target=all&mine=true&compact=true');
        if (!response.ok) throw new Error('Unable to load your requests');
        const data = await response.json();
        if (!active) return;
        setRequests(data.requests || []);
        setLoadError('');
      } catch (error) {
        console.error('My requests fetch failed:', error);
        if (active) setLoadError('Could not load your requests. Please refresh the page.');
      }
    };

    fetchRequests();
    return () => {
      active = false;
    };
  }, [isAuthenticated, router, user?.id]);

  const availableRequests = useMemo(
    () => requests.filter((request) => !isAdmin || !['certificate', 'relieving'].includes(request.type)),
    [isAdmin, requests]
  );
  const visibleRequests = useMemo(
    () => availableRequests.filter((request) =>
      (filter === 'all' || request.type === filter) &&
      (request.id === requestedRequestId || requestIsInReportingPeriod(request, period, selectedDate))
    ),
    [availableRequests, filter, period, selectedDate, requestedRequestId]
  );

  useEffect(() => {
    if (!requestedRequestId || !visibleRequests.some((request) => request.id === requestedRequestId)) return;
    document.getElementById(`my-request-${requestedRequestId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [requestedRequestId, visibleRequests]);

  const downloadOfficialDocument = async (request: any) => {
    let officialDocument = request.officialDocument;
    if (!officialDocument?.base64) {
      try {
        const response = await fetch(`/api/requests?target=all&requestId=${encodeURIComponent(request.id)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load the official document');
        officialDocument = data.request?.officialDocument;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to load the official document');
        return;
      }
    }
    if (!officialDocument?.base64) return toast.error('Official document is unavailable');
    const link = document.createElement('a');
    link.href = officialDocument.base64;
    link.download = officialDocument.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleExport = () => {
    try {
      exportToExcel(visibleRequests.map(toRequestExportRow), requestTrackingColumns, 'my-requests');
    } catch (error) {
      console.error('My requests export failed:', error);
      toast.error(error instanceof Error ? error.message : 'Unable to export requests');
    }
  };

  if (!isAuthenticated) return <div>Loading...</div>;

  return (
    <MainLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">My Requests</h1>
          </div>
          <Button onClick={handleExport} disabled={visibleRequests.length === 0}>Export to Excel</Button>
        </header>

        <div className="flex flex-wrap gap-2">
          {[
            ['all', 'All requests'],
            ['leave', 'Leave'],
            ['proposal', 'Project'],
            ['ta', 'Allowance'],
            ['report', 'Report'],
            ['attendance-report', 'Attendance'],
            ...(!isAdmin ? [['certificate', 'Certificates'], ['relieving', 'Relieving Letters']] : []),
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full border px-4 py-2 text-sm ${
                filter === value ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loadError && <Card className="border-red-200 bg-red-50 p-4 text-red-800">{loadError}</Card>}
        {visibleRequests.length === 0 ? (
          <Card className="p-8 text-center text-slate-600">
            {availableRequests.length === 0 ? 'You have not submitted any requests yet.' : 'No requests match this filter.'}
          </Card>
        ) : (
          <div className="space-y-4">
            {visibleRequests.map((request) => (
              <Card id={`my-request-${request.id}`} key={request.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                      {(typeLabels[request.type] || request.type).replace(/\b\w/g, (letter: string) => letter.toUpperCase())}
                    </span>
                    <h2 className="mt-1 text-lg font-bold text-slate-900">{request.title}</h2>
                    {request.type === 'leave' && (
                      <p className="text-sm text-slate-600">
                        {request.payload?.leaveType || 'Leave'} · {request.payload?.fromDate || '—'} to {request.payload?.toDate || '—'}
                      </p>
                    )}
                    {request.type === 'proposal' && (
                      <p className="text-sm text-slate-600">
                        {request.payload?.projectTitle || 'Project proposal'}
                        {request.payload?.clientOrganization ? ` · ${request.payload.clientOrganization}` : ''}
                      </p>
                    )}
                    {request.type === 'ta' && (
                      <p className="text-sm text-slate-600">₹{Number(request.payload?.amount || 0).toLocaleString()} · {request.payload?.description || 'Allowance claim'}</p>
                    )}
                    {request.type === 'report' && (
                      <p className="text-sm text-slate-600">
                        {request.payload?.reportFrequency || 'Report'}
                        {request.payload?.periodLabel ? ` · ${request.payload.periodLabel}` : ''}
                        {request.payload?.description ? ` · ${request.payload.description}` : ''}
                      </p>
                    )}
                    {request.type === 'leave' && request.payload?.reason && (
                      <p className="mt-2 text-sm text-slate-700">Reason: {request.payload.reason}</p>
                    )}
                    {(request.type === 'certificate' || request.type === 'relieving') && request.payload?.purpose && (
                      <p className="mt-2 text-sm text-slate-700">Purpose: {request.payload.purpose}</p>
                    )}
                    {request.type === 'proposal' && request.payload?.description && (
                      <p className="mt-2 text-sm text-slate-700">Description: {request.payload.description}</p>
                    )}
                    {request.type === 'attendance-report' && request.payload?.description && (
                      <p className="mt-2 text-sm text-slate-700">Description: {request.payload.description}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      Employee ID: {request.createdByEmployeeId || request.payload?.id || 'Not Set'}
                      {' · '}{request.createdByDesignation || request.payload?.designation || 'Designation not set'}
                      {' · Team: '}{request.createdByDepartment || request.payload?.department || 'Not Set'}
                      {' · Phone: '}{request.createdByPhone || request.payload?.phone || 'Not Set'}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-sm font-semibold ${
                    request.status === 'approved'
                      ? 'bg-green-100 text-green-800'
                      : request.status === 'rejected'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-amber-100 text-amber-800'
                  }`}>
                    {request.status === 'forwarded'
                      ? 'In Approval Workflow'
                      : String(request.status).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}
                  </span>
                </div>
                <RequestApprovalDetails request={request} />
                {request.officialDocument && (
                  <button
                    type="button"
                    className="mt-3 inline-flex rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
                    onClick={() => downloadOfficialDocument(request)}
                  >
                    Download official PDF · issued by {request.officialDocument.issuedBy}
                  </button>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/main-layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircle, XCircle, Clock, Trash2, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import FileViewerModal from '@/components/file-viewer-modal';
import { RequestApprovalDetails } from '@/components/request-approval-details';
import * as XLSX from 'xlsx';
import { getReportingPeriodRange, isInReportingPeriod, requestIsInReportingPeriod, useReportingPeriod } from '@/lib/reporting-period';

function displayApproverName(value: string) {
  const names: Record<string, string> = {
    hareeshv: 'Hareesh V',
    santhanakumarv: 'Santhana Kumar V',
    gkbharath: 'Golla Kumar Bharath',
  };
  return names[value.toLowerCase()] || value;
}

function displayRequestApprover(request: any, value: string) {
  const chain: string[] = Array.isArray(request.payload?.approvalChain) ? request.payload.approvalChain : [];
  const index = chain.findIndex((username) => username.toLowerCase() === value.toLowerCase());
  return request.payload?.approvalChainDisplayNames?.[index] || displayApproverName(value);
}

function cleanProjectValue(value: unknown): string {
  const text = String(value ?? '').trim();
  const normalized = text.toLowerCase().replace(/^[\s-]+|[\s-]+$/g, '');
  return ['na', 'n/a', 'not applicable'].includes(normalized) ? '' : text;
}

function getRequestApprovalNotes(request: any) {
  if (!Array.isArray(request.payload?.comments)) return '';
  return request.payload.comments
    .map((comment: any) => {
      const by = comment.byDisplayName || displayApproverName(comment.by || 'Approver');
      const chain: string[] = Array.isArray(request.payload?.approvalChain) ? request.payload.approvalChain : [];
      const stageIndex = Number.isInteger(comment.stageIndex)
        ? comment.stageIndex
        : chain.findIndex((username) => username.toLowerCase() === String(comment.by || '').toLowerCase());
      const decision = comment.decision === 'approve'
        ? stageIndex >= 0 && stageIndex < chain.length - 1 ? 'Approved & Forwarded' : 'Approved'
        : comment.decision === 'reject'
          ? 'Rejected'
          : comment.decision === 'recommend'
            ? 'Recommended'
            : comment.decision || 'Reviewed';
      return `${by}: ${decision}${comment.comment ? ` — ${comment.comment}` : ''}`;
    })
    .join(' | ');
}

function getRequestDetails(request: any): string {
  const payload = request.payload || {};
  if (request.type === 'report') {
    const frequency = payload.reportFrequency || payload.reportType;
    const period = frequency === 'weekly'
      ? `Report date: ${payload.reportDate || payload.periodStartDate || '—'}`
      : `Report period: ${payload.periodLabel || '—'}`;
    const attachments = [
      ...(Array.isArray(payload.attachments) ? payload.attachments : []),
      ...(request.uploadedFile ? [request.uploadedFile] : []),
    ].map((file: any) => file.name).filter(Boolean).join(', ');
    return [frequency, period, attachments && `Attachments: ${attachments}`].filter(Boolean).join('; ');
  }
  if (request.type === 'proposal') {
    return [
      payload.projectTitle && `Project: ${payload.projectTitle}`,
      cleanProjectValue(payload.clientOrganization) && `Client: ${cleanProjectValue(payload.clientOrganization)}`,
      payload.projectAmount && `Value: INR ${Number(payload.projectAmount).toLocaleString('en-IN')}`,
      request.uploadedFile?.name && `File: ${request.uploadedFile.name}`,
    ].filter(Boolean).join('; ');
  }
  if (request.type === 'leave') {
    return `${payload.leaveType || 'Leave'}: ${payload.fromDate || '—'} to ${payload.toDate || payload.fromDate || '—'}`;
  }
  if (request.type === 'ta') {
    return `Allowance: INR ${Number(payload.amount || 0).toLocaleString('en-IN')}`;
  }
  return '';
}

interface RetentionWorkflowView {
  nextRunAt: string;
  cycle?: {
    id: string;
    status: 'pending' | 'resetting' | 'approved' | 'rejected';
    requestedAt: string;
    archiveCreatedAt?: string;
    completedAt?: string;
    archiveFile: string;
    approvalChain: string[];
    currentApproverIndex: number;
    decisions: { username: string; decision: string; comment: string; at: string }[];
  };
}

export default function AdminDashboard() {
  const { isAuthenticated, user } = useAuth();
  const { period: attendancePeriod, setPeriod: setAttendancePeriod, selectedDate, setSelectedDate } = useReportingPeriod();
  const router = useRouter();
  const isFounder = user?.role === 'founder' || user?.username?.toLowerCase() === 'gkbharath' || user?.id === 'founder-001';
  const canViewDashboardTasks = ['admin', 'founder', 'managing-partner'].includes(user?.role || '');
  const canViewTeamAttendance = user?.role === 'founder' &&
    user?.username?.toLowerCase() === 'gkbharath' &&
    user?.id === 'founder-001';
  const canReviewAccessRequests = ['hareeshv', 'santhanakumarv', 'gkbharath'].includes(user?.username || '');
  const canViewRetention = ['admin', 'founder', 'managing-partner'].includes(user?.role || '');
  const isRetentionApprover = ['hareeshv', 'santhanakumarv', 'gkbharath'].includes(user?.username?.toLowerCase() || '');

  const [requests, setRequests] = useState<any[]>([]);
  const [requestFilterUsers, setRequestFilterUsers] = useState<any[]>([]);
  const [founderRequests, setFounderRequests] = useState<any[]>([]);
  const lastFounderReportCount = useRef(0);

  const [guestLogins, setGuestLogins] = useState<any[]>([]);
  const [guestInquiries, setGuestInquiries] = useState<any[]>([]);
  const [viewingFile, setViewingFile] = useState<any>(null);
  const [accessRequests, setAccessRequests] = useState<any[]>([]);
  const [accessHistory, setAccessHistory] = useState<any[]>([]);
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [companyLedger, setCompanyLedger] = useState<{ balance: number; transactions: any[] }>({
    balance: 0,
    transactions: [],
  });
  const [teamAttendance, setTeamAttendance] = useState<any[]>([]);
  const [retentionWorkflow, setRetentionWorkflow] = useState<RetentionWorkflowView>();
  const [retentionComment, setRetentionComment] = useState('');
  const [dashboardTasks, setDashboardTasks] = useState<any[]>([]);
  const [teamAttendanceError, setTeamAttendanceError] = useState('');
  const [selectedRequestUserId, setSelectedRequestUserId] = useState('');
  const attendanceRange = selectedDate
    ? { fromDate: selectedDate, toDate: selectedDate }
    : getReportingPeriodRange(attendancePeriod);
  const historicalRequestUsers = Array.from(
    new Map(
      requests
        .filter((request) => request.createdById || request.createdByUsername || request.createdBy)
        .map((request) => [
          request.createdById || request.createdByUsername || request.createdBy,
          {
            id: request.createdById || request.createdByUsername || request.createdBy,
            name: request.createdBy || request.createdByUsername || request.createdById,
            employeeId: request.createdByEmployeeId || '',
          },
        ])
    ).values()
  );
  const requestUsers = Array.from(
    new Map(
    [
      ...requestFilterUsers.map((account) => ({
        id: account.id,
        name: account.fullName || account.username || account.id,
        employeeId: account.employeeId || '',
        status: account.status || 'unknown',
      })),
      ...historicalRequestUsers.map((requestUser) => ({
        ...requestUser,
        status: '',
      })),
    ].map((account) => [account.id, account])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));
  const isRequestInSelectedRange = (request: any) => requestIsInReportingPeriod(request, attendancePeriod, selectedDate);
  const requestsInPeriod = requests.filter(isRequestInSelectedRange);
  const allowanceClaimsInPeriod = requestsInPeriod.filter((request) => request.type === 'ta');
  const founderRequestsInPeriod = founderRequests.filter(isRequestInSelectedRange);
  const periodRequests = requestsInPeriod.filter((request) =>
    !selectedRequestUserId ||
    (request.createdById || request.createdByUsername || request.createdBy) === selectedRequestUserId
  );
  const requestActivityGroups = [
    { title: 'Leave Requests', types: ['leave'] },
    { title: 'Allowance Requests', types: ['ta'] },
    { title: 'Report Requests', types: ['report'] },
    { title: 'Internal Requests', types: ['internal-service'] },
    { title: 'Project Proposals', types: ['proposal'] },
    { title: 'Attendance Reports', types: ['attendance-report'] },
    { title: 'Certificate & Relieving Requests', types: ['certificate', 'relieving'] },
  ].map((group) => ({
    ...group,
    requests: periodRequests.filter((request) => group.types.includes(request.type)),
  })).filter((group) => group.requests.length > 0);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  const fetchRequests = async () => {
    try {
      const response = await fetch('/api/requests?target=all&scope=dashboard&compact=true');
      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests || []);
        setFounderRequests(data.requests || []);
        if (isFounder) {
          const internReports = (data.requests || []).filter(
            (req: any) => req.type === 'report' && (req.createdByDesignation || '').toLowerCase().includes('intern')
          );
          if (internReports.length > lastFounderReportCount.current) {
            toast.success('New intern report submitted');
            lastFounderReportCount.current = internReports.length;
          }
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchRequests();
    const interval = setInterval(fetchRequests, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, isFounder, user]);

  useEffect(() => {
    if (!isAuthenticated || !canViewTeamAttendance) return;
    const fetchTeamAttendance = async () => {
      try {
        const params = new URLSearchParams({
          scope: 'team',
          fromDate: attendanceRange.fromDate,
          toDate: attendanceRange.toDate,
        });
        const response = await fetch(`/api/attendance?${params.toString()}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load team attendance');
        setTeamAttendance(data.records || []);
        setTeamAttendanceError('');
      } catch (error) {
        console.error('Team attendance fetch failed:', error);
        setTeamAttendanceError(error instanceof Error ? error.message : 'Unable to load team attendance');
      }
    };
    fetchTeamAttendance();
    const interval = setInterval(() => {
      fetchTeamAttendance();
    }, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, canViewTeamAttendance, attendanceRange.fromDate, attendanceRange.toDate]);

  useEffect(() => {
    if (!isAuthenticated || !canViewDashboardTasks) return;
    let active = true;
    const fetchDashboardTasks = async () => {
      try {
        const response = await fetch('/api/tasks');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load tasks');
        if (active) setDashboardTasks(data.tasks || []);
      } catch (error) {
        console.error('Dashboard task fetch failed:', error);
        if (active) toast.error(error instanceof Error ? error.message : 'Unable to load tasks');
      }
    };
    fetchDashboardTasks();
    const interval = setInterval(fetchDashboardTasks, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isAuthenticated, canViewDashboardTasks]);

  const periodTasks = dashboardTasks.filter((task) =>
    isInReportingPeriod(task.createdAt, attendancePeriod, selectedDate) ||
    isInReportingPeriod(task.updatedAt, attendancePeriod, selectedDate) ||
    isInReportingPeriod(task.deadline, attendancePeriod, selectedDate)
  );

  const retentionApproverName = (username: string) => {
    return displayApproverName(username);
  };

  const decideRetention = async (action: 'approve' | 'reject') => {
    if (!retentionWorkflow?.cycle) return;
    try {
      const response = await fetch('/api/admin/data-retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, comment: retentionComment.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to process archive approval');
      setRetentionWorkflow(data.workflow);
      setRetentionComment('');
      toast.success(action === 'approve' ? 'Archive approval recorded' : 'Archive reset rejected');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to process archive approval');
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !canViewRetention) return;
    let active = true;
    const fetchRetentionWorkflow = async () => {
      try {
        const response = await fetch('/api/admin/data-retention');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load archive status');
        if (active) setRetentionWorkflow(data.workflow);
      } catch (error) {
        console.error('Retention status fetch failed:', error);
      }
    };
    fetchRetentionWorkflow();
    const interval = setInterval(fetchRetentionWorkflow, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isAuthenticated, canViewRetention]);

  useEffect(() => {
    if (!isAuthenticated || !canViewTeamAttendance) return;
    const fetchRequestFilterUsers = async () => {
      try {
        const response = await fetch('/api/admin/users?scope=request-filter');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load users');
        setRequestFilterUsers(data.users || []);
      } catch (error) {
        console.error('Request filter user fetch failed:', error);
        toast.error(error instanceof Error ? error.message : 'Unable to load users for request filtering');
      }
    };
    fetchRequestFilterUsers();
  }, [isAuthenticated, canViewTeamAttendance]);

  const exportPeriodData = () => {
    const workbook = XLSX.utils.book_new();
    const periodLabel = `${attendanceRange.fromDate} to ${attendanceRange.toDate}`;
    const requestRows = periodRequests.map((request) => ({
      'Submitted on': request.createdAt ? new Date(request.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
      'Request type': request.type || '',
      'Request title': request.title || '',
      'Submitted by': request.createdBy || '',
      'Employee ID': request.createdByEmployeeId || request.payload?.id || '',
      'Department / team': request.createdByDepartment || request.payload?.department || '',
      'Status': request.status || '',
      'Current approver': displayRequestApprover(request, request.forwardedTo || request.payload?.approvalChain?.[request.payload?.currentApproverIndex ?? 0] || ''),
      'Amount (INR)': request.payload?.amount || request.payload?.projectAmount
        ? Number(request.payload.amount || request.payload.projectAmount)
        : '',
      'Request details': getRequestDetails(request),
      'Description': request.payload?.description || request.payload?.reportContent || request.description || '',
      'Remarks': request.remarks || request.payload?.remarks || '',
      'Approval remarks': getRequestApprovalNotes(request),
    }));
    const attendanceRows = teamAttendance.map((record) => ({
      'Date': record.date || '',
      'Employee': record.fullName || '',
      'Employee ID': record.employeeId || '',
      'Username': record.username || '',
      'Check-in': record.checkIn ? new Date(record.checkIn).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
      'Check-out': record.checkOut ? new Date(record.checkOut).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Not checked out',
      'Attendance status': record.checkOut ? 'Checked out' : 'Checked in',
    }));
    const taskRows = periodTasks.map((task) => ({
      'Task': task.title || '',
      'Description': task.description || '',
      'Assigned to': task.assignedToName || '',
      'Created on': task.createdAt ? new Date(task.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
      'Deadline': task.deadline || '',
      'Status': String(task.status || '').replaceAll('_', ' '),
      'Progress': `${task.progress ?? 0}%`,
    }));
    const summaryRows = [
      ['SURYAS MiB ENTERPRISES', 'Request & Attendance Report'],
      ['Reporting period', periodLabel],
      ['Request filter', selectedRequestUserId
        ? requestUsers.find((requestUser) => requestUser.id === selectedRequestUserId)?.name || 'Selected user'
        : 'All users'],
      ['Generated at (IST)', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })],
      ['Total requests', periodRequests.length],
      ['Approved requests', periodRequests.filter((request) => request.status === 'approved').length],
      ['Pending / forwarded requests', periodRequests.filter((request) => ['pending', 'forwarded'].includes(request.status)).length],
      ['Rejected requests', periodRequests.filter((request) => request.status === 'rejected').length],
      ['Other status requests', periodRequests.filter((request) => !['approved', 'pending', 'forwarded', 'rejected'].includes(request.status)).length],
      ['Attendance records', attendanceRows.length],
      ['Tasks', taskRows.length],
      ['Checked out', attendanceRows.filter((record) => record['Attendance status'] === 'Checked out').length],
      ['Still checked in', attendanceRows.filter((record) => record['Attendance status'] === 'Checked in').length],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    summarySheet['!cols'] = [{ wch: 32 }, { wch: 42 }];
    summarySheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    summarySheet['!rows'] = [{ hpt: 28 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Report Summary');

    const addDataSheet = (
      rows: Record<string, string | number>[],
      name: string,
      headers: string[],
      widths: number[],
    ) => {
      const sheet = XLSX.utils.aoa_to_sheet([
        headers,
        ...rows.map((row) => headers.map((header) => row[header] ?? '')),
      ]);
      sheet['!cols'] = widths.map((wch) => ({ wch }));
      if (headers.length) {
        sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headers.length - 1 } }) };
      }
      XLSX.utils.book_append_sheet(workbook, sheet, name);
    };
    addDataSheet(requestRows, 'Requests & Approvals', [
      'Submitted on',
      'Request type',
      'Request title',
      'Submitted by',
      'Employee ID',
      'Department / team',
      'Status',
      'Current approver',
      'Amount (INR)',
      'Request details',
      'Description',
      'Remarks',
      'Approval remarks',
    ], [22, 20, 34, 24, 16, 24, 16, 24, 16, 40, 38, 38, 48]);
    addDataSheet(attendanceRows, 'Attendance', [
      'Date',
      'Employee',
      'Employee ID',
      'Username',
      'Check-in',
      'Check-out',
      'Attendance status',
    ], [15, 26, 16, 20, 18, 18, 20]);
    addDataSheet(taskRows, 'Tasks', [
      'Task',
      'Description',
      'Assigned to',
      'Created on',
      'Deadline',
      'Status',
      'Progress',
    ], [32, 50, 24, 24, 16, 18, 14]);
    XLSX.writeFile(workbook, `SURYAS_Request_Attendance_${attendanceRange.fromDate}_to_${attendanceRange.toDate}.xlsx`);
  };

  useEffect(() => {
    if (user?.role !== 'admin') return;
    const fetchLedger = async () => {
      try {
        const response = await fetch('/api/company-ledger');
        if (!response.ok) return;
        const data = await response.json();
        if (data.ledger) {
          setCompanyLedger({
            balance: Number(data.ledger.balance || 0),
            transactions: data.ledger.transactions || [],
          });
        }
      } catch (error) {
        console.error('Company ledger fetch error:', error);
      }
    };
    fetchLedger();
    const interval = setInterval(fetchLedger, 15000);
    return () => clearInterval(interval);
  }, [user]);

  const exportApprovalRecords = () => {
    if (user?.role !== 'admin') {
      return;
    }

    const exportItems = requestsInPeriod.filter((req) =>
      req.type === 'leave' || req.type === 'ta' || req.type === 'proposal'
    );

    if (exportItems.length === 0) {
      toast.error('No approval records to export');
      return;
    }

    const statusLabel = (status: string) => {
      if (status === 'approved') return 'Approved';
      if (status === 'rejected') return 'Rejected';
      return 'Pending';
    };

    const typeLabel = (type: string) => {
      if (type === 'leave') return 'Leave';
      if (type === 'ta') return 'Allowance Claim';
      return 'Proposal';
    };

    const reasonValue = (req: any) => {
      if (req.type === 'leave') {
        const reason = req.payload?.reason || '';
        return req.payload?.isPastDateRequest ? `Past-date leave: ${reason}` : reason;
      }
      if (req.type === 'ta') {
        return req.payload?.description || '';
      }
      return req.payload?.projectTitle || req.payload?.abstract || '';
    };

    const csvEscape = (value: string) => {
      const text = value ?? '';
      const needsQuotes = /[",\n]/.test(text);
      const escaped = String(text).replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    };

    const headers = ['User Name', 'Request Type', 'Reason', 'Status', 'Applied On'];
    const rows = exportItems.map((req) => [
      req.createdBy || '',
      typeLabel(req.type),
      reasonValue(req),
      statusLabel(req.status),
      req.createdAt ? new Date(req.createdAt).toLocaleString('en-IN') : '',
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `approval-records-${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const fetchAccessRequests = async () => {
    if (!canReviewAccessRequests) return;
    setLoadingAccess(true);
    try {
      const response = await fetch('/api/admin/access-requests?includeHistory=true');
      if (!response.ok) return;
      const data = await response.json();
      setAccessRequests(data.requests || []);
      setAccessHistory(data.history || []);
    } catch (error) {
      console.error('Access request fetch error:', error);
    } finally {
      setLoadingAccess(false);
    }
  };

  useEffect(() => {
    fetchAccessRequests();
    const interval = setInterval(fetchAccessRequests, 30000);
    return () => clearInterval(interval);
  }, [user, canReviewAccessRequests]);

  // Load guest logins from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('guestLogins');
    if (stored) {
      try {
        setGuestLogins(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse guest logins:', e);
      }
    }
  }, []);

  useEffect(() => {
    const fetchInquiries = async () => {
      try {
        const response = await fetch('/api/guest-inquiries', { headers: { 'x-user-role': user?.role || '', 'x-user-id': user?.id || '' } });
        if (!response.ok) return;
        const data = await response.json();
        setGuestInquiries(data.inquiries || []);
      } catch (error) {
        console.error('Failed to fetch guest inquiries:', error);
      }
    };

    fetchInquiries();
    const interval = setInterval(fetchInquiries, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleRequestAction = (requestId: string, action: 'approve' | 'reject') => {
    void requestId;
    void action;
    router.push('/admin/approvals');
  };

  const canActOnRequest = (request: any) => {
    const payload = request.payload || {};
    const chain = Array.isArray(payload.approvalChain) ? payload.approvalChain : [];
    const index = request.status === 'forwarded'
      ? payload.currentApproverIndex
      : request.status === 'pending'
        ? 0
        : -1;
    return Number.isInteger(index) && chain[index] === user?.username?.toLowerCase();
  };

  const handleInquiryStatusChange = (inquiryId: string, newStatus: string) => {
    setGuestInquiries(prev => 
      prev.map(inquiry => 
        inquiry.id === inquiryId ? { ...inquiry, status: newStatus } : inquiry
      )
    );
  };

  const handleDeleteInquiry = (inquiryId: string) => {
    setGuestInquiries(prev => prev.filter(inquiry => inquiry.id !== inquiryId));
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
            h2 { font-size: 14px; margin-top: 20px; }
            .meta { font-size: 12px; color: #475569; margin-bottom: 16px; }
            .section { margin-top: 16px; }
            .line { margin: 6px 0; }
            .footer { margin-top: 32px; font-size: 12px; color: #64748b; }
          </style>
        </head>
        <body>
          <h1>${request.title}</h1>
          <div class="meta">Submitted by ${request.createdBy} • ${new Date(request.createdAt).toLocaleString('en-IN')}</div>
          <div class="section">
            <h2>Requester Details</h2>
            <div class="line">Name: ${request.createdBy}</div>
            <div class="line">Employee ID: ${request.createdByEmployeeId || request.payload?.id || '-'}</div>
            <div class="line">Designation: ${request.createdByDesignation || '-'}</div>
            <div class="line">Team Name: ${request.createdByDepartment || request.payload?.department || '-'}</div>
            <div class="line">Phone: ${request.createdByPhone || request.payload?.phone || '-'}</div>
            <div class="line">Role: ${request.createdByRole || '-'}</div>
          </div>
          <div class="section">
            <h2>Request Information</h2>
            ${Object.entries(payload)
              .map(([key, value]) => `<div class="line">${key}: ${value ?? '-'}</div>`)
              .join('')}
          </div>
          <div class="footer">Official Letter - Proposal Intranet System</div>
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

  const loadRequestFile = async (request: any, source: 'uploadedFile' | 'attachment', index = 0) => {
    const getFile = (item: any) => source === 'uploadedFile'
      ? item.uploadedFile
      : item.payload?.attachments?.[index];
    let file = getFile(request);
    if (!file) {
      toast.error('No file available');
      return undefined;
    }
    if (!file.base64) {
      try {
        const response = await fetch(`/api/requests?target=all&scope=dashboard&requestId=${encodeURIComponent(request.id)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load file');
        file = getFile(data.request);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to load file');
        return undefined;
      }
    }
    if (!file?.base64) {
      toast.error('No file available');
      return undefined;
    }
    return file;
  };

  const viewRequestFile = async (request: any, source: 'uploadedFile' | 'attachment', index = 0) => {
    const file = await loadRequestFile(request, source, index);
    if (!file) return;
    setViewingFile({
      ...file,
      base64: file.base64.startsWith('data:')
        ? file.base64
        : `data:${file.type || 'application/octet-stream'};base64,${file.base64}`,
    });
  };

  const downloadUploadedFile = async (request: any) => {
    const file = await loadRequestFile(request, 'uploadedFile');
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

  if (!isAuthenticated) {
    return <div>Loading...</div>;
  }

  return (
    <MainLayout>
      <div className="max-w-7xl space-y-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Admin Management — {user?.fullName || user?.username} - {user?.designation || user?.role}
            </h1>
          </div>
          {user?.role === 'admin' && (
            <Button
              variant="outline"
              className="border-slate-300"
              onClick={exportApprovalRecords}
            >
              Export Records
            </Button>
          )}
        </div>


        {/* Quick Stats */}
        <div>
          <h3 className="text-xl font-bold text-slate-900 mb-4">Dashboard Overview</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="bg-white p-6 border-l-4 border-yellow-500 hover:shadow-lg transition">
              <p className="text-slate-600 text-sm">Pending Leave Requests</p>
              <p className="text-3xl font-bold text-slate-900">{requestsInPeriod.filter((r) => r.type === 'leave' && (r.status === 'pending' || r.status === 'forwarded')).length}</p>
              <p className="text-xs text-yellow-600 mt-2">Action required</p>
            </Card>
            <Card className="bg-white p-6 border-l-4 border-orange-500 hover:shadow-lg transition">
              <p className="text-slate-600 text-sm">Pending Allowance Claims</p>
              <p className="text-3xl font-bold text-slate-900">{requestsInPeriod.filter((r) => r.type === 'ta' && (r.status === 'pending' || r.status === 'forwarded')).length}</p>
              <p className="text-xs text-orange-600 mt-2">Under review</p>
            </Card>
            <Card className="bg-white p-6 border-l-4 border-blue-500 hover:shadow-lg transition">
              <p className="text-slate-600 text-sm">Total Requests</p>
              <p className="text-3xl font-bold text-slate-900">{requestsInPeriod.length}</p>
              <p className="text-xs text-blue-600 mt-2">{user?.role === 'admin' || isFounder ? 'All submissions' : 'Requests visible to you'}</p>
            </Card>
            <Card className="bg-white p-6 border-l-4 border-red-500 hover:shadow-lg transition">
              <p className="text-slate-600 text-sm">Guest Inquiries</p>
              <p className="text-3xl font-bold text-slate-900">{guestInquiries.filter(i => i.status === 'new').length}</p>
              <p className="text-xs text-red-600 mt-2">Unread messages</p>
            </Card>
            <Card className="bg-white p-6 border-l-4 border-green-500 hover:shadow-lg transition">
              <p className="text-slate-600 text-sm">Guest Visitors</p>
              <p className="text-3xl font-bold text-slate-900">{guestLogins.length}</p>
              <p className="text-xs text-green-600 mt-2">Total visits</p>
            </Card>
          </div>
        </div>

        {user?.role === 'admin' && (
          <Card className="bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Company Ledger</h2>
                <p className="text-sm text-slate-600">Credits and debits from approvals</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Total Available Amount</p>
                <p className="text-2xl font-bold text-slate-900">₹{companyLedger.balance.toLocaleString()}</p>
              </div>
            </div>
            {companyLedger.transactions.length === 0 ? (
              <p className="text-sm text-slate-600">No transactions recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-slate-900">Date</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-900">Purpose</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-900">Amount</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-900">Type</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-900">Balance After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companyLedger.transactions.map((txn) => (
                      <tr key={txn.id} className="border-b border-slate-100">
                        <td className="px-4 py-3 text-slate-700">
                          {new Date(txn.date).toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          <div className="font-medium text-slate-900">{txn.purpose}</div>
                          {txn.remarks && (
                            <div className="text-xs text-slate-500">{txn.remarks}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700">₹{Number(txn.amount).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded font-medium ${
                            txn.type === 'credited'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {txn.type === 'credited' ? 'Credited' : 'Debited'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">₹{Number(txn.balanceAfter).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {canReviewAccessRequests && (
          <Card id="access-requests" className="bg-white p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">User Access Requests</h2>
            {loadingAccess && <p className="text-sm text-slate-600">Loading requests...</p>}
            {!loadingAccess && accessRequests.length === 0 && (
              <p className="text-sm text-slate-600">No pending access requests.</p>
            )}
            {!loadingAccess && accessRequests.length > 0 && (
              <div className="space-y-3">
                {accessRequests.map((request) => (
                  <div key={request.id} className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{request.fullName}</p>
                      <p className="text-xs text-slate-500">Employee ID: {request.employeeId || 'Not Set'}</p>
                      <p className="text-xs text-slate-500">
                        {request.designation || 'Designation not set'}
                        {' · Team: '}{request.department || 'Not Set'}
                        {' · Phone: '}{request.phone || 'Not Set'}
                      </p>
                      <p className="text-xs text-slate-500">{request.email}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Requested: {new Date(request.requestedAt).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-xs"
                        onClick={() => router.push('/admin/approvals')}
                      >
                        Review in Approvals
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loadingAccess && accessHistory.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-3">Past Requests</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold text-slate-900">Name</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-900">Email</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-900">Status</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-900">Requested</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-900">Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accessHistory.map((entry) => {
                        const decisionAt = entry.approvedAt || entry.rejectedAt || entry.requestedAt;
                        const statusClass = entry.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800';
                        return (
                          <tr key={entry.id} className="border-b border-slate-100">
                            <td className="px-4 py-3 text-slate-900">{entry.fullName}</td>
                            <td className="px-4 py-3 text-slate-700">{entry.email}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 text-xs rounded font-medium ${statusClass}`}>
                                {entry.status === 'active' ? 'Approved' : 'Rejected'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {entry.requestedAt ? new Date(entry.requestedAt).toLocaleString('en-IN') : '-'}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {decisionAt ? new Date(decisionAt).toLocaleString('en-IN') : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Leave Requests */}
        <Card className="bg-white p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Leave Requests</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Person</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Leave Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Request Status</th>
                </tr>
              </thead>
              <tbody>
                {requestsInPeriod.filter((req) => req.type === 'leave').map((request) => (
                  <tr key={request.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-900">{request.createdBy}</td>
                    <td className="px-4 py-3 text-slate-900">
                      {request.payload.fromDate || request.payload.toDate || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 text-xs rounded font-medium ${
                          request.status === 'pending' || request.status === 'forwarded'
                            ? 'bg-yellow-100 text-yellow-800'
                            : request.status === 'approved'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Guest Activity Log */}
        <Card className="bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              Guest Activity Log
            </h2>
            {guestLogins.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm('Are you sure you want to clear all guest activity history?')) {
                    localStorage.removeItem('guestLogins');
                    setGuestLogins([]);
                    toast.success('Guest activity history cleared');
                  }
                }}
              >
                Clear History
              </Button>
            )}
          </div>
          {guestLogins.length === 0 ? (
            <p className="text-sm text-slate-600">No guest visits recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-slate-900">Guest Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-900">Email</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-900">Company</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-900">Visit Date</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-900">Visit Time</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-900">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {guestLogins.map((guest) => (
                    <tr key={guest.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-900 font-medium">{guest.name}</td>
                      <td className="px-4 py-3 text-slate-900">{guest.email || 'N/A'}</td>
                      <td className="px-4 py-3 text-slate-900">{guest.companyName || 'N/A'}</td>
                      <td className="px-4 py-3 text-slate-900">{guest.visitDate}</td>
                      <td className="px-4 py-3 text-slate-900">{guest.visitTime}</td>
                      <td className="px-4 py-3 text-slate-700 max-w-xs truncate">{guest.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* TA Claims */}
        <Card className="bg-white p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Allowance Claims</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Employee</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Amount (₹)</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Description</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Status</th>
                </tr>
              </thead>
              <tbody>
                {allowanceClaimsInPeriod.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No allowance claims for this period.</td></tr>
                ) : allowanceClaimsInPeriod.map((claim) => (
                  <tr key={claim.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-900">
                      <p>{claim.createdBy}</p>
                      {claim.payload?.id && <p className="text-xs font-mono text-slate-500">{claim.payload.id}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-900 font-semibold">{claim.payload.amount}</td>
                    <td className="px-4 py-3 text-slate-900">
                      <p className="truncate">{claim.payload.description}</p>
                      <RequestApprovalDetails request={claim} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 text-xs rounded font-medium ${
                          claim.status === 'pending' || claim.status === 'forwarded'
                            ? 'bg-yellow-100 text-yellow-800'
                            : claim.status === 'approved'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {claim.status.charAt(0).toUpperCase() + claim.status.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Proposal Requests */}
        <Card className="bg-white p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Proposal Requests</h2>
          <div className="space-y-3">
            {requestsInPeriod.filter((req) => req.type === 'proposal').length === 0 ? (
              <p className="text-sm text-slate-500">No proposal requests for this period.</p>
            ) : requestsInPeriod.filter((req) => req.type === 'proposal').map((req) => (
              <div key={req.id} className="border rounded-lg p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{req.payload?.projectTitle || req.title}</p>
                    <p className="text-xs text-slate-500">From: {req.createdBy || 'Unknown'}{req.createdByDesignation ? ` · ${req.createdByDesignation}` : ''}</p>
                    {[cleanProjectValue(req.payload?.clientOrganization || req.payload?.clientName), req.payload?.projectAmount && `₹${Number(req.payload.projectAmount).toLocaleString('en-IN')}`].filter(Boolean).length > 0 && (
                      <p className="mt-1 text-sm text-slate-700">
                        {[cleanProjectValue(req.payload?.clientOrganization || req.payload?.clientName), req.payload?.projectAmount && `₹${Number(req.payload.projectAmount).toLocaleString('en-IN')}`].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {req.payload?.clientEmail && <p className="text-xs text-slate-500">Client: {req.payload.clientEmail}</p>}
                  </div>
                  <div className="text-right">
                    <span className={`rounded px-2 py-1 text-xs font-medium ${req.status === 'approved' ? 'bg-green-100 text-green-800' : req.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                      {req.status === 'forwarded' ? 'In approval workflow' : String(req.status).replaceAll('_', ' ')}
                    </span>
                    <p className="mt-2 text-xs text-slate-500">{new Date(req.createdAt).toLocaleString('en-IN')}</p>
                  </div>
                </div>
                {req.remarks && <p className="mt-2 text-sm text-slate-600">Remarks: {req.remarks}</p>}
                <RequestApprovalDetails request={req} />
                <div className="flex flex-wrap gap-2 mt-3">
                  {req.uploadedFile && (
                    <Button size="sm" variant="outline" onClick={() => viewRequestFile(req, 'uploadedFile')}>
                      View proposal: {req.uploadedFile.name}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Report Requests */}
        <Card className="bg-white p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Reports</h2>
          <div className="space-y-3">
            {requestsInPeriod.filter((req) => req.type === 'report').length === 0 ? (
              <p className="text-sm text-slate-500">No reports submitted for this period.</p>
            ) : requestsInPeriod.filter((req) => req.type === 'report').map((req) => (
              <div key={req.id} className="border rounded-lg p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{req.title}</p>
                    <p className="text-xs text-slate-500">From: {req.createdBy || 'Unknown'}{req.createdByDesignation ? ` · ${req.createdByDesignation}` : ''}</p>
                    <p className="mt-1 text-sm text-slate-700">
                      {req.payload?.reportFrequency || req.payload?.reportType || 'Report'} · {(req.payload?.reportFrequency || req.payload?.reportType) === 'weekly'
                        ? `Date: ${req.payload?.reportDate || req.payload?.periodStartDate || '—'}`
                        : `Period: ${req.payload?.periodLabel || '—'}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`rounded px-2 py-1 text-xs font-medium ${req.status === 'approved' ? 'bg-green-100 text-green-800' : req.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                      {req.status === 'forwarded' ? 'In approval workflow' : String(req.status).replaceAll('_', ' ')}
                    </span>
                    <p className="mt-2 text-xs text-slate-500">{new Date(req.createdAt).toLocaleString('en-IN')}</p>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{req.payload?.description || req.payload?.reportContent || 'No report description provided.'}</p>
                {req.remarks && <p className="mt-2 text-sm text-slate-600">Remarks: {req.remarks}</p>}
                <RequestApprovalDetails request={req} />
                <div className="flex flex-wrap gap-2 mt-3">
                  {[...(Array.isArray(req.payload?.attachments) ? req.payload.attachments : []), ...(req.uploadedFile ? [req.uploadedFile] : [])].map((file: any, index: number) => (
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
            ))}
          </div>
        </Card>

        {isFounder && (
          <Card className="bg-white p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Requests Awaiting Your Approval</h2>
            <div className="space-y-3">
              {founderRequestsInPeriod.filter((req) => canActOnRequest(req)).length === 0 && (
                <p className="text-sm text-slate-600">No requests are currently awaiting your approval.</p>
              )}
              {founderRequestsInPeriod
                .filter((req) => canActOnRequest(req))
                .map((req) => (
                <div key={req.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{req.title}</p>
                      <p className="text-xs text-slate-500">{req.createdBy} • {req.createdByDesignation || ''}</p>
                      <p className="text-xs text-slate-500">
                        Employee ID: {req.createdByEmployeeId || req.payload?.id || 'Not Set'}
                        {' · Team: '}{req.createdByDepartment || req.payload?.department || 'Not Set'}
                        {' · Phone: '}{req.createdByPhone || req.payload?.phone || 'Not Set'}
                      </p>
                    </div>
                    <span className="text-xs text-slate-500">{new Date(req.createdAt).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {req.uploadedFile && (
                      <Button size="sm" variant="outline" onClick={() => viewRequestFile(req, 'uploadedFile')}>
                        {req.type === 'ta' ? 'View Bill / Receipt' : 'View Form'}
                      </Button>
                    )}
                    {req.uploadedFile && (
                      <Button size="sm" variant="outline" onClick={() => downloadUploadedFile(req)}>
                        {req.type === 'ta' ? 'Download Bill / Receipt' : 'Download Form'}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => downloadRequestPdf(req)}>
                      <FileDown size={14} className="mr-1" /> PDF
                    </Button>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleRequestAction(req.id, 'approve')}>
                      Review in Approvals
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Guest Inquiries */}
        <Card className="bg-white p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            Guest Inquiries & Messages
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Guest Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Subject</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Message</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Date & Time</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-900">Action</th>
                </tr>
              </thead>
              <tbody>
                {guestInquiries.map((inquiry) => (
                  <tr key={inquiry.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-900 font-medium">{inquiry.guestName}</td>
                    <td className="px-4 py-3 text-slate-900 font-semibold">{inquiry.subject}</td>
                    <td className="px-4 py-3 text-slate-700 max-w-xs truncate">{inquiry.message}</td>
                    <td className="px-4 py-3 text-slate-900 text-xs">
                      {inquiry.date} <br /> {inquiry.time}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 text-xs rounded font-medium ${
                          inquiry.status === 'new'
                            ? 'bg-red-100 text-red-800'
                            : inquiry.status === 'read'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {inquiry.status.charAt(0).toUpperCase() + inquiry.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 flex gap-2">
                      {inquiry.status === 'new' && (
                        <Button
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700 text-xs"
                          onClick={() => handleInquiryStatusChange(inquiry.id, 'read')}
                        >
                          Mark Read
                        </Button>
                      )}
                      {inquiry.status !== 'resolved' && (
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-xs"
                          onClick={() => handleInquiryStatusChange(inquiry.id, 'resolved')}
                        >
                          Resolve
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        className="text-xs"
                        onClick={() => handleDeleteInquiry(inquiry.id)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {canViewTeamAttendance && (
          <Card className="bg-white p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Attendance, Requests & Approvals</h2>
                <p className="text-sm text-slate-600">
                  {selectedDate ? `Selected Date: ${selectedDate}` : `${attendanceRange.fromDate} – ${attendanceRange.toDate}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm text-slate-600">Date
                  <input
                    type="date"
                    aria-label="Filter attendance and requests by date"
                    className="ml-2 rounded-md border border-slate-300 bg-white px-3 py-2"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                  />
                </label>
                {selectedDate && (
                  <Button variant="outline" onClick={() => setSelectedDate('')}>Clear Date</Button>
                )}
                <select
                  aria-label="Report period"
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={attendancePeriod}
                  onChange={(event) => setAttendancePeriod(event.target.value as typeof attendancePeriod)}
                >
                  <option value="this-month">This month</option>
                  <option value="previous-month">Previous month</option>
                  <option value="last-three-months">Past 3 months</option>
                </select>
                <select
                  aria-label="Filter requests by user"
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={selectedRequestUserId}
                  onChange={(event) => setSelectedRequestUserId(event.target.value)}
                >
                  <option value="">Requests: all users</option>
                  {requestUsers.map((requestUser) => (
                    <option key={requestUser.id} value={requestUser.id}>
                      {requestUser.name}
                      {requestUser.employeeId ? ` (${requestUser.employeeId})` : ''}
                      {requestUser.status && requestUser.status !== 'active' ? ` — ${requestUser.status.replaceAll('_', ' ')}` : ''}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  onClick={exportPeriodData}
                  disabled={teamAttendanceError !== ''}
                >
                  <FileDown size={16} className="mr-2" /> Export Excel
                </Button>
              </div>
            </div>
            {teamAttendanceError ? (
              <p className="text-sm text-red-600">{teamAttendanceError}</p>
            ) : teamAttendance.length === 0 ? (
              <p className="text-sm text-slate-500">No attendance records for this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-2">Date</th>
                      <th className="py-2">Employee</th>
                      <th>Employee ID</th>
                      <th>Check-in</th>
                      <th>Check-out</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamAttendance.map((record) => (
                      <tr key={record.id} className="border-b last:border-0">
                        <td className="py-3">{record.date}</td>
                        <td className="font-medium text-slate-900">{record.fullName}</td>
                        <td>{record.employeeId || '—'}</td>
                        <td>{new Date(record.checkIn).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                        <td>{record.checkOut ? new Date(record.checkOut).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'}</td>
                        <td>
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${record.checkOut ? 'bg-slate-100 text-slate-700' : 'bg-green-100 text-green-700'}`}>
                            {record.checkOut ? 'Checked out' : 'Checked in'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-8">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-900">Requests & Approval Activity</h3>
                <p className="text-sm text-slate-500">
                  {periodRequests.length} request(s){selectedRequestUserId ? ' for selected user' : ''}
                </p>
              </div>
              {periodRequests.length === 0 ? (
                <p className="text-sm text-slate-500">No requests or approvals for this selection.</p>
              ) : (
                <div className="space-y-5">
                  {requestActivityGroups.map((group) => (
                    <section key={group.title} className="space-y-2">
                      <h4 className="text-base font-semibold text-slate-900">{group.title}</h4>
                      <div className="space-y-3">
                        {group.requests.map((request) => {
                          const currentApprover = request.forwardedTo || request.payload?.approvalChain?.[request.payload?.currentApproverIndex ?? 0];
                          return (
                            <Card key={request.id} className="p-4">
                              <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                                <p><strong>Request:</strong> {request.title}</p>
                                <p><strong>Request ID:</strong> {request.id}</p>
                                <p><strong>Submitted By:</strong> {request.createdBy || '—'}</p>
                                <p><strong>Submitted:</strong> {request.createdAt ? new Date(request.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'}</p>
                                <p><strong>Status:</strong> {String(request.status || '—').replace(/\b\w/g, (letter: string) => letter.toUpperCase())}</p>
                                <p><strong>Current Approver:</strong> {currentApprover ? displayRequestApprover(request, String(currentApprover)) : '—'}</p>
                                {request.type === 'leave' && <p><strong>Leave Type:</strong> {request.payload?.leaveType || '—'}</p>}
                                {request.type === 'leave' && <p><strong>Leave Date:</strong> {request.payload?.fromDate || request.payload?.toDate || '—'}</p>}
                                {request.type === 'proposal' && <p><strong>Project Title:</strong> {request.payload?.projectTitle || '—'}</p>}
                                {request.type === 'proposal' && cleanProjectValue(request.payload?.clientOrganization) && <p><strong>Client Organization:</strong> {cleanProjectValue(request.payload?.clientOrganization)}</p>}
                                {request.type === 'proposal' && request.payload?.projectAmount && <p><strong>Project Value:</strong> ₹{Number(request.payload.projectAmount).toLocaleString('en-IN')}</p>}
                                {request.type === 'ta' && <p><strong>Amount:</strong> ₹{Number(request.payload?.amount || 0).toLocaleString('en-IN')}</p>}
                                {(request.payload?.reportFrequency || request.payload?.reportType) && <p><strong>Report Frequency:</strong> {request.payload?.reportFrequency || request.payload?.reportType}</p>}
                                {(request.payload?.reportFrequency || request.payload?.reportType) === 'weekly' && <p><strong>Report Date:</strong> {request.payload?.reportDate || request.payload?.periodLabel || request.payload?.periodStartDate || '—'}</p>}
                                {(request.payload?.reportFrequency || request.payload?.reportType) === 'monthly' && <p><strong>Report Period:</strong> {request.payload?.periodLabel || '—'}</p>}
                                {(request.payload?.description || request.payload?.reportContent || request.description) && <p className="sm:col-span-2"><strong>Description:</strong> {request.payload?.description || request.payload?.reportContent || request.description}</p>}
                                {request.payload?.reason && <p className="sm:col-span-2"><strong>Reason:</strong> {request.payload.reason}</p>}
                                {(request.remarks || request.payload?.remarks) && <p className="sm:col-span-2"><strong>Remarks:</strong> {request.remarks || request.payload?.remarks}</p>}
                                {getRequestApprovalNotes(request) && <p className="sm:col-span-2"><strong>Approval Notes:</strong> {getRequestApprovalNotes(request)}</p>}
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-8">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-900">Tasks</h3>
                <p className="text-sm text-slate-500">{periodTasks.length} task(s) in this period</p>
              </div>
              {periodTasks.length === 0 ? (
                <p className="text-sm text-slate-500">No tasks in this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-slate-500">
                        <th className="py-2">Task</th>
                        <th>Description</th>
                        <th>Assigned to</th>
                        <th>Deadline</th>
                        <th>Status</th>
                        <th>Progress</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periodTasks.map((task) => (
                        <tr key={task.id} className="border-b last:border-0">
                          <td className="py-3 font-medium text-slate-900">{task.title}</td>
                          <td className="max-w-sm whitespace-pre-wrap">{task.description || '—'}</td>
                          <td>{task.assignedToName || '—'}</td>
                          <td>{task.deadline || '—'}</td>
                          <td className="capitalize">{String(task.status || '—').replaceAll('_', ' ')}</td>
                          <td>{task.progress ?? 0}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        )}

        {canViewDashboardTasks && !canViewTeamAttendance && (
          <Card className="bg-white p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-bold text-slate-900">Task Status</h2>
              <span className="text-sm text-slate-500">{periodTasks.length} task(s) in this period</span>
            </div>
            {periodTasks.length === 0 ? (
              <p className="text-sm text-slate-500">No tasks in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-2">Task</th>
                      <th>Assigned to</th>
                      <th>Deadline</th>
                      <th>Status</th>
                      <th>Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodTasks.map((task) => (
                      <tr key={task.id} className="border-b last:border-0">
                        <td className="py-3 font-medium text-slate-900">{task.title}</td>
                        <td>{task.assignedToName || '—'}</td>
                        <td>{task.deadline || '—'}</td>
                        <td className="capitalize">{String(task.status || '—').replaceAll('_', ' ')}</td>
                        <td>{task.progress ?? 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {canViewRetention && (
          <section className="mt-8">
            <Card className="p-5">
              <details>
                <summary className="cursor-pointer text-lg font-semibold text-slate-900">90-Day Data Archive and Reset</summary>
                {retentionWorkflow?.cycle ? (
                  <div className="mt-4 space-y-3 text-sm text-slate-700">
                    <p className="font-medium">Status: {retentionWorkflow.cycle.status}</p>
                    <p>Archive created: {new Date(retentionWorkflow.cycle.archiveCreatedAt || retentionWorkflow.cycle.requestedAt).toLocaleString('en-IN')}</p>
                    <p>Approval requested: {new Date(retentionWorkflow.cycle.requestedAt).toLocaleString('en-IN')}</p>
                    <p>Next cycle: {new Date(retentionWorkflow.nextRunAt).toLocaleString('en-IN')}</p>
                    <p>Archive location: .data/archives/{retentionWorkflow.cycle.archiveFile}</p>
                    <p>Approval route: {retentionWorkflow.cycle.approvalChain.map(retentionApproverName).join(' → ')}</p>
                    {retentionWorkflow.cycle.decisions.map((decision, index) => (
                      <p key={`${retentionWorkflow.cycle?.id}-${index}`}>
                        {retentionApproverName(decision.username)}: {decision.decision} · {decision.comment}
                      </p>
                    ))}
                    <a className="inline-block font-medium text-blue-700 underline" href="/api/admin/data-retention/archive">
                      Download {retentionWorkflow.cycle.archiveFile}
                    </a>
                    {retentionWorkflow.cycle.status === 'pending' && isRetentionApprover &&
                      retentionWorkflow.cycle.approvalChain[retentionWorkflow.cycle.currentApproverIndex]?.toLowerCase() === user?.username?.toLowerCase() && (
                        <div className="space-y-2">
                          <textarea
                            className="block w-full rounded-md border p-2"
                            rows={2}
                            placeholder="Decision remarks"
                            value={retentionComment}
                            onChange={(event) => setRetentionComment(event.target.value)}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => decideRetention('approve')}>Approve / Forward</Button>
                            <Button size="sm" variant="destructive" onClick={() => decideRetention('reject')}>Reject Reset</Button>
                          </div>
                        </div>
                      )}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-600">
                    No archive cycle has started. Next scheduled cycle: {new Date(retentionWorkflow?.nextRunAt || '2026-10-01T00:00:00+05:30').toLocaleString('en-IN')}.
                  </p>
                )}
              </details>
            </Card>
          </section>
        )}

      </div>
      <FileViewerModal file={viewingFile} onClose={() => setViewingFile(null)} />
    </MainLayout>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/main-layout';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { exportToExcel, requestTrackingColumns, toRequestExportRow } from '@/lib/excel-export';
import { toast } from 'sonner';
import { RequestApprovalDetails } from '@/components/request-approval-details';
import { isReportSubmissionRestricted } from '@/lib/report-access';
import { isInReportingPeriod, useReportingPeriod } from '@/lib/reporting-period';
import { isValidDocumentFile, STANDARD_DOCUMENT_MAX_BYTES } from '@/lib/document-upload';
import { getIsoWeekParts, resolveReportPeriod } from '@/lib/report-period';

interface Report {
  id: string;
  submissionId?: string;
  type: 'report';
  title: string;
  createdBy: string;
  createdByEmployeeId?: string;
  createdByDesignation?: string;
  createdByDepartment?: string;
  createdByPhone?: string;
  createdAt: string;
  status: string;
  remarks?: string;
  payload: {
    [key: string]: any;
    description: string;
    reportFrequency: 'weekly' | 'monthly';
    reportDate?: string;
    attachments?: Array<{ name: string; size: number; type: string; base64: string }>;
  };
}

export default function ReportsPage() {
  const { user } = useAuth();
  const { period, selectedDate } = useReportingPeriod();
  const currentWeek = getIsoWeekParts();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [remarks, setRemarks] = useState('');
  const [reportFrequency, setReportFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [reportYear, setReportYear] = useState(currentWeek.year);
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
  const [weeklyPeriodDate, setWeeklyPeriodDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });
  const [attachments, setAttachments] = useState<File[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState<'all' | 'weekly' | 'monthly'>('all');
  const [loading, setLoading] = useState(false);
  const selectedWeek = getIsoWeekParts(new Date(`${weeklyPeriodDate}T00:00:00`));
  const reportPeriod = resolveReportPeriod({
    frequency: reportFrequency,
    mode: 'period',
    year: reportFrequency === 'weekly' ? selectedWeek.year : reportYear,
    month: reportMonth,
    week: selectedWeek.week,
  });
  const periodYears = Array.from({ length: 5 }, (_, index) => currentWeek.year - 2 + index);
  const periodReports = reports.filter((report) => isInReportingPeriod(report.createdAt, period, selectedDate));

  useEffect(() => {
    fetchReports();
  }, [user?.id, filter]);

  function handleExport() {
    try {
      exportToExcel(periodReports.map(toRequestExportRow), requestTrackingColumns, 'my-reports');
    } catch (error) {
      console.error('Report export failed:', error);
      toast.error(error instanceof Error ? error.message : 'Unable to export reports');
    }
  }

  async function fetchReports() {
    setLoading(true);
    try {
      const query = filter !== 'all' ? `?frequency=${filter}` : '';
      const res = await fetch(`/api/reports${query}`, {
        headers: {
          'x-user-role': user?.role || '',
          'x-user-id': user?.id || '',
          'x-user-username': user?.username || '',
        },
      });
      const data = await res.json();
      if (data?.success) {
        setReports(data.reports || []);
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list) return;
    const selected = Array.from(list);
    if (!selected.every((file) => isValidDocumentFile(file, ['pdf'], STANDARD_DOCUMENT_MAX_BYTES))) {
      e.target.value = '';
      alert('Report attachments must be PDF files up to 5 MB each');
      return;
    }
    setAttachments(selected);
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
    if (!title.trim() || !description.trim()) {
      return alert('Title and description are required');
    }
    if (!user?.phone?.trim()) return alert('Add a phone number to your profile before submitting a report');
    if (!reportPeriod) return alert('Choose a valid month, week, or date range for this report');

    const encodedAttachments = await Promise.all(attachments.map((f) => toBase64(f)));

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': user?.role || '',
          'x-user-id': user?.id || '',
          'x-user-username': user?.username || '',
        },
        body: JSON.stringify({
          title,
          description,
          reportFrequency,
          reportPeriodMode: 'period',
          reportYear: reportFrequency === 'weekly' ? selectedWeek.year : reportYear,
          reportMonth,
          reportWeek: selectedWeek.week,
          reportDate: reportFrequency === 'weekly' ? weeklyPeriodDate : undefined,
          periodStartDate: reportPeriod.fromDate,
          periodEndDate: reportPeriod.toDate,
          periodLabel: reportPeriod.label,
          attachments: encodedAttachments,
          remarks,
        }),
      });

      const data = await res.json();
      if (data?.success) {
        setTitle('');
        setDescription('');
        setRemarks('');
        setAttachments([]);
        setReportFrequency('weekly');
        fetchReports();
        alert(`${reportFrequency === 'weekly' ? 'Weekly' : 'Monthly'} report for ${reportPeriod.label} submitted successfully!`);
      } else {
        alert('Failed to submit report: ' + (data?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error submitting report:', error);
      alert('Failed to submit report');
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

  const isAuthorized = Boolean(
    user &&
    user.role !== 'managing-partner' &&
    user.role !== 'guest' &&
    !isReportSubmissionRestricted(user.username)
  );

  if (!isAuthorized) {
    return (
      <MainLayout>
        <div className="max-w-2xl p-4">
          <h1 className="text-2xl font-bold mb-4">Reports</h1>
          <p className="text-slate-600">You do not have permission to access this page.</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Submit Report</h1>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link href="/admin/approvals?type=report">Report approvals</Link></Button>
            <Button onClick={handleExport} disabled={periodReports.length === 0}>Export to Excel</Button>
          </div>
        </div>

        {/* Report Submission Form */}
        <form onSubmit={handleSubmit} className="space-y-4 mb-8 p-4 border rounded bg-slate-50">
          <h2 className="text-lg font-semibold mb-4">Submit New Report</h2>
          <p className="text-sm text-slate-600">Phone Number *: {user?.phone || 'Update your profile phone number'}</p>

          <div>
            <label className="block text-sm font-medium text-slate-700">Report Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border rounded p-2 mt-1"
              placeholder="e.g., Weekly Team Status"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Description *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border rounded p-2 mt-1"
              rows={4}
              placeholder="Provide report details..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Applicant Remarks</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full border rounded p-2 mt-1"
              rows={3}
              placeholder="Explain the purpose and context of this report"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Report Frequency *</label>
            <select
              value={reportFrequency}
              onChange={(e) => setReportFrequency(e.target.value as 'weekly' | 'monthly')}
              className="w-full border rounded p-2 mt-1"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {reportFrequency === 'weekly' ? (
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="weekly-period-date">Report Period Date *</label>
              <input
                id="weekly-period-date"
                required
                type="date"
                value={weeklyPeriodDate}
                onChange={(event) => setWeeklyPeriodDate(event.target.value)}
                className="mt-1 w-full rounded border p-2"
              />
            </div>
          ) : (
            <p className="text-sm font-medium text-slate-700">Choose the report month and year.</p>
          )}

          {reportFrequency === 'monthly' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-slate-700">Month
                <select value={reportMonth} onChange={(event) => setReportMonth(Number(event.target.value))} className="mt-1 block w-full rounded border p-2">
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                    <option key={month} value={month}>{new Intl.DateTimeFormat('en-IN', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2020, month - 1, 1)))}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-slate-700">Year
                <select value={reportYear} onChange={(event) => setReportYear(Number(event.target.value))} className="mt-1 block w-full rounded border p-2">
                  {periodYears.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>
            </div>
          )}

          {reportFrequency === 'weekly' && <p className="text-sm text-slate-600">Report date: {weeklyPeriodDate}</p>}
          {reportFrequency === 'monthly' && reportPeriod && <p className="text-sm text-slate-600">Report period: {reportPeriod.label}</p>}

          <div>
            <label className="block text-sm font-medium text-slate-700">Attachments</label>
            <input
              type="file"
              multiple
              onChange={handleFileChange}
              className="mt-2"
              accept=".pdf,application/pdf"
            />
            {attachments.length > 0 && (
              <div className="mt-2 text-sm text-slate-600">
                {attachments.length} file(s) selected
              </div>
            )}
          </div>

          <div>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700"
            >
              Submit Report
            </button>
          </div>
        </form>

        <div>
          <h2 className="text-lg font-semibold mb-1">Report History</h2>
          <p className="mb-4 text-sm text-slate-600">Check each report’s approval status and decision history below.</p>

          <div className="mb-4 flex gap-2">
            {['all', 'weekly', 'monthly'].map((f) => (
              <button
                key={f}
                onClick={() => {
                  setFilter(f as any);
                }}
                className={`px-3 py-1 rounded text-sm font-medium ${
                  filter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {f === 'all' ? 'All' : f === 'weekly' ? 'Weekly' : 'Monthly'}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-slate-600">Loading reports...</div>
          ) : periodReports.length === 0 ? (
            <div className="text-slate-600">No reports submitted yet.</div>
          ) : (
            <div className="space-y-3">
              {periodReports.map((report) => (
                <div key={report.id} className="p-4 border rounded">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-semibold text-lg">{report.title}</div>
                      <div className="text-sm text-slate-600">
                        {report.createdBy} • {new Date(report.createdAt).toLocaleString()}
                      </div>
                      <div className="text-xs text-slate-500">
                        Employee ID: {report.createdByEmployeeId || 'Not Set'}
                        {' · '}{report.createdByDesignation || 'Designation not set'}
                        {' · Team: '}{report.createdByDepartment || 'Not Set'}
                        {' · Phone: '}{report.createdByPhone || 'Not Set'}
                      </div>
                      <div className="mt-1">
                        <span className={`px-2 py-1 text-xs rounded font-medium ${
                          report.payload.reportFrequency === 'weekly'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}>
                          {report.payload.reportFrequency === 'weekly' ? 'Weekly' : 'Monthly'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {report.payload.reportFrequency === 'weekly'
                          ? `Report date: ${report.payload.reportDate || report.payload.periodStartDate || 'Not set'}`
                          : `Report period: ${report.payload.periodLabel || 'Not set'}`}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 p-2 bg-slate-50 rounded text-sm text-slate-700">
                    {report.payload.description}
                  </div>
                  {report.payload.attachments && report.payload.attachments.length > 0 && (
                    <div className="mt-2">
                      <div className="text-xs font-medium text-slate-600 mb-1">Attachments:</div>
                      <div className="flex flex-wrap gap-2">
                        {report.payload.attachments.map((att: any, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => downloadFile(att.base64, att.name, att.type)}
                            className="px-2 py-1 text-xs bg-white border rounded text-blue-600 hover:bg-blue-50"
                          >
                            {att.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <RequestApprovalDetails request={report} />
                    </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}

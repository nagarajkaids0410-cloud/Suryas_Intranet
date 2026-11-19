import * as XLSX from 'xlsx';

export interface ExportRow {
  [key: string]: any;
}

export interface RequestExportable {
  id: string;
  type: string;
  title: string;
  createdBy: string;
  createdByEmployeeId?: string;
  createdByDesignation?: string;
  createdByDepartment?: string;
  createdByPhone?: string;
  createdAt: string;
  status: string;
  remarks?: string;
  forwardedTo?: string;
  payload?: Record<string, any>;
}

const approverDisplayNames: Record<string, string> = {
  hareeshv: 'Hareesh V',
  santhanakumarv: 'Santhana Kumar V',
  gkbharath: 'Golla Kumar Bharath',
};

export const requestTrackingColumns = [
  { key: 'requestId', header: 'Request ID' },
  { key: 'applicant', header: 'Applicant' },
  { key: 'employeeId', header: 'Employee ID' },
  { key: 'designation', header: 'Designation' },
  { key: 'teamName', header: 'Team Name' },
  { key: 'phone', header: 'Phone' },
  { key: 'requestType', header: 'Request Type' },
  { key: 'details', header: 'Request Details' },
  { key: 'amount', header: 'Amount (INR)' },
  { key: 'status', header: 'Status' },
  { key: 'pendingApprover', header: 'Pending Approver' },
  { key: 'remarks', header: 'Remarks' },
  { key: 'approvalHistory', header: 'Approval History' },
  { key: 'submittedAt', header: 'Submitted At' },
];

export function toRequestExportRow(request: RequestExportable): ExportRow {
  const payload = request.payload || {};
  const chain: string[] = Array.isArray(payload.approvalChain) ? payload.approvalChain : [];
  const displayChain: string[] = Array.isArray(payload.approvalChainDisplayNames) ? payload.approvalChainDisplayNames : [];
  const comments: Array<{ by?: string; byDisplayName?: string; decision?: string; comment?: string; at?: string }> =
    Array.isArray(payload.comments) ? payload.comments : [];
  const index = payload.currentApproverIndex;
  const activeIndex = request.status === 'pending'
    ? 0
    : request.status === 'forwarded' && Number.isInteger(index)
      ? index
      : -1;
  const pendingApprover = activeIndex >= 0 ? displayChain[activeIndex] || chain[activeIndex] : undefined;
  const details: string[] = [request.title];
  let amount: number | '' = '';

  if (request.type === 'leave') {
    details.push(
      payload.leaveType,
      payload.fromDate && payload.toDate ? `${payload.fromDate} to ${payload.toDate}` : '',
      payload.reason
    );
  } else if (request.type === 'ta') {
    amount = payload.amount === undefined || payload.amount === null ? '' : Number(payload.amount);
    details.push(payload.claimType, payload.description);
  } else if (request.type === 'proposal') {
    amount = payload.projectAmount === undefined || payload.projectAmount === null ? '' : Number(payload.projectAmount);
    details.push(payload.projectTitle, payload.projectStatus);
    if (Array.isArray(payload.projectTeam)) {
      details.push(`Team: ${payload.projectTeam.map((member: any) =>
        `${member.fullName || member.employeeId || member.username} (${member.employeeId || 'No Employee ID'}) — ${member.designation || ''} — ${member.department || 'No Team'} — ${member.phone || 'No Phone'} — ${member.projectRole || ''} — ${member.responsibility || ''}`
      ).join('; ')}`);
    }
  } else if (request.type === 'report') {
    details.push(payload.reportFrequency, payload.periodLabel, payload.periodStartDate && payload.periodEndDate ? `${payload.periodStartDate} to ${payload.periodEndDate}` : '', payload.description);
    if (Array.isArray(payload.attachments)) {
      details.push(`Attachments: ${payload.attachments.map((attachment: any) => attachment.name).filter(Boolean).join('; ')}`);
    }
  } else if (request.type === 'internal-service') {
    details.push(payload.description, payload.remarks);
  } else {
    details.push(payload.description, payload.reason);
  }

  const approvalHistory = comments.map((entry) => {
    const approver = entry.by
      ? entry.byDisplayName || approverDisplayNames[entry.by.toLowerCase()] || entry.by
      : 'Approver';
    const decision = entry.decision ? `: ${entry.decision}` : '';
    const comment = entry.comment ? ` — ${entry.comment}` : '';
    const timestamp = entry.at ? ` (${formatExportDate(entry.at)})` : '';
    return `${approver}${decision}${comment}${timestamp}`;
  }).join('; ');

  return {
    requestId: request.id,
    applicant: request.createdBy,
    employeeId: request.createdByEmployeeId || payload.id || '',
    designation: request.createdByDesignation || payload.designation || '',
    teamName: request.createdByDepartment || payload.department || '',
    phone: request.createdByPhone || payload.phone || '',
    requestType: getRequestTypeLabel(request.type),
    details: details.filter(Boolean).join(' · '),
    amount,
    status: getStatusLabel(request.status),
    pendingApprover: pendingApprover
      ? approverDisplayNames[pendingApprover.toLowerCase()] || pendingApprover
      : request.forwardedTo
        ? approverDisplayNames[request.forwardedTo.toLowerCase()] || request.forwardedTo
        : '',
    remarks: request.remarks || payload.remarks || '',
    approvalHistory,
    submittedAt: new Date(request.createdAt).toLocaleString('en-IN'),
  };
}

function valueAtPath(row: ExportRow, key: string): unknown {
  return key.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[segment];
  }, row);
}

function formatCell(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((item) => typeof item === 'object' ? JSON.stringify(item) : String(item ?? '')).join('; ');
  return JSON.stringify(value);
}

/**
 * Export approval request data to Excel format
 * @param data Array of data rows to export
 * @param columns Column definitions with key and header
 * @param fileName Name of the file to download
 */
export const exportToExcel = (
  data: ExportRow[],
  columns: { key: string; header: string }[],
  fileName: string
): void => {
  if (data.length === 0) {
    throw new Error('No data to export');
  }

  // Create worksheet data with headers
  const wsData = [
    columns.map(col => col.header),
    ...data.map(row => columns.map(col => formatCell(valueAtPath(row, col.key))))
  ];

  // Create a new workbook
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  const colWidths = columns.map(col => ({
    wch: Math.max(col.header.length, 15)
  }));
  ws['!cols'] = colWidths;

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Approval Requests');

  // Generate file and download
  XLSX.writeFile(wb, `${fileName}.xlsx`);
};

/**
 * Format date for export (submission date only)
 * @param dateString ISO date string
 * @returns Formatted date string in en-IN locale
 */
export const formatExportDate = (dateString: string): string => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  } catch {
    return '';
  }
};

/**
 * Get request type label
 * @param type Request type (leave, ta, proposal)
 * @returns Formatted request type label
 */
export const getRequestTypeLabel = (type: string): string => {
  const typeMap: { [key: string]: string } = {
    leave: 'Leave',
    ta: 'Allowance Claim',
    proposal: 'Project Proposal',
    report: 'Report',
    'attendance-report': 'Attendance Report',
    'internal-service': 'Internal Service',
    certificate: 'Certificate Request',
    relieving: 'Relieving Letter Request',
    registration: 'Registration',
  };
  return typeMap[type] || type;
};

/**
 * Get status label
 * @param status Request status
 * @returns Formatted status label
 */
export const getStatusLabel = (status: string): string => {
  const statusMap: { [key: string]: string } = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    forwarded: 'Forwarded',
    signed: 'Signed',
    conversation: 'Conversation',
  };
  return statusMap[status] || status;
};

/**
 * Get reason/description for export
 * @param request Request object
 * @param type Request type
 * @returns Reason or description text
 */
export const getReasonForExport = (request: any, type: string): string => {
  if (type === 'leave') {
    const reason = request.payload?.reason || '';
    return request.payload?.isPastDateRequest ? `Past-date leave: ${reason}` : reason;
  }
  if (type === 'ta') {
    return request.payload?.description || '';
  }
  if (type === 'proposal') {
    return request.payload?.projectTitle || request.payload?.abstract || '';
  }
  return '';
};

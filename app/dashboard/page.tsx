'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/main-layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileDown } from 'lucide-react';
import FileViewerModal from '@/components/file-viewer-modal';
import { toast } from 'sonner';
import { isInReportingPeriod, requestIsInReportingPeriod, useReportingPeriod } from '@/lib/reporting-period';

export default function Page() {
  const { isAuthenticated, user } = useAuth();
  const { period, selectedDate } = useReportingPeriod();
  const router = useRouter();
  const [requests, setRequests] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [viewingFile, setViewingFile] = useState<any>(null);
  const [projectReports, setProjectReports] = useState<Record<string, string>>({});
  const periodRequests = requests.filter((request) => requestIsInReportingPeriod(request, period, selectedDate));
  const periodTasks = tasks.filter((task) =>
    isInReportingPeriod(task.createdAt, period, selectedDate) ||
    isInReportingPeriod(task.updatedAt, period, selectedDate) ||
    isInReportingPeriod(task.deadline, period, selectedDate)
  );
  const assignedProjects = requests.filter((request) =>
    request.type === 'proposal' && request.payload?.projectTeam?.some((member: any) => member.userId === user?.id)
  );
  const activeAssignedProjects = assignedProjects.filter((request) => request.payload?.projectWorkStatus !== 'closed');
  const closedAssignedProjects = assignedProjects.filter((request) => request.payload?.projectWorkStatus === 'closed');
  const approverNames: Record<string, string> = {
    hareeshv: 'Hareesh V',
    santhanakumarv: 'Santhana Kumar V',
    gkbharath: 'Golla Kumar Bharath',
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchRequests = async () => {
      const response = await fetch('/api/requests?target=all&compact=true');
      if (!response.ok) return;
      const data = await response.json();
      const userRequests = (data.requests || []).filter((req: any) =>
        req.type !== 'internal-service' && (
        req.createdById === user?.id ||
        (req.type === 'proposal' && req.payload?.projectTeam?.some((member: any) => member.userId === user?.id))
        )
      );
      setRequests(userRequests);
    };
    fetchRequests();
    const interval = setInterval(fetchRequests, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchTasks = async () => {
      try {
        const response = await fetch('/api/tasks');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load tasks');
        setTasks(data.tasks || []);
      } catch (error) {
        console.error('Dashboard task fetch failed:', error);
        toast.error(error instanceof Error ? error.message : 'Unable to load tasks');
      }
    };
    fetchTasks();
    const interval = setInterval(fetchTasks, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, user?.id]);

  if (!isAuthenticated) {
    return <div>Loading...</div>;
  }

  const downloadUploadedFile = (request: any) => {
    if (!request.uploadedFile) {
      toast.error('No file available');
      return;
    }
    const link = document.createElement('a');
    link.href = request.uploadedFile.base64;
    link.download = request.uploadedFile.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const updateProjectTaskStatus = async (task: any, status: string) => {
    const response = await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, status }),
    });
    const data = await response.json();
    if (!response.ok) {
      toast.error(data.error || 'Unable to update project task');
      return;
    }
    setTasks((current) => current.map((item) => item.id === task.id ? data.task : item));
  };

  const submitProjectFinalReport = async (project: any) => {
    const finalReport = projectReports[project.id]?.trim() || '';
    if (finalReport.length < 20) {
      toast.error('Enter a final project report of at least 20 characters');
      return;
    }
    const response = await fetch('/api/requests/project-close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: project.id, finalReport }),
    });
    const data = await response.json();
    if (!response.ok) {
      toast.error(data.error || 'Unable to submit project report');
      return;
    }
    setRequests((current) => current.map((request) => request.id === project.id ? data.request : request));
    setProjectReports((current) => ({ ...current, [project.id]: '' }));
    toast.success('Final report submitted and project closed');
  };

  const getPendingApprover = (request: any) => {
    if (request.status !== 'pending' && request.status !== 'forwarded') return '—';
    const chain = request.payload?.approvalChain;
    if (!Array.isArray(chain)) return 'Leadership review';
    const index = request.status === 'forwarded'
      ? request.payload?.currentApproverIndex
      : 0;
    const username = Number.isInteger(index) ? chain[index] : undefined;
    const displayName = Number.isInteger(index) ? request.payload?.approvalChainDisplayNames?.[index] : undefined;
    return username ? displayName || approverNames[username] || username : '—';
  };

  const getFinalDecision = (request: any) => {
    if (request.status !== 'approved' && request.status !== 'rejected') return 'Not decided';
    const comments = Array.isArray(request.payload?.comments) ? request.payload.comments : [];
    const decision = comments.find((entry: any) => entry.decision === request.status);
    const actor = decision?.byDisplayName || (decision?.by ? approverNames[decision.by] || decision.by : 'Approver');
    return `${request.status === 'approved' ? 'Approved' : 'Rejected'} by ${actor}`;
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Welcome, {user?.fullName || 'User'}!</h1>
          <p className="text-slate-600">Here's your personal dashboard</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-white p-6 border-l-4 border-blue-500">
            <p className="text-slate-600 text-sm">Total Requests</p>
            <p className="text-3xl font-bold text-slate-900">{periodRequests.length}</p>
          </Card>
          <Card className="bg-white p-6 border-l-4 border-yellow-500">
            <p className="text-slate-600 text-sm">Pending</p>
            <p className="text-3xl font-bold text-slate-900">
              {periodRequests.filter((r) => r.status === 'pending' || r.status === 'forwarded').length}
            </p>
          </Card>
          <Card className="bg-white p-6 border-l-4 border-green-500">
            <p className="text-slate-600 text-sm">Approved</p>
            <p className="text-3xl font-bold text-slate-900">
              {periodRequests.filter((r) => r.status === 'approved').length}
            </p>
          </Card>
          <Card className="bg-white p-6 border-l-4 border-red-500">
            <p className="text-slate-600 text-sm">Rejected</p>
            <p className="text-3xl font-bold text-slate-900">
              {periodRequests.filter((r) => r.status === 'rejected').length}
            </p>
          </Card>
        </div>

        <Card className="bg-white p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">My Requests — Status & Approval History</h2>
          {periodRequests.filter((request) => request.createdById === user?.id).length === 0 ? (
            <p className="text-sm text-slate-600">You have not submitted any requests yet.</p>
          ) : (
            <div className="space-y-4">
              {periodRequests
                .filter((request) => request.createdById === user?.id)
                .map((request) => {
                  const history = Array.isArray(request.payload?.comments) ? request.payload.comments : [];
                  const approvalChain: string[] = Array.isArray(request.payload?.approvalChain) ? request.payload.approvalChain : [];
                  const approvalRoute = approvalChain.length > 0
                    ? approvalChain.map((username: string, index: number) => request.payload?.approvalChainDisplayNames?.[index] || approverNames[username] || username).join(' → ')
                    : 'Leadership review';
                  return (
                    <article key={request.id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-slate-900">{request.title}</h3>
                          <p className="mt-1 text-xs text-slate-500">Request ID: {request.id}</p>
                          <p className="text-xs text-slate-500">Submitted: {new Date(request.createdAt).toLocaleString('en-IN')}</p>
                        </div>
                        <span className={`rounded px-2 py-1 text-xs font-semibold ${
                          request.status === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : request.status === 'rejected'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                        }`}>
                          {request.status === 'forwarded' ? 'In approval workflow' : request.status}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                        <p><strong>Pending approver:</strong> {getPendingApprover(request)}</p>
                        <p><strong>Final decision:</strong> {getFinalDecision(request)}</p>
                        <p className="md:col-span-2"><strong>Approval route:</strong> {approvalRoute}</p>
                        <p className="md:col-span-2"><strong>Your remarks:</strong> {request.remarks || request.payload?.remarks || '—'}</p>
                      </div>
                      <div className="mt-3 border-t pt-3">
                        <h4 className="text-sm font-semibold text-slate-800">Approval history</h4>
                        {history.length === 0 ? (
                          <p className="mt-1 text-sm text-slate-500">No approval action has been recorded yet.</p>
                        ) : (
                          <ol className="mt-2 space-y-2">
                            {history.map((entry: any, index: number) => {
                              const stageIndex = Number.isInteger(entry.stageIndex)
                                ? entry.stageIndex
                                : approvalChain.findIndex((username) => username.toLowerCase() === String(entry.by || '').toLowerCase());
                              return (
                                <li key={`${entry.at || 'history'}-${index}`} className="text-sm text-slate-600">
                                  <span className="font-medium text-slate-800">
                                    {entry.byDisplayName || approverNames[entry.by] || entry.by || 'Approver'}
                                  </span>
                                  {' · '}
                                  {entry.decision === 'approve'
                                    ? stageIndex >= 0 && stageIndex < approvalChain.length - 1
                                      ? 'Approved & Forwarded'
                                      : 'Approved'
                                    : entry.decision === 'reject' ? 'Rejected' : entry.decision || 'Updated'}
                                  {entry.at ? ` · ${new Date(entry.at).toLocaleString('en-IN')}` : ''}
                                  {entry.comment ? <span className="block pl-2">{entry.comment}</span> : null}
                                </li>
                              );
                            })}
                          </ol>
                        )}
                      </div>
                    </article>
                  );
                })}
            </div>
          )}
        </Card>

        {activeAssignedProjects.length > 0 && (
          <Card className="bg-white p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">My Assigned Projects</h2>
            <div className="space-y-3">
              {activeAssignedProjects.map((project) => {
                  const assignment = project.payload.projectTeam.find((member: any) => member.userId === user?.id);
                  const projectTasks = tasks.filter((task) => task.sourceProjectId === project.id);
                  const allTasksComplete = projectTasks.length === project.payload.projectTeam.length &&
                    projectTasks.every((task) => task.status === 'completed');
                  return (
                    <div key={project.id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-slate-900">{project.payload?.projectTitle || project.title}</h3>
                          <p className="text-sm text-slate-600">Role: {assignment.projectRole}</p>
                          {project.payload?.teamAssignedDeadline && <p className="text-sm font-medium text-slate-700">Project deadline: {project.payload.teamAssignedDeadline}</p>}
                          <p className="text-xs text-slate-500">
                            Employee ID: {assignment.employeeId || user?.employeeId || 'Not Set'}
                            {' · '}{assignment.designation || user?.designation || 'Designation not set'}
                            {' · Team: '}{assignment.department || user?.department || 'Not Set'}
                            {' · Phone: '}{assignment.phone || user?.phone || 'Not Set'}
                          </p>
                          <p className="text-sm text-slate-600">Responsibilities: {assignment.responsibility}</p>
                        </div>
                        <span className="rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                          {project.payload?.projectWorkStatus || 'In Progress'}
                        </span>
                      </div>
                      <div className="mt-4 space-y-2 border-t pt-3">
                        <h4 className="text-sm font-semibold text-slate-800">Team Task Status</h4>
                        {projectTasks.length === 0 ? (
                          <p className="text-sm text-slate-500">No project tasks have been assigned.</p>
                        ) : projectTasks.map((task) => (
                          <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span>{task.assignedToName}: {task.title}</span>
                            {task.assignedToId === user?.id ? (
                              <select
                                aria-label={`Task status for ${task.title}`}
                                className="rounded border px-2 py-1"
                                value={task.status}
                                onChange={(event) => updateProjectTaskStatus(task, event.target.value)}
                              >
                                <option value="not_started">Not Started</option>
                                <option value="in_progress">In Progress</option>
                                <option value="blocked">Blocked</option>
                                <option value="completed">Completed</option>
                              </select>
                            ) : (
                              <span className="capitalize text-slate-600">{String(task.status).replaceAll('_', ' ')}</span>
                            )}
                          </div>
                        ))}
                      </div>
                      {allTasksComplete ? (
                        <div className="mt-4 space-y-2 border-t pt-3">
                          <label className="block text-sm font-medium text-slate-700">
                            Final Project Report
                            <textarea
                              className="mt-1 block w-full rounded-md border p-2"
                              rows={4}
                              minLength={20}
                              maxLength={20000}
                              value={projectReports[project.id] || ''}
                              onChange={(event) => setProjectReports((current) => ({ ...current, [project.id]: event.target.value }))}
                              placeholder="Summarize completed work, outcomes, and handover details"
                            />
                          </label>
                          <Button
                            disabled={(projectReports[project.id] || '').trim().length < 20}
                            onClick={() => submitProjectFinalReport(project)}
                          >
                            Submit Report & Close Project
                          </Button>
                        </div>
                      ) : projectTasks.length > 0 ? (
                        <p className="mt-3 text-xs text-slate-500">Complete every team task to submit the final report and close the project.</p>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          </Card>
        )}

        {closedAssignedProjects.length > 0 && (
          <details className="rounded-lg border border-slate-200 bg-white p-5">
            <summary className="cursor-pointer text-lg font-semibold text-slate-900">Closed Project History ({closedAssignedProjects.length})</summary>
            <div className="mt-4 space-y-3">
              {closedAssignedProjects.map((project) => (
                <article key={project.id} className="rounded border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900">{project.payload?.projectTitle || project.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">Closed {project.payload?.projectClosedAt ? new Date(project.payload.projectClosedAt).toLocaleString('en-IN') : ''}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{project.payload?.projectFinalReport}</p>
                </article>
              ))}
            </div>
          </details>
        )}

        <Card className="bg-white p-6">
          <h2 className="mb-4 text-xl font-bold text-slate-900">My Tasks</h2>
          {periodTasks.length === 0 ? (
            <p className="text-sm text-slate-600">No tasks in the selected period.</p>
          ) : (
            <div className="space-y-3">
              {periodTasks.map((task) => (
                <article key={task.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-slate-900">{task.title}</h3>
                      <p className="text-sm text-slate-600">{task.description || 'No description provided.'}</p>
                      <p className="mt-1 text-xs text-slate-500">Due {task.deadline || '—'} · {task.progress ?? 0}% complete</p>
                    </div>
                    <span className="rounded bg-blue-100 px-2 py-1 text-xs font-medium capitalize text-blue-800">
                      {String(task.status || 'not_started').replaceAll('_', ' ')}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>

        {/* Approval History (No Balance Exposure) */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Approval History</h2>
          {periodRequests.filter((req) => (req.type === 'ta' || req.type === 'proposal') && req.status === 'approved' && !(req.type === 'proposal' && req.payload?.projectWorkStatus === 'closed')).length === 0 ? (
            <p className="text-slate-600">No approval history yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-slate-900">Date</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-900">Amount</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-900">Purpose</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-900">Remarks</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-900">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {periodRequests
                    .filter((req) => (req.type === 'ta' || req.type === 'proposal') && req.status === 'approved' && !(req.type === 'proposal' && req.payload?.projectWorkStatus === 'closed'))
                    .map((req) => {
                      const isAllowance = req.type === 'ta';
                      const amount = isAllowance
                        ? req.payload?.amount
                        : req.payload?.projectAmount;
                      const purpose = isAllowance
                        ? req.payload?.description
                        : req.payload?.projectTitle;
                      const remarks = isAllowance
                        ? (req.payload?.claimType || req.payload?.billFileName || '')
                        : '';
                      const statusLabel = isAllowance ? 'Debited' : 'Approved';

                      return (
                        <tr key={req.id} className="border-b border-slate-100">
                          <td className="px-4 py-3 text-slate-700">
                            {new Date(req.createdAt).toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3 text-slate-700">₹{Number(amount || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-slate-700">{purpose || '-'}</td>
                          <td className="px-4 py-3 text-slate-700">{remarks || '-'}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 text-xs rounded font-medium bg-blue-100 text-blue-800">
                              {statusLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
      <FileViewerModal file={viewingFile} onClose={() => setViewingFile(null)} />
    </MainLayout>
  );
}

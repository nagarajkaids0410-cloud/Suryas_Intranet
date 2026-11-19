import { NextRequest, NextResponse } from 'next/server';
import { getRequestByIdDB, updateRequestPayloadDB } from '@/lib/request-db';
import { requireRole } from '@/lib/rbac';
import { getTasks } from '@/lib/task-db';
import { findUserById } from '@/lib/user-database';
import { addNotificationDB } from '@/lib/notification-db';
import { addAuditEntry } from '@/lib/audit-log';

const roles = ['founder', 'managing-partner', 'admin', 'employee', 'freelancer', 'senior-freelancer', 'intern', 'project-intern', 'user'] as const;

export async function POST(request: NextRequest) {
  const auth = requireRole(request, [...roles]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const requestId = typeof body.requestId === 'string' ? body.requestId : '';
    const finalReport = typeof body.finalReport === 'string' ? body.finalReport.trim() : '';
    if (!requestId || finalReport.length < 20 || finalReport.length > 20000) {
      return NextResponse.json({ error: 'Provide a project and a final report of 20 to 20,000 characters' }, { status: 400 });
    }

    const project = getRequestByIdDB(requestId);
    if (!project || project.type !== 'proposal' || project.status !== 'approved') {
      return NextResponse.json({ error: 'Only an approved project can be closed' }, { status: 409 });
    }
    if (project.payload?.projectWorkStatus === 'closed') {
      return NextResponse.json({ error: 'This project is already closed' }, { status: 409 });
    }
    const team = Array.isArray(project.payload?.projectTeam) ? project.payload.projectTeam : [];
    if (!team.some((member: { userId?: string }) => member.userId === auth.id)) {
      return NextResponse.json({ error: 'Only an assigned project team member may close this project' }, { status: 403 });
    }

    const projectTasks = getTasks().filter((task) => task.sourceProjectId === requestId);
    if (
      projectTasks.length !== team.length ||
      !projectTasks.some((task) => task.assignedToId === auth.id) ||
      projectTasks.some((task) => task.status !== 'completed')
    ) {
      return NextResponse.json({ error: 'Complete every project team task before submitting the final report' }, { status: 409 });
    }

    const closedAt = new Date().toISOString();
    const submitterName = findUserById(auth.id)?.fullName || auth.username;
    const updated = updateRequestPayloadDB(requestId, {
      projectWorkStatus: 'closed',
      projectFinalReport: finalReport,
      projectClosedAt: closedAt,
      projectClosedBy: auth.id,
    });
    if (!updated) return NextResponse.json({ error: 'Unable to close project' }, { status: 500 });

    addAuditEntry({
      action: 'project:closed',
      actor: auth.username,
      actorId: auth.id,
      details: { requestId, teamMemberCount: team.length },
    });

    for (const member of team) {
      const user = findUserById(member.userId);
      if (!user) continue;
      addNotificationDB({
        type: 'project_closed',
        title: `Project closed - ${project.payload?.projectTitle || project.title}`,
        message: `The final project report was submitted by ${submitterName}.`,
        targetUser: user.username,
        relatedId: requestId,
        read: false,
      });
    }

    return NextResponse.json({ success: true, request: updated });
  } catch (error) {
    console.error('Project closure failed:', error);
    return NextResponse.json({ error: 'Unable to close project' }, { status: 500 });
  }
}

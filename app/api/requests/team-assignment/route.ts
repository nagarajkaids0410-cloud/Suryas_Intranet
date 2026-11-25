import { NextRequest, NextResponse } from 'next/server';
import { addNotificationDB } from '@/lib/notification-db';
import { getRequestByIdDB, updateRequestPayloadDB } from '@/lib/request-db';
import { addAuditEntry } from '@/lib/audit-log';
import { requireRole } from '@/lib/rbac';
import { getAllUsers } from '@/lib/user-database';
import { isEligibleProjectTeamMember } from '@/lib/project-team';
import { syncProjectTeamTasks } from '@/lib/task-db';

export async function POST(request: NextRequest) {
  const auth = requireRole(request, ['founder']);
  if (auth instanceof NextResponse) return auth;
  if (auth.username.toLowerCase() !== 'gkbharath' || auth.id !== 'founder-001') {
    return NextResponse.json({ error: 'Only G K Bharath may assign the approved project team' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const requestId = typeof body.requestId === 'string' ? body.requestId : '';
    const deadline = typeof body.deadline === 'string' ? body.deadline : '';
    const submittedTeam = body.team;
    if (!requestId || !/^\d{4}-\d{2}-\d{2}$/.test(deadline) || !Number.isFinite(Date.parse(deadline)) || !Array.isArray(submittedTeam) || submittedTeam.length < 1 || submittedTeam.length > 4) {
      return NextResponse.json({ error: 'A project, valid task deadline, and between one and four team members are required' }, { status: 400 });
    }

    let project = getRequestByIdDB(requestId);
    if (!project) {
      try {
        const { getSupabaseAdmin } = require('@/lib/supabase');
        const supabase = getSupabaseAdmin();
        const { data } = await supabase.from('requests').select('*').eq('id', requestId).maybeSingle();
        if (data) project = data;
      } catch {}
    }
    if (!project || project.type !== 'proposal') {
      return NextResponse.json({ error: 'Project proposal not found' }, { status: 404 });
    }

    const chain = project.payload?.approvalChain;
    const comments = project.payload?.comments;
    const finalApproval = Array.isArray(chain) &&
      chain.at(-1) === 'gkbharath' &&
      project.payload?.currentApproverIndex === chain.length - 1 &&
      Array.isArray(comments) &&
      comments[0]?.by === 'gkbharath' &&
      comments[0]?.decision === 'approve';
    if (project.status !== 'approved' || !finalApproval) {
      return NextResponse.json({ error: 'Project team assignment is available only after G K Bharath final approval' }, { status: 409 });
    }

    const users = getAllUsers();
    const assignedIds = new Set<string>();
    const team = [];
    for (const entry of submittedTeam) {
      const userId = typeof entry?.userId === 'string' ? entry.userId : '';
      const projectRole = typeof entry?.projectRole === 'string' ? entry.projectRole.trim() : '';
      const responsibility = typeof entry?.responsibility === 'string' ? entry.responsibility.trim() : '';
      const member = users.find((user) => user.id === userId && user.status === 'active');
      if (
        !member ||
        !isEligibleProjectTeamMember(member) ||
        assignedIds.has(userId) ||
        !projectRole ||
        !responsibility
      ) {
        return NextResponse.json({ error: 'Each member must be an active portal user with a unique assignment role and responsibility' }, { status: 400 });
      }
      assignedIds.add(userId);
      team.push({
        userId: member.id,
        employeeId: member.employeeId,
        username: member.username,
        fullName: member.fullName,
        designation: member.designation,
        department: member.department,
        phone: member.phone,
        projectRole,
        responsibility,
      });
    }

    const assignedAt = new Date().toISOString();
    const updated = updateRequestPayloadDB(requestId, {
      projectTeam: team,
      teamAssignedAt: assignedAt,
      teamAssignedBy: auth.username,
      teamAssignedDeadline: deadline,
    });
    if (!updated) {
      return NextResponse.json({ error: 'Unable to save project team assignment' }, { status: 500 });
    }
    const projectTasks = syncProjectTeamTasks(
      requestId,
      project.payload?.projectTitle || project.title,
      team,
      deadline,
      { id: auth.id, name: users.find((user) => user.id === auth.id)?.fullName || auth.username }
    );

    try {
      addAuditEntry({
        action: 'project:team-assigned',
        actor: auth.username,
        actorId: auth.id,
        details: { requestId, members: team.map(({ userId, username, projectRole }) => ({ userId, username, projectRole })) },
      });
    } catch (error) {
      console.error('Project team assignment audit failed', error);
    }

    const recipients = new Map<string, string>();
    for (const member of team) recipients.set(member.username, member.fullName || member.username);
    if (project.createdById) {
      const applicant = users.find((user) => user.id === project.createdById);
      if (applicant) recipients.set(applicant.username, applicant.fullName || applicant.username);
    }
    for (const username of ['hareeshv', 'santhanakumarv', 'gkbharath']) {
      const manager = users.find((user) => user.username === username);
      if (manager) recipients.set(manager.username, manager.fullName || manager.username);
    }

    for (const [targetUser, fullName] of recipients) {
      const assignedMember = team.find((member) => member.username === targetUser);
      const message = assignedMember
        ? `You have been assigned to ${project.payload?.projectTitle || project.title} as ${assignedMember.projectRole}. Responsibilities: ${assignedMember.responsibility}`
        : `The team for ${project.payload?.projectTitle || project.title} has been assigned: ${team.map((member) => `${member.fullName} (${member.projectRole})`).join(', ')}.`;
      try {
        addNotificationDB({
          type: 'project_team_assigned',
          title: `Project team assigned - ${project.payload?.projectTitle || project.title}`,
          message: `${fullName}: ${message}`,
          targetUser,
          relatedId: requestId,
          read: false,
        });
      } catch (error) {
        console.error(`Failed to notify ${targetUser} about project team assignment`, error);
      }
    }

    return NextResponse.json({ success: true, request: updated, tasks: projectTasks });
  } catch (error) {
    console.error('Project team assignment error:', error);
    return NextResponse.json({ error: 'Failed to assign project team' }, { status: 500 });
  }
}

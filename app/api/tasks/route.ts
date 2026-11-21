import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/rbac';
import { findUserById } from '@/lib/user-database';
import { createTasks, createTasksAndSync, getTasks, fetchTasksFromSupabase, TaskStatus, updateTask, updateTaskAndSync } from '@/lib/task-db';
import { getRequestsByTargetDB } from '@/lib/request-db';
import { addAuditEntry } from '@/lib/audit-log';

const roles = ['founder', 'managing-partner', 'admin', 'employee', 'freelancer', 'senior-freelancer', 'intern', 'project-intern', 'user'] as const;
const assigneeRoles = ['founder', 'managing-partner', 'admin', 'employee', 'freelancer', 'senior-freelancer', 'intern', 'project-intern', 'user'];
const validStatuses: TaskStatus[] = ['not_started', 'in_progress', 'blocked', 'completed'];
const taskAdminRoles = ['admin', 'founder', 'managing-partner'];
const canManageTasks = (role: string) => taskAdminRoles.includes(role);

export async function GET(request: NextRequest) {
  const auth = requireRole(request, [...roles]);
  if (auth instanceof NextResponse) return auth;
  try {
    const tasks = await fetchTasksFromSupabase();
    const teamProjectIds = new Set(
      getRequestsByTargetDB('all')
        .filter((request) => request.type === 'proposal' && request.payload?.projectTeam?.some((member: { userId?: string }) => member.userId === auth.id))
        .map((request) => request.id)
    );
    return NextResponse.json({
      success: true,
      tasks: canManageTasks(auth.role)
        ? tasks
        : tasks.filter((task) => task.assignedToId === auth.id || (!!task.sourceProjectId && teamProjectIds.has(task.sourceProjectId))),
    });
  } catch (error) {
    console.error('Task fetch failed:', error);
    return NextResponse.json({ error: 'Unable to load tasks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, taskAdminRoles as typeof roles[number][]);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await request.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const deadline = typeof body.deadline === 'string' ? body.deadline : '';
    const submittedAssigneeIds = Array.isArray(body.assignedToIds)
      ? body.assignedToIds
      : typeof body.assignedToId === 'string'
        ? [body.assignedToId]
        : [];
    const assigneeIds = submittedAssigneeIds.filter((id: unknown): id is string => typeof id === 'string');
    const assignees = assigneeIds.map((id: string) => findUserById(id));
    const creator = findUserById(auth.id);
    if (
      !title || title.length > 200 ||
      !deadline || !Number.isFinite(Date.parse(deadline)) ||
      assigneeIds.length < 1 || assigneeIds.length > 4 ||
      new Set(assigneeIds).size !== assigneeIds.length ||
      assignees.some((assignee: ReturnType<typeof findUserById>) => !assignee || assignee.status !== 'active' || !assigneeRoles.includes(assignee.role))
    ) {
      return NextResponse.json({ error: 'Provide a task title, valid deadline, and active employee or intern assignee' }, { status: 400 });
    }
    if (!creator || creator.status !== 'active') {
      return NextResponse.json({ error: 'An active administrator is required' }, { status: 403 });
    }
    const tasks = await createTasksAndSync(assignees.map((assignee: ReturnType<typeof findUserById>) => ({
      title,
      description,
      deadline,
      status: 'not_started' as const,
      progress: 0,
      assignedToId: assignee!.id,
      assignedToName: assignee!.fullName,
      assignedToUsername: assignee!.username,
      assignedById: creator.id,
      assignedByName: creator.fullName,
    })));
    addAuditEntry({
      action: 'task:created',
      actor: creator.username,
      actorId: creator.id,
      details: { taskIds: tasks.map((task) => task.id), assignedToIds: assigneeIds, deadline },
    });
    return NextResponse.json({ success: true, task: tasks[0], tasks });
  } catch (error) {
    console.error('Task creation failed:', error);
    return NextResponse.json({ error: 'Unable to create task' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = requireRole(request, [...roles]);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await request.json();
    const taskId = typeof body.taskId === 'string' ? body.taskId : '';
    const existing = getTasks().find((task) => task.id === taskId);
    if (!existing) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    if (body.action === 'comment') {
      const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
      if (!canManageTasks(auth.role) || existing.assignedById !== auth.id) {
        return NextResponse.json({ error: 'Only the task assigner may add an admin comment' }, { status: 403 });
      }
      if (!comment || comment.length > 2000) {
        return NextResponse.json({ error: 'Enter a task comment of up to 2,000 characters' }, { status: 400 });
      }
      const task = await updateTaskAndSync(taskId, (item) => item.comments.unshift({
        by: auth.username,
        byId: auth.id,
        comment,
        at: new Date().toISOString(),
      }));
      addAuditEntry({
        action: 'task:commented',
        actor: auth.username,
        actorId: auth.id,
        details: { taskId, hasComment: true },
      });
      return NextResponse.json({ success: true, task });
    }

    if (body.action === 'reassign') {
      if (!canManageTasks(auth.role) || existing.assignedById !== auth.id) {
        return NextResponse.json({ error: 'Only the authorized person who assigned this task may reassign it' }, { status: 403 });
      }
      const assignee = typeof body.assignedToId === 'string' ? findUserById(body.assignedToId) : undefined;
      if (!assignee || assignee.status !== 'active' || !assigneeRoles.includes(assignee.role)) {
        return NextResponse.json({ error: 'Choose an active employee or intern as the new assignee' }, { status: 400 });
      }
      const task = await updateTaskAndSync(taskId, (item) => {
        item.assignedToId = assignee.id;
        item.assignedToName = assignee.fullName;
        item.assignedToUsername = assignee.username;
      });
      addAuditEntry({
        action: 'task:reassigned',
        actor: auth.username,
        actorId: auth.id,
        details: { taskId, previousAssigneeId: existing.assignedToId, assignedToId: assignee.id },
      });
      return NextResponse.json({ success: true, task });
    }

    if (existing.assignedToId !== auth.id) {
      return NextResponse.json({ error: 'Only the assigned employee or intern can update this task' }, { status: 403 });
    }
    const status = body.status as TaskStatus | undefined;
    const progress = body.progress;
    const comment = typeof body.comment === 'string' ? body.comment.trim() : '';
    if (status === undefined && progress === undefined && body.comment === undefined) {
      return NextResponse.json({ error: 'Provide at least one task update' }, { status: 400 });
    }
    if (
      (status !== undefined && !validStatuses.includes(status)) ||
      (progress !== undefined && (!Number.isInteger(progress) || progress < 0 || progress > 100)) ||
      (body.comment !== undefined && (!comment || comment.length > 2000))
    ) {
      return NextResponse.json({ error: 'Provide a valid task status, progress from 0 to 100, and non-empty comment' }, { status: 400 });
    }
    const task = await updateTaskAndSync(taskId, (item) => {
      if (status !== undefined) item.status = status;
      if (progress !== undefined) item.progress = progress;
      if (comment) item.comments.unshift({
        by: auth.username,
        byId: auth.id,
        comment,
        at: new Date().toISOString(),
      });
      if (status === 'completed') item.progress = 100;
    });
    addAuditEntry({
      action: 'task:updated',
      actor: auth.username,
      actorId: auth.id,
      details: { taskId, status, progress, hasComment: !!comment },
    });
    return NextResponse.json({ success: true, task });
  } catch (error) {
    console.error('Task update failed:', error);
    return NextResponse.json({ error: 'Unable to update task' }, { status: 500 });
  }
}

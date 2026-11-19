import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DB_FILE = path.join(process.cwd(), '.data', 'tasks.json');

export type TaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'completed';

export interface TaskComment {
  by: string;
  byId: string;
  comment: string;
  at: string;
}

export interface ManagedTask {
  id: string;
  title: string;
  description: string;
  deadline: string;
  status: TaskStatus;
  progress: number;
  assignedToId: string;
  assignedToName: string;
  assignedToUsername: string;
  assignedById: string;
  assignedByName: string;
  sourceProjectId?: string;
  projectRole?: string;
  createdAt: string;
  updatedAt: string;
  comments: TaskComment[];
}

function readDB(): ManagedTask[] {
  if (!fs.existsSync(DB_FILE)) return [];
  const tasks: unknown = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  if (!Array.isArray(tasks)) throw new Error('Task database has an invalid format');
  return tasks as ManagedTask[];
}

function writeDB(tasks: ManagedTask[]) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(tasks, null, 2));
}

export function getTasks(): ManagedTask[] {
  return readDB();
}

type NewTask = Omit<ManagedTask, 'id' | 'createdAt' | 'updatedAt' | 'comments'>;

export function createTasks(inputs: NewTask[]): ManagedTask[] {
  const tasks = readDB();
  const now = new Date().toISOString();
  const created = inputs.map((input) => ({
    ...input,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    comments: [],
  }));
  tasks.unshift(...created);
  writeDB(tasks);
  return created;
}

export function createTask(input: NewTask): ManagedTask {
  return createTasks([input])[0];
}

export function syncProjectTeamTasks(
  projectId: string,
  projectTitle: string,
  team: Array<{ userId: string; fullName: string; username: string; projectRole: string; responsibility: string }>,
  deadline: string,
  assignedBy: { id: string; name: string }
): ManagedTask[] {
  const tasks = readDB();
  const existing = new Map(
    tasks.filter((task) => task.sourceProjectId === projectId).map((task) => [task.assignedToId, task])
  );
  const now = new Date().toISOString();
  const projectTasks = team.map((member) => {
    const current = existing.get(member.userId);
    return current
      ? {
          ...current,
          title: `${projectTitle}: ${member.projectRole}`,
          description: member.responsibility,
          deadline,
          assignedToName: member.fullName,
          assignedToUsername: member.username,
          assignedById: assignedBy.id,
          assignedByName: assignedBy.name,
          projectRole: member.projectRole,
          updatedAt: now,
        }
      : {
          id: randomUUID(),
          title: `${projectTitle}: ${member.projectRole}`,
          description: member.responsibility,
          deadline,
          status: 'not_started' as const,
          progress: 0,
          assignedToId: member.userId,
          assignedToName: member.fullName,
          assignedToUsername: member.username,
          assignedById: assignedBy.id,
          assignedByName: assignedBy.name,
          sourceProjectId: projectId,
          projectRole: member.projectRole,
          createdAt: now,
          updatedAt: now,
          comments: [],
        };
  });
  const remaining = tasks.filter((task) => task.sourceProjectId !== projectId);
  remaining.unshift(...projectTasks);
  writeDB(remaining);
  return projectTasks;
}

export function updateTask(id: string, update: (task: ManagedTask) => void): ManagedTask | undefined {
  const tasks = readDB();
  const task = tasks.find((item) => item.id === id);
  if (!task) return undefined;
  update(task);
  task.updatedAt = new Date().toISOString();
  writeDB(tasks);
  return task;
}

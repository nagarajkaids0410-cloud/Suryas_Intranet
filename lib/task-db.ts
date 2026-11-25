import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from './supabase';

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

let cachedTasks: ManagedTask[] | undefined;

function readDB(): ManagedTask[] {
  try {
    if (!fs.existsSync(DB_FILE)) return cachedTasks || [];
    const tasks: unknown = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!Array.isArray(tasks)) return cachedTasks || [];
    cachedTasks = tasks as ManagedTask[];
    return cachedTasks;
  } catch {
    return cachedTasks || [];
  }
}

function writeDB(tasks: ManagedTask[]) {
  cachedTasks = tasks;
  try {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(tasks, null, 2));
  } catch {}
}

export async function fetchTasksFromSupabase(): Promise<ManagedTask[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('createdAt', { ascending: false });

    if (!error && data) {
      cachedTasks = data as ManagedTask[];
      return cachedTasks;
    }
  } catch (err) {
    console.warn('[Supabase fetchTasks error]:', err);
  }
  return cachedTasks || readDB();
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

  // Sync to Supabase
  try {
    const supabase = getSupabaseAdmin();
    Promise.resolve(supabase.from('tasks').upsert(created)).catch(() => {});
  } catch {}

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

  // Sync to Supabase
  try {
    const supabase = getSupabaseAdmin();
    Promise.resolve(supabase.from('tasks').upsert(projectTasks)).catch(() => {});
  } catch {}

  return projectTasks;
}

export function updateTask(id: string, update: (task: ManagedTask) => void): ManagedTask | undefined {
  const tasks = readDB();
  const task = tasks.find((item) => item.id === id);
  if (!task) return undefined;
  update(task);
  task.updatedAt = new Date().toISOString();
  writeDB(tasks);

  // Sync to Supabase
  try {
    const supabase = getSupabaseAdmin();
    Promise.resolve(supabase.from('tasks').update(task).eq('id', id)).catch(() => {});
  } catch {}

  return task;
}

export async function createTasksAndSync(inputs: NewTask[]): Promise<ManagedTask[]> {
  const created = createTasks(inputs);
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('tasks').upsert(created);
  } catch (err) {
    console.warn('[Supabase createTasksAndSync error]:', err);
  }
  return created;
}

export async function updateTaskAndSync(id: string, update: (task: ManagedTask) => void): Promise<ManagedTask | undefined> {
  const task = updateTask(id, update);
  if (task) {
    try {
      const supabase = getSupabaseAdmin();
      await supabase.from('tasks').upsert(task);
    } catch (err) {
      console.warn('[Supabase updateTaskAndSync error]:', err);
    }
  }
  return task;
}

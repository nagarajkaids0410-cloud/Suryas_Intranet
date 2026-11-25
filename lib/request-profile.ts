import { findUserById, getAllUsersAsync, StoredUser } from '@/lib/user-database';
import { loadUsersFromDB } from '@/lib/user-db';
import type { RequestItem } from '@/lib/request-store';

function withApprovalDisplayNames<T extends RequestItem>(request: T, usersByUsername: Map<string, { fullName: string }>): T {
  const comments = request.payload?.comments;
  return {
    ...request,
    payload: {
      ...request.payload,
      ...(Array.isArray(request.payload?.approvalChain) ? {
        approvalChainDisplayNames: request.payload.approvalChain.map((username: string) =>
          usersByUsername.get(username.toLowerCase())?.fullName || username
        ),
      } : {}),
      ...(Array.isArray(comments) ? {
        comments: comments.map((comment: any) => ({
          ...comment,
          byDisplayName: typeof comment.by === 'string'
            ? usersByUsername.get(comment.by.toLowerCase())?.fullName || comment.by
            : comment.by,
        })),
      } : {}),
    },
  };
}

export function withCurrentSubmitterProfile<T extends RequestItem>(request: T, providedUsers?: StoredUser[]): T {
  const users = providedUsers || loadUsersFromDB();
  const usersByUsername = new Map(users.map((user) => [user.username.toLowerCase(), user]));
  if (!request.createdById) return withApprovalDisplayNames(request, usersByUsername);
  const user = users.find((u) => u.id === request.createdById) || findUserById(request.createdById);
  if (!user) return withApprovalDisplayNames(request, usersByUsername);

  return withApprovalDisplayNames({
    ...request,
    createdBy: user.fullName,
    createdByDesignation: user.designation,
    createdByEmployeeId: user.employeeId,
    createdByDepartment: user.department,
    createdByPhone: user.phone,
    payload: {
      ...request.payload,
      id: user.employeeId || request.payload?.id,
      designation: user.designation || request.payload?.designation,
      department: user.department || request.payload?.department,
      phone: user.phone || request.payload?.phone,
    },
  }, usersByUsername);
}

export function withCurrentSubmitterProfiles<T extends RequestItem>(requests: T[], providedUsers?: StoredUser[]): T[] {
  const users = providedUsers || loadUsersFromDB();
  const usersById = new Map(users.map((user) => [user.id, user]));
  const usersByUsername = new Map(users.map((user) => [user.username.toLowerCase(), user]));
  return requests.map((request) => {
    if (!request.createdById) return withApprovalDisplayNames(request, usersByUsername);
    const user = usersById.get(request.createdById) || findUserById(request.createdById);
    if (!user) return withApprovalDisplayNames(request, usersByUsername);
    return withApprovalDisplayNames({
      ...request,
      createdBy: user.fullName,
      createdByDesignation: user.designation,
      createdByEmployeeId: user.employeeId,
      createdByDepartment: user.department,
      createdByPhone: user.phone,
      payload: {
        ...request.payload,
        id: user.employeeId || request.payload?.id,
        designation: user.designation || request.payload?.designation,
        department: user.department || request.payload?.department,
        phone: user.phone || request.payload?.phone,
      },
    }, usersByUsername);
  });
}

export async function withCurrentSubmitterProfilesAsync<T extends RequestItem>(requests: T[]): Promise<T[]> {
  const users = await getAllUsersAsync({ includePhotos: false });
  return withCurrentSubmitterProfiles(requests, users);
}

export async function withCurrentSubmitterProfileAsync<T extends RequestItem>(request: T): Promise<T> {
  const users = await getAllUsersAsync({ includePhotos: false });
  return withCurrentSubmitterProfile(request, users);
}

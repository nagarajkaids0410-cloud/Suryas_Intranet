import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/rbac';
import { getAllUsers } from '@/lib/user-database';

export async function GET(request: NextRequest) {
  const scope = new URL(request.url).searchParams.get('scope');
  const auth = requireRole(request, [
    'founder', 'managing-partner', 'admin', 'employee', 'freelancer', 'senior-freelancer', 'intern', 'project-intern', 'user',
  ], { allowPasswordChange: scope === 'me' });
  if (auth instanceof NextResponse) return auth;

  const allUsers = getAllUsers();
  if (scope === 'me') {
    const user = allUsers.find((candidate) => candidate.id === auth.id && candidate.status === 'active');
    if (!user) return NextResponse.json({ error: 'Active account required' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        employeeId: user.employeeId,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        designation: user.designation,
        department: user.department,
        phone: user.phone,
        guideId: user.guideId,
        guideName: user.guideName,
        profilePictureUploaded: user.profilePictureUploaded,
        isProfileCompleted: user.isProfileCompleted,
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const users = allUsers
    .filter((user) => user.status === 'active' && user.role !== 'guest')
    .map(({ id, employeeId, username, fullName, role, designation, department, phone, profilePhoto }) => ({
      id,
      employeeId,
      username,
      fullName,
      role,
      designation,
      department,
      phone,
      profilePhoto,
    }));

  return NextResponse.json({ success: true, users }, { headers: { 'Cache-Control': 'no-store' } });
}
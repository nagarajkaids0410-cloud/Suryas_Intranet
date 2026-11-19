'use client';

import React, { useEffect, useState } from 'react';
import MainLayout from '@/components/main-layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, Filter, CheckCircle, XCircle, Clock, Users as UsersIcon, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { exportToExcel } from '@/lib/excel-export';
import { isEligibleGuideRole, requiresGuideRole } from '@/lib/request-store';

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [issuedCredentials, setIssuedCredentials] = useState<{
    fullName: string;
    employeeId: string;
    username: string;
    temporaryPassword: string;
  } | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [guideSelections, setGuideSelections] = useState<Record<string, string>>({});
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUser, setNewUser] = useState({
    fullName: '',
    username: '',
    email: '',
    role: 'employee',
    employmentType: 'full-time',
    designation: '',
    department: '',
    phone: '',
    guideId: '',
    remarks: '',
  });
  const canCreateUsers = currentUser?.role === 'founder' && currentUser.username.toLowerCase() === 'gkbharath';

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/admin/users');
        if (!response.ok) return;
        const data = await response.json();
        setUsers(data.users || []);
      } catch (error) {
        console.error('User fetch error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
    const interval = setInterval(fetchUsers, 5000);
    window.addEventListener('focus', fetchUsers);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', fetchUsers);
    };
  }, []);

  const handleUserStatusChange = async (id: string, status: 'active' | 'suspended') => {
    const response = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: id, updates: { status } }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      toast.error(result.error || 'Unable to update user status');
      return;
    }
    const refreshedUsers = await fetch('/api/admin/users');
    if (refreshedUsers.ok) {
      const data = await refreshedUsers.json();
      setUsers(data.users || []);
    }
    toast.success(status === 'suspended' ? 'User suspended' : 'User reactivated');
  };

  const handleGuideAssignment = async (intern: any) => {
    const guideId = guideSelections[intern.id];
    if (!guideId) {
      toast.error('Select an active guide');
      return;
    }
    const response = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: intern.id, updates: { guideId } }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(result.error || 'Unable to assign guide');
      return;
    }
    setUsers((current) => current.map((account) =>
      account.id === intern.id
        ? { ...account, guideId, guideName: users.find((candidate) => candidate.id === guideId)?.fullName }
        : account
    ));
    toast.success('Intern guide assigned');
  };

  const handleUserTypeChange = async (account: any) => {
    const role = roleDrafts[account.id] || account.role;
    if (role === account.role) return;
    const guideId = requiresGuideRole(role) ? guideSelections[account.id] || account.guideId : undefined;
    if (requiresGuideRole(role) && !guideId) {
      toast.error('Select an active guide for this user type');
      return;
    }
    const response = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: account.id, updates: { role, ...(guideId ? { guideId } : {}) } }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(result.error || 'Unable to change user type');
      return;
    }
    setUsers((current) => current.map((user) => user.id === account.id
      ? { ...user, role, ...(guideId ? { guideId, guideName: users.find((candidate) => candidate.id === guideId)?.fullName } : {}) }
      : user
    ));
    setRoleDrafts((current) => ({ ...current, [account.id]: role }));
    toast.success('User type updated');
  };

  const handlePasswordReset = async (account: any) => {
    if (!window.confirm(`Reset the password for ${account.fullName || account.username}? Their current sessions will be signed out.`)) {
      return;
    }

    setResettingUserId(account.id);
    try {
      const response = await fetch('/api/admin/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: account.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to reset password');
      setIssuedCredentials({
        ...result.user,
        temporaryPassword: result.temporaryPassword,
      });
      if (result.auditLogged) {
        toast.success('Temporary password created. Share it securely with the user.');
      } else {
        toast.error('Password reset succeeded, but the audit log could not be written. Notify the portal administrator.');
      }
    } catch (error) {
      console.error('Admin password reset failed:', error);
      toast.error(error instanceof Error ? error.message : 'Unable to reset password');
    } finally {
      setResettingUserId(null);
    }
  };

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreatingUser(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to create user');

      setIssuedCredentials({
        ...result.user,
        temporaryPassword: result.temporaryPassword,
      });
      setNewUser({
        fullName: '',
        username: '',
        email: '',
        role: 'employee',
        employmentType: 'full-time',
        designation: '',
        department: '',
        phone: '',
        guideId: '',
        remarks: '',
      });

      const refreshedUsers = await fetch('/api/admin/users');
      if (refreshedUsers.ok) {
        const data = await refreshedUsers.json();
        setUsers(data.users || []);
      }
      if (result.auditLogged) {
        toast.success('User created. Share the temporary password securely.');
      } else {
        toast.error('User created, but the audit log could not be written. Notify the portal administrator.');
      }
    } catch (error) {
      console.error('Founder user creation failed:', error);
      toast.error(error instanceof Error ? error.message : 'Unable to create user');
    } finally {
      setCreatingUser(false);
    }
  };

  const copyCredential = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch (error) {
      console.error(`Unable to copy ${label.toLowerCase()}:`, error);
      toast.error(`Unable to copy ${label.toLowerCase()}. Select and copy it manually.`);
    }
  };

  const getUserType = (user: any) => {
    if (user.role === 'intern' || user.role === 'project-intern') return 'Intern';
    if (user.role === 'freelancer' || user.role === 'senior-freelancer') return 'Freelancer';
    if (user.role === 'managing-partner') return 'Managing Partner';
    if (user.role === 'employee') return 'Employee';
    if (user.role === 'admin') return 'Admin';
    if (user.role === 'founder') return 'Founder';

    const designation = (user.designation || '').toLowerCase();
    if (designation.includes('intern')) return 'Intern';
    if (designation.includes('freelancer')) return 'Freelancer';
    if (designation.includes('employee')) return 'Employee';
    return 'Consultant';
  };

  const filteredUsers = users
    .filter((user) => filterType === 'all' || getUserType(user) === filterType)
    .filter((user) => filterStatus === 'all' || user.status === filterStatus)
    .filter(
      (user) =>
        (user.fullName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.employeeId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.designation || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.department || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

  const handleExport = () => {
    const columns = [
      { key: 'fullName', header: 'Name' },
      { key: 'employeeId', header: 'Employee ID' },
      { key: 'username', header: 'Username' },
      { key: 'email', header: 'Email' },
      { key: 'phone', header: 'Phone' },
      { key: 'designation', header: 'Designation' },
      { key: 'department', header: 'Team Name' },
      { key: 'role', header: 'Role' },
      { key: 'type', header: 'User Type' },
      { key: 'status', header: 'Status' },
      { key: 'createdAt', header: 'Registration Date' },
      { key: 'approvedAt', header: 'Approval Date' },
    ];
    const rows = filteredUsers.map((account) => ({
      ...account,
      type: getUserType(account),
    }));
    try {
      exportToExcel(rows, columns, 'user-directory');
    } catch (error) {
      console.error('User directory export failed:', error);
      toast.error(error instanceof Error ? error.message : 'Unable to export users');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700';
      case 'pending_approval':
        return 'bg-yellow-100 text-yellow-700';
      case 'rejected':
        return 'bg-slate-100 text-slate-700';
      case 'suspended':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="text-green-500" size={18} />;
      case 'pending_approval':
        return <Clock className="text-yellow-500" size={18} />;
      case 'rejected':
        return <XCircle className="text-slate-500" size={18} />;
      case 'suspended':
        return <UserX className="text-red-500" size={18} />;
      default:
        return null;
    }
  };

  const stats = {
    total: users.length,
    active: users.filter((u) => u.status === 'active').length,
    pending: users.filter((u) => u.status === 'pending_approval').length,
    employees: users.filter((u) => getUserType(u) === 'Employee').length,
    interns: users.filter((u) => getUserType(u) === 'Intern').length,
    freelancers: users.filter((u) => getUserType(u) === 'Freelancer').length,
  };

  return (
    <MainLayout>
      <div className="max-w-7xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900">User Management</h1>
          <p className="text-slate-600">Monitor users, registrations, and manage access</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <Card className="bg-blue-50 p-4 border-l-4 border-blue-500">
            <p className="text-sm text-slate-600">Total Users</p>
            <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
          </Card>
          <Card className="bg-green-50 p-4 border-l-4 border-green-500">
            <p className="text-sm text-slate-600">Active</p>
            <p className="text-2xl font-bold text-green-600">{stats.active}</p>
          </Card>
          <Card className="bg-yellow-50 p-4 border-l-4 border-yellow-500">
            <p className="text-sm text-slate-600">Pending</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
          </Card>
          <Card className="bg-purple-50 p-4 border-l-4 border-purple-500">
            <p className="text-sm text-slate-600">Employees</p>
            <p className="text-2xl font-bold text-purple-600">{stats.employees}</p>
          </Card>
          <Card className="bg-indigo-50 p-4 border-l-4 border-indigo-500">
            <p className="text-sm text-slate-600">Interns</p>
            <p className="text-2xl font-bold text-indigo-600">{stats.interns}</p>
          </Card>
          <Card className="bg-orange-50 p-4 border-l-4 border-orange-500">
            <p className="text-sm text-slate-600">Freelancers</p>
            <p className="text-2xl font-bold text-orange-600">{stats.freelancers}</p>
          </Card>
        </div>

        {canCreateUsers && (
          <Card className="p-6">
            <h2 className="mb-1 text-xl font-semibold text-slate-900">Create New User</h2>
            <p className="mb-4 text-sm text-slate-600">New accounts are activated immediately and receive a one-time temporary password.</p>
            <p className="mb-4 text-sm text-slate-600">Interns, project interns, freelancers, and senior freelancers need an active guide. Consultants can be assigned as guides.</p>
            <form onSubmit={handleCreateUser} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm text-slate-700">
                Full name *
                <input required className="mt-1 block w-full rounded-md border p-2" value={newUser.fullName} onChange={(event) => setNewUser((current) => ({ ...current, fullName: event.target.value }))} />
              </label>
              <label className="text-sm text-slate-700">
                Username *
                <input required minLength={3} pattern="[a-zA-Z0-9._-]+" className="mt-1 block w-full rounded-md border p-2" value={newUser.username} onChange={(event) => setNewUser((current) => ({ ...current, username: event.target.value }))} />
              </label>
              <label className="text-sm text-slate-700">
                Email *
                <input required type="email" className="mt-1 block w-full rounded-md border p-2" value={newUser.email} onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))} />
              </label>
              <label className="text-sm text-slate-700">
                User type *
                <select required className="mt-1 block w-full rounded-md border p-2" value={newUser.role} onChange={(event) => setNewUser((current) => ({ ...current, role: event.target.value, guideId: '' }))}>
                  <option value="employee">Employee</option>
                  <option value="intern">Intern</option>
                  <option value="project-intern">Project Intern</option>
                  <option value="user">Consultant</option>
                  <option value="managing-partner">Managing Partner</option>
                  <option value="freelancer">Freelancer</option>
                  <option value="senior-freelancer">Senior Freelancer</option>
                </select>
              </label>
              <label className="text-sm text-slate-700">
                Employment type
                <select className="mt-1 block w-full rounded-md border p-2" value={newUser.employmentType} onChange={(event) => setNewUser((current) => ({ ...current, employmentType: event.target.value }))}>
                  <option value="full-time">Full time</option>
                  <option value="part-time">Part time</option>
                </select>
              </label>
              <label className="text-sm text-slate-700">
                Designation
                <input className="mt-1 block w-full rounded-md border p-2" value={newUser.designation} onChange={(event) => setNewUser((current) => ({ ...current, designation: event.target.value }))} />
              </label>
              <label className="text-sm text-slate-700">
                Team name
                <input className="mt-1 block w-full rounded-md border p-2" value={newUser.department} onChange={(event) => setNewUser((current) => ({ ...current, department: event.target.value }))} />
              </label>
              <label className="text-sm text-slate-700">
                Phone
                <input type="tel" className="mt-1 block w-full rounded-md border p-2" value={newUser.phone} onChange={(event) => setNewUser((current) => ({ ...current, phone: event.target.value }))} />
              </label>
              {requiresGuideRole(newUser.role) && (
                <label className="text-sm text-slate-700">
                  Guide *
                  <select required className="mt-1 block w-full rounded-md border p-2" value={newUser.guideId} onChange={(event) => setNewUser((current) => ({ ...current, guideId: event.target.value }))}>
                    <option value="">Select active guide</option>
                    {users.filter((candidate) =>
                      candidate.status === 'active' &&
                      isEligibleGuideRole(candidate.role)
                    ).map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.fullName || candidate.username} ({candidate.designation || candidate.role})
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="text-sm text-slate-700 md:col-span-2 lg:col-span-3">
                Reason for access
                <textarea className="mt-1 block w-full rounded-md border p-2" rows={2} value={newUser.remarks} onChange={(event) => setNewUser((current) => ({ ...current, remarks: event.target.value }))} />
              </label>
              <div className="md:col-span-2 lg:col-span-3">
                <Button type="submit" disabled={creatingUser}>
                  {creatingUser ? 'Creating user...' : 'Create user'}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Search and Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search by name or email..."
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="Employee">Employees</option>
            <option value="Intern">Interns</option>
            <option value="Consultant">Consultants</option>
            <option value="Managing Partner">Managing Partners</option>
            <option value="Freelancer">Freelancers</option>
          </select>
          <select
            className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="pending_approval">Pending Approval</option>
            <option value="rejected">Rejected</option>
            <option value="suspended">Suspended</option>
          </select>
          <Button onClick={handleExport} disabled={filteredUsers.length === 0}>
            Export to Excel
          </Button>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {filteredUsers.length === 0 ? (
            <div className="p-8 text-center">
              <UsersIcon size={48} className="mx-auto text-slate-300 mb-4" />
              <p className="text-slate-600">No users found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] table-fixed text-sm">
                <thead className="bg-slate-100 border-b border-slate-200">
                  <tr>
                    <th className="w-[24%] px-2 py-3 text-left text-xs font-semibold text-slate-900">User</th>
                    <th className="w-[16%] px-2 py-3 text-left text-xs font-semibold text-slate-900">Type</th>
                    <th className="w-[14%] px-2 py-3 text-left text-xs font-semibold text-slate-900">Status</th>
                    <th className="w-[12%] px-2 py-3 text-left text-xs font-semibold text-slate-900">Registered</th>
                    <th className="w-[12%] px-2 py-3 text-left text-xs font-semibold text-slate-900">Approved</th>
                    <th className="w-[22%] px-2 py-3 text-center text-xs font-semibold text-slate-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b border-slate-200 hover:bg-slate-50 transition">
                      <td className="px-2 py-3">
                        <div className="flex min-w-0 items-center gap-2">
                          {user.profilePhoto ? (
                            <img src={user.profilePhoto} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                              {(user.fullName || user.username || '?').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-slate-900">{user.fullName || user.username}</p>
                            <p className="truncate text-xs text-slate-500">{user.email}</p>
                            <details className="mt-1 text-xs text-slate-500">
                              <summary className="cursor-pointer text-blue-700">More details</summary>
                              <p className="mt-1">{user.designation || 'Not Set'} · {user.department || 'Not Set'}</p>
                              <p>ID: {user.employeeId || 'Not Set'} · Phone: {user.phone || 'Not Set'}</p>
                              {requiresGuideRole(user.role) && <p>Guide: {user.guideName || 'Not assigned'}</p>}
                            </details>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        {canCreateUsers && user.id !== currentUser?.id && !['founder', 'admin'].includes(user.role) ? (
                          <div className="flex min-w-0 flex-col gap-1">
                            <select
                              aria-label={`User type for ${user.fullName || user.username}`}
                              className="w-full rounded-md border p-1.5 text-xs"
                              value={roleDrafts[user.id] || user.role}
                              onChange={(event) => setRoleDrafts((current) => ({ ...current, [user.id]: event.target.value }))}
                            >
                              <option value="employee">Employee</option>
                              <option value="intern">Intern</option>
                              <option value="project-intern">Project Intern</option>
                              <option value="user">Consultant</option>
                              <option value="managing-partner">Managing Partner</option>
                              <option value="freelancer">Freelancer</option>
                              <option value="senior-freelancer">Senior Freelancer</option>
                            </select>
                            {requiresGuideRole(roleDrafts[user.id] || user.role) &&
                              ((roleDrafts[user.id] || user.role) !== user.role || !user.guideId) && (
                              <select
                                aria-label={`Guide for ${user.fullName || user.username}`}
                                className="w-full rounded-md border p-1.5 text-xs"
                                value={guideSelections[user.id] || ''}
                                onChange={(event) => setGuideSelections((current) => ({ ...current, [user.id]: event.target.value }))}
                              >
                                <option value="">Select active guide</option>
                                {users.filter((candidate) => candidate.id !== user.id && candidate.status === 'active' && isEligibleGuideRole(candidate.role)).map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>{candidate.fullName || candidate.username}</option>
                                ))}
                              </select>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={(roleDrafts[user.id] || user.role) === user.role}
                              onClick={() => handleUserTypeChange(user)}
                            >
                              Save Type
                            </Button>
                          </div>
                        ) : (
                          <span className="inline-block px-3 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded-full">
                            {getUserType(user)}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(user.status)}
                          <span
                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                              user.status
                            )}`}
                          >
                            {user.status === 'pending_approval'
                              ? 'Pending Approval'
                              : user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-xs text-slate-600">
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN') : 'N/A'}
                      </td>
                      <td className="px-2 py-3 text-xs text-slate-600">
                        {user.approvedAt ? new Date(user.approvedAt).toLocaleDateString('en-IN') : 'N/A'}
                      </td>
                      <td className="px-2 py-3 text-center">
                        <div className="flex flex-wrap justify-center gap-1">
                          {currentUser?.role === 'founder' &&
                            requiresGuideRole(user.role) &&
                            user.status === 'active' && (
                              <div className="flex items-center gap-1">
                                <select
                                  className="max-w-40 rounded-md border p-1 text-xs"
                                  value={guideSelections[user.id] || user.guideId || ''}
                                  onChange={(event) => setGuideSelections((current) => ({ ...current, [user.id]: event.target.value }))}
                                >
                                  <option value="">Select guide</option>
                                  {users.filter((candidate) =>
                                    candidate.id !== user.id &&
                                    candidate.status === 'active' &&
                                    isEligibleGuideRole(candidate.role)
                                  ).map((candidate) => (
                                    <option key={candidate.id} value={candidate.id}>
                                      {candidate.fullName || candidate.username} ({candidate.designation || candidate.role})
                                    </option>
                                  ))}
                                </select>
                                <Button size="sm" variant="outline" onClick={() => handleGuideAssignment(user)}>
                                  Assign guide
                                </Button>
                              </div>
                            )}
                          {user.status === 'pending_approval' && (
                            <span className="text-xs text-slate-500">Sequential approval via Dashboard</span>
                          )}
                          {user.status === 'active' &&
                            user.role !== 'founder' &&
                            user.id !== currentUser?.id &&
                            (currentUser?.role === 'admin' || currentUser?.role === 'founder') && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={resettingUserId === user.id}
                                onClick={() => handlePasswordReset(user)}
                              >
                                {resettingUserId === user.id ? 'Resetting...' : 'Reset Password'}
                              </Button>
                            )}
                          {currentUser?.role === 'founder' && user.id !== currentUser.id && user.status === 'active' && (
                            <Button
                              size="sm"
                              className="bg-orange-500 hover:bg-orange-600 text-white text-xs"
                              onClick={() => handleUserStatusChange(user.id, 'suspended')}
                            >
                              Suspend
                            </Button>
                          )}
                          {currentUser?.role === 'founder' && user.id !== currentUser.id && user.status === 'suspended' && (
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white text-xs"
                              onClick={() => handleUserStatusChange(user.id, 'active')}
                            >
                              Reactivate
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Activity Info */}
        <Card className="p-6 bg-blue-50 border-l-4 border-blue-500">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">User Activity Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-slate-600">Online Now</p>
              <p className="text-lg font-bold text-blue-600">{users.filter((u) => u.status === 'active').length}</p>
            </div>
            <div>
              <p className="text-slate-600">Awaiting Approval</p>
              <p className="text-lg font-bold text-yellow-600">{users.filter((u) => u.status === 'pending_approval').length}</p>
            </div>
            <div>
              <p className="text-slate-600">Denied</p>
              <p className="text-lg font-bold text-slate-600">{users.filter((u) => u.status === 'rejected').length}</p>
            </div>
            <div>
              <p className="text-slate-600">Suspended</p>
              <p className="text-lg font-bold text-red-600">{users.filter((u) => u.status === 'suspended').length}</p>
            </div>
          </div>
        </Card>
      </div>
      {issuedCredentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="temporary-credentials-title">
          <Card className="w-full max-w-lg space-y-4 p-6">
            <div>
              <h2 id="temporary-credentials-title" className="text-xl font-bold text-slate-900">Temporary sign-in credentials</h2>
              <p className="mt-1 text-sm text-slate-600">
                This password is shown only once. Share it with the user through a secure channel. They must change it at their next sign-in.
              </p>
            </div>
            <div className="space-y-3 rounded border bg-slate-50 p-4">
              <p className="font-medium text-slate-900">{issuedCredentials.fullName}</p>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-500">User ID (Employee ID)</label>
                <div className="mt-1 flex gap-2">
                  <input className="min-w-0 flex-1 rounded border bg-white px-3 py-2 font-mono" readOnly value={issuedCredentials.employeeId || issuedCredentials.username} />
                  <Button size="sm" variant="outline" onClick={() => copyCredential(issuedCredentials.employeeId || issuedCredentials.username, 'User ID')}>Copy</Button>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-500">Temporary password</label>
                <div className="mt-1 flex gap-2">
                  <input className="min-w-0 flex-1 rounded border bg-white px-3 py-2 font-mono" readOnly value={issuedCredentials.temporaryPassword} />
                  <Button size="sm" variant="outline" onClick={() => copyCredential(issuedCredentials.temporaryPassword, 'Temporary password')}>Copy</Button>
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500">Closing this window removes the temporary password from this page. It cannot be retrieved later; reset it again if it is lost.</p>
            <div className="flex justify-end">
              <Button onClick={() => setIssuedCredentials(null)}>Done</Button>
            </div>
          </Card>
        </div>
      )}
    </MainLayout>
  );
}

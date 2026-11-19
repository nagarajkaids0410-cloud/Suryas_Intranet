'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { ProfileSetupModal } from '@/components/profile-setup-modal';
import { NotificationBell } from '@/components/notification-bell';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Home,
  FileText,
  Receipt,
  FolderPlus,
  BarChart3,
  Users,
  Heart,
  LogOut,
  Menu,
  X,
  Clock,
  User,
  Share2,
  CalendarDays,
  ClipboardList,
} from 'lucide-react';
import { toast } from 'sonner';
import { isReportSubmissionRestricted } from '@/lib/report-access';
import { type ReportingPeriod, useReportingPeriod } from '@/lib/reporting-period';

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { period, setPeriod, selectedDate, setSelectedDate } = useReportingPeriod();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showProfileEditor, setShowProfileEditor] = useState(false);

  const isFounder =
    user?.role === 'founder' ||
    user?.username?.toLowerCase() === 'gkbharath' ||
    user?.id === 'founder-001';
  const isAdmin = user?.role === 'admin' || isFounder;
  const isManagingPartner = user?.role === 'managing-partner';
  const isGuest = user?.role === 'guest';
  const isServiceRequestsRestricted = ['hareeshv', 'santhanakumarv', 'gkbharath']
    .includes(user?.username?.toLowerCase() || '');

  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    const savedSidebarState = window.localStorage.getItem('main-layout-sidebar-open');
    if (savedSidebarState !== null) {
      setSidebarOpen(savedSidebarState === 'true');
    } else if (window.matchMedia('(min-width: 768px)').matches) {
      setSidebarOpen(true);
      window.localStorage.setItem('main-layout-sidebar-open', 'true');
    }
  }, []);

  const updateSidebarOpen = (isOpen: boolean) => {
    setSidebarOpen(isOpen);
    window.localStorage.setItem('main-layout-sidebar-open', String(isOpen));
  };


  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    router.push('/login');
  };

  if (!user) {
    return <>{children}</>;
  }

  const adminNavItems = [
    { label: 'Dashboard', icon: Home, href: '/admin-dashboard' },
    { label: 'My Requests', icon: Clock, href: '/my-requests' },
    { label: 'Attendance', icon: CalendarDays, href: '/attendance' },
    { label: 'Tasks', icon: ClipboardList, href: '/tasks' },
    { label: 'Approvals', icon: FileText, href: '/admin/approvals' },
    { label: 'User Management', icon: Users, href: '/admin/user-management' },
    { label: 'Submit Report', icon: BarChart3, href: '/reports' },
    { label: 'Internal Requests', icon: FileText, href: '/internal-requests' },
    { label: 'Circulars', icon: FileText, href: '/circulars' },
    // Recruitment and Sponsorship removed per admin request
  ];

  const founderNavItems = [
    ...adminNavItems,
    { label: 'Leave Application', icon: FileText, href: '/leave-form' },
    { label: 'Allowance Claim', icon: Receipt, href: '/ta-claim' },
    { label: 'Project Proposal', icon: FolderPlus, href: '/project-creation' },
  ];

  const guestNavItems: Array<{ label: string; icon: typeof Home; href: string }> = [
    // Guest navigation intentionally left minimal (no recruitment/sponsorship)
  ];

  const managingPartnerNavItems = [
    { label: 'Dashboard', icon: Home, href: '/admin-dashboard' },
    { label: 'My Requests', icon: Clock, href: '/my-requests' },
    { label: 'Attendance', icon: CalendarDays, href: '/attendance' },
    { label: 'Tasks', icon: ClipboardList, href: '/tasks' },
    { label: 'Relieving & Certificates', icon: FileText, href: '/service-requests' },
    { label: 'Approvals', icon: FileText, href: '/admin/approvals' },
    { label: 'Leave Application', icon: FileText, href: '/leave-form' },
    { label: 'Allowance Claim', icon: Receipt, href: '/ta-claim' },
    { label: 'Project Proposal', icon: FolderPlus, href: '/project-creation' },
    { label: 'Internal Requests', icon: FileText, href: '/internal-requests' },
    { label: 'Circulars', icon: FileText, href: '/circulars' },
  ];

  const employeeNavItems = [
    { label: 'Dashboard', icon: Home, href: '/dashboard' },
    { label: 'My Requests', icon: Clock, href: '/my-requests' },
    { label: 'Approvals', icon: FileText, href: '/admin/approvals' },
    { label: 'Attendance', icon: CalendarDays, href: '/attendance' },
    { label: 'Tasks', icon: ClipboardList, href: '/tasks' },
    { label: 'Relieving & Certificates', icon: FileText, href: '/service-requests' },
    { label: 'Leave Form', icon: FileText, href: '/leave-form' },
    { label: 'Allowance Claim', icon: Receipt, href: '/ta-claim' },
    { label: 'Proposal', icon: FolderPlus, href: '/project-creation' },
    { label: 'Reports', icon: BarChart3, href: '/reports' },
    { label: 'Internal Requests', icon: FileText, href: '/internal-requests' },
    { label: 'Circulars', icon: FileText, href: '/circulars' },
    // Recruitment and Sponsorship removed from employee sidebar
  ];

  const navItems = (isAdmin
    ? isFounder
      ? founderNavItems
      : adminNavItems
    : isManagingPartner
      ? managingPartnerNavItems
      : isGuest
        ? guestNavItems
        : employeeNavItems).filter(
    (item) =>
      (!isServiceRequestsRestricted || item.href !== '/service-requests') &&
      (!isReportSubmissionRestricted(user?.username) || item.href !== '/reports'),
  );

  const logoImg = '/company-logo.png';

  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-slate-50 flex">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'w-64 translate-x-0' : 'w-20 -translate-x-full md:translate-x-0'
        } bg-gradient-to-b from-slate-900 to-slate-800 text-white transition-all duration-300 fixed inset-y-0 left-0 h-dvh flex flex-col shadow-2xl z-50 md:translate-x-0`}
      >
        {/* Logo Section */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition">
            <div className="w-11 h-11 shrink-0 bg-white rounded-lg flex items-center justify-center overflow-hidden p-1">
              <img src={logoImg} alt="SURYAS MiB ENTERPRISES logo" className="w-full h-full object-contain" />
            </div>
            {sidebarOpen && <span className="text-sm font-bold whitespace-nowrap">SURYAS MiB ENTERPRISES</span>}
          </Link>
          <button
            onClick={() => updateSidebarOpen(!sidebarOpen)}
            className="p-1 hover:bg-slate-700 rounded text-white"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto py-4 px-2">
          <div className="space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (window.matchMedia('(max-width: 767px)').matches) updateSidebarOpen(false);
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-700 transition text-slate-100 hover:text-white group"
                title={!sidebarOpen ? item.label : ''}
              >
                <item.icon size={20} className="flex-shrink-0 group-hover:text-blue-400" />
                {sidebarOpen && <span className="text-sm">{item.label}</span>}
              </Link>
            ))}
          </div>
        </nav>

        {/* Logout Button */}
        <div className="border-t border-slate-700 p-4">
          <Button
            onClick={handleLogout}
            variant="destructive"
            className="w-full flex items-center justify-center gap-2"
          >
            <LogOut size={18} />
            {sidebarOpen && <span>Logout</span>}
          </Button>
        </div>
      </div>

      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => updateSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
        />
      )}

      {/* Main Content */}
      <div className={`${sidebarOpen ? 'md:ml-64' : 'md:ml-20'} min-w-0 w-full flex-1 flex flex-col transition-all duration-300`}>
        {/* Top Header */}
        <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-6 sm:py-4 lg:flex-nowrap">
            <div className="flex min-w-0 items-center gap-2 sm:gap-4">
              <button
                type="button"
                aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
                onClick={() => updateSidebarOpen(!sidebarOpen)}
                className="rounded p-2 text-slate-700 hover:bg-slate-100 md:hidden"
              >
                {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
              <img src={logoImg} alt="SURYAS MiB ENTERPRISES logo" className="h-9 w-24 shrink-0 object-contain sm:h-12 sm:w-36 lg:h-9 lg:w-24" />
              <div className="hidden shrink-0 items-center gap-2 lg:flex">
                <Clock size={16} className="text-slate-500" />
                <span className="whitespace-nowrap text-xs text-slate-600">
                  {new Intl.DateTimeFormat('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  }).format(currentTime)}
                </span>
              </div>
            </div>

            {/* User Profile Dropdown */}
            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2 lg:flex-nowrap">
              {!isGuest && (
                <div className="flex flex-wrap items-center justify-end gap-2 lg:flex-nowrap">
                  <label className="flex items-center gap-1 text-xs text-slate-600">
                    Period
                    <select
                      aria-label="Shared reporting period"
                      className="max-w-32 rounded-md border border-slate-300 bg-white px-1.5 py-2 text-xs text-slate-800 sm:max-w-none sm:px-2 sm:text-sm"
                      value={period}
                      onChange={(event) => setPeriod(event.target.value as ReportingPeriod)}
                    >
                      <option value="this-month">This month</option>
                      <option value="previous-month">Previous month</option>
                      <option value="last-three-months">Past 3 months</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1 text-xs text-slate-600">
                    Date
                    <input
                      type="date"
                      aria-label="Shared reporting date"
                      className="w-32 rounded-md border border-slate-300 bg-white px-1.5 py-2 text-xs text-slate-800 sm:w-auto sm:px-2 sm:text-sm"
                      value={selectedDate}
                      onChange={(event) => setSelectedDate(event.target.value)}
                    />
                  </label>
                  {selectedDate && (
                    <button type="button" className="text-xs text-blue-700 underline" onClick={() => setSelectedDate('')}>
                      Clear
                    </button>
                  )}
                </div>
              )}
              {/* Notification Bell */}
              {!isGuest && <NotificationBell />}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-3">
                    {isGuest ? (
                      <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
                        <User size={20} className="text-white" />
                      </div>
                    ) : isAdmin ? (
                      <img
                        src={user.profilePhoto || '/default-admin.svg'}
                        alt="Admin Profile"
                        className="w-10 h-10 rounded-full object-cover border-2 border-blue-400"
                        style={{ objectPosition: 'center 0%' }}
                      />
                    ) : (
                      <img
                        src={user.profilePhoto || 'https://via.placeholder.com/40'}
                        alt="Profile"
                        className="w-10 h-10 rounded-full object-cover border-2 border-blue-400"
                        style={{ objectPosition: 'center 0%' }}
                      />
                    )}
                    <div className="hidden sm:block text-left">
                      <p className="text-sm font-semibold text-slate-900">{user.fullName || user.username}</p>
                      <p className="text-xs text-slate-500">{isFounder ? 'Founder & Chief Executive Partner' : isAdmin ? 'Administrator' : user.designation}</p>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>User Profile</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {!isGuest && (
                    <div className="px-4 py-3 text-center mb-2">
                      <img src={logoImg} alt="SURYAS MiB ENTERPRISES logo" className="h-12 w-36 object-contain mx-auto mb-2" />
                      <p className="text-xs text-slate-500">SURYAS MiB ENTERPRISES</p>
                    </div>
                  )}
                  <div className="px-4 py-3 space-y-2">
                    <div>
                      <p className="text-xs text-slate-500">Full Name</p>
                      <p className="text-sm font-semibold">{user.fullName || user.username}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Employee ID</p>
                      <p className="text-sm font-semibold font-mono">{user.employeeId || 'Not Set'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Designation</p>
                      <p className="text-sm font-semibold">{user.designation || 'Not Set'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Team Name</p>
                      <p className="text-sm font-semibold">{user.department || 'Not Set'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Phone</p>
                      <p className="text-sm font-semibold">{user.phone || 'Not Set'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Email</p>
                      <p className="text-sm font-semibold text-blue-600">{user.email}</p>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  {!isGuest && (
                    <>
                      <DropdownMenuItem onClick={() => setShowProfileEditor(true)}>
                        <User size={16} className="mr-2" />
                        Edit Profile
                      </DropdownMenuItem>
                      {isAdmin && !isFounder && (
                        <DropdownMenuItem>
                          <Share2 size={16} className="mr-2" />
                          Management Console
                        </DropdownMenuItem>
                      )}
                      {isAdmin && !isFounder && <DropdownMenuSeparator />}
                    </>
                  )}
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer">
                    <LogOut size={16} className="mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Page Content */}
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6">{children}</div>
      </div>

      <ProfileSetupModal
        isOpen={showProfileEditor}
        onClose={() => setShowProfileEditor(false)}
        mode="edit"
      />
    </div>
  );
}

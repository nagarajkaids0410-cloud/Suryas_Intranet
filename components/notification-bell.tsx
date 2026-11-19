"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { useNotifications } from '@/lib/notification-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const visibleNotifications = notifications.filter((notif) => !notif.read);
  const router = useRouter();
  const { user } = useAuth();

  const handleNotificationClick = async (notif: { id: string; type?: string; title?: string; relatedId?: string }) => {
    void markAsRead(notif.id);
    const directDestinations: Record<string, string> = {
      user_access_request: '/admin-dashboard#access-requests',
      registration_approval: '/admin-dashboard#access-requests',
      project_team_assigned: '/dashboard',
      project_closed: '/dashboard',
      data_retention_approval: '/admin-dashboard#data-retention',
      data_retention_completed: '/admin-dashboard#data-retention',
      internal_service_request: '/internal-requests',
      'internal-service-request': '/internal-requests',
      leave: '/admin/leave-management',
      ta: '/admin/ta-claims',
      project: '/admin/project-approvals',
      certificate: '/service-requests',
      report: '/reports',
      attendance: '/attendance',
      inquiry: '/admin-dashboard',
    };
    const directDestination = notif.type ? directDestinations[notif.type] : undefined;
    const directFirstTypes = new Set([
      'user_access_request',
      'registration_approval',
      'project_team_assigned',
      'project_closed',
      'data_retention_approval',
      'data_retention_completed',
      'internal_service_request',
      'internal-service-request',
    ]);
    if (directDestination && notif.type && directFirstTypes.has(notif.type)) {
      router.push(directDestination);
      return;
    }
    if (notif.relatedId) {
      try {
        const params = new URLSearchParams({
          target: 'all',
          requestId: notif.relatedId,
          compact: 'true',
        });
        if (user?.role === 'admin' || (user?.role === 'founder' && user.username.toLowerCase() === 'gkbharath')) {
          params.set('scope', 'dashboard');
        }
        const response = await fetch(`/api/requests?${params.toString()}`);
        if (response.ok) {
          const data = await response.json();
          const request = data.request;
          if (request?.type === 'internal-service') {
            router.push(`/internal-requests?requestId=${encodeURIComponent(request.id)}`);
            return;
          }
          if (request?.type && request?.id) {
            const isRequester = request.createdById === user?.id;
            const basePath = isRequester ? '/my-requests' : '/admin/approvals';
            router.push(`${basePath}?type=${encodeURIComponent(request.type)}&requestId=${encodeURIComponent(request.id)}`);
            return;
          }
        }
      } catch (error) {
        console.error('Unable to open the related request:', error);
      }
    }
    if (directDestination) router.push(directDestination);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Mark all as read
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {visibleNotifications.length === 0 ? (
          <div className="p-4 text-center text-sm text-slate-500">
            No notifications
          </div>
        ) : (
          visibleNotifications.slice(0, 10).map((notif) => (
            <DropdownMenuItem
              key={notif.id}
              onClick={() => handleNotificationClick(notif)}
              className={`flex flex-col items-start p-3 cursor-pointer ${
                !notif.read ? 'bg-blue-50' : ''
              }`}
            >
              <div className="flex items-start justify-between w-full">
                <div className="flex-1">
                  <p className="font-semibold text-sm">{notif.title}</p>
                  <p className="text-xs text-slate-600 mt-1">{notif.message}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {formatTimestamp(notif.timestamp)}
                  </p>
                </div>
                {!notif.read && (
                  <div className="w-2 h-2 rounded-full bg-blue-600 ml-2 mt-1"></div>
                )}
              </div>
            </DropdownMenuItem>
          ))
        )}
        {visibleNotifications.length > 10 && (
          <div className="p-2 text-center">
            <span className="text-xs text-slate-500">
              +{visibleNotifications.length - 10} more notifications
            </span>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

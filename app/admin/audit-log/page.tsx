'use client';

import React, { useEffect, useState } from 'react';
import MainLayout from '@/components/main-layout';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { exportToExcel } from '@/lib/excel-export';

export default function AuditLogPage() {
  const { user, isAuthenticated } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (user?.role !== 'admin' && user?.role !== 'founder') return;
    fetchLogs();
  }, [isAuthenticated, user]);

  async function fetchLogs() {
    const res = await fetch('/api/admin/audit-log');
    const data = await res.json();
    if (data?.success) setLogs(data.logs || []);
  }

  function handleExport() {
    const columns = [
      { key: 'timestamp', header: 'Timestamp' },
      { key: 'action', header: 'Action' },
      { key: 'actor', header: 'Actor' },
      { key: 'actorEmployeeId', header: 'Employee ID' },
      { key: 'details', header: 'Details' },
    ];
    const rows = logs.map((l) => ({ timestamp: l.timestamp, action: l.action, actor: l.actor || '', actorEmployeeId: l.actorEmployeeId || '', details: JSON.stringify(l.details || {}) }));
    exportToExcel(rows, columns as any, 'audit-log');
  }

  if (!isAuthenticated) return <div>Loading...</div>;
  if (user?.role !== 'admin' && user?.role !== 'founder') return <div>Access denied</div>;

  return (
    <MainLayout>
      <div className="max-w-6xl">
        <h1 className="text-2xl font-bold mb-4">Audit Log</h1>
        <div className="mb-4">
          <Button onClick={fetchLogs} className="mr-2">Refresh</Button>
          <Button onClick={handleExport} className="bg-green-600 text-white">Export to Excel</Button>
        </div>
        <div className="space-y-2">
          {logs.map((l) => (
            <div key={l.id} className="p-3 border rounded">
              <div className="text-sm text-slate-600">{new Date(l.timestamp).toLocaleString()}</div>
              <div className="font-medium">{l.action}</div>
              <div className="text-sm">Actor: {l.actor || '-'} · Employee ID: {l.actorEmployeeId || 'Not Set'}</div>
              <div className="text-xs mt-2">{JSON.stringify(l.details || {})}</div>
            </div>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}

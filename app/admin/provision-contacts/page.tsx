"use client";

import React, { useState } from 'react';
import MainLayout from '@/components/main-layout';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';

export default function ProvisionContactsPage() {
  const { user } = useAuth();
  const [results, setResults] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleProvision = async () => {
    if (!user) return alert('Please login as Admin or Founder');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/provision-contacts', { method: 'POST' });
      const data = await res.json();
      if (data?.created) setResults(data.created);
      else alert('Provisioning failed');
    } catch (e) {
      console.error(e);
      alert('Provisioning failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold mb-4">Provision Contact Users</h1>
        <p className="text-sm text-slate-600 mb-4">Creates the three initial leadership accounts. Only the Founder can run this once; credentials are shown only for newly created accounts.</p>
        <div className="mb-4">
          <Button onClick={handleProvision} className="bg-blue-600" disabled={loading}>{loading ? 'Provisioning…' : 'Provision Contacts'}</Button>
        </div>

        {results && (
          <div className="space-y-2">
            <h2 className="font-semibold">Provisioned Accounts</h2>
            <div className="bg-white p-4 border rounded">
              {results.map((r: any) => (
                <div key={r.id} className="mb-2">
                  <div><strong>{r.fullName}</strong> — {r.email}</div>
                  <div className="text-sm">Username: {r.username} — ID: {r.id}</div>
                  <div className="text-sm">Password: <span className="font-mono">{r.password}</span></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

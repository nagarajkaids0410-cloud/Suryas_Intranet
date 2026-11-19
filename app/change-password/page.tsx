'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < 12 || newPassword !== confirmation) {
      toast.error('Use at least 12 characters and enter matching new passwords');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Password change failed');
      toast.success('Password changed');
      router.replace('/homepage');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Password change failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
      <form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-lg border border-slate-700 bg-slate-900 p-8">
        <div>
          <p className="text-sm text-sky-300">SURYAS MiB ENTERPRISES</p>
          <h1 className="mt-2 text-2xl font-semibold">Change temporary password</h1>
        </div>
        <label className="block text-sm">Current password
          <input className="mt-2 w-full rounded border border-slate-600 bg-slate-800 px-3 py-2" type="password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        </label>
        <label className="block text-sm">New password
          <input className="mt-2 w-full rounded border border-slate-600 bg-slate-800 px-3 py-2" type="password" minLength={12} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
        </label>
        <label className="block text-sm">Confirm new password
          <input className="mt-2 w-full rounded border border-slate-600 bg-slate-800 px-3 py-2" type="password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        </label>
        <button disabled={loading} className="w-full rounded bg-sky-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60">
          {loading ? 'Updating...' : 'Update password'}
        </button>
      </form>
    </main>
  );
}
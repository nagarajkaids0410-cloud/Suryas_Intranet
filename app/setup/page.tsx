'use client';

import { FormEvent, useState } from 'react';

type CreatedAccount = {
  employeeId: string;
  username: string;
  email: string;
  role: string;
  fullName: string;
  password: string;
};

export default function SetupPage() {
  const [setupToken, setSetupToken] = useState('');
  const [accounts, setAccounts] = useState<CreatedAccount[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/provision-contacts', {
        method: 'POST',
        headers: { 'x-initial-setup-token': setupToken },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Initial setup failed');
      setAccounts(result.created || []);
      setMessage(result.message || 'Initial setup complete');
      setSetupToken('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Initial setup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-white">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-sky-300">SURYAS MiB ENTERPRISES</p>
        <h1 className="mt-2 text-3xl font-semibold">Initial account setup</h1>
        <p className="mt-3 text-sm text-slate-300">Use the one-time setup token configured by the operator. Newly generated passwords are shown only in this response and must be changed at first login.</p>

        <form onSubmit={submit} className="mt-8 flex gap-3">
          <input
            type="password"
            required
            value={setupToken}
            onChange={(event) => setSetupToken(event.target.value)}
            aria-label="Initial setup token"
            placeholder="Initial setup token"
            className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2"
          />
          <button disabled={loading} className="rounded bg-sky-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-60">
            {loading ? 'Setting up...' : 'Create accounts'}
          </button>
        </form>

        {message && <p role="status" className="mt-4 text-sm text-slate-200">{message}</p>}
        {accounts.length > 0 && (
          <div className="mt-6 divide-y divide-slate-700 border-y border-slate-700">
            {accounts.map((account) => (
              <section key={account.employeeId} className="py-4">
                <h2 className="font-semibold">{account.fullName}</h2>
                <p className="mt-1 text-sm text-slate-300">Employee ID: {account.employeeId} · Username: {account.username}</p>
                <p className="text-sm text-slate-300">Email: {account.email} · Role: {account.role}</p>
                <p className="mt-2 break-all font-mono text-sm">Temporary password: {account.password}</p>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
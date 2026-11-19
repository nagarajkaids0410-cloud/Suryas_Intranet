import { getSessionUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  return (
    <main className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-sky-700">Dashboard</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Welcome, {session.name}</h1>
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          Role: {session.role}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Active requests" value="12" />
        <StatCard label="Leave balance" value="9.5" />
        <StatCard label="Pending approvals" value="3" />
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

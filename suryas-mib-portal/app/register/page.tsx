"use client";

import Link from 'next/link';
import { FormEvent, useState } from 'react';

export default function RegisterPage() {
  const [form, setForm] = useState({
    employeeId: '',
    name: '',
    email: '',
    phone: '',
    department: 'Operations',
    designation: '',
    requestedRole: 'EMPLOYEE',
    password: '',
  });
  const [status, setStatus] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus('Submitting registration request...');

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error || 'Registration failed');
      return;
    }

    setStatus('Registration request submitted and is pending Bharath approval.');
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.28em] text-sky-700">SURYA’S MiB ENTERPRISES</p>
          <h1 className="mt-2 text-3xl font-bold">Registration request</h1>
        </div>

        <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
          <input className="rounded-xl border px-3 py-2" placeholder="Employee ID" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} required />
          <input className="rounded-xl border px-3 py-2" placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="rounded-xl border px-3 py-2 md:col-span-2" type="email" placeholder="Work email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input className="rounded-xl border px-3 py-2" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="rounded-xl border px-3 py-2" placeholder="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          <input className="rounded-xl border px-3 py-2 md:col-span-2" placeholder="Designation" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} required />
          <select className="rounded-xl border px-3 py-2 " value={form.requestedRole} onChange={(e) => setForm({ ...form, requestedRole: e.target.value as any })}>
            <option value="EMPLOYEE">Employee</option>
            <option value="RECOMMENDER">Recommender</option>
            <option value="MANAGING_PARTNER">Managing Partner</option>
          </select>
          <input className="rounded-xl border px-3 py-2" type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />

          <div className="md:col-span-2 flex items-center gap-3 pt-2">
            <button type="submit" className="rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white hover:bg-sky-500">Submit request</button>
            <Link href="/login" className="text-sm text-sky-700 hover:underline">Already have access?</Link>
          </div>
        </form>

        {status && <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">{status}</div>}
      </div>
    </main>
  );
}

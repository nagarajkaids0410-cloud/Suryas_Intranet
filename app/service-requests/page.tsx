'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/main-layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import { isValidDocumentFile, STANDARD_DOCUMENT_MAX_BYTES } from '@/lib/document-upload';

export default function ServiceRequestsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isRestrictedUser = ['hareeshv', 'santhanakumarv', 'gkbharath']
    .includes(user?.username?.toLowerCase() || '');
  const [type, setType] = useState<'relieving' | 'certificate'>('certificate');
  const [purpose, setPurpose] = useState('');
  const [remarks, setRemarks] = useState('');
  const [relievingEmail, setRelievingEmail] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isRestrictedUser) router.replace('/admin-dashboard');
  }, [isRestrictedUser, router]);

  if (isRestrictedUser) return null;

  const handleRelievingEmail = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!isValidDocumentFile(file, ['pdf'], STANDARD_DOCUMENT_MAX_BYTES)) {
      toast.error('The relieving email copy must be a PDF up to 5 MB');
      event.target.value = '';
      setRelievingEmail(null);
      return;
    }
    setRelievingEmail(file);
  };

  const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Unable to read the selected PDF'));
    reader.readAsDataURL(file);
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.phone?.trim()) {
      toast.error('Add a phone number to your profile before submitting a request');
      return;
    }
    if (type === 'relieving' && !relievingEmail) {
      toast.error('Attach the relieving email copy as a PDF');
      return;
    }
    setBusy(true);
    try {
      const title = type === 'relieving'
        ? 'Relieving letter request'
        : 'Experience certificate request';
      const uploadedFile = type === 'relieving' && relievingEmail
        ? {
            name: relievingEmail.name,
            size: relievingEmail.size,
            type: relievingEmail.type,
            base64: await fileToDataUrl(relievingEmail),
            uploadedAt: new Date().toISOString(),
          }
        : undefined;
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          title,
          remarks,
          ...(uploadedFile ? { uploadedFile } : {}),
          payload: {
            ...(type === 'certificate' ? { certificateType: 'experience' } : {}),
            purpose: purpose.trim(),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to submit request');
      setPurpose('');
      setRemarks('');
      setRelievingEmail(null);
      toast.success('Request submitted. Track its approval history in My Requests.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to submit request');
    } finally {
      setBusy(false);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-slate-900">Relieving & Certificate Requests</h1>
          <p className="mt-1 text-slate-600">Submit a request, track remarks and approval history, and download the official document after issuance.</p>
          <p className="mt-1 text-sm text-slate-600">Phone Number *: {user?.phone || 'Update your profile phone number'}</p>
        </header>
        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">Request type
              <select className="mt-1 block w-full rounded-md border p-2" value={type} onChange={(event) => setType(event.target.value as 'relieving' | 'certificate')}>
                <option value="relieving">Request Relieving Letter</option>
                <option value="certificate">Experience Certificate</option>
              </select>
            </label>
            {type === 'relieving' && (
              <label className="block text-sm font-medium text-slate-700">Relieving Email Copy (PDF) *
                <input className="mt-1 block w-full rounded-md border p-2" type="file" accept=".pdf,application/pdf" onChange={handleRelievingEmail} required />
                {relievingEmail && <span className="mt-1 block text-xs text-slate-600">{relievingEmail.name}</span>}
              </label>
            )}
            <label className="block text-sm font-medium text-slate-700">Purpose and relevant details
              <textarea className="mt-1 block w-full rounded-md border p-2" rows={3} value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Include dates or details relevant to this request" />
            </label>
            <label className="block text-sm font-medium text-slate-700">Applicant remarks
              <textarea className="mt-1 block w-full rounded-md border p-2" rows={2} value={remarks} onChange={(event) => setRemarks(event.target.value)} />
            </label>
            <Button type="submit" disabled={busy}>{busy ? 'Submitting...' : 'Submit request'}</Button>
          </form>
        </Card>
      </div>
    </MainLayout>
  );
}

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);

  // Password reset by users is disabled. Only administrators can reset passwords.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    toast.error('Password reset by users is disabled. Please contact your administrator.');
  };

  if (resetLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md p-6 space-y-4">
          <h1 className="text-2xl font-bold text-slate-900">Password Reset Link</h1>
          <p className="text-slate-600">
            (Development Mode) Click the link below to reset your password:
          </p>
          <div className="bg-blue-50 p-3 rounded border border-blue-200 break-all text-sm">
            <Link href={resetLink} className="text-blue-600 hover:text-blue-800 underline">
              {resetLink}
            </Link>
          </div>
          <Button onClick={() => router.push('/login')} className="w-full">
            Back to Login
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md p-6 space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Password Reset Disabled</h1>
        <p className="text-slate-600">Self-service password reset has been disabled. If you need your password changed, please contact an administrator to reset it for you.</p>
        <div className="mt-4">
          <Button onClick={() => router.push('/login')} className="w-full">
            Back to Login
          </Button>
        </div>
      </Card>
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/main-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileUp, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { isValidDocumentFile, STANDARD_DOCUMENT_MAX_BYTES } from '@/lib/document-upload';

export default function LeaveFormPage() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();

  const [formData, setFormData] = useState({
    name: user?.fullName || '',
    id: user?.employeeId || '',
    designation: user?.designation || '',
    department: user?.department || '',
    email: user?.email || '',
    phone: user?.phone || '',
    leaveType: 'casual',
    fromDate: '',
    toDate: '',
    reason: '',
    isPastDateRequest: false,
    filledFormFile: null as File | null,
    medicalDocument: null as File | null,
    remarks: '',
  });

  const [filledFormFileName, setFilledFormFileName] = useState('');
  const [medicalDocumentFileName, setMedicalDocumentFileName] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    setFormData((previous) => ({
      ...previous,
      name: user?.fullName || user?.username || '',
      id: user?.employeeId || '',
      designation: user?.designation || '',
      department: user?.department || '',
      email: user?.email || '',
      phone: user?.phone || '',
    }));
  }, [isAuthenticated, router, user]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'fromDate' ? { toDate: value } : {}),
    }));
  };

  const handleSelectChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      leaveType: value,
      ...(value === 'medical' ? {} : { medicalDocument: null }),
    }));
    if (value !== 'medical') setMedicalDocumentFileName('');
  };

  const handleFilledFormUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!isValidDocumentFile(file, ['pdf'], STANDARD_DOCUMENT_MAX_BYTES)) {
        toast.error('Choose a PDF file up to 5 MB');
        return;
      }
      setFormData((prev) => ({ ...prev, filledFormFile: file }));
      setFilledFormFileName(file.name);
    }
  };

  const handleMedicalDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!isValidDocumentFile(file, ['pdf'], STANDARD_DOCUMENT_MAX_BYTES)) {
        toast.error('Medical document must be a PDF up to 5 MB');
        return;
      }
      setFormData((prev) => ({ ...prev, medicalDocument: file }));
      setMedicalDocumentFileName(file.name);
    }
  };

  const isMedicalLeave = formData.leaveType === 'medical';

  const validateDates = () => {
    if (!formData.fromDate || !formData.toDate) {
      toast.error('Please select valid dates');
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fromDate = new Date(formData.fromDate);
    const toDate = new Date(formData.toDate);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      toast.error('Invalid date');
      return false;
    }

    if (!formData.isPastDateRequest && (fromDate < today || toDate < today)) {
      toast.error('Please select a valid future date');
      return false;
    }

    if (toDate < fromDate) {
      toast.error('To date must be after From date');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.phone.trim() || !formData.fromDate || !formData.toDate || !formData.reason) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!validateDates()) {
      return;
    }

    const existingResponse = await fetch('/api/requests?target=all&mine=true&type=leave');
    if (existingResponse.ok) {
      const existingData = await existingResponse.json();
      const duplicateDate = (existingData.requests || []).some((request: any) => {
        const existingStart = request.payload?.fromDate;
        const existingEnd = request.payload?.toDate || existingStart;
        return typeof existingStart === 'string' &&
          typeof existingEnd === 'string' &&
          existingStart <= formData.fromDate &&
          existingEnd >= formData.fromDate;
      });
      if (duplicateDate) {
        toast.error('A leave request already exists for this date');
        return;
      }
    }

    if (isMedicalLeave && !formData.medicalDocument) {
      toast.error('Upload a medical certificate or prescription for Medical Leave');
      return;
    }

    const getSignatureFrom = (designation?: string) => {
      const roleValue = (designation || '').toLowerCase();
      if (roleValue.includes('intern')) return 'Hareesh';
      if (roleValue.includes('freelancer') || roleValue.includes('employee')) return 'Founder';
      return 'Admin';
    };

    const signatureFrom = getSignatureFrom(user?.designation);
    const isAdminRequester = user?.role === 'admin';
    const target = signatureFrom === 'Founder' ? 'founder' : 'admin';
    const finalTarget = isAdminRequester ? 'founder' : target;

    // Convert file to base64
    const fileToBase64 = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    };

    try {
      const fileBase64 = formData.filledFormFile
        ? await fileToBase64(formData.filledFormFile)
        : null;
      const medicalDocumentBase64 = formData.medicalDocument
        ? await fileToBase64(formData.medicalDocument)
        : null;

      const leaveTypeLabel = formData.leaveType === 'loss-of-pay'
        ? 'Loss of Pay'
        : `${formData.leaveType.charAt(0).toUpperCase()}${formData.leaveType.slice(1)}`;
      const leaveTitle = `${leaveTypeLabel} Leave Request`;
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'leave',
          title: formData.isPastDateRequest ? `Past-Date ${leaveTitle}` : leaveTitle,
          createdBy: user?.fullName || user?.username || 'User',
          createdById: user?.id,
          createdByRole: user?.role,
          createdByDesignation: user?.designation,
          target: finalTarget,
          remarks: formData.remarks,
          uploadedFile: fileBase64 && formData.filledFormFile
            ? {
                name: formData.filledFormFile.name,
                size: formData.filledFormFile.size,
                type: formData.filledFormFile.type,
                base64: fileBase64,
                uploadedAt: new Date().toISOString(),
              }
            : undefined,
          signatureFrom,
          payload: {
            name: formData.name,
            id: formData.id,
            designation: formData.designation,
            department: formData.department,
            email: formData.email,
            phone: formData.phone,
            leaveType: formData.leaveType,
            fromDate: formData.fromDate,
            toDate: formData.toDate,
            reason: formData.reason,
            remarks: formData.remarks,
            isPastDateRequest: formData.isPastDateRequest,
            filledFormFileName: filledFormFileName,
            medicalDocument: medicalDocumentBase64 && formData.medicalDocument
              ? {
                  name: formData.medicalDocument.name,
                  size: formData.medicalDocument.size,
                  type: formData.medicalDocument.type,
                  base64: medicalDocumentBase64,
                  uploadedAt: new Date().toISOString(),
                }
              : undefined,
            submittedAt: new Date().toISOString(),
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        toast.error(data?.error || 'Failed to submit leave request');
        return;
      }

      toast.success('Leave request submitted successfully!');
      // Reset form
      setFormData({
        name: user?.fullName || '',
        id: user?.employeeId || '',
        designation: user?.designation || '',
        department: user?.department || '',
        email: user?.email || '',
        phone: user?.phone || '',
        leaveType: 'casual',
        fromDate: '',
        toDate: '',
        reason: '',
        isPastDateRequest: false,
        filledFormFile: null,
        medicalDocument: null,
        remarks: '',
      });
      setFilledFormFileName('');
      setMedicalDocumentFileName('');
      router.push('/dashboard');
    } catch (error) {
      console.error('Error converting file:', error);
      toast.error('Error processing file. Please try again.');
    }
  };

  const handleCancel = () => {
    router.push('/dashboard');
  };

  if (!isAuthenticated) {
    return <div>Loading...</div>;
  }

  return (
    <MainLayout>
      <div className="max-w-6xl">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Leave Application Form</h1>
        <p className="text-slate-600 mb-6">Submit your leave request here</p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form */}
          <div className="lg:col-span-2">
            <Card className="bg-white p-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Employee Details Section */}
                <div className="bg-slate-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-slate-900 mb-4">Employee Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                      <Input value={formData.name} disabled className="bg-slate-100" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Employee ID</label>
                      <Input value={formData.id} disabled className="bg-slate-100" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Designation</label>
                      <Input value={formData.designation} disabled className="bg-slate-100" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Team Name</label>
                      <Input value={formData.department} disabled className="bg-slate-100" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                      <Input value={formData.email} disabled className="bg-slate-100" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number *</label>
                      <Input
                        type="tel"
                        required
                        disabled
                        placeholder="Update your profile phone number"
                        value={formData.phone}
                        className="bg-slate-100"
                      />
                      <p className="mt-1 text-xs text-slate-500">Update your phone number in your profile.</p>
                    </div>
                  </div>
                </div>

                {/* Leave Details Section */}
                <div className="bg-slate-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-slate-900 mb-4">Leave Details</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Leave Type *</label>
                      <Select value={formData.leaveType} onValueChange={handleSelectChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="casual">Casual Leave</SelectItem>
                          <SelectItem value="medical">Medical Leave</SelectItem>
                          <SelectItem value="loss-of-pay">Loss of Pay</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
                      <label className="flex items-start gap-3 text-sm text-amber-900 cursor-pointer">
                        <input
                          type="checkbox"
                          name="isPastDateRequest"
                          checked={formData.isPastDateRequest}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              isPastDateRequest: e.target.checked,
                            }))
                          }
                          className="mt-1"
                        />
                        <span>
                          <span className="font-semibold">Past-date leave request</span>
                          <span className="block text-xs text-amber-700 mt-1">
                            Use this for post-leave or correction requests (previous dates).
                          </span>
                        </span>
                      </label>
                    </div>

                    <div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Leave Date *</label>
                        <Input
                          type="date"
                          name="fromDate"
                          value={formData.fromDate}
                          onChange={handleInputChange}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Reason for Leave *</label>
                      <textarea
                        name="reason"
                        placeholder="Enter your reason for leave"
                        value={formData.reason}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        rows={3}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Applicant Remarks</label>
                      <textarea
                        name="remarks"
                        placeholder="Any remarks for approver"
                        value={formData.remarks}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        rows={3}
                      />
                    </div>

                    {/* Mandatory Filled Form Upload */}
                    <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
                      <div className="flex items-start gap-2 mb-3">
                        <div>
                          <h3 className="font-semibold text-amber-900">Upload Filled Form</h3>
                          <p className="text-sm text-amber-700 mt-1">
                            Attach any supporting leave document here when needed.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="file"
                          accept=".pdf,application/pdf"
                          onChange={(e) => handleFilledFormUpload(e)}
                          className="text-sm"
                        />
                        {filledFormFileName && (
                          <span className="text-sm text-green-600 font-medium">
                            {filledFormFileName}
                          </span>
                        )}
                      </div>
                    </div>

                    {isMedicalLeave && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Medical Certificate or Prescription *</label>
                        <p className="text-xs text-slate-500 mb-2">Upload a medical certificate or prescription PDF up to 5 MB. Required for Medical Leave.</p>
                        <div className="flex items-center gap-2">
                          <label className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-blue-300 rounded-lg cursor-pointer hover:bg-blue-50 transition">
                            <Upload size={18} className="text-blue-600" />
                            <span className="text-sm text-blue-600 font-medium">Upload certificate or prescription</span>
                            <input
                              type="file"
                              accept=".pdf,application/pdf"
                              onChange={handleMedicalDocumentUpload}
                              className="hidden"
                            />
                          </label>
                        </div>
                        {medicalDocumentFileName && (
                          <div className="mt-2 flex items-center gap-2 text-sm text-green-700 bg-green-50 p-2 rounded">
                            <FileUp size={16} />
                            {medicalDocumentFileName}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-3">
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700 flex-1">
                    Submit Request
                  </Button>
                  <Button type="button" variant="outline" onClick={handleCancel} className="flex-1">
                    Cancel
                  </Button>
                </div>
              </form>
            </Card>
          </div>

          {/* Profile Photo Section */}
          <div className="lg:col-span-1">
            <Card className="bg-white p-6 sticky top-20">
              <h3 className="font-semibold text-slate-900 mb-4">Your Profile</h3>
              <div className="text-center">
                <img
                  src={user?.profilePhoto || 'https://via.placeholder.com/150'}
                  alt="Profile"
                  className="w-40 h-40 rounded-lg object-cover mx-auto border-4 border-blue-200 mb-4"
                />
                <p className="font-semibold text-slate-900">{user?.fullName || 'Employee Name'}</p>
                <p className="text-sm text-slate-600">Employee ID: {user?.employeeId || 'Not Set'}</p>
                <p className="text-sm text-slate-600">{user?.designation}</p>

                {/* Leave Balance */}
                <div className="mt-6 bg-slate-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-slate-900 mb-3 text-sm">Monthly Leave Entitlement</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Casual Leave</span>
                      <span className="font-semibold text-slate-900">1 per month</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Medical Leave</span>
                      <span className="font-semibold text-slate-900">1 per month</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Medical certificate or prescription is required for Medical Leave.
                    </p>
                    <div className="border-t border-slate-200 pt-2">
                      <span className="font-semibold text-slate-700">Loss of Pay:</span>
                      <span className="ml-1 text-slate-600">Available when required.</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

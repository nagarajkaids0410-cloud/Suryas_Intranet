'use client';

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth, type User } from '@/lib/auth-context';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

interface ProfileSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: 'setup' | 'edit';
}

export const ProfileSetupModal: React.FC<ProfileSetupModalProps> = ({ isOpen, onClose, mode = 'setup' }) => {
  const { user, updateProfile } = useAuth();
  const [previewImage, setPreviewImage] = useState<string>(user?.profilePhoto || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [designation, setDesignation] = useState(user?.designation || '');
  const [teamName, setTeamName] = useState(user?.department || '');
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [loading, setLoading] = useState(false);
  const isEditMode = mode === 'edit';
  const capitalizeInitial = (value: string) => {
    const trimmed = value.trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : '';
  };

  useEffect(() => {
    if (!isOpen || !user) return;
    setPreviewImage(user.profilePhoto || '');
    setPhone(user.phone || '');
    setDesignation(user.designation || '');
    setTeamName(user.department || '');
    setFullName(user.fullName || '');
  }, [isOpen, user]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB');
        return;
      }

      // Check file type
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!isEditMode && !previewImage) {
        toast.error('Please upload a profile picture');
        setLoading(false);
        return;
      }

      if (!designation.trim()) {
        toast.error('Please enter your designation');
        setLoading(false);
        return;
      }

      if (!phone.trim()) {
        toast.error('Please enter your phone number');
        setLoading(false);
        return;
      }

      if (isEditMode) {
        if (!fullName.trim()) {
          toast.error('Please enter your full name');
          setLoading(false);
          return;
        }

      }

      const updatePayload: Partial<User> = {
        profilePhoto: previewImage || user?.profilePhoto,
        profilePictureUploaded: user?.profilePictureUploaded || !!previewImage,
        designation: capitalizeInitial(designation),
        department: capitalizeInitial(teamName),
      };

      if (isEditMode) {
        updatePayload.fullName = fullName.trim();
        updatePayload.phone = phone.trim();
      } else {
        updatePayload.phone = phone.trim();
        updatePayload.isProfileCompleted = true;
      }

      await updateProfile(updatePayload);

      toast.success(isEditMode ? 'Profile updated successfully!' : 'Profile updated successfully!');
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open && !isEditMode) return;
      if (!open && isEditMode) onClose();
    }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" onInteractOutside={(e) => {
        if (!isEditMode) {
          e.preventDefault();
        }
      }}>
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-blue-600">
            {isEditMode ? 'Edit Profile' : '✨ Complete Your Profile'}
          </DialogTitle>
        </DialogHeader>

        {!isEditMode && (
          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800 mb-2">
            <p className="font-semibold">ℹ️ Profile completion required</p>
            <p className="text-blue-700 mt-1">Please complete your profile before accessing the dashboard.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Profile Picture Upload */}
          <div className="flex flex-col items-center space-y-4">
            <label className="relative w-32 h-32 rounded-full border-4 border-blue-200 overflow-hidden bg-slate-100 flex items-center justify-center cursor-pointer group">
              {previewImage ? (
                <img
                  src={previewImage}
                  alt="Profile Preview"
                  className="w-full h-full object-cover"
                  style={{ objectPosition: 'center 0%' }}
                />
              ) : (
                <Camera className="w-12 h-12 text-slate-400" />
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-semibold">
                Upload
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </label>
            <p className="text-xs text-slate-500">
              Click the circle to upload (JPG, PNG, GIF — Max 5MB)
            </p>
          </div>

          {isEditMode && (
            <div className="text-sm text-slate-600">
              <p>Employee ID: {user?.employeeId || 'Not Set'}</p>
            </div>
          )}

          {isEditMode && (
            <div>
              <Label className="block text-sm font-medium text-slate-700 mb-2">
                Full Name
              </Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full"
              />
            </div>
          )}

          {isEditMode && (
            <div className="text-sm text-slate-600">
              <p>Username: {user?.username}</p>
              <p>Email: {user?.email}</p>
              <Link href="/change-password" className="mt-2 inline-block text-blue-600 hover:underline">
                Change password
              </Link>
            </div>
          )}

          {/* Phone Number */}
          <div>
            <Label className="block text-sm font-medium text-slate-700 mb-2">
              Phone Number *
            </Label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Enter your phone number"
              className="w-full"
            />
          </div>

          {/* Designation */}
          <div>
            <Label className="block text-sm font-medium text-slate-700 mb-2">
              Designation *
            </Label>
            <Input
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              onBlur={() => setDesignation(capitalizeInitial(designation))}
              placeholder="Enter your designation"
              className="w-full"
            />
          </div>

          <div>
            <Label className="block text-sm font-medium text-slate-700 mb-2">
              Team Name
            </Label>
            <Input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              onBlur={() => setTeamName(capitalizeInitial(teamName))}
              placeholder="Enter your team name"
              className="w-full"
            />
          </div>


          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            {isEditMode && (
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {loading ? 'Saving...' : isEditMode ? 'Save Changes' : 'Complete Profile'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

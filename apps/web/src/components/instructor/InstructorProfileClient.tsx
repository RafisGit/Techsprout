'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/useCurrentUser';
import {
  fetchMyInstructorProfile,
  updateMyInstructorProfile,
} from '@/lib/api/instructor';
import { MediaUploader } from '@/components/admin/MediaUploader';
import { InstructorBioCard } from '@/components/public/InstructorBioCard';
import { Button } from '@/components/ui/button';
import {
  User,
  Mail,
  AtSign,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  FileEdit,
  Globe,
  Award,
  Sparkles,
  Info,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import type { UpdateInstructorProfileRequest } from '@techsprout/contracts';

function isValidUrl(val: string): boolean {
  if (!val.trim()) return true;
  try {
    const url = new URL(val);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function InstructorProfileClient() {
  const queryClient = useQueryClient();
  const { data: currentUser, isLoading: isUserLoading } = useCurrentUser();

  const {
    data: profile,
    isLoading: isProfileLoading,
    isError: isProfileError,
    error: profileFetchError,
    refetch,
  } = useQuery({
    queryKey: ['myInstructorProfile'],
    queryFn: fetchMyInstructorProfile,
  });

  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  // Form State
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [credentials, setCredentials] = useState('');
  const [expertiseInput, setExpertiseInput] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [avatarMediaId, setAvatarMediaId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Status feedback
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Populate form when profile data arrives
  useEffect(() => {
    if (profile) {
      setHeadline(profile.headline || '');
      setBio(profile.bio || '');
      setCredentials(profile.credentials || '');
      setExpertiseInput((profile.expertiseAreas || []).join(', '));
      setWebsiteUrl(profile.websiteUrl || '');
      setLinkedinUrl(profile.linkedinUrl || '');
      setGithubUrl(profile.githubUrl || '');
      setAvatarMediaId(profile.avatarMediaId || null);
      setAvatarUrl(profile.avatarUrl || null);
    }
  }, [profile]);

  const parsedExpertiseAreas = expertiseInput
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const saveMutation = useMutation({
    mutationFn: (payload: UpdateInstructorProfileRequest) =>
      updateMyInstructorProfile(payload),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['myInstructorProfile'] });
      setStatusMessage({
        type: 'success',
        text: 'Your instructor profile has been saved successfully.',
      });
      setFieldErrors({});
      // Update local state with returned values
      if (updated) {
        setHeadline(updated.headline || '');
        setBio(updated.bio || '');
        setCredentials(updated.credentials || '');
        setExpertiseInput((updated.expertiseAreas || []).join(', '));
        setWebsiteUrl(updated.websiteUrl || '');
        setLinkedinUrl(updated.linkedinUrl || '');
        setGithubUrl(updated.githubUrl || '');
        setAvatarMediaId(updated.avatarMediaId || null);
        setAvatarUrl(updated.avatarUrl || null);
      }
    },
    onError: (err: any) => {
      const serverMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to save profile. Please check your inputs and try again.';
      const errors = err?.response?.data?.details || {};
      const formattedErrors: Record<string, string> = {};
      Object.keys(errors).forEach((key) => {
        if (Array.isArray(errors[key]) && errors[key].length > 0) {
          formattedErrors[key] = errors[key][0];
        }
      });
      setFieldErrors(formattedErrors);
      setStatusMessage({
        type: 'error',
        text: serverMessage,
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    const errors: Record<string, string> = {};

    // Bounds and validation checks
    if (headline.length > 150) {
      errors.headline = 'Headline cannot exceed 150 characters.';
    }
    if (bio.length > 2000) {
      errors.bio = 'Bio cannot exceed 2000 characters.';
    }
    if (credentials.length > 500) {
      errors.credentials = 'Credentials cannot exceed 500 characters.';
    }
    if (parsedExpertiseAreas.length > 10) {
      errors.expertise = 'Maximum 10 expertise areas allowed.';
    }
    if (websiteUrl && !isValidUrl(websiteUrl)) {
      errors.websiteUrl = 'Please enter a valid website URL (including https://).';
    }
    if (linkedinUrl && !isValidUrl(linkedinUrl)) {
      errors.linkedinUrl = 'Please enter a valid LinkedIn URL (including https://).';
    }
    if (githubUrl && !isValidUrl(githubUrl)) {
      errors.githubUrl = 'Please enter a valid GitHub URL (including https://).';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setStatusMessage({
        type: 'error',
        text: 'Please correct the highlighted errors before saving.',
      });
      return;
    }

    setFieldErrors({});

    const payload: UpdateInstructorProfileRequest = {
      headline: headline.trim() || null,
      bio: bio.trim() || null,
      credentials: credentials.trim() || null,
      expertiseAreas: parsedExpertiseAreas.length > 0 ? parsedExpertiseAreas : null,
      websiteUrl: websiteUrl.trim() || null,
      linkedinUrl: linkedinUrl.trim() || null,
      githubUrl: githubUrl.trim() || null,
      avatarMediaId: avatarMediaId || null,
    };

    saveMutation.mutate(payload);
  };

  const handleReset = () => {
    if (profile) {
      setHeadline(profile.headline || '');
      setBio(profile.bio || '');
      setCredentials(profile.credentials || '');
      setExpertiseInput((profile.expertiseAreas || []).join(', '));
      setWebsiteUrl(profile.websiteUrl || '');
      setLinkedinUrl(profile.linkedinUrl || '');
      setGithubUrl(profile.githubUrl || '');
      setAvatarMediaId(profile.avatarMediaId || null);
      setAvatarUrl(profile.avatarUrl || null);
    } else {
      setHeadline('');
      setBio('');
      setCredentials('');
      setExpertiseInput('');
      setWebsiteUrl('');
      setLinkedinUrl('');
      setGithubUrl('');
      setAvatarMediaId(null);
      setAvatarUrl(null);
    }
    setStatusMessage(null);
    setFieldErrors({});
  };

  const isLoading = isUserLoading || isProfileLoading;
  const isMissingProfile = !isLoading && profile === null;

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs animate-pulse">
          <div className="h-7 w-48 bg-gray-200 rounded-md mb-2" />
          <div className="h-4 w-96 bg-gray-100 rounded-md" />
        </div>
        <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-xs space-y-6 animate-pulse">
          <div className="flex gap-4">
            <div className="w-20 h-20 bg-gray-200 rounded-2xl" />
            <div className="space-y-2 flex-1">
              <div className="h-5 w-48 bg-gray-200 rounded-md" />
              <div className="h-4 w-32 bg-gray-100 rounded-md" />
            </div>
          </div>
          <div className="h-10 bg-gray-100 rounded-xl" />
          <div className="h-28 bg-gray-100 rounded-xl" />
        </div>
      </div>
    );
  }

  if (isProfileError) {
    return (
      <div className="max-w-4xl mx-auto p-8 bg-white rounded-2xl border border-red-200 text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-red-50 text-red-500 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">Unable to Load Profile</h2>
        <p className="text-xs text-gray-500">
          {(profileFetchError as any)?.response?.data?.message ||
            'There was an error communicating with the instructor profile service.'}
        </p>
        <Button onClick={() => refetch()} size="sm" variant="outline">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Instructor Profile</h1>
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Verified Faculty
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Manage your public educator identity, biography, teaching credentials, and external links.
          </p>
        </div>

        {/* Tab switch: Edit vs Preview */}
        <div className="flex items-center bg-gray-100 p-1 rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('edit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'edit'
                ? 'bg-white text-gray-900 shadow-xs'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <FileEdit className="w-3.5 h-3.5" />
            <span>Edit Profile</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'preview'
                ? 'bg-white text-gray-900 shadow-xs'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Public Preview</span>
          </button>
        </div>
      </div>

      {/* Missing Profile / First-Time Setup Notice */}
      {isMissingProfile && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">First-Time Profile Setup</p>
            <p className="mt-0.5 text-amber-800 text-xs leading-relaxed">
              You haven&apos;t configured your public educator profile yet. Complete the fields below and save to showcase your academic credentials, biography, and expertise on your published course pages.
            </p>
          </div>
        </div>
      )}

      {/* Status Announcements */}
      {statusMessage && (
        <div
          role="alert"
          className={`p-4 rounded-xl text-sm flex items-start gap-3 border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 font-medium">{statusMessage.text}</div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-xs opacity-60 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {activeTab === 'preview' ? (
        /* Public Preview Tab */
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-800">
              <p className="font-semibold">Catalog Course Preview</p>
              <p className="mt-0.5">
                This is exactly how your biography, credentials, and social links appear to learners on your public course catalog pages.
              </p>
            </div>
          </div>

          <InstructorBioCard
            instructor={{
              name: currentUser?.name || 'Educator',
              headline: headline || null,
              bio: bio || null,
              credentials: credentials || null,
              expertiseAreas: parsedExpertiseAreas,
              avatarUrl: avatarUrl || null,
              websiteUrl: websiteUrl || null,
              linkedinUrl: linkedinUrl || null,
              githubUrl: githubUrl || null,
            }}
          />
        </div>
      ) : (
        /* Edit Profile Form Tab */
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Account Context (Read-Only Identity) */}
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-200 shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-gray-900">Institutional Identity</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Verified account credentials tied to your LMS profile.
                </p>
              </div>
              <span className="text-xs text-gray-400 font-medium bg-gray-50 px-2.5 py-1 rounded-md border border-gray-200/60">
                Private Account Data
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-gray-50/70 rounded-xl border border-gray-100">
                <span className="text-gray-400 font-semibold uppercase tracking-wider block mb-1">
                  Full Name
                </span>
                <span className="font-semibold text-gray-900 text-sm">
                  {currentUser?.name || '—'}
                </span>
              </div>
              <div className="p-3.5 bg-gray-50/70 rounded-xl border border-gray-100">
                <span className="text-gray-400 font-semibold uppercase tracking-wider block mb-1">
                  Email Address
                </span>
                <span className="font-semibold text-gray-900 text-sm">
                  {currentUser?.email || '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Avatar Media */}
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-200 shadow-xs space-y-4">
            <div className="border-b border-gray-100 pb-4">
              <h2 className="text-base font-bold text-gray-900">Profile Avatar</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Upload a professional headshot to display across the public course catalog.
              </p>
            </div>

            <div className="max-w-md">
              <MediaUploader
                mediaType="IMAGE"
                folder="techsprout/images/avatars"
                currentUrl={avatarUrl}
                currentMediaId={avatarMediaId}
                label="Instructor Avatar"
                helperText="Upload a square JPEG, PNG, or WebP image."
                onMediaSelect={(asset) => {
                  if (asset) {
                    setAvatarMediaId(asset.id);
                    setAvatarUrl(asset.url);
                  } else {
                    setAvatarMediaId(null);
                    setAvatarUrl(null);
                  }
                }}
                onRemoved={() => {
                  setAvatarMediaId(null);
                  setAvatarUrl(null);
                }}
              />
            </div>
          </div>

          {/* Section 3: Public Biography & Credentials */}
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-200 shadow-xs space-y-6">
            <div className="border-b border-gray-100 pb-4">
              <h2 className="text-base font-bold text-gray-900">Public Educator Profile</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                This information is displayed publicly on course detail pages.
              </p>
            </div>

            {/* Headline */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <label htmlFor="headline" className="font-semibold text-gray-700">
                  Professional Headline
                </label>
                <span
                  className={`font-mono text-[11px] ${
                    headline.length > 150 ? 'text-red-500 font-bold' : 'text-gray-400'
                  }`}
                >
                  {headline.length}/150
                </span>
              </div>
              <input
                id="headline"
                type="text"
                value={headline}
                maxLength={150}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="e.g. Principal Systems Architect & Visiting Faculty"
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                  fieldErrors.headline ? 'border-red-300 bg-red-50/20' : 'border-gray-200'
                }`}
              />
              {fieldErrors.headline && (
                <p className="text-xs text-red-500 font-medium">{fieldErrors.headline}</p>
              )}
            </div>

            {/* Credentials */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <label htmlFor="credentials" className="font-semibold text-gray-700">
                  Academic & Professional Credentials
                </label>
                <span
                  className={`font-mono text-[11px] ${
                    credentials.length > 500 ? 'text-red-500 font-bold' : 'text-gray-400'
                  }`}
                >
                  {credentials.length}/500
                </span>
              </div>
              <input
                id="credentials"
                type="text"
                value={credentials}
                maxLength={500}
                onChange={(e) => setCredentials(e.target.value)}
                placeholder="e.g. Ph.D. in Computer Engineering, Stanford University"
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                  fieldErrors.credentials ? 'border-red-300 bg-red-50/20' : 'border-gray-200'
                }`}
              />
              {fieldErrors.credentials && (
                <p className="text-xs text-red-500 font-medium">{fieldErrors.credentials}</p>
              )}
            </div>

            {/* Expertise Areas */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <label htmlFor="expertise" className="font-semibold text-gray-700">
                  Areas of Expertise
                </label>
                <span className="text-gray-400 text-[11px]">
                  Comma-separated tags (max 10)
                </span>
              </div>
              <input
                id="expertise"
                type="text"
                value={expertiseInput}
                onChange={(e) => setExpertiseInput(e.target.value)}
                placeholder="e.g. Computer Architecture, RISC-V, Embedded Systems"
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                  fieldErrors.expertise ? 'border-red-300 bg-red-50/20' : 'border-gray-200'
                }`}
              />
              {parsedExpertiseAreas.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {parsedExpertiseAreas.map((area, idx) => (
                    <span
                      key={`${area}-${idx}`}
                      className="text-xs font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              )}
              {fieldErrors.expertise && (
                <p className="text-xs text-red-500 font-medium">{fieldErrors.expertise}</p>
              )}
            </div>

            {/* Bio */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <label htmlFor="bio" className="font-semibold text-gray-700">
                  Biography
                </label>
                <span
                  className={`font-mono text-[11px] ${
                    bio.length > 2000 ? 'text-red-500 font-bold' : 'text-gray-400'
                  }`}
                >
                  {bio.length}/2000
                </span>
              </div>
              <textarea
                id="bio"
                rows={5}
                value={bio}
                maxLength={2000}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell learners about your background, industry experience, research interests, and teaching philosophy..."
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y leading-relaxed ${
                  fieldErrors.bio ? 'border-red-300 bg-red-50/20' : 'border-gray-200'
                }`}
              />
              {fieldErrors.bio && (
                <p className="text-xs text-red-500 font-medium">{fieldErrors.bio}</p>
              )}
            </div>
          </div>

          {/* Section 4: Public External Links */}
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-200 shadow-xs space-y-6">
            <div className="border-b border-gray-100 pb-4">
              <h2 className="text-base font-bold text-gray-900">External & Social Profiles</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Optional links to your professional websites and academic publications.
              </p>
            </div>

            <div className="space-y-4">
              {/* Website */}
              <div className="space-y-1.5">
                <label htmlFor="websiteUrl" className="text-xs font-semibold text-gray-700 block">
                  Personal Website / Academic Lab
                </label>
                <input
                  id="websiteUrl"
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://techsprout.edu/faculty/yourname"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                    fieldErrors.websiteUrl ? 'border-red-300 bg-red-50/20' : 'border-gray-200'
                  }`}
                />
                {fieldErrors.websiteUrl && (
                  <p className="text-xs text-red-500 font-medium">{fieldErrors.websiteUrl}</p>
                )}
              </div>

              {/* LinkedIn */}
              <div className="space-y-1.5">
                <label htmlFor="linkedinUrl" className="text-xs font-semibold text-gray-700 block">
                  LinkedIn Profile URL
                </label>
                <input
                  id="linkedinUrl"
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/yourprofile"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                    fieldErrors.linkedinUrl ? 'border-red-300 bg-red-50/20' : 'border-gray-200'
                  }`}
                />
                {fieldErrors.linkedinUrl && (
                  <p className="text-xs text-red-500 font-medium">{fieldErrors.linkedinUrl}</p>
                )}
              </div>

              {/* GitHub */}
              <div className="space-y-1.5">
                <label htmlFor="githubUrl" className="text-xs font-semibold text-gray-700 block">
                  GitHub Profile URL
                </label>
                <input
                  id="githubUrl"
                  type="url"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/yourusername"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                    fieldErrors.githubUrl ? 'border-red-300 bg-red-50/20' : 'border-gray-200'
                  }`}
                />
                {fieldErrors.githubUrl && (
                  <p className="text-xs text-red-500 font-medium">{fieldErrors.githubUrl}</p>
                )}
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={saveMutation.isPending}
            >
              Reset Changes
            </Button>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveTab('preview')}
              >
                <Eye className="w-3.5 h-3.5 mr-1.5" />
                Preview Bio
              </Button>

              <Button
                type="submit"
                size="sm"
                disabled={saveMutation.isPending}
                className="bg-primary text-white hover:bg-primary/90 px-6 font-semibold"
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving Profile...
                  </>
                ) : (
                  'Save Profile'
                )}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

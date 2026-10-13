'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  ShieldCheck,
  Award,
  Globe,
  ExternalLink,
  BookOpen,
} from 'lucide-react';

export interface InstructorBioProps {
  instructor?: {
    id?: string;
    name: string;
    headline?: string | null;
    bio?: string | null;
    credentials?: string | null;
    expertiseAreas?: string[] | null;
    avatarUrl?: string | null;
    websiteUrl?: string | null;
    linkedinUrl?: string | null;
    githubUrl?: string | null;
  } | null;
  className?: string;
}

export function InstructorBioCard({ instructor, className = '' }: InstructorBioProps) {
  const [imageError, setImageError] = useState(false);

  if (!instructor || !instructor.name) {
    return null;
  }

  const initials = instructor.name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'E';

  const hasExtraDetails = Boolean(
    instructor.headline ||
      instructor.bio ||
      instructor.credentials ||
      (instructor.expertiseAreas && instructor.expertiseAreas.length > 0) ||
      instructor.websiteUrl ||
      instructor.linkedinUrl ||
      instructor.githubUrl
  );

  return (
    <div
      className={`bg-white rounded-3xl border border-gray-200/80 shadow-xs p-6 sm:p-8 space-y-6 ${className}`}
      data-testid="instructor-bio-card"
    >
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
          <BookOpen className="w-4 h-4" />
          <span>Course Instructor</span>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          Verified Faculty
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-start gap-5">
        {/* Avatar */}
        <div className="relative shrink-0 w-20 h-20 rounded-2xl overflow-hidden bg-emerald-50 border border-emerald-200 flex items-center justify-center shadow-xs">
          {instructor.avatarUrl && !imageError ? (
            <Image
              src={instructor.avatarUrl}
              alt={instructor.name}
              fill
              className="object-cover"
              sizes="80px"
              onError={() => setImageError(true)}
            />
          ) : (
            <span className="font-extrabold text-2xl text-emerald-700 select-none">
              {initials}
            </span>
          )}
        </div>

        {/* Identity & Headline */}
        <div className="space-y-1.5 flex-1 min-w-0">
          <h3 className="text-xl font-bold text-gray-900 tracking-tight">
            {instructor.name}
          </h3>

          {instructor.headline && (
            <p className="text-sm font-medium text-gray-600 leading-snug">
              {instructor.headline}
            </p>
          )}

          {/* Academic / Professional Credentials */}
          {instructor.credentials && (
            <div className="inline-flex items-center gap-1.5 text-xs text-primary font-medium mt-1 bg-primary/5 px-2.5 py-1 rounded-lg border border-primary/10">
              <Award className="w-3.5 h-3.5 shrink-0 text-primary" />
              <span>{instructor.credentials}</span>
            </div>
          )}
        </div>
      </div>

      {/* Areas of Expertise */}
      {instructor.expertiseAreas && instructor.expertiseAreas.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
            Areas of Expertise
          </span>
          <div className="flex flex-wrap gap-1.5">
            {instructor.expertiseAreas.map((area, idx) => (
              <span
                key={`${area}-${idx}`}
                className="text-xs font-medium px-2.5 py-1 rounded-lg bg-gray-50 text-gray-700 border border-gray-200/60"
              >
                {area}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Biography text */}
      {instructor.bio ? (
        <div className="text-sm text-gray-600 leading-relaxed space-y-3 whitespace-pre-line border-t border-gray-100 pt-4">
          {instructor.bio}
        </div>
      ) : !hasExtraDetails ? (
        <div className="text-xs text-gray-400 italic border-t border-gray-100 pt-3">
          Educator biography and academic background are managed by institutional faculty.
        </div>
      ) : null}

      {/* Public Social / Web Links */}
      {(instructor.websiteUrl || instructor.linkedinUrl || instructor.githubUrl) && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
          {instructor.websiteUrl && (
            <a
              href={instructor.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Visit ${instructor.name}'s official website`}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 transition-colors"
            >
              <Globe className="w-3.5 h-3.5 text-gray-500" />
              <span>Website</span>
              <ExternalLink className="w-3 h-3 text-gray-400 ml-0.5" />
            </a>
          )}

          {instructor.linkedinUrl && (
            <a
              href={instructor.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View ${instructor.name}'s LinkedIn profile`}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl bg-[#0077B5]/10 hover:bg-[#0077B5]/20 text-[#0077B5] border border-[#0077B5]/20 transition-colors"
            >
              <svg
                className="w-3.5 h-3.5 fill-current"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
              </svg>
              <span>LinkedIn</span>
              <ExternalLink className="w-3 h-3 text-[#0077B5]/60 ml-0.5" />
            </a>
          )}

          {instructor.githubUrl && (
            <a
              href={instructor.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View ${instructor.name}'s GitHub profile`}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl bg-gray-900 text-white hover:bg-gray-800 transition-colors"
            >
              <svg
                className="w-3.5 h-3.5 fill-current"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
              <span>GitHub</span>
              <ExternalLink className="w-3 h-3 text-gray-400 ml-0.5" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

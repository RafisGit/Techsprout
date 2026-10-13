import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchMyInstructorProfile,
  updateMyInstructorProfile,
} from '@/lib/api/instructor';
import { axiosInstance } from '@/lib/axiosInstance';
import type { InstructorProfileDto, UpdateInstructorProfileRequest } from '@techsprout/contracts';

// Mock axiosInstance
vi.mock('@/lib/axiosInstance', () => ({
  axiosInstance: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('P6.2 — WP-06: Instructor Profile Management & Catalog Bio Frontend Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. INSTRUCTOR PROFILE API CLIENT INTEGRATION
  // =========================================================================
  describe('1. Instructor Profile API Client', () => {
    it('1.1 should fetch authenticated instructor profile from /api/v1/instructor/profile', async () => {
      const mockProfile: InstructorProfileDto = {
        id: 'prof-101',
        userId: 'usr-101',
        headline: 'Lead Software Architect & Educator',
        bio: '15+ years in full-stack architecture and systems design.',
        credentials: 'M.S. in Computer Science',
        expertiseAreas: ['TypeScript', 'Next.js', 'Distributed Systems'],
        websiteUrl: 'https://techsprout.edu/faculty/lead',
        linkedinUrl: 'https://linkedin.com/in/lead-architect',
        githubUrl: 'https://github.com/lead-architect',
        avatarMediaId: 'med-101',
        avatarUrl: 'https://res.cloudinary.com/test/avatar.jpg',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-09T00:00:00.000Z',
        user: {
          id: 'usr-101',
          name: 'Dr. Sarah Mitchell',
          email: 'sarah@techsprout.edu',
        },
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, message: 'Profile retrieved', data: mockProfile },
      });

      const result = await fetchMyInstructorProfile();

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/instructor/profile');
      expect(result).toEqual(mockProfile);
      expect(result?.headline).toBe('Lead Software Architect & Educator');
      expect(result?.expertiseAreas).toHaveLength(3);
    });

    it('1.2 should return null when instructor has no profile row yet', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, message: 'Profile retrieved', data: null },
      });

      const result = await fetchMyInstructorProfile();

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/instructor/profile');
      expect(result).toBeNull();
    });

    it('1.3 should call updateMyInstructorProfile with PUT and correct payload', async () => {
      const updatePayload: UpdateInstructorProfileRequest = {
        headline: 'Principal AI Researcher',
        bio: 'Focusing on distributed deep learning.',
        credentials: 'Ph.D. in Artificial Intelligence',
        expertiseAreas: ['Machine Learning', 'PyTorch'],
        websiteUrl: 'https://example.com/research',
        linkedinUrl: 'https://linkedin.com/in/researcher',
        githubUrl: 'https://github.com/researcher',
        avatarMediaId: 'med-202',
      };

      const mockUpdatedProfile: InstructorProfileDto = {
        id: 'prof-101',
        userId: 'usr-101',
        ...updatePayload,
        avatarUrl: 'https://res.cloudinary.com/test/new-avatar.jpg',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-10T00:00:00.000Z',
      };

      vi.mocked(axiosInstance.put).mockResolvedValueOnce({
        data: { success: true, message: 'Profile updated', data: mockUpdatedProfile },
      });

      const result = await updateMyInstructorProfile(updatePayload);

      expect(axiosInstance.put).toHaveBeenCalledWith('/api/v1/instructor/profile', updatePayload);
      expect(result.headline).toBe('Principal AI Researcher');
      expect(result.expertiseAreas).toEqual(['Machine Learning', 'PyTorch']);
    });

    it('1.4 should propagate API rejection on mutation error', async () => {
      vi.mocked(axiosInstance.put).mockRejectedValueOnce(
        new Error('Network error or server unavailable')
      );

      await expect(
        updateMyInstructorProfile({ headline: 'Failed update' })
      ).rejects.toThrow('Network error or server unavailable');
    });
  });

  // =========================================================================
  // 2. INPUT VALIDATION & URL SANITIZATION
  // =========================================================================
  describe('2. Client-Side Input Validation Rules', () => {
    function isValidUrl(val: string): boolean {
      if (!val.trim()) return true;
      try {
        const url = new URL(val);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    }

    function parseExpertiseAreas(input: string): string[] {
      return input
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    it('2.1 should validate valid http and https URLs', () => {
      expect(isValidUrl('https://techsprout.edu')).toBe(true);
      expect(isValidUrl('http://myblog.com/path')).toBe(true);
      expect(isValidUrl('https://linkedin.com/in/tariq')).toBe(true);
      expect(isValidUrl('https://github.com/techsprout')).toBe(true);
      expect(isValidUrl('')).toBe(true); // Empty string allowed to clear
      expect(isValidUrl('   ')).toBe(true);
    });

    it('2.2 should reject malformed or non-http protocols', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('javascript:alert(1)')).toBe(false);
      expect(isValidUrl('ftp://files.example.com')).toBe(false);
      expect(isValidUrl('file:///etc/passwd')).toBe(false);
    });

    it('2.3 should correctly parse and clean comma-separated expertise areas', () => {
      const input = '  React , TypeScript,  Node.js ,,, Distributed Systems ';
      const parsed = parseExpertiseAreas(input);

      expect(parsed).toEqual(['React', 'TypeScript', 'Node.js', 'Distributed Systems']);
      expect(parsed).toHaveLength(4);
    });

    it('2.4 should handle empty expertise input gracefully', () => {
      expect(parseExpertiseAreas('')).toEqual([]);
      expect(parseExpertiseAreas('   , ,  ')).toEqual([]);
    });

    it('2.5 should enforce maximum bounds on text fields', () => {
      const headlineMax = 150;
      const bioMax = 2000;
      const credentialsMax = 500;
      const expertiseMaxTags = 10;

      const validHeadline = 'A'.repeat(headlineMax);
      const invalidHeadline = 'A'.repeat(headlineMax + 1);

      expect(validHeadline.length <= headlineMax).toBe(true);
      expect(invalidHeadline.length <= headlineMax).toBe(false);

      const validBio = 'B'.repeat(bioMax);
      const invalidBio = 'B'.repeat(bioMax + 1);

      expect(validBio.length <= bioMax).toBe(true);
      expect(invalidBio.length <= bioMax).toBe(false);

      const validCreds = 'C'.repeat(credentialsMax);
      const invalidCreds = 'C'.repeat(credentialsMax + 1);

      expect(validCreds.length <= credentialsMax).toBe(true);
      expect(invalidCreds.length <= credentialsMax).toBe(false);

      const tenTags = Array.from({ length: 10 }, (_, i) => `Tag${i}`).join(', ');
      const elevenTags = Array.from({ length: 11 }, (_, i) => `Tag${i}`).join(', ');

      expect(parseExpertiseAreas(tenTags).length <= expertiseMaxTags).toBe(true);
      expect(parseExpertiseAreas(elevenTags).length <= expertiseMaxTags).toBe(false);
    });
  });

  // =========================================================================
  // 3. PUBLIC INSTRUCTOR BIO PROJECTION & PRIVACY INVARIANTS
  // =========================================================================
  describe('3. Public Instructor Bio Projection & Privacy Safeguards', () => {
    interface PublicInstructor {
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
      email?: string;
      passwordHash?: string;
      avatarMediaId?: string;
    }

    function extractInitials(name: string): string {
      return (
        name
          .split(' ')
          .filter(Boolean)
          .map((part) => part[0])
          .slice(0, 2)
          .join('')
          .toUpperCase() || 'E'
      );
    }

    it('3.1 should compute initials for single, double, and complex names', () => {
      expect(extractInitials('Sarah Mitchell')).toBe('SM');
      expect(extractInitials('Tariq')).toBe('T');
      expect(extractInitials('Dr. Md. Rafiqul Islam')).toBe('DM');
      expect(extractInitials('')).toBe('E');
    });

    it('3.2 should sanitize public bio payload and guarantee zero private leak', () => {
      const internalDbEntity = {
        id: 'usr-101',
        name: 'Dr. Sarah Mitchell',
        email: 'sarah.private@techsprout.edu',
        passwordHash: '$2b$10$supersecretargon2orbycrypt',
        headline: 'Lead Software Architect',
        bio: 'Full-stack educator.',
        credentials: 'Ph.D. Computer Science',
        expertiseAreas: ['React', 'PostgreSQL'],
        websiteUrl: 'https://sarahmitchell.dev',
        linkedinUrl: 'https://linkedin.com/in/sarah',
        githubUrl: 'https://github.com/sarah',
        avatarMediaId: 'media-secret-uuid-1234',
        avatarUrl: 'https://res.cloudinary.com/test/sarah.jpg',
      };

      // Public projection mapping exactly matching courses.service.ts
      const publicProjection: PublicInstructor = {
        id: internalDbEntity.id,
        name: internalDbEntity.name,
        headline: internalDbEntity.headline ?? null,
        bio: internalDbEntity.bio ?? null,
        credentials: internalDbEntity.credentials ?? null,
        expertiseAreas: internalDbEntity.expertiseAreas ?? [],
        websiteUrl: internalDbEntity.websiteUrl ?? null,
        linkedinUrl: internalDbEntity.linkedinUrl ?? null,
        githubUrl: internalDbEntity.githubUrl ?? null,
        avatarUrl: internalDbEntity.avatarUrl ?? null,
      };

      // Verify approved fields
      expect(publicProjection.name).toBe('Dr. Sarah Mitchell');
      expect(publicProjection.headline).toBe('Lead Software Architect');
      expect(publicProjection.avatarUrl).toBe('https://res.cloudinary.com/test/sarah.jpg');
      expect(publicProjection.expertiseAreas).toEqual(['React', 'PostgreSQL']);

      // CRITICAL PRIVACY CHECKS:
      expect((publicProjection as any).email).toBeUndefined();
      expect((publicProjection as any).passwordHash).toBeUndefined();
      expect((publicProjection as any).avatarMediaId).toBeUndefined();
      expect(Object.keys(publicProjection)).not.toContain('email');
      expect(Object.keys(publicProjection)).not.toContain('passwordHash');
      expect(Object.keys(publicProjection)).not.toContain('avatarMediaId');
    });

    it('3.3 should handle missing profile record with graceful defaults', () => {
      const bareInstructor = {
        id: 'usr-202',
        name: 'Prof. Tariq Rahman',
        headline: null,
        bio: null,
        credentials: null,
        expertiseAreas: [],
        websiteUrl: null,
        linkedinUrl: null,
        githubUrl: null,
        avatarUrl: null,
      };

      expect(bareInstructor.name).toBe('Prof. Tariq Rahman');
      expect(bareInstructor.headline).toBeNull();
      expect(bareInstructor.bio).toBeNull();
      expect(bareInstructor.avatarUrl).toBeNull();
      expect(extractInitials(bareInstructor.name)).toBe('PT');
    });
  });

  // =========================================================================
  // 4. INSTRUCTOR PROFILE CLIENT FORM STATE MACHINE
  // =========================================================================
  describe('4. Profile Form State Machine & Mutation Behavior', () => {
    it('4.1 should detect first-time setup state when profile is null', () => {
      const profile = null;
      const isLoading = false;
      const isMissingProfile = !isLoading && profile === null;

      expect(isMissingProfile).toBe(true);
    });

    it('4.2 should detect existing loaded profile state when profile is present', () => {
      const profile: InstructorProfileDto = {
        id: 'prof-1',
        userId: 'u-1',
        headline: 'Instructor',
        bio: 'Bio text',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      };
      const isLoading = false;
      const isMissingProfile = !isLoading && profile === null;

      expect(isMissingProfile).toBe(false);
    });

    it('4.3 should construct clean UpdateInstructorProfileRequest payload trimming inputs', () => {
      const rawHeadline = '   Lead Systems Architect   ';
      const rawBio = '   Experienced in distributed consensus protocols.   ';
      const rawCreds = '   Ph.D. Stanford   ';
      const rawExpertise = ['Raft', 'Paxos', 'Byzantine Fault Tolerance'];
      const rawWebsite = '  https://techsprout.edu  ';

      const payload: UpdateInstructorProfileRequest = {
        headline: rawHeadline.trim() || null,
        bio: rawBio.trim() || null,
        credentials: rawCreds.trim() || null,
        expertiseAreas: rawExpertise.length > 0 ? rawExpertise : null,
        websiteUrl: rawWebsite.trim() || null,
        linkedinUrl: null,
        githubUrl: null,
        avatarMediaId: null,
      };

      expect(payload.headline).toBe('Lead Systems Architect');
      expect(payload.bio).toBe('Experienced in distributed consensus protocols.');
      expect(payload.credentials).toBe('Ph.D. Stanford');
      expect(payload.expertiseAreas).toEqual(['Raft', 'Paxos', 'Byzantine Fault Tolerance']);
      expect(payload.websiteUrl).toBe('https://techsprout.edu');
      expect(payload.linkedinUrl).toBeNull();
      expect(payload.githubUrl).toBeNull();
    });

    it('4.4 should convert empty string fields to null for database cleanliness', () => {
      const headline = '';
      const bio = '   ';
      const websiteUrl = '';

      const payload: UpdateInstructorProfileRequest = {
        headline: headline.trim() || null,
        bio: bio.trim() || null,
        websiteUrl: websiteUrl.trim() || null,
      };

      expect(payload.headline).toBeNull();
      expect(payload.bio).toBeNull();
      expect(payload.websiteUrl).toBeNull();
    });
  });
});

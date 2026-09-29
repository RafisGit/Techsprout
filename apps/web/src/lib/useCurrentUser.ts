'use client';

import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/axiosInstance';
import type { AuthUser } from '@/auth';

export function useCurrentUser() {
  return useQuery<AuthUser | null>({
    queryKey: ['currentUser'],
    queryFn: async () => {
      try {
        const res = await axiosInstance.get('/api/v1/auth/me');
        return res.data.data;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });
}

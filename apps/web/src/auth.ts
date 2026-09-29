/**
 * TechSprout Auth Client Helper
 * Replaced legacy NextAuth credentials stub with NestJS API session client.
 */

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  email: string;
  phone?: string | null;
  role: 'student' | 'admin' | 'instructor';
  isVerified: boolean;
}

export async function getCurrentUser(cookieHeader?: string): Promise<AuthUser | null> {
  const apiUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  try {
    const res = await fetch(`${apiUrl}/api/v1/auth/me`, {
      headers: {
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return null;
    }

    const json = await res.json();
    return json.data || null;
  } catch {
    return null;
  }
}
